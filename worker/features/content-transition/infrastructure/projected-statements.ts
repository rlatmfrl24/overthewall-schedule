import { assertProjectedRecord, type ProjectedRecord } from "../domain/projected-content";
import { contentDispositionRegistry } from "../domain/disposition-registry";
import {assertD1String} from "./d1-size-bounds";
import { historicalStatements } from "./historical-statements";

const quote=(name:string)=>`"${name}"`;
const scalar=(value:unknown):string|number|null=>typeof value==="boolean"?Number(value):value===null?null:typeof value==="object"?JSON.stringify(value):value as string|number;
/** Narrow final persistence adapter. Only parser-issued images enter SQL. */
export function projectedStatements(db:D1Database, transitionId:string, record:ProjectedRecord, remove=false):D1PreparedStatement[] {
  assertProjectedRecord(record);
  if(record.destination==="historical") {
    if(remove) return [db.prepare("DELETE FROM content_historical_relations WHERE source_site=? AND ((from_table=? AND from_key=?) OR (to_table=? AND to_key=?))").bind(record.sourceSite,record.table,record.sourceRecordId,record.table,record.sourceRecordId),db.prepare("DELETE FROM content_historical_records WHERE source_site=? AND source_table=? AND source_key=?").bind(record.sourceSite,record.table,record.sourceRecordId)];
    const candidate=record.value.candidate_id;
    const aggregate=record.value.aggregate_type,aggregateId=record.value.aggregate_id;
    const table=aggregate==="review_candidate"?"music_ingestion_candidates":aggregate==="review_proposal"?"music_cover_proposals":aggregate==="performance"?"music_performances":null;
    return historicalStatements(db,record,typeof candidate==="string"?[{table:"music_ingestion_candidates",key:JSON.stringify([candidate])}]:table && typeof aggregateId==="string"?[{table,key:JSON.stringify([aggregateId])}]:[]);
  }
  const table=contentDispositionRegistry[record.table];
  const keys=JSON.parse(record.key) as Array<string|number|null>;
  if(keys.length!==table.primaryKey.length || keys.some(key=>key===null)) throw new Error("Missing projected primary key");
  const predicate=table.primaryKey.map(column=>`${quote(column)}=?`).join(" AND ");
  const owned=`(EXISTS(SELECT 1 FROM content_transition_materialized_rows r WHERE r.transition_id=? AND r.row_table=? AND r.row_key=?) OR EXISTS(SELECT 1 FROM content_transition_baseline_rows b WHERE b.transition_id=? AND b.row_table=? AND b.row_key=? AND b.installed=1))`;
  const ownershipGuard=()=>db.prepare(`UPDATE content_transition_permits SET version_matches=(NOT EXISTS(SELECT 1 FROM ${quote(record.table)} WHERE ${predicate}) OR ${owned}) WHERE transition_id=?`).bind(...keys,transitionId,record.table,record.key,transitionId,record.table,record.key,transitionId);
  if(remove) {
    if(record.table==="members") throw new Error("Managed roster removal requires manifest conflict resolution");
    return [ownershipGuard(),db.prepare(`DELETE FROM ${quote(record.table)} WHERE ${predicate}`).bind(...keys)];
  }
  const columns=Object.keys(record.value);
  const values=columns.map(column=>scalar(record.value[column]));
  if(columns.length+6>100) throw new Error("Projected record exceeds bind limit");
  const assignments=columns.filter(column=>!(table.primaryKey as readonly string[]).includes(column)).map(column=>`${quote(column)}=excluded.${quote(column)}`).join(",");
  const statements = [ownershipGuard()];
  if(record.table==="members") statements.push(db.prepare("UPDATE content_transition_permits SET version_matches=EXISTS(SELECT 1 FROM content_transitions t JOIN json_each(t.plan_json,'$.members') approved WHERE t.id=? AND t.local_site=t.target_site AND json_extract(approved.value,'$.targetUid')=? AND json_extract(approved.value,'$.code')=? AND NOT EXISTS(SELECT 1 FROM members m WHERE m.code=? AND m.uid<>?)) WHERE transition_id=?").bind(transitionId,record.value.uid,record.value.code,record.value.code,record.value.uid,transitionId));
  statements.push(db.prepare(`INSERT INTO ${quote(record.table)}(${columns.map(quote).join(",")}) VALUES(${columns.map(()=>"?").join(",")}) ON CONFLICT(${table.primaryKey.map(quote).join(",")}) DO UPDATE SET ${assignments||`${quote(table.primaryKey[0])}=excluded.${quote(table.primaryKey[0])}`} WHERE ${owned}`).bind(...values,transitionId,record.table,record.key,transitionId,record.table,record.key));
  // The same transaction verifies every projected value, so a conflict, missing
  // approved member or silently skipped upsert cannot produce an install receipt.
  statements.push(db.prepare(`UPDATE content_transition_permits SET version_matches=EXISTS(SELECT 1 FROM ${quote(record.table)} WHERE ${columns.map(column=>`${quote(column)} IS ?`).join(" AND ")}) WHERE transition_id=?`).bind(...values,transitionId));
  return statements;
}

/** Group by canonical table and column shape; every chunk remains in the same
 * caller's D1 batch. Chunk size bounds SQL binding strings, not commit row count. */
export function groupedProjectedStatements(db:D1Database,id:string,records:readonly ProjectedRecord[],remove=false):D1PreparedStatement[] {
  const groups=new Map<string,ProjectedRecord[][]>();
  for(const record of records) {
    assertProjectedRecord(record);
    const signature=JSON.stringify([record.table,Object.keys(record.value).sort()]);
    const batches=groups.get(signature)??[[]];
    const last=batches.at(-1)!;
    if(last.length && new TextEncoder().encode(JSON.stringify([...last,record])).length>1_000_000) batches.push([record]); else last.push(record);
    assertD1String(JSON.stringify([record]));
    groups.set(signature,batches);
  }
  const statements:D1PreparedStatement[]=[];
  for(const batches of groups.values()) for(const batch of batches) {
    const first=batch[0];
    if(first.destination==="historical" || first.table==="members") {
      // Managed identities require the persisted manifest and ownership guard;
      // historical rows use their non-executable provenance/link adapter.
      statements.push(...batch.flatMap(record=>projectedStatements(db,id,record,remove)));
      continue;
    }
    const registry=contentDispositionRegistry[first.table],json=JSON.stringify(batch);
    const key=(alias:string)=>`json_array(${registry.primaryKey.map(column=>`${alias}.${quote(column)}`).join(",")})`;
    statements.push(db.prepare(`UPDATE content_transition_permits SET version_matches=NOT EXISTS(SELECT 1 FROM json_each(?) r JOIN ${quote(first.table)} a ON ${registry.primaryKey.map((column,index)=>`a.${quote(column)}=json_extract(json_extract(r.value,'$.key'),'$[${index}]')`).join(" AND ")} WHERE NOT EXISTS(SELECT 1 FROM content_transition_materialized_rows m WHERE m.transition_id=? AND m.row_table=? AND m.row_key=${key("a")}) AND NOT EXISTS(SELECT 1 FROM content_transition_baseline_rows b WHERE b.transition_id=? AND b.row_table=? AND b.row_key=${key("a")} AND b.installed=1)) WHERE transition_id=?`).bind(json,id,first.table,id,first.table,id));
    if(remove) {
      statements.push(db.prepare(`DELETE FROM ${quote(first.table)} AS a WHERE EXISTS(SELECT 1 FROM json_each(?) r WHERE ${key("a")}=json_extract(r.value,'$.key'))`).bind(json));
      statements.push(db.prepare("DELETE FROM content_transition_materialized_rows WHERE transition_id=? AND row_table=? AND row_key IN (SELECT json_extract(value,'$.key') FROM json_each(?))").bind(id,first.table,json));
      continue;
    }
    const columns=Object.keys(first.value),assignments=columns.filter(column=>!(registry.primaryKey as readonly string[]).includes(column)).map(column=>`${quote(column)}=excluded.${quote(column)}`).join(",");
    const owned=`EXISTS(SELECT 1 FROM content_transition_materialized_rows WHERE transition_id=? AND row_table=? AND row_key=${key("excluded")}) OR EXISTS(SELECT 1 FROM content_transition_baseline_rows WHERE transition_id=? AND row_table=? AND row_key=${key("excluded")} AND installed=1)`;
    statements.push(db.prepare(`INSERT INTO ${quote(first.table)}(${columns.map(quote).join(",")}) SELECT ${columns.map(column=>`json_extract(r.value,'$.value.${column}')`).join(",")} FROM json_each(?) r WHERE 1 ON CONFLICT(${registry.primaryKey.map(quote).join(",")}) DO UPDATE SET ${assignments||`${quote(registry.primaryKey[0])}=excluded.${quote(registry.primaryKey[0])}`} WHERE ${owned}`).bind(json,id,first.table,id,first.table));
    statements.push(db.prepare(`UPDATE content_transition_permits SET version_matches=NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM ${quote(first.table)} a WHERE ${columns.map(column=>`a.${quote(column)} IS json_extract(r.value,'$.value.${column}')`).join(" AND ")})) WHERE transition_id=?`).bind(json,id));
    statements.push(db.prepare("INSERT OR IGNORE INTO content_transition_materialized_rows(transition_id,row_table,row_key) SELECT ?,?,json_extract(value,'$.key') FROM json_each(?)").bind(id,first.table,json));
  }
  return statements;
}
