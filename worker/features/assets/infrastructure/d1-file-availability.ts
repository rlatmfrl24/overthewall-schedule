import type { SiteId } from "@contracts/site-definition";
import type { FileObservation, StaticFileObservation, CommittedR2Observation,BaselineFileInventoryPage,LegacyR2Observation } from "@contracts/content-transition";
import type { CommittedFileAvailability, FileAvailabilityContext, BaselineFileInventoryContext } from "../../content-transition";
import { isStaticProfileAsset } from "../domain/asset-key-policy";
import { hashFileBytes } from "./d1-r2-file-store";
import {classifyFileReference} from "../domain/file-reference";
import {D1FileInventory} from "./d1-file-inventory";

const manifestPath="/profile/__artifact.json";
type StaticEntry={path:string;hash:string;size:number};
type FileReference={logical_key:string;version_key:string;hash:string;size:number};

/** Storage availability is a body read, bound to the current captured reference.
 * Static artifact receipts and immutable R2 upload observations stay distinct. */
export class D1FileAvailability implements CommittedFileAvailability {
  private readonly db:D1Database;
  private readonly bucket:R2Bucket;
  private readonly assets:Fetcher;
  private readonly site:SiteId;
  private readonly resource:string;
  private readonly inventory:D1FileInventory;
  constructor(db:D1Database,bucket:R2Bucket,assets:Fetcher,site:SiteId,resource:string) {
    this.db=db;this.bucket=bucket;this.assets=assets;this.site=site;this.resource=resource;
    this.inventory=new D1FileInventory(db,bucket,site,resource);
    if(!resource.startsWith(`${site}-`)) throw new Error("File availability resource/site mismatch");
  }
  observeArmedInventory(id:string,inventoryId:string) {return this.inventory.observe(id,inventoryId);}
  /** Initial copy consumes the original seal, before source ownership is fenced.
   * It neither creates fence receipts nor marks committed state installed. */
  async exportBaselineInventoryPage(context:BaselineFileInventoryContext,offset=0) {
    await this.validateBaselineContext(context);const page=await this.inventory.exportPage(context,offset);await this.validateBaselineContext(context);return page;
  }
  async receiveBaselineInventoryPage(context:BaselineFileInventoryContext,page:BaselineFileInventoryPage) {
    await this.validateBaselineContext(context);await this.inventory.receivePage(context,page);await this.validateBaselineContext(context);
  }
  async verifyBaselineInventory(context:BaselineFileInventoryContext) {
    await this.validateBaselineContext(context);
    if(this.site!==context.plan.targetSite) throw new Error("Only target verifies baseline copy");
    for(const expected of (await this.inventory.objects(context)).objects) {
      const actual=await this.inventory.readObject(expected.logicalKey);
      if(actual.hash!==expected.hash || actual.size!==expected.size) throw new Error("Legacy inventory target body/hash/size mismatch");
    }
    await this.validateBaselineContext(context);
  }
  private async validateBaselineContext(context:BaselineFileInventoryContext) {
    const row=await this.db.prepare("SELECT local_site,local_resource,plan_json,manifest_revision,phase,fence_json FROM content_transitions WHERE id=?").bind(context.plan.id)
      .first<{local_site:string;local_resource:string;plan_json:string;manifest_revision:number;phase:string;fence_json:string|null}>();
    const side=this.site===context.plan.sourceSite?"source":this.site===context.plan.targetSite?"target":null;
    if(!row || !side || row.local_site!==this.site || row.local_resource!==(side==="source"?context.plan.sourceResource:context.plan.targetResource) || row.plan_json!==JSON.stringify(context.plan) || row.manifest_revision!==context.manifestRevision) throw new Error("Stale baseline inventory transition/manifest/resource");
    if(row.fence_json!==null || !(side==="source"?["protected","copying","replaying","target_ingress_ready"]:["prepared","target_ingress_ready"]).includes(row.phase)) throw new Error("Baseline inventory is not in an unfenced copy phase");
    if(!context.plan.assetBuckets || context.plan.assetBuckets[side]!==this.resource) throw new Error("Baseline inventory bucket differs from approved manifest resource");
    if(side==="target" && !await this.db.prepare(`SELECT 1 ready FROM content_transition_baselines b JOIN content_transition_file_inventories i ON i.transition_id=b.transition_id
      WHERE b.transition_id=? AND i.source_boundary=b.source_boundary AND i.state IN ('receiving','received')
      AND json_extract(i.plan_json,'$.manifestDigest')=b.manifest_digest AND i.expected_rows>=3 AND i.expected_digest IS NOT NULL`).bind(context.plan.id).first("ready")) throw new Error("Baseline inventory requires its approved original receiving header");
  }
  async exportInventoryPage(context:FileAvailabilityContext,offset=0) {
    await this.validateContext(context);const page=await this.inventory.exportPage(context,offset);await this.validateContext(context);return page;
  }
  async receiveInventoryPage(context:FileAvailabilityContext,page:BaselineFileInventoryPage) {
    await this.validateContext(context);await this.inventory.receivePage(context,page);await this.validateContext(context);
  }
  private async validateContext(context:FileAvailabilityContext) {
    const row=await this.db.prepare("SELECT local_site,manifest_digest,manifest_revision,generation,fence_json,plan_json FROM content_transitions WHERE id=?").bind(context.plan.id)
      .first<{local_site:string;manifest_digest:string;manifest_revision:number;generation:number;fence_json:string;plan_json:string}>();
    if(!row || row.local_site!==this.site || row.manifest_digest!==context.plan.manifestDigest || row.manifest_revision!==context.manifestRevision || row.generation!==context.plan.generation || row.fence_json!==JSON.stringify(context.fence) || row.plan_json!==JSON.stringify(context.plan)) throw new Error("Stale file availability transition/manifest/generation/fence");
    const buckets=context.plan.assetBuckets;
    if(buckets && (!buckets.source.startsWith(`${context.plan.sourceSite}-`) || !buckets.target.startsWith(`${context.plan.targetSite}-`) || buckets[this.site===context.plan.sourceSite?"source":"target"]!==this.resource)) throw new Error("Availability bucket differs from approved manifest resource");
  }
  private async requirements(context:FileAvailabilityContext) {
    const paths=new Set<string>();
    for(const member of context.plan.members) {
      const uid=this.site===context.plan.sourceSite?member.uid:member.targetUid;
      const actual=await this.db.prepare("SELECT code FROM members WHERE uid=?").bind(uid).first<string>("code");
      if(actual!==member.code) throw new Error("Missing current file member reference");
      paths.add(`/profile/${member.code}.webp`);paths.add(`/profile/signatures/${member.code}.png`);
      const images=(await this.db.prepare("SELECT image_url url FROM member_profile_images WHERE member_uid=? UNION ALL SELECT '/r2-assets/'||logical_key url FROM asset_file_references WHERE logical_key LIKE ?")
        .bind(uid,`members/${member.code}/backgrounds/%`).all<{url:string}>()).results;
      for(const image of images) paths.add(image.url);
    }
    const rows=(await this.db.prepare(`SELECT n.thumbnail_url url FROM notices n JOIN (SELECT transition_id,row_table,row_key FROM content_transition_membership UNION SELECT transition_id,row_table,row_key FROM content_transition_materialized_rows UNION SELECT transition_id,row_table,row_key FROM content_transition_baseline_rows WHERE installed=1) m ON m.transition_id=? AND m.row_table='notices' AND m.row_key=json_array(n.id)
      UNION SELECT image.value url FROM notices n JOIN (SELECT transition_id,row_table,row_key FROM content_transition_membership UNION SELECT transition_id,row_table,row_key FROM content_transition_materialized_rows UNION SELECT transition_id,row_table,row_key FROM content_transition_baseline_rows WHERE installed=1) m ON m.transition_id=? AND m.row_table='notices' AND m.row_key=json_array(n.id),json_each(n.image_urls) image
      UNION SELECT p.thumbnail_url url FROM naver_cafe_posts p JOIN (SELECT transition_id,row_table,row_key FROM content_transition_membership UNION SELECT transition_id,row_table,row_key FROM content_transition_materialized_rows UNION SELECT transition_id,row_table,row_key FROM content_transition_baseline_rows WHERE installed=1) m ON m.transition_id=? AND m.row_table='naver_cafe_posts' AND m.row_key=json_array(p.id)
      UNION SELECT '/r2-assets/'||r.logical_key url FROM asset_file_references r JOIN (SELECT transition_id,row_table,row_key FROM content_transition_membership UNION SELECT transition_id,row_table,row_key FROM content_transition_materialized_rows UNION SELECT transition_id,row_table,row_key FROM content_transition_baseline_rows WHERE installed=1) m ON m.transition_id=? AND m.row_table='asset_file_references' AND m.row_key=json_array(r.logical_key)`)
      .bind(context.plan.id,context.plan.id,context.plan.id,context.plan.id).all<{url:string|null}>()).results;
    for(const row of rows) if(row.url) paths.add(row.url);
    const required=new Set<string>();
    for(const raw of paths) {
      const reference=classifyFileReference(raw,context.plan);
      if(reference.kind==="owned") required.add(reference.path);
    }
    return [...required].sort();
  }
  private async staticArtifact() {
    const response=await this.assets.fetch(`https://selected-assets.invalid${manifestPath}`);
    if(response.status!==200) throw new Error("Missing static artifact manifest proof");
    const bytes=new Uint8Array(await response.arrayBuffer());
    const artifact=JSON.parse(new TextDecoder().decode(bytes)) as {version:number;entries:StaticEntry[]};
    if(artifact.version!==1 || !Array.isArray(artifact.entries) || !artifact.entries.length) throw new Error("Invalid static artifact manifest");
    const entries=new Map<string,StaticEntry>();
    for(const entry of artifact.entries) {
      if(!isStaticProfileAsset(entry.path) || entries.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.hash) || !Number.isSafeInteger(entry.size) || entry.size<=0) throw new Error("Invalid static artifact entry");
      const body=await this.assets.fetch(`https://selected-assets.invalid${entry.path}`);
      const actual=new Uint8Array(await body.arrayBuffer());
      if(body.status!==200 || actual.byteLength!==entry.size || await hashFileBytes(actual)!==entry.hash) throw new Error("Static artifact body/hash/size mismatch");
      entries.set(entry.path,entry);
    }
    return {artifactHash:await hashFileBytes(bytes),entries};
  }
  async observeStatic(context:FileAvailabilityContext):Promise<StaticFileObservation[]> {
    await this.validateContext(context);
    const artifact=await this.staticArtifact();
    const observations:StaticFileObservation[]=[];
    for(const path of (await this.requirements(context)).filter(isStaticProfileAsset)) {
      const entry=artifact.entries.get(path);
      if(!entry) throw new Error(`Missing static file proof: ${path}`);
      const observation:StaticFileObservation={kind:"static",evidenceId:crypto.randomUUID(),transitionId:context.plan.id,generation:context.plan.generation,manifestDigest:context.plan.manifestDigest,manifestRevision:context.manifestRevision,fence:context.fence,site:this.site,resource:`${this.site}:ASSETS`,artifactHash:artifact.artifactHash,...entry};
      await this.storeStatic(observation);
      observations.push(observation);
    }
    await this.validateContext(context);
    return observations;
  }
  private async storeStatic(observation:StaticFileObservation|CommittedR2Observation|LegacyR2Observation) {
    await this.db.prepare("INSERT OR IGNORE INTO content_transition_file_availability_evidence(transition_id,evidence_id,observation_json) VALUES(?,?,?)").bind(observation.transitionId,observation.evidenceId,JSON.stringify(observation)).run();
    const stored=await this.db.prepare("SELECT observation_json FROM content_transition_file_availability_evidence WHERE transition_id=? AND evidence_id=?").bind(observation.transitionId,observation.evidenceId).first<string>("observation_json");
    if(stored!==JSON.stringify(observation)) throw new Error("Static observation identity conflict");
  }
  async receiveSourceStatic(context:FileAvailabilityContext,observation:StaticFileObservation) {
    await this.validateContext(context);
    if(observation.kind!=="static" || this.site!==context.plan.targetSite || observation.site!==context.plan.sourceSite || observation.resource!==`${context.plan.sourceSite}:ASSETS` || observation.transitionId!==context.plan.id || observation.generation!==context.plan.generation || observation.manifestDigest!==context.plan.manifestDigest || observation.manifestRevision!==context.manifestRevision || JSON.stringify(observation.fence)!==JSON.stringify(context.fence) || !/^[a-f0-9]{64}$/.test(observation.artifactHash) || !/^[a-f0-9]{64}$/.test(observation.hash) || !Number.isSafeInteger(observation.size) || observation.size<=0 || !(await this.requirements(context)).includes(observation.path)) throw new Error("Static source proof identity/reference mismatch");
    await this.storeStatic(observation);
  }
  private async reference(context:FileAvailabilityContext,key:string) {
    const reference=await this.db.prepare("SELECT logical_key,version_key,hash,size FROM asset_file_references WHERE logical_key=?").bind(key).first<FileReference>();
    if(!reference || !(await this.requirements(context)).includes(`/r2-assets/${key}`)) throw new Error("Missing committed captured file reference");
    if(this.site===context.plan.sourceSite) {
      const captured=await this.db.prepare(`SELECT j.after_json FROM content_transition_journal j JOIN content_transition_commits c ON c.seq=j.commit_seq WHERE j.transition_id=? AND j.row_table='asset_file_references' AND j.row_key=json_array(?) AND c.sealed=1 AND c.seq<=? ORDER BY j.seq DESC LIMIT 1`).bind(context.plan.id,key,context.fence.boundary).first<string>("after_json");
      const expected=captured?JSON.parse(captured) as FileReference:null;
      if(!expected || expected.version_key!==reference.version_key || expected.hash!==reference.hash || expected.size!==reference.size) throw new Error("Current file differs from captured committed reference");
    } else if(!await this.db.prepare(`SELECT 1 FROM content_transition_materialized_rows WHERE transition_id=? AND row_table='asset_file_references' AND row_key=json_array(?) UNION SELECT 1 FROM content_transition_baseline_rows WHERE transition_id=? AND row_table='asset_file_references' AND row_key=json_array(?) AND installed=1`).bind(context.plan.id,key,context.plan.id,key).first()) throw new Error("File reference was not installed from approved capture");
    return reference;
  }
  async observeCommittedR2(context:FileAvailabilityContext,key:string):Promise<CommittedR2Observation> {
    await this.validateContext(context);
    const reference=await this.reference(context,key);
    const object=await this.bucket.get(reference.version_key);
    if(!object) throw new Error("Missing committed immutable R2 body");
    const bytes=new Uint8Array(await object.arrayBuffer());
    if(bytes.byteLength!==reference.size || object.size!==reference.size || await hashFileBytes(bytes)!==reference.hash) throw new Error("Committed R2 body/hash/size mismatch");
    const observation:CommittedR2Observation={kind:"committed_r2",evidenceId:crypto.randomUUID(),transitionId:context.plan.id,generation:context.plan.generation,manifestDigest:context.plan.manifestDigest,manifestRevision:context.manifestRevision,fence:context.fence,site:this.site,resource:this.resource,logicalKey:key,versionKey:reference.version_key,objectVersion:object.version,hash:reference.hash,size:reference.size};
    await this.validateContext(context);
    await this.storeStatic(observation);
    return observation;
  }
  async receiveSourceCommittedR2(context:FileAvailabilityContext,observation:CommittedR2Observation) {
    await this.validateContext(context);
    const reference=await this.reference(context,observation.logicalKey);
    if(observation.kind!=="committed_r2" || !context.plan.assetBuckets || observation.resource!==context.plan.assetBuckets.source || this.site!==context.plan.targetSite || observation.site!==context.plan.sourceSite || observation.transitionId!==context.plan.id || observation.generation!==context.plan.generation || observation.manifestDigest!==context.plan.manifestDigest || observation.manifestRevision!==context.manifestRevision || JSON.stringify(observation.fence)!==JSON.stringify(context.fence) || !observation.objectVersion || observation.versionKey!==reference.version_key || observation.hash!==reference.hash || observation.size!==reference.size) throw new Error("Committed source R2 proof identity/reference mismatch");
    await this.storeStatic(observation);
  }
  async assertAvailable(context:FileAvailabilityContext) {
    await this.validateContext(context);
    if(this.site!==context.plan.targetSite) throw new Error("Only target verifies committed availability");
    const requirements=await this.requirements(context);
    if(!context.plan.assetBuckets) throw new Error("Missing approved bucket inventory resources");
    const legacy=await this.inventory.objects(context);
    for(const expected of legacy.objects) {
      const actual=await this.inventory.readObject(expected.logicalKey);
      if(actual.hash!==expected.hash || actual.size!==expected.size) throw new Error("Legacy inventory target body/hash/size mismatch");
      const observation:LegacyR2Observation={kind:"legacy_r2",evidenceId:await hashFileBytes(new TextEncoder().encode(JSON.stringify([legacy.inventoryId,this.site,this.resource,context.fence,actual]))),inventoryId:legacy.inventoryId,transitionId:context.plan.id,generation:context.plan.generation,manifestDigest:context.plan.manifestDigest,manifestRevision:context.manifestRevision,fence:context.fence,site:this.site,resource:this.resource,...actual};
      await this.storeStatic(observation);
    }
    const local=await this.observeStatic(context);
    const source=(await this.db.prepare("SELECT observation_json FROM content_transition_file_availability_evidence WHERE transition_id=?").bind(context.plan.id).all<{observation_json:string}>()).results.map(row=>JSON.parse(row.observation_json) as StaticFileObservation|CommittedR2Observation);
    for(const observation of local) {
      if(!source.some(prior=>prior.kind==="static" && prior.site===context.plan.sourceSite && prior.resource===`${context.plan.sourceSite}:ASSETS` && prior.path===observation.path && prior.hash===observation.hash && prior.size===observation.size && prior.generation===context.plan.generation && prior.manifestRevision===context.manifestRevision && prior.manifestDigest===context.plan.manifestDigest && JSON.stringify(prior.fence)===JSON.stringify(context.fence))) throw new Error("Missing matching source static body proof");
    }
    for(const path of requirements.filter(path=>path.startsWith("/r2-assets/"))) {
      const key=path.slice("/r2-assets/".length);
      if(!await this.db.prepare("SELECT 1 FROM asset_file_references WHERE logical_key=?").bind(key).first()) {
        if(!legacy.objects.some(object=>object.logicalKey===key)) throw new Error("Missing sealed legacy file inventory reference");
        continue;
      }
      const reference=await this.reference(context,key);
      const proofs=(await this.db.prepare(`SELECT e.observation_json FROM content_transition_file_intents i JOIN content_transition_file_evidence e ON e.transition_id=i.transition_id AND e.intent_id=i.intent_id WHERE i.transition_id=? AND i.version_key=? AND i.generation=? AND json_extract(i.envelope_json,'$.logicalKey')=? AND json_extract(i.envelope_json,'$.hash')=? AND json_extract(i.envelope_json,'$.size')=?`)
        .bind(context.plan.id,reference.version_key,context.plan.generation-1,key,reference.hash,reference.size).all<{observation_json:string}>()).results.map(row=>JSON.parse(row.observation_json) as FileObservation);
      const object=await this.bucket.get(reference.version_key);
      if(!object) throw new Error("Missing committed immutable R2 body");
      const bytes=new Uint8Array(await object.arrayBuffer());
      const activeProof=proofs.some(proof=>proof.site===this.site && proof.resource===this.resource && proof.result==="present" && proof.versionKey===reference.version_key && proof.objectVersion===object.version && proof.hash===reference.hash && proof.size===reference.size);
      const baselineProof=source.some(prior=>prior.kind==="committed_r2" && prior.site===context.plan.sourceSite && prior.resource===context.plan.assetBuckets?.source && prior.logicalKey===key && prior.versionKey===reference.version_key && prior.hash===reference.hash && prior.size===reference.size && prior.generation===context.plan.generation && prior.manifestRevision===context.manifestRevision && prior.manifestDigest===context.plan.manifestDigest && JSON.stringify(prior.fence)===JSON.stringify(context.fence));
      if(bytes.byteLength!==reference.size || await hashFileBytes(bytes)!==reference.hash || !activeProof && !baselineProof) throw new Error("Committed R2 body/version/resource proof mismatch");
      if(baselineProof) await this.observeCommittedR2(context,key);
    }
    await this.validateContext(context);
  }
}
