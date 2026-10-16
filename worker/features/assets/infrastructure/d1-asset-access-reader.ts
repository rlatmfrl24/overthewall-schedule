import { publicationHiddenSql } from "../../content-access";
import { type SiteId } from "@contracts/site-definition";
import type { AssetAccessReader } from "../application/ports/asset-reader";
import { readContentAccessRevision } from "../../content-access";
import { currentRowFileIndexSql, selectedFileRowSql } from "./file-reference-integrity";

export class D1AssetAccessReader implements AssetAccessReader {
  private readonly db:D1Database;
  private readonly origin:string|null;
  private readonly siteId: SiteId;
  constructor(db: D1Database,origin:string|null=null,siteId:SiteId="otw") { this.db=db;this.siteId=siteId;this.origin=origin; }

  async readAccess(path: string) {
    const code = path.match(/^(?:\/r2-assets)?\/profile\/(?:signatures\/)?([a-z0-9_]+)\.(?:webp|png)$/i)?.[1]
      ?? path.match(/^\/r2-assets\/members\/([a-z0-9_]+)\/backgrounds\//i)?.[1] ?? null;
    const reference=(table:string,row:string)=>`EXISTS(SELECT 1 FROM asset_file_reference_paths f WHERE f.row_table='${table}' AND f.row_key=json_array(${row}.id) AND (${currentRowFileIndexSql("f",table,row)}) AND (
      (f.origin IS NULL OR f.origin=?) AND f.path=? OR EXISTS(SELECT 1 FROM content_transitions t,json_each(t.plan_json,'$.fileOrigins') o WHERE ${selectedFileRowSql(table,row)} AND json_extract(o.value,'$.origin')=f.origin AND json_extract(o.value,'$.site')=t.local_site AND json_extract(o.value,'$.kind') IN ('site','r2') AND iif(json_extract(o.value,'$.kind')='r2','/r2-assets'||f.path,f.path)=?)))`;
    const rows = (await this.db.prepare(`SELECT CASE WHEN ${publicationHiddenSql("members","members",this.siteId)} THEN 'admin_archive' ELSE content_access END content_access FROM members WHERE lower(code)=lower(?)
      UNION ALL SELECT CASE WHEN ${publicationHiddenSql("members","m",this.siteId)} THEN 'admin_archive' ELSE m.content_access END content_access FROM member_profile_images p JOIN members m ON m.uid=p.member_uid WHERE ${reference("member_profile_images","p")}
      UNION ALL SELECT CASE WHEN ${publicationHiddenSql("notices","n",this.siteId)} THEN 'admin_archive' ELSE n.content_access END content_access FROM notices n WHERE ${reference("notices","n")}
      UNION ALL SELECT CASE WHEN ${publicationHiddenSql("naver_cafe_posts","n",this.siteId)} THEN 'admin_archive' ELSE n.content_access END content_access FROM naver_cafe_posts n WHERE ${reference("naver_cafe_posts","n")}`)
      .bind(code,this.origin,path,path,this.origin,path,path,this.origin,path,path).all<{ content_access: string }>()).results;
    // Unreferenced uploads are admin drafts; an unrelated legitimate reference keeps shared bytes public.
    return { restricted: !rows.some(row => row.content_access === "normal"), revision: await readContentAccessRevision(this.db, this.siteId) };
  }
}
