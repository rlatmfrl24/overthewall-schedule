import {currentFileIndexSql,selectedFileRowSql} from "./file-reference-integrity";
import {fileOriginSql,filePathSql} from "../../../platform/url-path-sql";
/** Existing cleanup authority is limited to notice thumbnails. These predicates
 * are shared by eligibility and the durable deletion claim's final D1 guard. */
// Unknown absolute origins with a candidate path retain that object until classified.
// This is a hold, never an ownership or public-access grant.
const externalOriginSql=(origin:string,scope:string)=>`EXISTS(SELECT 1 FROM content_transitions t,json_each(t.plan_json,'$.fileOrigins') o WHERE json_extract(o.value,'$.origin')=${origin} AND json_extract(o.value,'$.kind')='external' AND ${scope})`;
const externalIndexedReferenceSql=(alias:string)=>externalOriginSql(`${alias}.origin`,`(${["notices","member_profile_images","naver_cafe_posts"].map(table=>`(${alias}.row_table='${table}' AND EXISTS(SELECT 1 FROM ${table} owner WHERE json_array(owner.id)=${alias}.row_key AND ${selectedFileRowSql(table,"owner")}))`).join(" OR ")})`);
const candidatePathSql=(path:string,key:string)=>`${path} IN ('/r2-assets/'||${key},'/'||${key})`;
export const noticeKeyFromPathSql=(path:string)=>`iif(${path} LIKE '/r2-assets/notices/thumbnails/%',substr(${path},12),iif(${path} LIKE '/notices/thumbnails/%',substr(${path},2),NULL))`;
export const liveFileReferencesSql=(key:string)=>`(
  EXISTS(SELECT 1 FROM asset_file_reference_paths f WHERE ${candidatePathSql("f.path",key)} AND ${currentFileIndexSql("f")} AND NOT ${externalIndexedReferenceSql("f")}) OR
  EXISTS(SELECT 1 FROM asset_file_reference_inputs raw WHERE NOT EXISTS(SELECT 1 FROM asset_file_reference_paths f WHERE f.row_table=raw.row_table AND f.row_key=raw.row_key AND f.field=raw.field AND f.raw_url=raw.raw_url) AND ${candidatePathSql(filePathSql("raw.raw_url"),key)}) OR
  EXISTS(SELECT 1 FROM members m WHERE ${key} LIKE 'members/'||m.code||'/backgrounds/%') OR
  0
)`;
export const historicalFileReferencesSql=(key:string)=>`(
  EXISTS(SELECT 1 FROM content_transition_membership m JOIN content_transitions t ON t.id=m.transition_id WHERE t.phase<>'prepared' AND m.row_table='asset_file_references' AND m.row_key=json_array(${key})) OR
  EXISTS(SELECT 1 FROM content_transition_journal j,json_tree(j.before_json) image WHERE (image.atom=${key} OR ${candidatePathSql(filePathSql("image.atom"),key)})) OR
  EXISTS(SELECT 1 FROM content_transition_journal j,json_tree(j.after_json) image WHERE (image.atom=${key} OR ${candidatePathSql(filePathSql("image.atom"),key)})) OR
  EXISTS(SELECT 1 FROM content_transition_baseline_rows b,json_tree(b.record_json) image WHERE (image.atom=${key} OR ${candidatePathSql(filePathSql("image.atom"),key)})) OR
  EXISTS(SELECT 1 FROM content_historical_records h,json_tree(h.record_json) image WHERE (image.atom=${key} OR ${candidatePathSql(filePathSql("image.atom"),key)}))
)`;
export const recoveryFileHeldSql=(key:string)=>`(
  EXISTS(SELECT 1 FROM content_transition_file_inventories i WHERE EXISTS(SELECT 1 FROM content_transition_file_inventory_rows r WHERE r.transition_id=i.transition_id AND r.inventory_id=i.inventory_id AND (r.kind='object' AND r.identity=${key} OR r.kind='reference' AND json_extract(r.value_json,'$.logicalKey')=${key})) OR EXISTS(SELECT 1 FROM json_each(i.plan_json,'$.members') m WHERE ${key} LIKE 'members/'||json_extract(m.value,'$.code')||'/backgrounds/%')) OR
  EXISTS(SELECT 1 FROM asset_file_versions v WHERE v.logical_key=${key} AND (v.acknowledged_at IS NULL OR v.reference_committed_at IS NULL)) OR
  EXISTS(SELECT 1 FROM content_transition_file_intents i JOIN content_transitions t ON t.id=i.transition_id WHERE json_extract(i.envelope_json,'$.logicalKey')=${key} AND (t.phase<>'complete' OR i.outcome_acknowledged=0 OR i.outcome_json IS NULL OR json_extract(i.outcome_json,'$.sideEffectReconciled')<>1))
)`;
export const fileProtectedSql=(key:string)=>`(${liveFileReferencesSql(key)} OR ${historicalFileReferencesSql(key)} OR ${recoveryFileHeldSql(key)})`;

export const releaseLegacyFileSql=(candidates:string,now:string)=>`INSERT INTO asset_file_retention_releases(logical_key,released_at,held)
  SELECT candidate.logical_key,${now},0 FROM (${candidates}) candidate WHERE candidate.logical_key IS NOT NULL AND NOT ${fileProtectedSql("candidate.logical_key")}
    AND (NOT EXISTS(SELECT 1 FROM asset_file_versions v WHERE v.logical_key=candidate.logical_key) OR EXISTS(SELECT 1 FROM asset_file_retention_releases r WHERE r.logical_key=candidate.logical_key))
  ON CONFLICT(logical_key) DO UPDATE SET released_at=max(asset_file_retention_releases.released_at,excluded.released_at),held=0 WHERE asset_file_retention_releases.held=1`;

export const acquireLegacyFileSql=(candidates:string)=>`INSERT INTO asset_file_retention_releases(logical_key,released_at,held)
  SELECT candidate.logical_key,0,1 FROM (${candidates}) candidate WHERE candidate.logical_key IS NOT NULL
    AND (NOT EXISTS(SELECT 1 FROM asset_file_versions v WHERE v.logical_key=candidate.logical_key) OR EXISTS(SELECT 1 FROM asset_file_retention_releases r WHERE r.logical_key=candidate.logical_key))
  ON CONFLICT(logical_key) DO UPDATE SET held=1 WHERE asset_file_retention_releases.held=0`;

/** Historical replay can add or intentionally remove a file hold after a live
 * reference was released. Keep that clock in its actual owning transaction.
 * Immutable journals/baselines keep holding their files; there is no expiry. */
export function historicalFileRetentionTriggers():string[] {
  const keys=(row:string)=>`SELECT DISTINCT iif(image.atom LIKE 'notices/thumbnails/%',image.atom,${noticeKeyFromPathSql(filePathSql("image.atom"))}) logical_key FROM json_tree(${row}.record_json) image WHERE image.type='text'`;
  return ["INSERT","UPDATE","DELETE"].map(action=>`CREATE TRIGGER asset_file_history_${action.toLowerCase()} AFTER ${action} ON content_historical_records ${action==="UPDATE"?"WHEN OLD.record_json IS NOT NEW.record_json":""} BEGIN
    ${action==="DELETE"?"":acquireLegacyFileSql(keys("NEW"))+";"}
    ${action==="INSERT"?"":releaseLegacyFileSql(keys("OLD"),"CAST(unixepoch('subsec')*1000 AS INTEGER)")+";"}
  END`);
}

/** A pending/finished physical deletion cannot acquire a new business reference.
 * A genuinely newer immutable version at the same logical path is independent. */
export function fileReferenceGuardTriggers() {
  const blocked=(url:string,table:string)=>`EXISTS(SELECT 1 FROM asset_file_cleanup c WHERE ${candidatePathSql(filePathSql(url),"c.logical_key")} AND NOT ${externalOriginSql(fileOriginSql(url),selectedFileRowSql(table,"NEW"))} AND NOT EXISTS(SELECT 1 FROM asset_file_references r WHERE r.logical_key=c.logical_key AND r.version_key<>c.object_key))`;
  const tables=[
    ["notices",`EXISTS(SELECT 1 FROM json_each(json_insert(NEW.image_urls,'$[#]',NEW.thumbnail_url)) image WHERE ${blocked("image.value","notices")})`],
    ["member_profile_images",blocked("NEW.image_url","member_profile_images")],
    ["naver_cafe_posts",blocked("NEW.thumbnail_url","naver_cafe_posts")],
  ];
  return [
    ...tables.flatMap(([table,predicate])=>["INSERT","UPDATE"].map(event=>`CREATE TRIGGER asset_file_${table}_${event.toLowerCase()} BEFORE ${event} ON ${table} WHEN ${predicate} BEGIN SELECT RAISE(ABORT,'asset_file_cleanup_reference_conflict'); END`)),
    ...["INSERT","UPDATE"].map(event=>`CREATE TRIGGER asset_file_reference_${event.toLowerCase()} BEFORE ${event} ON asset_file_references WHEN EXISTS(SELECT 1 FROM asset_file_cleanup c WHERE c.object_key=NEW.version_key) BEGIN SELECT RAISE(ABORT,'asset_file_cleanup_reference_conflict'); END`),
  ];
}
