import { contentDispositionRegistry } from "../domain/disposition-registry";
import {sourceJsonValidationStatements} from "./source-json-validation";
import {identityProjectionStatements} from "./identity-projection";
import {fileReferenceProjectionSql,indexedFileTables} from "./file-reference-index";
import { captureEdges, capturedTables, keySql, matchKey, ownedRootTables, ownershipParents, rootPredicates, structuralColumns, type ContentTable } from "./capture-graph";

const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const named = (table: ContentTable) => `"${table}"`;
const rootTables=capturedTables.filter(table=>rootPredicates[table]!==undefined || contentDispositionRegistry[table].destination==="classification");
const selected = (table: ContentTable, alias: string) => {
  const decision=`json_extract(decision.value,'$.table')=${q(table)} AND json_extract(decision.value,'$.key')=${keySql(table,alias)}`;
  const native=table==="ddays"?` OR (t.local_site=t.target_site AND EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=t.id AND o.generation=t.generation AND o.source_seq IS NULL AND json_extract(o.envelope_json,'$.codec.id')='ddays.create' AND json_extract(o.envelope_json,'$.nativeReceipt.result.success')=1 AND json_extract(o.envelope_json,'$.nativeReceipt.result.id')=${alias}.id))`:"";
  return `(((${(rootPredicates[table] ?? "0").replaceAll("a.", `${alias}.`)} OR EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.classifications') decision WHERE ${decision} AND json_extract(decision.value,'$.disposition')='include')) AND NOT EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.classifications') decision WHERE ${decision} AND json_extract(decision.value,'$.disposition')='exclude'))${native})`;
};
const image = (table: ContentTable) => {
  const registry = contentDispositionRegistry[table];
  const columns = [...registry.values, ...Object.keys(registry.json)];
  let result = "'{}'";
  // D1's documented 32-function-argument limit: at most 15 path/value pairs.
  for (let i = 0; i < columns.length; i += 15) {
    result = `json_set(${result},${columns.slice(i, i+15).flatMap(column => [q(`$.${column}`), `a."${column}"`]).join(",")})`;
  }
  return result;
};
const recursiveEdges = (reverse: boolean) => {
  // D1 permits five compound terms: one seed plus four recursive branches.
  // Each branch has closure + fixed metadata + two indexed joins per edge.
  // Metadata contains only schema edge numbers, never aggregated source rows.
  const size=Math.ceil(captureEdges.length/4);
  if(size*2+2>64) throw new Error("Capture graph exceeds the supported 124-edge SQL partition; revise the schema partition before generating");
  const branches:string[]=[];
  for(let offset=0;offset<captureEdges.length;offset+=size) {
    const group=captureEdges.slice(offset,offset+size);
    const choose=(expression:(edge:typeof captureEdges[number],i:number)=>string)=>`CASE e.value ${group.map((edge,i)=>`WHEN ${i} THEN ${expression(edge,i)}`).join(" ")} END`;
    const metadata=`CASE c.row_table ${[...new Set(group.map(edge=>reverse?edge.to:edge.from))].map(table=>`WHEN ${q(table)} THEN ${q(JSON.stringify(group.flatMap((edge,i)=>(reverse?edge.to:edge.from)===table?[i]:[])))}`).join(" ")} ELSE '[]' END`;
    const joins=group.map((edge,i)=>{
      const from=reverse?edge.to:edge.from,to=reverse?edge.from:edge.to;
      const source=reverse?`b${i}`:`a${i}`,target=reverse?`a${i}`:`b${i}`;
      const relation=edge.join.replaceAll("a.",`a${i}.`).replaceAll("b.",`b${i}.`);
      return `LEFT JOIN ${named(from)} ${source} ON e.value=${i} AND c.row_table=${q(from)} AND ${matchKey(from,source,"c.row_key")} LEFT JOIN ${named(to)} ${target} ON ${relation}`;
    }).join("\n");
    branches.push(`SELECT c.transition_id,${reverse?"":"c.root_table,c.root_key,"}${choose(edge=>q(reverse?edge.from:edge.to))},${choose((edge,i)=>keySql(reverse?edge.from:edge.to,reverse?`a${i}`:`b${i}`))} FROM closure c CROSS JOIN json_each(${metadata}) e ${joins} WHERE ${choose((edge,i)=>`${reverse?`a${i}`:`b${i}`}."${contentDispositionRegistry[reverse?edge.from:edge.to].primaryKey[0]}" IS NOT NULL`)}`);
  }
  return branches.join("\nUNION ");
};
const eligibleRoot = (alias: string) => `CASE ${alias}.row_table ${rootTables.map(table => `WHEN ${q(table)} THEN EXISTS(SELECT 1 FROM ${named(table)} a WHERE ${matchKey(table,"a",`${alias}.row_key`)} AND ${selected(table,"a")})`).join("\n")} ELSE 0 END`;
function partitionView(name: string, selects: string[], output: string[], level = 0): void {
  if (selects.length<=5) { output.push(`CREATE VIEW ${name} AS ${selects.join("\nUNION ALL\n")}`); return; }
  const children: string[] = [];
  for (let i=0;i<selects.length;i+=5) {
    const child = `${name}_level${level}_${i/5}`;
    partitionView(child,selects.slice(i,i+5),output);
    children.push(`SELECT * FROM ${child}`);
  }
  partitionView(name,children,output,level+1);
}

// Views are evaluated only from the transaction's dirty rows/roots. They never
// reconstruct a whole source snapshot on a normal business write.
export function captureMigrationStatements(): string[] {
  const roots = rootTables.map(table => `SELECT t.id transition_id,${q(table)} root_table,${keySql(table,"a")} root_key FROM content_transitions t JOIN ${named(table)} a WHERE ${selected(table,"a")}`);
  const statements: string[] = [];
  partitionView("content_transition_selected_roots", roots, statements);
  statements.push(
    // An admitted command is a control membership seed, never a business row.
    // Its required existing parents use the same recursive closure/projection.
    `CREATE VIEW content_transition_admitted_dependencies AS SELECT d.transition_id,d.root_table,d.root_key,'music_entities' row_table,json_array(e.id) row_key
      FROM content_transition_dirty_roots d JOIN content_transitions t ON t.id=d.transition_id
      JOIN content_transition_operations o ON o.transition_id=t.id AND json_array(o.operation_id)=d.root_key
      JOIN content_transition_commits boundary ON boundary.transition_id=t.id AND boundary.operation_id=json_extract(o.envelope_json,'$.sourceReceipt.dependencyCapture')
      JOIN json_each(o.envelope_json,'$.sourceCommand.payload.input.entityIds') requested JOIN music_entities e ON e.id=requested.value
      WHERE d.root_table='content_transition_operations' AND t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')
        AND o.source_seq IS NULL AND o.generation=t.generation-1 AND json_extract(o.envelope_json,'$.codec.id')='otw-play.channel.mutate'
        AND json_extract(o.envelope_json,'$.sourceReceipt.dependencyCapture')='channel-dependencies:'||o.operation_id
      UNION ALL SELECT d.transition_id,d.root_table,d.root_key,json_extract(requested.value,'$.table'),json_extract(requested.value,'$.key')
      FROM content_transition_dirty_roots d JOIN content_transitions t ON t.id=d.transition_id
      JOIN content_transition_operations o ON o.transition_id=t.id AND json_array(o.operation_id)=d.root_key
      JOIN content_transition_commits boundary ON boundary.transition_id=t.id AND boundary.operation_id=json_extract(o.envelope_json,'$.sourceReceipt.dependencyCapture')
      JOIN json_each(o.envelope_json,'$.sourceReceipt.dependencyReferences') requested
      WHERE d.root_table='content_transition_operations' AND t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready')
        AND o.source_seq IS NULL AND o.generation=t.generation-1 AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.video.mutate','otw-play.candidate.convert','otw-play.candidate.refresh','otw-play.candidate.channel_approve')
        AND json_extract(o.envelope_json,'$.sourceReceipt.dependencyCapture')='video-dependencies:'||o.operation_id
        AND json_extract(requested.value,'$.table') IN ('members','music_entities','music_songs','music_channels','music_media_sources','music_performances','music_cover_proposals')`,
    `CREATE VIEW content_transition_affected_roots AS WITH RECURSIVE closure(transition_id,row_table,row_key) AS (
      SELECT transition_id,row_table,row_key FROM content_transition_dirty_rows WHERE structural=1
      UNION ${recursiveEdges(true)}
    ) SELECT DISTINCT c.transition_id,c.row_table root_table,c.row_key root_key FROM closure c JOIN content_transitions t ON t.id=c.transition_id WHERE ${eligibleRoot("c")}
      UNION SELECT m.transition_id,m.root_table,m.root_key FROM content_transition_membership m JOIN content_transition_dirty_rows d ON d.transition_id=m.transition_id AND d.row_table=m.row_table AND d.row_key=m.row_key`,
    `CREATE VIEW content_transition_live_membership AS WITH RECURSIVE closure(transition_id,root_table,root_key,row_table,row_key) AS (
      SELECT * FROM (
        SELECT d.transition_id,d.root_table,d.root_key,d.root_table,d.root_key FROM content_transition_dirty_roots d JOIN content_transitions t ON t.id=d.transition_id JOIN (SELECT transition_id,root_table row_table,root_key row_key FROM content_transition_dirty_roots) candidate ON candidate.transition_id=d.transition_id AND candidate.row_table=d.root_table AND candidate.row_key=d.root_key WHERE ${eligibleRoot("candidate")}
        UNION ALL SELECT * FROM content_transition_admitted_dependencies
      )
      UNION ${recursiveEdges(false)}
    ) SELECT * FROM closure`,
    `CREATE VIEW content_transition_live_rows AS
      SELECT transition_id,row_table,row_key FROM content_transition_live_membership
      UNION SELECT d.transition_id,d.row_table,d.row_key FROM content_transition_dirty_rows d WHERE d.structural=0 AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=d.transition_id AND m.row_table=d.row_table AND m.row_key=d.row_key)
    `,
    `CREATE TRIGGER content_transition_membership_add AFTER INSERT ON content_transition_membership BEGIN UPDATE content_transition_images SET root_count=root_count+1 WHERE transition_id=NEW.transition_id AND row_table=NEW.row_table AND row_key=NEW.row_key; END`,
    `CREATE TRIGGER content_transition_membership_remove AFTER DELETE ON content_transition_membership BEGIN UPDATE content_transition_images SET root_count=root_count-1 WHERE transition_id=OLD.transition_id AND row_table=OLD.row_table AND row_key=OLD.row_key; END`,
  );
  statements.push(`CREATE VIEW content_transition_live_images AS SELECT r.transition_id,r.row_table,r.row_key,CASE r.row_table ${capturedTables.map(table => `WHEN ${q(table)} THEN (SELECT ${image(table)} FROM ${named(table)} a WHERE ${matchKey(table,"a","r.row_key")})`).join("\n")} END image_json FROM content_transition_live_rows r`);
  statements.push(`CREATE VIEW content_transition_prepared_validation_membership AS WITH RECURSIVE closure(transition_id,root_table,root_key,row_table,row_key) AS (
    SELECT r.transition_id,r.root_table,r.root_key,r.root_table,r.root_key FROM content_transition_selected_roots r JOIN content_transitions t ON t.id=r.transition_id WHERE t.local_site=t.source_site AND t.phase='prepared'
    UNION ${recursiveEdges(false)}
  ) SELECT DISTINCT transition_id,row_table,row_key FROM closure`);
  const jsonTables=capturedTables.filter(table=>Object.keys(contentDispositionRegistry[table].json).length);
  const jsonTableNames=jsonTables.map(q).join(",");
  statements.push(`CREATE VIEW content_transition_validation_images AS SELECT j.transition_id,j.row_table,j.row_key,j.after_json image_json,j.commit_seq FROM content_transition_journal j JOIN content_transitions t ON t.id=j.transition_id WHERE t.local_site=t.source_site AND t.phase<>'prepared' AND j.after_json IS NOT NULL AND j.row_table IN (${jsonTableNames})
    UNION ALL SELECT r.transition_id,r.row_table,r.row_key,CASE r.row_table ${jsonTables.map(table=>`WHEN ${q(table)} THEN (SELECT ${image(table)} FROM ${named(table)} a WHERE ${matchKey(table,"a","r.row_key")})`).join("\n")} END,0 FROM content_transition_prepared_validation_membership r WHERE r.row_table IN (${jsonTableNames})`);
  statements.push(...sourceJsonValidationStatements());
  statements.push(...identityProjectionStatements());
  for (const table of capturedTables) {
    const registry = contentDispositionRegistry[table];
    const allColumns = [...registry.values, ...registry.excluded, ...Object.keys(registry.json)];
    const hasAccess = allColumns.includes("content_access" as never);
    const archiveOnly = hasAccess ? `${allColumns.filter(column => column!=="content_access").map(column => `OLD."${column}" IS NEW."${column}"`).join(" AND ")} AND EXISTS(SELECT 1 FROM content_transition_permits p JOIN content_transitions t ON t.id=p.transition_id WHERE p.mode='archive' AND t.aborted_at IS NULL AND t.local_site=t.source_site AND t.phase='source_fenced' AND p.generation=t.generation-1 AND ((p.operation_id='archive' AND OLD.content_access='normal' AND NEW.content_access='admin_archive') OR (p.operation_id='abort-restore' AND OLD.content_access='admin_archive' AND NEW.content_access='normal' AND json_extract(t.installation_json,'$.kind')='target_aborted' AND EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.root_table=${q(table)} AND m.row_table=m.root_table AND m.row_key=m.root_key AND m.root_key=${keySql(table,'OLD')} AND m.archive_previous_access='normal'))))` : "0";
    const active = "EXISTS(SELECT 1 FROM content_transitions WHERE aborted_at IS NULL AND (local_site=target_site OR phase<>'prepared'))";
    if (hasAccess) statements.push(`CREATE TRIGGER ct_${table}_access BEFORE UPDATE OF content_access ON ${named(table)} WHEN OLD.content_access IS NOT NEW.content_access AND ${active} AND NOT (${archiveOnly}) BEGIN SELECT RAISE(ABORT,'content_transition_archive_control_only'); END`);
    for (const action of ["INSERT", "UPDATE", "DELETE"] as const) {
      const refs = action==="INSERT" ? ["NEW"] : action==="DELETE" ? ["OLD"] : ["OLD", "NEW"];
      const owns = refs.map(ref=>{
        const parent=ownershipParents[table];
        const ownerTable=parent?.table ?? table;
        if (!parent && !ownedRootTables.includes(table)) return "0";
        const key=parent ? `json_array(${ref}."${parent.column}")` : keySql(table,ref);
        return `(EXISTS(SELECT 1 FROM content_transition_membership frozen WHERE frozen.transition_id=t.id AND frozen.root_table=${q(ownerTable)} AND frozen.root_key=${key} AND frozen.row_table=frozen.root_table AND frozen.row_key=frozen.root_key) OR EXISTS(SELECT 1 FROM ${named(ownerTable)} a WHERE ${matchKey(ownerTable,"a",key)} AND ${selected(ownerTable,"a")}))`;
      }).join(" OR ");
      const structural = action==="UPDATE" ? `iif(${structuralColumns(table).map(column => `OLD."${column}" IS NOT NEW."${column}"`).join(" OR ")},1,0)` : "1";
      const dirty = refs.map(ref => `INSERT INTO content_transition_dirty_rows(transition_id,row_table,row_key,structural) SELECT id,${q(table)},${keySql(table,ref)},${structural} FROM content_transitions WHERE aborted_at IS NULL AND (local_site=target_site OR phase<>'prepared') ON CONFLICT(transition_id,row_table,row_key) DO UPDATE SET structural=max(content_transition_dirty_rows.structural,excluded.structural);`).join("\n");
      const pathProjection=fileReferenceProjectionSql(table,action);
      const activeCondition=(indexedFileTables as readonly string[]).includes(table)?"1":active;
      statements.push(`CREATE TRIGGER ct_${table}_${action.toLowerCase()} AFTER ${action} ON ${named(table)} WHEN ${activeCondition}${action==="UPDATE" && hasAccess ? ` AND NOT (${archiveOnly})` : ""} BEGIN
        ${pathProjection}
        ${table==="ddays" && action==="INSERT"?`SELECT RAISE(ABORT,'content_transition_final_owner_required') FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=t.target_site AND NOT EXISTS(SELECT 1 FROM content_transition_permits p WHERE p.transition_id=t.id AND p.generation=t.generation AND (p.mode='baseline' AND t.phase IN ('prepared','target_ingress_ready','source_fenced') OR p.mode='business' AND t.phase IN ('target_owned','complete') AND EXISTS(SELECT 1 FROM content_transition_operations o WHERE o.transition_id=t.id AND o.operation_id=p.operation_id AND o.generation=t.generation AND o.source_seq IS NULL AND json_extract(o.envelope_json,'$.codec.id')='ddays.create' AND json_extract(o.envelope_json,'$.nativeReceipt.result') IS NULL)));`:""}
        SELECT RAISE(ABORT,'content_transition_source_root_fenced') WHERE EXISTS(SELECT 1 FROM content_transitions t WHERE t.aborted_at IS NULL AND t.local_site=t.source_site AND t.phase IN ('source_fenced','target_owned','complete') AND (${owns}));
        ${dirty}
        SELECT RAISE(ABORT,'content_transition_final_owner_required') FROM content_transition_dirty_rows d JOIN content_transitions t ON t.id=d.transition_id
          WHERE t.aborted_at IS NULL AND t.local_site=t.target_site AND (EXISTS(SELECT 1 FROM content_transition_baseline_rows b WHERE b.transition_id=t.id AND b.row_table=d.row_table AND b.row_key=d.row_key AND b.installed=1) OR EXISTS(SELECT 1 FROM content_transition_materialized_rows m WHERE m.transition_id=t.id AND m.row_table=d.row_table AND m.row_key=d.row_key))
          AND NOT EXISTS(SELECT 1 FROM content_transition_permits p WHERE p.transition_id=t.id AND p.generation=t.generation AND (p.mode='business' AND t.phase IN ('target_owned','complete') OR p.mode='baseline' AND t.phase IN ('prepared','target_ingress_ready','source_fenced')));
        SELECT RAISE(ABORT,'content_transition_final_owner_required') WHERE EXISTS(SELECT 1 FROM content_transition_affected_roots r JOIN content_transitions t ON t.id=r.transition_id WHERE t.aborted_at IS NULL AND (t.local_site=t.target_site OR t.phase IN ('protected','copying','replaying','target_ingress_ready')) AND NOT EXISTS(SELECT 1 FROM content_transition_permits p WHERE p.transition_id=t.id AND p.mode IN ('baseline','business') AND p.generation=iif(t.local_site=t.source_site,t.generation-1,t.generation) AND (t.local_site=t.source_site AND t.phase IN ('protected','copying','replaying','target_ingress_ready') OR t.local_site=t.target_site AND t.phase IN ('target_owned','complete') OR t.local_site=t.target_site AND p.mode='baseline' AND t.phase IN ('prepared','target_ingress_ready','source_fenced'))));
        DELETE FROM content_transition_dirty_rows WHERE NOT EXISTS(SELECT 1 FROM content_transition_permits p WHERE p.transition_id=content_transition_dirty_rows.transition_id);
      END`);
    }
  }
  statements.push(`CREATE TRIGGER content_transition_permit_retired BEFORE INSERT ON content_transition_permits WHEN EXISTS(SELECT 1 FROM content_transitions WHERE id=NEW.transition_id AND aborted_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'content_transition_aborted'); END`);
  const compact=statements.map(statement=>statement.replace(/\s+/g," "));
  for (const statement of compact) if (new TextEncoder().encode(statement).length > 100_000) throw new Error("Capture statement exceeds D1 SQL limit");
  return compact;
}

export function seedScopeStatements(db: D1Database, id: string): D1PreparedStatement[] {
  return [db.prepare("INSERT OR IGNORE INTO content_transition_dirty_roots SELECT transition_id,root_table,root_key FROM content_transition_selected_roots WHERE transition_id=?").bind(id)];
}
export function captureStatements(db: D1Database, id: string): D1PreparedStatement[] {
  const sql = [
    // Ordinary value changes use the row-only path. Structural changes use the
    // old membership and current reverse graph, including newly selected roots.
    `INSERT OR IGNORE INTO content_transition_dirty_roots SELECT r.* FROM content_transition_affected_roots r WHERE r.transition_id=? AND EXISTS(SELECT 1 FROM content_transition_dirty_rows d WHERE d.transition_id=r.transition_id AND d.structural=1)`,
    `INSERT INTO content_transition_journal(transition_id,commit_seq,row_table,row_key,before_json,after_json) SELECT l.transition_id,p.commit_seq,l.row_table,l.row_key,s.image_json,l.image_json FROM content_transition_live_images l JOIN content_transition_permits p ON p.transition_id=l.transition_id LEFT JOIN content_transition_images s ON s.transition_id=l.transition_id AND s.row_table=l.row_table AND s.row_key=l.row_key WHERE l.transition_id=? AND (s.image_json IS NULL OR s.image_json<>l.image_json)`,
    `INSERT INTO content_transition_images(transition_id,row_table,row_key,image_json) SELECT transition_id,row_table,row_key,image_json FROM content_transition_live_images WHERE transition_id=? ON CONFLICT(transition_id,row_table,row_key) DO UPDATE SET image_json=excluded.image_json WHERE content_transition_images.image_json<>excluded.image_json`,
    `DELETE FROM content_transition_membership AS m WHERE m.transition_id=? AND EXISTS(SELECT 1 FROM content_transition_dirty_roots d WHERE d.transition_id=m.transition_id AND d.root_table=m.root_table AND d.root_key=m.root_key) AND NOT EXISTS(SELECT 1 FROM content_transition_live_membership l WHERE l.transition_id=m.transition_id AND l.root_table=m.root_table AND l.root_key=m.root_key AND l.row_table=m.row_table AND l.row_key=m.row_key)`,
    `INSERT OR IGNORE INTO content_transition_membership(transition_id,root_table,root_key,row_table,row_key) SELECT * FROM content_transition_live_membership WHERE transition_id=?`,
    `INSERT INTO content_transition_journal(transition_id,commit_seq,row_table,row_key,before_json) SELECT s.transition_id,p.commit_seq,s.row_table,s.row_key,s.image_json FROM content_transition_images s JOIN content_transition_permits p ON p.transition_id=s.transition_id WHERE s.transition_id=? AND s.root_count=0`,
    `DELETE FROM content_transition_images WHERE transition_id=? AND root_count=0`,
    `DELETE FROM content_transition_dirty_rows WHERE transition_id=?`,
    `DELETE FROM content_transition_dirty_roots WHERE transition_id=?`,
  ];
  return sql.map(statement => db.prepare(statement).bind(id));
}
