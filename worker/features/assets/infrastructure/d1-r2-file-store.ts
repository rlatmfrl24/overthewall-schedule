import type { SiteId } from "@contracts/site-definition";
import { getAssetContentType, getAssetMemberCode } from "../domain/asset-key-policy";
import { parseFileReplacement } from "../domain/file-command";
import { fileProtectedSql, releaseLegacyFileSql, NOTICE_FILE_GRACE_MS } from "./file-retention";

export interface FileWriteInput { operationId: string; logicalKey: string; contentType: string; bytes: Uint8Array }
export interface DurableFileIntent { operationId: string; logicalKey: string; versionKey: string; previousVersion: string | null; hash: string; size: number; contentType: string; memberUid:number|null;memberCode:string|null; generation: number; transitionId: string | null }
export interface VerifiedFile { objectVersion: string; hash: string; size: number }

type Row = { operation_id:string; logical_key:string; version_key:string; previous_version:string|null; hash:string; size:number; content_type:string; member_uid:number|null;member_code:string|null; generation:number; transition_id:string|null; site_id:string; resource:string; object_version:string|null; reference_committed_at:number|null; acknowledged_at:number|null;released_at:number|null;created_at:number };
const fromRow = (row: Row): DurableFileIntent => ({ operationId:row.operation_id, logicalKey:row.logical_key, versionKey:row.version_key, previousVersion:row.previous_version, hash:row.hash, size:row.size, contentType:row.content_type,memberUid:row.member_uid,memberCode:row.member_code, generation:row.generation, transitionId:row.transition_id });
export const hashFileBytes = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), value=>value.toString(16).padStart(2,"0")).join("");

/** R2 and D1 have separate durable commits. Retry reconciles the immutable key before attempting another put. */
export class D1R2FileStore {
  private readonly db:D1Database;
  private readonly bucket:R2Bucket;
  private readonly site:SiteId;
  private readonly resource:string;

  constructor(db:D1Database, bucket:R2Bucket, site:SiteId, resource:string) {
    this.db=db;this.bucket=bucket;this.site=site;this.resource=resource;
    if(!["otw","luvdia"].includes(site) || !resource) throw new Error("Explicit file site/resource required");
  }
  private row(operationId:string) { return this.db.prepare("SELECT * FROM asset_file_versions WHERE operation_id=?").bind(operationId).first<Row>(); }

  async begin(input:FileWriteInput):Promise<DurableFileIntent> {
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(input.operationId) || getAssetContentType(input.logicalKey)!==input.contentType || !input.bytes.byteLength) throw new Error("Invalid file operation identity/key/content type/bytes");
    const memberCode=getAssetMemberCode(input.logicalKey);
    const member=memberCode?await this.db.prepare("SELECT uid,code,content_access FROM members WHERE code=?").bind(memberCode).first<{uid:number;code:string;content_access:string}>():null;
    if(memberCode && (!member || member.content_access!=="normal")) throw new Error("File member is absent or archived on this site");
    const memberUid=member?.uid??null;
    const hash=await hashFileBytes(input.bytes);
    const existing=await this.row(input.operationId);
    if(existing) {
      if(existing.site_id!==this.site || existing.resource!==this.resource || existing.logical_key!==input.logicalKey || existing.hash!==hash || existing.size!==input.bytes.byteLength || existing.content_type!==input.contentType || existing.member_uid!==memberUid || existing.member_code!==memberCode) throw new Error("File operation identity conflict");

      if(existing.transition_id) throw new Error("Retained transfer file responsibility requires recovery before writing");
      return fromRow(existing);
    }
    const previousVersion=await this.db.prepare("SELECT version_key FROM asset_file_references WHERE logical_key=?").bind(input.logicalKey).first<string>("version_key");
    const intent:DurableFileIntent={operationId:input.operationId,logicalKey:input.logicalKey,versionKey:`_versions/${this.site}/${input.operationId}.${input.logicalKey.split('.').pop()}`,previousVersion,hash,size:input.bytes.byteLength,contentType:input.contentType,memberUid,memberCode,generation:1,transitionId:null};
    if(!parseFileReplacement(intent)) throw new Error("Invalid file replacement");

    await this.db.prepare(`INSERT OR IGNORE INTO asset_file_versions(version_key,operation_id,logical_key,site_id,generation,resource,previous_version,hash,size,content_type,member_uid,member_code,transition_id,transition_operation_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(intent.versionKey,intent.operationId,intent.logicalKey,this.site,intent.generation,this.resource,intent.previousVersion,hash,intent.size,intent.contentType,intent.memberUid,intent.memberCode,intent.transitionId,intent.transitionId?intent.operationId:null,Date.now()).run();
    const stored=(await this.row(input.operationId))!;
    if(JSON.stringify(fromRow(stored))!==JSON.stringify(intent)) throw new Error("File admission identity race");
    return intent;
  }

  async verifyPut(intent:DurableFileIntent, bytes:Uint8Array):Promise<VerifiedFile> {
    const stored=await this.row(intent.operationId);
    if(intent.transitionId) throw new Error("Retained transfer file responsibility requires recovery before writing");
    if(!stored || JSON.stringify(fromRow(stored))!==JSON.stringify(intent) || stored.site_id!==this.site || stored.resource!==this.resource) throw new Error("File intent identity mismatch");
    if(await this.db.prepare("SELECT 1 FROM asset_file_cleanup WHERE object_key=?").bind(intent.versionKey).first()) throw new Error("File version has a durable cleanup claim; use a new operation");
    if(bytes.byteLength!==intent.size || await hashFileBytes(bytes)!==intent.hash) throw new Error("File input byte hash/size mismatch");
    let object=await this.bucket.get(intent.versionKey);
    if(!object) {
      await this.db.prepare("UPDATE asset_file_versions SET attempted_at=COALESCE(attempted_at,?) WHERE operation_id=?").bind(Date.now(),intent.operationId).run();
      await this.bucket.put(intent.versionKey,bytes,{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:intent.contentType,cacheControl:"private, no-store"}});
      object=await this.bucket.get(intent.versionKey);
    }
    if(!object) throw new Error("Immutable put outcome unknown; retry the same operation");
    const actual=new Uint8Array(await object.arrayBuffer());
    const hash=await hashFileBytes(actual);
    if(hash!==intent.hash || actual.byteLength!==intent.size || object.size!==intent.size) throw new Error("Immutable object byte hash/size mismatch");
    const observed={objectVersion:object.version,hash,size:actual.byteLength};
    const update=await this.db.prepare("UPDATE asset_file_versions SET object_version=?,verified_at=COALESCE(verified_at,?) WHERE operation_id=? AND (object_version IS NULL OR object_version=?)")
      .bind(object.version,Date.now(),intent.operationId,object.version).run();
    if(update.meta.changes!==1) throw new Error("Immutable R2 upload version changed");
    return observed;
  }

  async commitReference(intent:DurableFileIntent, observed:VerifiedFile):Promise<void> {
    const row=await this.row(intent.operationId);
    if(!row || JSON.stringify(fromRow(row))!==JSON.stringify(intent) || row.site_id!==this.site || row.resource!==this.resource || row.object_version!==observed.objectVersion || row.hash!==observed.hash || row.size!==observed.size) throw new Error("Unverified file reference identity");
    if(row.reference_committed_at!==null) return;
    const now=Date.now();
    const statements=[
      // Force a constraint failure to roll back the whole transaction on a stale expected reference.
      this.db.prepare(`UPDATE asset_file_versions SET size=CASE WHEN (SELECT version_key FROM asset_file_references WHERE logical_key=?) IS ? AND (? IS NULL OR EXISTS(SELECT 1 FROM members WHERE uid=? AND code=? AND content_access='normal')) THEN size ELSE -1 END WHERE operation_id=? AND site_id=? AND generation=? AND resource=? AND object_version=?`).bind(intent.logicalKey,intent.previousVersion,intent.memberUid,intent.memberUid,intent.memberCode,intent.operationId,this.site,intent.generation,this.resource,observed.objectVersion),
      this.db.prepare(`INSERT INTO asset_file_references(logical_key,version_key,hash,size,content_type,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(logical_key) DO UPDATE SET version_key=excluded.version_key,hash=excluded.hash,size=excluded.size,content_type=excluded.content_type,updated_at=excluded.updated_at`).bind(intent.logicalKey,intent.versionKey,intent.hash,intent.size,intent.contentType,now),
      this.db.prepare("UPDATE asset_file_versions SET reference_committed_at=? WHERE operation_id=? AND reference_committed_at IS NULL").bind(now,intent.operationId),
      this.db.prepare("UPDATE asset_file_versions SET released_at=? WHERE version_key=?").bind(now,intent.previousVersion),
      this.db.prepare("UPDATE asset_file_retention_releases SET held=1 WHERE logical_key=? AND held=0").bind(intent.logicalKey),
    ];
    try {
      if(intent.transitionId) throw new Error("Retained transfer file responsibility requires recovery before writing");
      await this.db.batch(statements);
    } catch(error) {
      if(String(error).includes("asset_file_identity")) throw new Error("File reference version conflict",{cause:error});
      throw error;
    }
    const current=await this.db.prepare("SELECT version_key FROM asset_file_references WHERE logical_key=?").bind(intent.logicalKey).first<string>("version_key");
    if(current!==intent.versionKey || (await this.row(intent.operationId))?.reference_committed_at===null) throw new Error("File reference readback mismatch");
  }

  async acknowledge(intent:DurableFileIntent) {
    const result=await this.db.prepare("UPDATE asset_file_versions SET acknowledged_at=COALESCE(acknowledged_at,?) WHERE operation_id=? AND site_id=? AND generation=? AND resource=? AND reference_committed_at IS NOT NULL")
      .bind(Date.now(),intent.operationId,this.site,intent.generation,this.resource).run();
    if(result.meta.changes!==1) throw new Error("Cannot acknowledge uncommitted file reference");
  }

  async put(input:FileWriteInput) {
    const intent=await this.begin(input);
    const observation=await this.verifyPut(intent,input.bytes);
    await this.commitReference(intent,observation);
    await this.acknowledge(intent);
    return intent;
  }

  async releaseNoticeReference(logicalKey:string) {
    if(!logicalKey.startsWith("notices/thumbnails/")) throw new Error("File has no automatic cleanup authority");
    const now=Date.now();
    await this.db.batch([
      this.db.prepare(`UPDATE asset_file_versions SET released_at=? WHERE logical_key=? AND acknowledged_at IS NOT NULL AND EXISTS(SELECT 1 FROM asset_file_references r WHERE r.logical_key=asset_file_versions.logical_key) AND NOT ${fileProtectedSql("asset_file_versions.logical_key")}`).bind(now,logicalKey),
      this.db.prepare(`DELETE FROM asset_file_references WHERE logical_key=? AND NOT ${fileProtectedSql("asset_file_references.logical_key")}`).bind(logicalKey),
      this.db.prepare(`UPDATE asset_file_versions SET released_at=? WHERE logical_key=? AND released_at IS NULL AND acknowledged_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM asset_file_references r WHERE r.logical_key=asset_file_versions.logical_key) AND NOT ${fileProtectedSql("asset_file_versions.logical_key")}`).bind(now,logicalKey),
      this.db.prepare(releaseLegacyFileSql("SELECT ? logical_key","?")).bind(now,logicalKey),
    ]);
    return !await this.db.prepare("SELECT 1 FROM asset_file_references WHERE logical_key=?").bind(logicalKey).first();
  }

  async retention(logicalKey:string,objectKey:string,uploadedAt:number) {
    const state=await this.db.prepare(`SELECT ${fileProtectedSql("input.logical_key")} protected,EXISTS(SELECT 1 FROM asset_file_references r WHERE r.version_key=input.object_key) current FROM (SELECT ? logical_key,? object_key) input`).bind(logicalKey,objectKey).first<{protected:number;current:number}>();
    const version=await this.db.prepare("SELECT * FROM asset_file_versions WHERE version_key=?").bind(objectKey).first<Row>();
    const legacy=version?null:await this.db.prepare("SELECT released_at,held FROM asset_file_retention_releases WHERE logical_key=?").bind(logicalKey).first<{released_at:number;held:number}>();
    const graceStart=Math.max(uploadedAt,version?.acknowledged_at??0,version?.released_at??0,legacy?.released_at??0);
    const recoveryHeld=!!state?.protected || !!state?.current || (version ? version.acknowledged_at===null || version.released_at===null : !legacy || legacy.held!==0);
    return {recoveryHeld,cleanupEligible:logicalKey.startsWith("notices/thumbnails/") && !recoveryHeld && Date.now()-graceStart>=NOTICE_FILE_GRACE_MS,graceStart};
  }

  async listNoticeObjects() {
    const objects:Array<{key:string;objectKey:string;size:number;uploadedAt:number;recoveryHeld:boolean;cleanupEligible:boolean;graceStart:number}>=[];
    let cursor:string|undefined;
    do {
      const page=await this.bucket.list({prefix:"notices/thumbnails/",cursor});
      for(const object of page.objects) objects.push({key:object.key,objectKey:object.key,size:object.size,uploadedAt:object.uploaded.getTime(),...await this.retention(object.key,object.key,object.uploaded.getTime())});
      cursor=page.truncated?page.cursor:undefined;
    } while(cursor);
    const versions=await this.db.prepare("SELECT * FROM asset_file_versions WHERE logical_key LIKE 'notices/thumbnails/%' AND site_id=? AND resource=?").bind(this.site,this.resource).all<Row>();
    for(const version of versions.results) {
      const object=await this.bucket.head(version.version_key);
      if(object) objects.push({key:version.logical_key,objectKey:version.version_key,size:object.size,uploadedAt:object.uploaded.getTime(),...await this.retention(version.logical_key,version.version_key,object.uploaded.getTime())});
    }
    return objects;
  }

  async cleanupNoticeObject(logicalKey:string,objectKey:string) {
    if(!logicalKey.startsWith("notices/thumbnails/")) throw new Error("File has no automatic cleanup authority");
    const version=await this.db.prepare("SELECT * FROM asset_file_versions WHERE version_key=?").bind(objectKey).first<Row>();
    if(version ? version.logical_key!==logicalKey || version.site_id!==this.site || version.resource!==this.resource : objectKey!==logicalKey) throw new Error("Cleanup object identity mismatch");
    const generation=version?.generation??1;
    let claim=await this.db.prepare("SELECT * FROM asset_file_cleanup WHERE object_key=?").bind(objectKey).first<{site_id:string;resource:string;logical_key:string;object_version:string;hash:string;size:number;generation:number;deleted_at:number|null}>();
    let object=await this.bucket.get(objectKey);
    if(!claim) {
      if(!object) return false;
      if(!(await this.retention(logicalKey,objectKey,object.uploaded.getTime())).cleanupEligible) return false;
      const hash=await hashFileBytes(new Uint8Array(await object.arrayBuffer()));
      const now=Date.now();
      await this.db.prepare(`INSERT OR IGNORE INTO asset_file_cleanup(object_key,logical_key,site_id,resource,object_version,hash,size,generation,claimed_at)
        SELECT ?,?,?,?,?,?,?,COALESCE((SELECT generation FROM asset_file_versions WHERE version_key=?),1),? FROM (SELECT ? logical_key,? object_key) input WHERE NOT ${fileProtectedSql("input.logical_key")}
        AND NOT EXISTS(SELECT 1 FROM asset_file_references r WHERE r.version_key=input.object_key)
        AND NOT EXISTS(SELECT 1 FROM asset_file_versions v WHERE v.version_key=input.object_key AND (v.acknowledged_at IS NULL OR v.released_at IS NULL OR max(v.created_at,v.acknowledged_at,v.released_at)>?))
        AND (input.object_key<>input.logical_key OR EXISTS(SELECT 1 FROM asset_file_retention_releases r WHERE r.logical_key=input.logical_key AND r.held=0 AND r.released_at<=?))`)
        .bind(objectKey,logicalKey,this.site,this.resource,object.version,hash,object.size,objectKey,now,logicalKey,objectKey,now-NOTICE_FILE_GRACE_MS,now-NOTICE_FILE_GRACE_MS).run();
      claim=await this.db.prepare("SELECT * FROM asset_file_cleanup WHERE object_key=?").bind(objectKey).first<typeof claim>();
      if(!claim) return false;
      object=await this.bucket.get(objectKey);
    }
    if(claim.site_id!==this.site || claim.resource!==this.resource || claim.logical_key!==logicalKey || claim.generation!==generation) throw new Error("Cleanup claim resource/generation identity conflict");
    if(claim.deleted_at!==null) {
      if(object) throw new Error("Deleted immutable object unexpectedly reappeared");
      return true;
    }
    if(object) {
      if(object.version!==claim.object_version || object.size!==claim.size || await hashFileBytes(new Uint8Array(await object.arrayBuffer()))!==claim.hash) throw new Error("Cleanup object changed after durable claim");
      await this.bucket.delete(objectKey);
    }
    if(await this.bucket.head(objectKey)) throw new Error("Cleanup outcome unknown; reconcile the same durable claim");
    await this.db.prepare("UPDATE asset_file_cleanup SET deleted_at=COALESCE(deleted_at,?) WHERE object_key=? AND site_id=? AND resource=? AND generation=?").bind(Date.now(),objectKey,this.site,this.resource,generation).run();
    return true;
  }
}
