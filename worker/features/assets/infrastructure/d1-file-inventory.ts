import type {BaselineFileInventoryHeader,BaselineFileInventoryPage,BaselineFileInventoryRow,TransitionPlan} from "@contracts/content-transition";
import type {SiteId} from "@contracts/site-definition";
import {inventoryReferencesMatchSql,readFileInventoryHeader,type FileAvailabilityContext} from "../../content-transition";
import {classifyFileReference} from "../domain/file-reference";
import {getAssetContentType} from "../domain/asset-key-policy";
import {hashFileBytes} from "./d1-r2-file-store";

type Inventory={plan_json:string;manifest_revision:number;state:string;coverage_json:string|null;source_boundary:number|null;expected_rows:number|null;expected_digest:string|null;staged_rows:number;staged_digest:string};
export type LegacyObject={logicalKey:string;objectVersion:string;hash:string;size:number};
const digest=(value:string)=>hashFileBytes(new TextEncoder().encode(value));
const rowDigest=async(previous:string,row:BaselineFileInventoryRow)=>digest(previous+await digest(JSON.stringify(row)));

/** Explicit pre-baseline protection is owned by the transition repository. This
 * adapter observes real selected R2 bytes and transports the sealed inventory. */
export class D1FileInventory {
  private readonly db:D1Database;
  private readonly bucket:R2Bucket;
  private readonly site:SiteId;
  private readonly resource:string;
  constructor(db:D1Database,bucket:R2Bucket,site:SiteId,resource:string) {this.db=db;this.bucket=bucket;this.site=site;this.resource=resource;}
  private async row(id:string,inventoryId:string) {
    const row=await this.db.prepare("SELECT * FROM content_transition_file_inventories WHERE transition_id=? AND inventory_id=?").bind(id,inventoryId).first<Inventory>();
    if(!row) throw new Error("Missing explicit file inventory arm");return row;
  }
  private async records(id:string,inventoryId:string,offset=0,limit=15):Promise<BaselineFileInventoryRow[]> {
    return (await this.db.prepare("SELECT kind,identity,value_json value FROM content_transition_file_inventory_rows WHERE transition_id=? AND inventory_id=? ORDER BY kind,identity LIMIT ? OFFSET ?").bind(id,inventoryId,limit,offset).all<BaselineFileInventoryRow>()).results;
  }
  private async current(id:string,inventoryId:string) {
    const valid=await this.db.prepare(`SELECT i.plan_json=t.plan_json AND i.manifest_revision=t.manifest_revision AND t.phase='prepared' AND t.local_site=t.source_site AND t.local_site=? AND ${inventoryReferencesMatchSql()} valid FROM content_transition_file_inventories i JOIN content_transitions t ON t.id=i.transition_id WHERE i.transition_id=? AND i.inventory_id=?`).bind(this.site,id,inventoryId).first<number>("valid");
    if(valid!==1) throw new Error("Stale inventory manifest/reference/member snapshot");
  }
  async readObject(key:string,expected?:LegacyObject):Promise<LegacyObject> {
    const object=await this.bucket.get(key);
    if(!object) throw new Error(`Missing inventory R2 body: ${key}`);
    const bytes=new Uint8Array(await object.arrayBuffer());
    const result={logicalKey:key,objectVersion:object.version,hash:await hashFileBytes(bytes),size:bytes.byteLength};
    if(object.size!==result.size || expected && (expected.logicalKey!==key || expected.objectVersion!==result.objectVersion || expected.hash!==result.hash || expected.size!==result.size)) throw new Error("Inventory R2 body/version/hash/size mismatch");
    return result;
  }
  private async legacyPrefix(prefix:string) {
    const entries=new Map<string,string>();let cursor:string|undefined;
    do {
      const page=await this.bucket.list({prefix,cursor});
      for(const object of page.objects) if(getAssetContentType(object.key) && !await this.db.prepare("SELECT 1 FROM asset_file_references WHERE logical_key=?").bind(object.key).first()) entries.set(object.key,object.version);
      cursor=page.truncated?page.cursor:undefined;
    } while(cursor);
    return [...entries].sort(([a],[b])=>a.localeCompare(b));
  }
  async observe(id:string,inventoryId:string) {
    const row=await this.row(id,inventoryId),plan:TransitionPlan=JSON.parse(row.plan_json);
    if(plan.sourceSite!==this.site || plan.assetBuckets?.source!==this.resource || !["armed","observed"].includes(row.state)) throw new Error("Invalid source inventory resource/state");
    await this.current(id,inventoryId);
    const keys=new Set<string>();
    for(let offset=0;;offset+=15) {
      const rows=await this.records(id,inventoryId,offset);if(!rows.length) break;
      for(const record of rows.filter(record=>record.kind==="reference")) {
        const reference=JSON.parse(record.value) as {table:string;rawUrl:string;logicalKey:string|null};
        if(["members","asset_file_references"].includes(reference.table)) continue;
        const parsed=classifyFileReference(reference.rawUrl,plan);
        if(parsed.kind==="owned" && parsed.path.startsWith("/r2-assets/")) {
          if(parsed.site!==this.site || parsed.resource!==this.resource) throw new Error("Cross-resource inventory reference");
          const key=parsed.path.slice(11);
          if(!await this.db.prepare("SELECT 1 FROM asset_file_references WHERE logical_key=?").bind(key).first()) keys.add(key);
        }
      }
    }
    const coverage=plan.members.map(member=>`members/${member.code}/backgrounds/`).sort();
    const lists=await Promise.all(coverage.map(prefix=>this.legacyPrefix(prefix)));
    for(const list of lists) for(const [key] of list) keys.add(key);
    for(const key of [...keys].sort()) {
      const actual=await this.readObject(key);
      const value=JSON.stringify(actual);
      await this.db.prepare("INSERT OR IGNORE INTO content_transition_file_inventory_rows(transition_id,inventory_id,kind,identity,value_json) SELECT ?,?,'object',?,? WHERE EXISTS(SELECT 1 FROM content_transition_file_inventories WHERE transition_id=? AND inventory_id=? AND state='armed')").bind(id,inventoryId,key,value,id,inventoryId).run();
      if(await this.db.prepare("SELECT value_json FROM content_transition_file_inventory_rows WHERE transition_id=? AND inventory_id=? AND kind='object' AND identity=?").bind(id,inventoryId,key).first("value_json")!==value) throw new Error("Inventory observation changed; arm a new attempt");
    }
    for(let i=0;i<coverage.length;i++) if(JSON.stringify(await this.legacyPrefix(coverage[i]))!==JSON.stringify(lists[i])) throw new Error("Inventory prefix changed during observation");
    await this.current(id,inventoryId);
    let count=0,hash="0";
    for(;;) {const page=await this.records(id,inventoryId,count);if(!page.length) break;for(const record of page) {hash=await rowDigest(hash,record);count++;}}
    if(row.state==="observed" && row.expected_rows===count && row.expected_digest===hash && row.coverage_json===JSON.stringify(coverage)) return;
    await this.db.prepare(`UPDATE content_transition_file_inventories AS i SET state='observed',coverage_json=?,expected_rows=?,expected_digest=? WHERE transition_id=? AND inventory_id=? AND state IN ('armed','observed') AND EXISTS(SELECT 1 FROM content_transitions t WHERE t.id=i.transition_id AND t.phase='prepared' AND t.plan_json=i.plan_json AND t.manifest_revision=i.manifest_revision AND ${inventoryReferencesMatchSql()})`).bind(JSON.stringify(coverage),count,hash,id,inventoryId).run();
    const actual=await this.row(id,inventoryId);
    if(actual.state!=="observed" || actual.expected_rows!==count || actual.expected_digest!==hash) throw new Error("Inventory observation CAS conflict");
  }
  async sealed(id:string):Promise<{inventoryId:string;row:Inventory}> {
    const rows=(await this.db.prepare("SELECT inventory_id FROM content_transition_file_inventories WHERE transition_id=? AND state IN ('sealed','received')").bind(id).all<{inventory_id:string}>()).results;
    if(rows.length!==1) throw new Error("Missing or conflicting sealed file inventory");
    return {inventoryId:rows[0].inventory_id,row:await this.row(id,rows[0].inventory_id)};
  }
  async exportPage(context:FileAvailabilityContext,offset=0):Promise<BaselineFileInventoryPage> {
    if(this.site!==context.plan.sourceSite) throw new Error("Only source exports original inventory");
    const {inventoryId,row}=await this.sealed(context.plan.id);
    if(!Number.isSafeInteger(offset) || offset<0 || offset%15!==0 || offset>=row.expected_rows!) throw new Error("Invalid inventory cursor");
    const header:BaselineFileInventoryHeader={inventoryId,plan:JSON.parse(row.plan_json),manifestRevision:row.manifest_revision,sourceBoundary:row.source_boundary!,coverage:JSON.parse(row.coverage_json!),rows:row.expected_rows!,digest:row.expected_digest!};
    await this.validateHeader(context,header,false);
    let hash="0",ordinal=0;
    while(ordinal<offset) {const page=await this.records(context.plan.id,inventoryId,ordinal,Math.min(15,offset-ordinal));if(!page.length) throw new Error("Invalid inventory cursor");for(const record of page){hash=await rowDigest(hash,record);ordinal++;}}
    const start={ordinal,digest:hash},records=await this.records(context.plan.id,inventoryId,offset);
    for(const record of records) {if(record.kind==="object") await this.readObject(record.identity,JSON.parse(record.value));hash=await rowDigest(hash,record);ordinal++;}
    return {header,start,next:{ordinal,digest:hash},records};
  }
  private async validateHeader(context:FileAvailabilityContext,header:BaselineFileInventoryHeader,target:boolean) {
    const original=header.plan,current=context.plan;
    if(!header.inventoryId || !Number.isSafeInteger(header.rows) || header.rows<3 || !Number.isSafeInteger(header.sourceBoundary) || header.sourceBoundary<1 || header.sourceBoundary>context.fence.boundary || !/^[a-f0-9]{64}$/.test(header.digest) || JSON.stringify(header.coverage)!==JSON.stringify(original.members.map(member=>`members/${member.code}/backgrounds/`).sort())) throw new Error("Invalid inventory header/coverage");
    if(original.id!==current.id || original.sourceSite!==current.sourceSite || original.targetSite!==current.targetSite || original.sourceResource!==current.sourceResource || original.targetResource!==current.targetResource || original.generation!==current.generation || original.protocol!==current.protocol || JSON.stringify(original.members)!==JSON.stringify(current.members) || JSON.stringify(original.assetBuckets)!==JSON.stringify(current.assetBuckets) || original.assetBuckets?.[target?"target":"source"]!==this.resource) throw new Error("Inventory transition/resource identity mismatch");
    if(original.manifestDigest!==current.manifestDigest && !await this.db.prepare("SELECT 1 FROM content_transition_manifest_revisions WHERE transition_id=? AND (parent_digest=? OR manifest_digest=?)").bind(current.id,original.manifestDigest,original.manifestDigest).first()) throw new Error("Unapproved inventory manifest lineage");
    const boundary=target?await this.db.prepare("SELECT source_boundary FROM content_transition_baselines WHERE transition_id=?").bind(current.id).first<number>("source_boundary"):await this.db.prepare("SELECT seq FROM content_transition_commits WHERE transition_id=? AND operation_id='baseline' AND sealed=1").bind(current.id).first<number>("seq");
    if(boundary!==header.sourceBoundary) throw new Error("Inventory differs from original baseline");
    if(JSON.stringify(header)!==JSON.stringify(await readFileInventoryHeader(this.db,current.id,target?"target":"sealed"))) throw new Error("Inventory differs from original baseline seal");
  }
  async receivePage(context:FileAvailabilityContext,page:BaselineFileInventoryPage) {
    if(this.site!==context.plan.targetSite) throw new Error("Only target receives inventory");
    await this.validateHeader(context,page.header,true);
    const h=page.header;
    if(!Number.isSafeInteger(page.start.ordinal) || page.start.ordinal<0 || page.start.ordinal%15!==0 || !page.records.length || page.records.length!==Math.min(15,h.rows-page.start.ordinal) || page.next.ordinal!==page.start.ordinal+page.records.length || page.next.ordinal>h.rows) throw new Error("Invalid inventory page bounds");
    let hash=page.start.digest;
    for(const record of page.records) {
      if(!["reference","object"].includes(record.kind) || !record.identity) throw new Error("Invalid inventory row");
      const value=JSON.parse(record.value);
      if(record.kind==="object" && (value.logicalKey!==record.identity || !getAssetContentType(value.logicalKey) || typeof value.objectVersion!=="string" || !value.objectVersion || !/^[a-f0-9]{64}$/.test(value.hash) || !Number.isSafeInteger(value.size) || value.size<0)) throw new Error("Invalid inventory object proof");
      hash=await rowDigest(hash,record);
    }
    if(hash!==page.next.digest || page.next.ordinal===h.rows && hash!==h.digest) throw new Error("Inventory page digest mismatch");
    const stored=await this.row(h.plan.id,h.inventoryId);
    if(stored.plan_json!==JSON.stringify(h.plan) || stored.manifest_revision!==h.manifestRevision || stored.coverage_json!==JSON.stringify(h.coverage) || stored.source_boundary!==h.sourceBoundary || stored.expected_rows!==h.rows || stored.expected_digest!==h.digest) throw new Error("Conflicting original inventory header");
    if(stored.staged_rows>=page.next.ordinal) {
      // Restarting transport may repeat any complete earlier page. Re-read its
      // persisted prefix and rows; never rewind the cursor or write on replay.
      let ordinal=0,actualDigest="0";
      while(ordinal<page.next.ordinal) {
        if(ordinal===page.start.ordinal && actualDigest!==page.start.digest) throw new Error("Inventory replayed page predecessor conflict");
        const records=await this.records(h.plan.id,h.inventoryId,ordinal,Math.min(15,page.next.ordinal-ordinal));
        if(!records.length) throw new Error("Missing inventory replayed page rows");
        if(ordinal===page.start.ordinal && JSON.stringify(records)!==JSON.stringify(page.records)) throw new Error("Inventory replayed page row conflict");
        for(const record of records) {actualDigest=await rowDigest(actualDigest,record);ordinal++;}
      }
      if(actualDigest!==page.next.digest) throw new Error("Inventory replayed page digest conflict");
      return;
    }
    if(stored.state!=="receiving" || stored.staged_rows!==page.start.ordinal || stored.staged_digest!==page.start.digest) throw new Error("Inventory page predecessor mismatch");
    await this.db.batch([
      this.db.prepare("SELECT iif(coalesce((SELECT state='receiving' AND staged_rows=? AND staged_digest=? FROM content_transition_file_inventories WHERE transition_id=? AND inventory_id=?),0),1,json('inventory_page_predecessor_conflict'))").bind(page.start.ordinal,page.start.digest,h.plan.id,h.inventoryId),
      ...page.records.map(record=>this.db.prepare("INSERT INTO content_transition_file_inventory_rows(transition_id,inventory_id,kind,identity,value_json) VALUES(?,?,?,?,?)").bind(h.plan.id,h.inventoryId,record.kind,record.identity,record.value)),
      this.db.prepare("UPDATE content_transition_file_inventories SET staged_rows=?,staged_digest=?,state=iif(?=expected_rows,'received','receiving') WHERE transition_id=? AND inventory_id=? AND staged_rows=? AND staged_digest=?").bind(page.next.ordinal,page.next.digest,page.next.ordinal,h.plan.id,h.inventoryId,page.start.ordinal,page.start.digest),
    ]);
  }
  async objects(context:FileAvailabilityContext):Promise<{inventoryId:string;objects:LegacyObject[]}> {
    const {inventoryId,row}=await this.sealed(context.plan.id);
    await this.validateHeader(context,{inventoryId,plan:JSON.parse(row.plan_json),manifestRevision:row.manifest_revision,sourceBoundary:row.source_boundary!,coverage:JSON.parse(row.coverage_json!),rows:row.expected_rows!,digest:row.expected_digest!},this.site===context.plan.targetSite);
    const objects:LegacyObject[]=[];let ordinal=0,hash="0";
    for(;;) {const page=await this.records(context.plan.id,inventoryId,ordinal);if(!page.length) break;for(const record of page){hash=await rowDigest(hash,record);ordinal++;if(record.kind==="object") objects.push(JSON.parse(record.value));}}
    if(ordinal!==row.expected_rows || hash!==row.expected_digest) throw new Error("Incomplete or changed sealed inventory");
    return {inventoryId,objects};
  }
}
