import {fileOriginSql,filePathSql} from "../../../platform/url-path-sql";
export {fileOriginSql,filePathSql} from "../../../platform/url-path-sql";
import {noticeKeyFromPathSql,releaseLegacyFileSql,acquireLegacyFileSql} from "./file-retention";
import {currentFileIndexSql,currentRowFileIndexSql} from "./file-reference-integrity";

export const indexedFileTables=["notices","member_profile_images","naver_cafe_posts"] as const;

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

export function fileReferenceProjectionTriggers(): string[] {
  return indexedFileTables.flatMap(table => (["INSERT", "UPDATE", "DELETE"] as const).map(action => {
    return `CREATE TRIGGER asset_file_projection_${table}_${action.toLowerCase()} AFTER ${action} ON ${table} BEGIN ${fileReferenceProjectionSql(table, action)} END`.replace(/\s+/g, " ");
  }));
}

/** Compare against current raw row identities; index rows alone grant no access. */
export {currentFileIndexSql,currentRowFileIndexSql} from "./file-reference-integrity";
