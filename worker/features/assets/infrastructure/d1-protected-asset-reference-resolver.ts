import type {SiteId} from "@contracts/site-definition";
import type {TransitionPlan} from "@contracts/content-transition";
import type {ProtectedAssetReferenceResolver} from "../application/ports/asset-reader";
import {classifyFileReference,normalizeOwnedFilePath} from "../domain/file-reference";
import {currentFileIndexSql,selectedFileRowSql} from "../../content-transition";

/** Produces a same-site representation; never fetches or redirects to raw URLs. */
export class D1ProtectedAssetReferenceResolver implements ProtectedAssetReferenceResolver {
  private readonly db:D1Database;
  private readonly site:SiteId;
  private readonly resource:string;
  private readonly origins:readonly string[];
  constructor(db:D1Database,site:SiteId,resource:string,origins:readonly string[]) {this.db=db;this.site=site;this.resource=resource;this.origins=origins;}
  async resolve(raw:string):Promise<string|null> {
    const value=raw.trim(),url=new URL(value);
    if(!["http:","https:"].includes(url.protocol) || url.username || url.password || !value.startsWith(`${url.origin}/`)) throw new Error("Invalid canonical asset URL");
    if(this.origins.includes(url.origin)) return normalizeOwnedFilePath(url.pathname);
    const selected=["notices","member_profile_images","naver_cafe_posts"].map(table=>`(f.row_table='${table}' AND EXISTS(SELECT 1 FROM ${table} owner WHERE f.row_key=json_array(owner.id) AND ${selectedFileRowSql(table,"owner")}))`).join(" OR ");
    const plans=(await this.db.prepare(`SELECT DISTINCT t.plan_json FROM content_transitions t JOIN asset_file_reference_paths f ON f.raw_url=? WHERE t.local_site=? AND ${currentFileIndexSql("f")} AND (${selected})`).bind(raw,this.site).all<{plan_json:string}>()).results;
    const paths=new Set<string>();
    let external=false;
    for(const row of plans) {
      const plan=JSON.parse(row.plan_json) as TransitionPlan;
      if(!plan.fileOrigins?.some(entry=>entry.origin===url.origin)) continue;
      const reference=classifyFileReference(raw,plan);
      if(reference.kind==="external") external=true;
      else if(reference.site===this.site && [this.resource,`${this.site}:ASSETS`].includes(reference.resource)) paths.add(reference.path);
      else throw new Error("Cross-site asset reference");
    }
    if(paths.size>1 || paths.size && external) throw new Error("Conflicting own asset origins");
    if(paths.size) return paths.values().next().value!;
    if(external) return null;
    throw new Error("Unclassified asset origin");
  }
}
