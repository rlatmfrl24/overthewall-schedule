import {fileOriginSql,filePathSql} from "../../../platform/url-path-sql";
export {fileOriginSql,filePathSql} from "../../../platform/url-path-sql";
import {ownedFilePathSql} from "../../assets/commands";
import {noticeKeyFromPathSql,releaseLegacyFileSql,acquireLegacyFileSql} from "./file-retention";
import {currentFileIndexSql,currentRowFileIndexSql} from "./file-reference-integrity";

export const indexedFileTables=["notices","member_profile_images","naver_cafe_posts"] as const;


export function fileReferenceInputStatements():string[] {
  return [`CREATE VIEW asset_file_reference_inputs AS
    SELECT 'notices' row_table,id row_id,json_array(id) row_key,'thumbnail_url' field,thumbnail_url raw_url FROM notices WHERE thumbnail_url IS NOT NULL AND trim(thumbnail_url)<>''
    UNION ALL SELECT 'notices',n.id,json_array(n.id),'image_urls.'||image.key,image.value FROM notices n,json_each(n.image_urls) image WHERE typeof(image.value)='text' AND trim(image.value)<>''
    UNION ALL SELECT 'member_profile_images',id,json_array(id),'image_url',image_url FROM member_profile_images WHERE image_url IS NOT NULL AND trim(image_url)<>''
    UNION ALL SELECT 'naver_cafe_posts',id,json_array(id),'thumbnail_url',thumbnail_url FROM naver_cafe_posts WHERE thumbnail_url IS NOT NULL AND trim(thumbnail_url)<>''`,
    `CREATE VIEW content_transition_file_paths AS SELECT t.id transition_id,f.row_table,f.row_key,f.field,f.raw_url,${resolvedFilePathSql("f","t.plan_json")} path FROM content_transitions t CROSS JOIN asset_file_reference_paths f WHERE ${originMatchesPlanSql("f","t.plan_json")}`];
}

export function fileReferenceProjectionSql(table:string,action:"INSERT"|"UPDATE"|"DELETE"):string {
  if(!(indexedFileTables as readonly string[]).includes(table)) return "";
  const ids=action==="INSERT"?["NEW.id"]:action==="DELETE"?["OLD.id"]:["OLD.id","NEW.id"];
  const released=action==="INSERT"?"":`${releaseLegacyFileSql(`SELECT DISTINCT ${noticeKeyFromPathSql("f.path")} logical_key FROM asset_file_reference_paths f WHERE f.row_table='${table}' AND f.row_key=json_array(OLD.id) AND (${currentRowFileIndexSql("f",table,"OLD")}) AND NOT ${currentFileIndexSql("f")}`,"CAST(unixepoch('subsec')*1000 AS INTEGER)")};`;
  const projection=ids.map(id=>`DELETE FROM asset_file_reference_paths WHERE row_table='${table}' AND row_key=json_array(${id}) AND NOT EXISTS(SELECT 1 FROM asset_file_reference_inputs raw WHERE raw.row_table='${table}' AND raw.row_id=${id} AND raw.field=asset_file_reference_paths.field AND raw.raw_url=asset_file_reference_paths.raw_url);
    INSERT INTO asset_file_reference_paths(row_table,row_key,field,raw_url,origin,path)
    SELECT row_table,row_key,field,raw_url,${fileOriginSql("raw_url")},${filePathSql("raw_url")} FROM asset_file_reference_inputs WHERE row_table='${table}' AND row_id=${id}
    ON CONFLICT(row_table,row_key,field) DO UPDATE SET raw_url=excluded.raw_url,origin=excluded.origin,path=excluded.path WHERE asset_file_reference_paths.raw_url<>excluded.raw_url OR asset_file_reference_paths.origin IS NOT excluded.origin OR asset_file_reference_paths.path<>excluded.path;`).join("\n");
  const acquired=action==="DELETE"?"":acquireLegacyFileSql(`SELECT DISTINCT ${noticeKeyFromPathSql("f.path")} logical_key FROM asset_file_reference_paths f WHERE f.row_table='${table}' AND f.row_key=json_array(NEW.id)`)+";";
  return released+projection+acquired;
}

export function fileReferenceIndexGuardStatements():string[] {
  return [
    ...["INSERT","UPDATE"].map(action=>`CREATE TRIGGER asset_file_path_${action.toLowerCase()} BEFORE ${action} ON asset_file_reference_paths BEGIN
      SELECT RAISE(ABORT,'asset_file_index_identity') WHERE NOT ${currentFileIndexSql("NEW")} OR NEW.origin IS NOT ${fileOriginSql("NEW.raw_url")} OR NEW.path IS NOT ${filePathSql("NEW.raw_url")}; END`),
    `CREATE TRIGGER asset_file_path_delete BEFORE DELETE ON asset_file_reference_paths WHEN ${currentFileIndexSql("OLD")} BEGIN SELECT RAISE(ABORT,'asset_file_index_current_reference'); END`,
  ];
}

/** Compare against current raw row identities; index rows alone grant no access. */
export {currentFileIndexSql,currentRowFileIndexSql} from "./file-reference-integrity";
export const originMatchesPlanSql=(alias:string,plan:string)=>`(${alias}.origin IS NULL OR EXISTS(SELECT 1 FROM json_each(${plan},'$.fileOrigins') origin WHERE json_extract(origin.value,'$.origin')=${alias}.origin AND json_extract(origin.value,'$.kind') IN ('site','r2')))`;
export const resolvedFilePathSql=(alias:string,plan:string)=>`CASE WHEN EXISTS(SELECT 1 FROM json_each(${plan},'$.fileOrigins') origin WHERE json_extract(origin.value,'$.origin')=${alias}.origin AND json_extract(origin.value,'$.kind')='r2') THEN '/r2-assets'||${alias}.path ELSE ${alias}.path END`;

export function fileReferencesResolvedSql(plan="t.plan_json") {
  const selected=(uid:string)=>`EXISTS(SELECT 1 FROM json_each(${plan},'$.members') member WHERE json_extract(member.value,'$.uid')=${uid})`;
  const classified=(disposition:string)=>`EXISTS(SELECT 1 FROM json_each(${plan},'$.classifications') decision WHERE json_extract(decision.value,'$.table')=raw.row_table AND json_extract(decision.value,'$.key')=raw.row_key AND json_extract(decision.value,'$.disposition')='${disposition}')`;
  const owner=`(${classified("include")} OR raw.row_table='member_profile_images' AND EXISTS(SELECT 1 FROM member_profile_images p WHERE p.id=raw.row_id AND ${selected("p.member_uid")}) OR raw.row_table='naver_cafe_posts' AND EXISTS(SELECT 1 FROM naver_cafe_posts p WHERE p.id=raw.row_id AND ${selected("p.member_uid")}) OR raw.row_table='notices' AND EXISTS(SELECT 1 FROM notices n WHERE n.id=raw.row_id AND (${selected("n.publisher_member_uid")} OR EXISTS(SELECT 1 FROM json_each(n.related_member_uids) related WHERE ${selected("related.value")}))))`;
  const external=`EXISTS(SELECT 1 FROM json_each(${plan},'$.fileOrigins') origin WHERE json_extract(origin.value,'$.origin')=f.origin AND json_extract(origin.value,'$.kind')='external')`;
  return `NOT EXISTS(SELECT 1 FROM asset_file_reference_inputs raw LEFT JOIN asset_file_reference_paths f ON f.row_table=raw.row_table AND f.row_key=raw.row_key AND f.field=raw.field WHERE ${owner} AND NOT ${classified("exclude")} AND (f.raw_url IS NOT raw.raw_url OR NOT (${external} OR ${originMatchesPlanSql("f",plan)} AND ${ownedFilePathSql(resolvedFilePathSql("f",plan))})))`;
}

/** The same final manifest revision must describe every image replay will parse,
 * including an old URL subsequently corrected or deleted from current rows. */
export function sealedFileReferencesResolvedSql(plan="t.plan_json",transition="t.id") {
  const selected=(uid:string)=>`EXISTS(SELECT 1 FROM json_each(${plan},'$.members') member WHERE json_extract(member.value,'$.uid')=${uid})`;
  const classified=(disposition:string)=>`EXISTS(SELECT 1 FROM json_each(${plan},'$.classifications') decision WHERE json_extract(decision.value,'$.table')=i.row_table AND json_extract(decision.value,'$.key')=i.row_key AND json_extract(decision.value,'$.disposition')='${disposition}')`;
  const owner=`(${classified("include")} OR i.row_table IN ('member_profile_images','naver_cafe_posts') AND ${selected("json_extract(i.image_json,'$.member_uid')")} OR i.row_table='notices' AND (${selected("json_extract(i.image_json,'$.publisher_member_uid')")} OR EXISTS(SELECT 1 FROM json_each(json_extract(i.image_json,'$.related_member_uids')) related WHERE ${selected("related.value")})))`;
  const external=`EXISTS(SELECT 1 FROM json_each(${plan},'$.fileOrigins') origin WHERE json_extract(origin.value,'$.origin')=f.origin AND json_extract(origin.value,'$.kind')='external')`;
  return `NOT EXISTS(WITH images AS MATERIALIZED(
    SELECT j.row_table,j.row_key,j.before_json image_json FROM content_transition_journal j JOIN content_transition_commits c ON c.seq=j.commit_seq WHERE j.transition_id=${transition} AND c.sealed=1 AND j.before_json IS NOT NULL AND j.row_table IN ('notices','member_profile_images','naver_cafe_posts')
    UNION ALL SELECT j.row_table,j.row_key,j.after_json FROM content_transition_journal j JOIN content_transition_commits c ON c.seq=j.commit_seq WHERE j.transition_id=${transition} AND c.sealed=1 AND j.after_json IS NOT NULL AND j.row_table IN ('notices','member_profile_images','naver_cafe_posts')),
    selected_images AS MATERIALIZED(SELECT * FROM images i WHERE ${owner} AND NOT ${classified("exclude")}),
    raw AS MATERIALIZED(SELECT image.value raw_url FROM selected_images i,json_each(json_array(json_extract(i.image_json,'$.image_url'),json_extract(i.image_json,'$.thumbnail_url'))) image WHERE image.type='text' AND trim(image.value)<>''
      UNION ALL SELECT image.value FROM selected_images i,json_each(json_extract(i.image_json,'$.image_urls')) image WHERE image.type='text' AND trim(image.value)<>''),
    files AS MATERIALIZED(SELECT raw_url,${fileOriginSql("raw_url")} origin,${filePathSql("raw_url")} path FROM raw)
    SELECT 1 FROM files f WHERE NOT coalesce((${external} OR ${originMatchesPlanSql("f",plan)} AND ${ownedFilePathSql(resolvedFilePathSql("f",plan))}),0))`;
}
