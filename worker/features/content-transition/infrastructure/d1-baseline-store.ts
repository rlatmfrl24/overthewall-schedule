import type { TransitionIdentity, TransitionPlan } from "../../../../contracts/content-transition";
import { assertSameTransition } from "../domain/transition";
import { assertProjectedRecord, decodeProjectedRecord, projectCapturedRecord, type ProjectedRecord, type ProjectionContext } from "../domain/projected-content";
import { contentDispositionRegistry } from "../domain/disposition-registry";
import { projectedStatements } from "./projected-statements";
import {assertD1Row} from "./d1-size-bounds";

export interface BaselineHeader { identity:TransitionIdentity; boundary:number; rows:number; digest:string }
interface Cursor { sequence:number; ordinal:number; digest:string }
export interface BaselinePage { header:BaselineHeader; start:Cursor; next:Cursor; records:readonly ProjectedRecord[] }
type Stored={ordinal:number;row_digest:string;record_json:string};
const zero:Cursor={sequence:0,ordinal:0,digest:"0"};
export async function digestText(text:string):Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)))].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
function rank(table:keyof typeof contentDispositionRegistry,seen=new Set<string>()):number {
  const registry=contentDispositionRegistry[table];
  if(registry.destination==="historical") return 100;
  if(seen.has(table)) throw new Error(`Cyclic materialization dependency: ${table}`);
  const next=new Set([...seen,table]);
  return Math.max(0,...registry.foreignKeys.filter(foreign=>foreign.table!==table).map(foreign=>rank(foreign.table as keyof typeof contentDispositionRegistry,next)+1));
}

/** Baseline pages are inactive until complete staged and actual-row readback.
 * Ordinary business commits use the separate indivisible replay adapter. */
export class D1BaselineStore {
  private db:D1Database;
  private identity:TransitionIdentity;
  private context:ProjectionContext;
  constructor(db:D1Database,identity:TransitionIdentity,plan:TransitionPlan) {
    this.db=db;this.identity=identity;
    this.context={sourceSite:identity.sourceSite,classifications:plan.classifications,members:plan.members.map(member=>({uid:member.targetUid,targetUid:member.targetUid,name:member.code,externalEntityId:null}))};
  }
  private async acceptedIdentity(other:TransitionIdentity):Promise<void> {
    assertSameTransition(this.identity,{...other,manifestDigest:this.identity.manifestDigest});
    if(other.manifestDigest===this.identity.manifestDigest) return;
    const accepted=await this.db.prepare("SELECT 1 accepted FROM content_transition_manifest_revisions WHERE transition_id=? AND (parent_digest=? OR manifest_digest=?) LIMIT 1").bind(this.identity.id,other.manifestDigest,other.manifestDigest).first<number>("accepted");
    if(!accepted) throw new Error("Baseline manifest has no accepted revision lineage");
  }
  async describe(context:ProjectionContext):Promise<BaselineHeader> {
    const boundary=await this.db.prepare("SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='baseline' AND sealed=1").bind(this.identity.id).first<number>("seq");
    if(!boundary) throw new Error("Missing sealed baseline");
    const originalDigest=await this.db.prepare("SELECT parent_digest FROM content_transition_manifest_revisions WHERE transition_id=? ORDER BY revision LIMIT 1").bind(this.identity.id).first<string>("parent_digest");
    const header={identity:{...this.identity,manifestDigest:originalDigest??this.identity.manifestDigest},boundary,rows:0,digest:"0"};
    let cursor=zero;
    for(;;) {
      const page=await this.exportPage(header,cursor,context);
      if(page.next.sequence===cursor.sequence) break;
      cursor=page.next;
    }
    return {...header,rows:cursor.ordinal,digest:cursor.digest};
  }
  async exportPage(header:BaselineHeader,cursor:Cursor|0,context:ProjectionContext):Promise<BaselinePage> {
    await this.acceptedIdentity(header.identity);
    const start=cursor===0?zero:cursor;
    const rows=(await this.db.prepare("SELECT seq,row_table,row_key,after_json FROM content_transition_journal WHERE transition_id=? AND commit_seq=? AND seq>? ORDER BY seq LIMIT 15").bind(this.identity.id,header.boundary,start.sequence).all<{seq:number;row_table:string;row_key:string;after_json:string}>()).results;
    const records:ProjectedRecord[]=[];
    let digest=start.digest;
    for(const row of rows) {
      const record=await projectCapturedRecord(row.row_table as keyof typeof contentDispositionRegistry,row.row_key,JSON.parse(row.after_json),context);
      if(record) { records.push(record); digest=await digestText(digest+await digestText(JSON.stringify(record))); }
    }
    return {header,start,next:{sequence:rows.at(-1)?.seq??start.sequence,ordinal:start.ordinal+records.length,digest},records};
  }
  async begin(header:BaselineHeader):Promise<void> {
    await this.acceptedIdentity(header.identity);
    if(!Number.isSafeInteger(header.rows) || header.rows<0 || !Number.isSafeInteger(header.boundary) || header.boundary<1) throw new Error("Invalid baseline header");
    await this.db.prepare("INSERT OR IGNORE INTO content_transition_baselines(transition_id,manifest_digest,source_boundary,expected_rows,expected_digest) SELECT id,?,?,?,? FROM content_transitions WHERE id=? AND local_site=target_site AND phase IN ('target_ingress_ready','source_fenced')").bind(header.identity.manifestDigest,header.boundary,header.rows,header.digest,this.identity.id).run();
    const actual=await this.db.prepare("SELECT manifest_digest,source_boundary,expected_rows,expected_digest FROM content_transition_baselines WHERE transition_id=?").bind(this.identity.id).first<{manifest_digest:string;source_boundary:number;expected_rows:number;expected_digest:string}>();
    if(!actual || actual.manifest_digest!==header.identity.manifestDigest || actual.source_boundary!==header.boundary || actual.expected_rows!==header.rows || actual.expected_digest!==header.digest) throw new Error("Baseline identity conflict");
  }
  async stage(page:BaselinePage):Promise<void> {
    await this.begin(page.header);
    if(page.records.length>15 || !Number.isSafeInteger(page.start.ordinal) || page.start.ordinal<0 || page.next.ordinal>page.header.rows || page.next.ordinal!==page.start.ordinal+page.records.length) throw new Error("Invalid bounded baseline page");
    let digest=page.start.digest;
    const statements:D1PreparedStatement[]=[];
    const rowHashes:{ordinal:number;hash:string}[]=[];
    for(const [index,record] of page.records.entries()) {
      assertProjectedRecord(record);
      decodeProjectedRecord(record,this.context);
      const json=JSON.stringify(record),hash=await digestText(json);
      assertD1Row([this.identity.id,page.start.ordinal+index,record.table,record.key,hash,json,rank(record.table),0]);
      digest=await digestText(digest+hash);
      rowHashes.push({ordinal:page.start.ordinal+index,hash});
      statements.push(this.db.prepare("INSERT OR IGNORE INTO content_transition_baseline_rows(transition_id,ordinal,row_table,row_key,row_digest,record_json,dependency_rank) VALUES(?,?,?,?,?,?,?)").bind(this.identity.id,page.start.ordinal+index,record.table,record.key,hash,json,rank(record.table)));
    }
    if(digest!==page.next.digest) throw new Error("Baseline page digest mismatch");
    // The NOT NULL guard aborts the whole batch before inserting any row. An
    // exact already-staged page remains retryable, including after finalization.
    statements.unshift(this.db.prepare(`UPDATE content_transition_baselines SET staged_rows=iif(
      (staged_rows=? AND staged_digest=? AND receipt_json IS NULL) OR
      (staged_rows>=? AND NOT EXISTS(SELECT 1 FROM json_each(?) requested WHERE NOT EXISTS(
        SELECT 1 FROM content_transition_baseline_rows b WHERE b.transition_id=?
          AND b.ordinal=json_extract(requested.value,'$.ordinal') AND b.row_digest=json_extract(requested.value,'$.hash')))),staged_rows,NULL)
      WHERE transition_id=?`).bind(page.start.ordinal,page.start.digest,page.next.ordinal,JSON.stringify(rowHashes),this.identity.id,this.identity.id));
    statements.push(this.db.prepare("UPDATE content_transition_baselines SET staged_rows=?,staged_digest=? WHERE transition_id=? AND staged_rows=? AND staged_digest=? AND receipt_json IS NULL").bind(page.next.ordinal,digest,this.identity.id,page.start.ordinal,page.start.digest));
    try { await this.db.batch(statements); }
    catch(error) { throw new Error("Baseline page cursor or stored-row conflict",{cause:error}); }
    const actual=await this.db.prepare("SELECT staged_rows,staged_digest FROM content_transition_baselines WHERE transition_id=?").bind(this.identity.id).first<{staged_rows:number;staged_digest:string}>();
    if(!actual || actual.staged_rows<page.next.ordinal || actual.staged_rows===page.next.ordinal && actual.staged_digest!==digest) throw new Error("Baseline page cursor conflict");
    for(const [index,record] of page.records.entries()) {
      const hash=await this.db.prepare("SELECT row_digest FROM content_transition_baseline_rows WHERE transition_id=? AND ordinal=?").bind(this.identity.id,page.start.ordinal+index).first<string>("row_digest");
      if(hash!==await digestText(JSON.stringify(record))) throw new Error("Baseline stored row conflict");
    }
  }
  private async ready() {
    const header=await this.db.prepare("SELECT * FROM content_transition_baselines WHERE transition_id=?").bind(this.identity.id).first<{manifest_digest:string;source_boundary:number;expected_rows:number;expected_digest:string;staged_rows:number;staged_digest:string;receipt_json:string|null}>();
    if(!header || header.expected_rows!==header.staged_rows || header.expected_digest!==header.staged_digest) throw new Error("Baseline staging incomplete");
    await this.acceptedIdentity({...this.identity,manifestDigest:header.manifest_digest});
    return header;
  }
  async materialize():Promise<number> {
    await this.ready();
    const rows=(await this.db.prepare("SELECT b.ordinal,b.row_digest,b.record_json FROM content_transition_baseline_rows b WHERE b.transition_id=? AND b.installed=0 AND (b.row_table<>'music_songs' OR json_extract(b.record_json,'$.value.merged_into_song_id') IS NULL OR NOT EXISTS(SELECT 1 FROM content_transition_baseline_rows parent WHERE parent.transition_id=b.transition_id AND parent.row_table='music_songs' AND parent.row_key=json_array(json_extract(b.record_json,'$.value.merged_into_song_id')) AND parent.installed=0)) ORDER BY b.dependency_rank,b.ordinal LIMIT 8").bind(this.identity.id).all<Stored>()).results;
    if(!rows.length) {
      if(await this.db.prepare("SELECT count(*) n FROM content_transition_baseline_rows WHERE transition_id=? AND installed=0").bind(this.identity.id).first<number>("n")) throw new Error("Cyclic merged-song baseline requires manifest conflict resolution");
      return 0;
    }
    const mutations:D1PreparedStatement[]=[];
    for(const row of rows) {
      if(await digestText(row.record_json)!==row.row_digest) throw new Error("Baseline stored digest drift");
      const record=decodeProjectedRecord(JSON.parse(row.record_json),this.context);
      mutations.push(...projectedStatements(this.db,this.identity.id,record));
      mutations.push(this.db.prepare("UPDATE content_transition_baseline_rows SET installed=1 WHERE transition_id=? AND ordinal=? AND row_digest=?").bind(this.identity.id,row.ordinal,row.row_digest));
    }
    await this.db.batch([
      this.db.prepare("PRAGMA defer_foreign_keys=ON"),
      this.db.prepare("INSERT OR IGNORE INTO content_transition_commits(transition_id,operation_id) VALUES(?,'baseline-install')").bind(this.identity.id),
      this.db.prepare("INSERT INTO content_transition_permits(id,transition_id,operation_id,generation,mode,commit_seq) SELECT 1,id,'baseline-install',generation,'baseline',(SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='baseline-install') FROM content_transitions WHERE id=? AND local_site=target_site AND phase IN ('target_ingress_ready','source_fenced')").bind(this.identity.id,this.identity.id),
      ...mutations,
      this.db.prepare("DELETE FROM content_transition_dirty_rows WHERE transition_id=?").bind(this.identity.id),
      this.db.prepare("DELETE FROM content_transition_permits WHERE transition_id=?").bind(this.identity.id),
      this.db.prepare("PRAGMA defer_foreign_keys=OFF"),
    ]);
    return rows.length;
  }
  async finalize():Promise<{manifestDigest:string;boundary:number;rows:number;digest:string}> {
    const header=await this.ready();
    if(await this.db.prepare("SELECT count(*) n FROM content_transition_baseline_rows WHERE transition_id=? AND installed=0").bind(this.identity.id).first<number>("n")) throw new Error("Baseline materialization incomplete");
    // This receipt attests the historical baseline boundary. Once replay has
    // advanced, its business rows intentionally differ from that old image.
    if(header.receipt_json) {
      const receipt=JSON.parse(header.receipt_json);
      if(receipt.manifestDigest!==header.manifest_digest || receipt.boundary!==header.source_boundary || receipt.rows!==header.expected_rows || receipt.digest!==header.expected_digest) throw new Error("Baseline receipt drift");
      return receipt;
    }
    let after=-1,count=0,digest="0";
    for(;;) {
      const rows=(await this.db.prepare("SELECT ordinal,row_digest,record_json FROM content_transition_baseline_rows WHERE transition_id=? AND ordinal>? ORDER BY ordinal LIMIT 15").bind(this.identity.id,after).all<Stored>()).results;
      if(!rows.length) break;
      for(const row of rows) {
        if(row.ordinal!==count || await digestText(row.record_json)!==row.row_digest) throw new Error("Baseline row/count/hash drift");
        const record=decodeProjectedRecord(JSON.parse(row.record_json),this.context);
        if(record.destination==="historical") {
          const material=await this.db.prepare("SELECT record_json FROM content_historical_records WHERE source_site=? AND source_table=? AND source_key=?").bind(record.sourceSite,record.table,record.sourceRecordId).first<string>("record_json");
          if(!material || JSON.stringify(JSON.parse(material).values)!==JSON.stringify(record.value)) throw new Error("Baseline historical readback mismatch");
        } else {
          const registry=contentDispositionRegistry[record.table];
          const keys=JSON.parse(record.key) as Array<string|number>;
          const actual=await this.db.prepare(`SELECT * FROM "${record.table}" WHERE ${registry.primaryKey.map(column=>`"${column}"=?`).join(" AND ")}`).bind(...keys).first<Record<string,unknown>>();
          for(const [column,value] of Object.entries(record.value)) {
            const expected=typeof value==="boolean"?Number(value):value!==null && typeof value==="object"?JSON.stringify(value):value;
            if(!actual || actual[column]!==expected) throw new Error(`Baseline actual row readback mismatch: ${record.table}.${column}`);
          }
        }
        digest=await digestText(digest+row.row_digest);count++;after=row.ordinal;
      }
    }
    if(count!==header.expected_rows || digest!==header.expected_digest) throw new Error("Baseline overall readback mismatch");
    const receipt={manifestDigest:header.manifest_digest,boundary:header.source_boundary,rows:count,digest};
    await this.db.prepare("UPDATE content_transition_baselines SET receipt_json=? WHERE transition_id=? AND staged_rows=expected_rows AND staged_digest=expected_digest").bind(JSON.stringify(receipt),this.identity.id).run();
    return JSON.parse((await this.db.prepare("SELECT receipt_json FROM content_transition_baselines WHERE transition_id=?").bind(this.identity.id).first<string>("receipt_json"))!);
  }
}
