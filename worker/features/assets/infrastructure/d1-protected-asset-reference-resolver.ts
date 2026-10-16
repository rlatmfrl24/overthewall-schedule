import type {SiteId} from "@contracts/site-definition";
import type { TransitionPlan } from "@contracts/content-transition";
import type {ProtectedAssetReferenceContext} from "@contracts/assets";
import type {ProtectedAssetReferenceResolver,NoticeImageMemberValidator} from "../application/ports/asset-reader";
import {classifyFileReference,normalizeOwnedFilePath} from "../domain/file-reference";
import { selectedFileRowSql } from "./file-reference-integrity";
import { contentRowHeldSql, contentRowMovedSql } from "../../content-access";

const tables=["notices","member_profile_images","naver_cafe_posts"] as const;
const imageMatches=(table:string,json:string)=>`(${table}='notices' AND (json_extract(${json},'$.thumbnail_url')=input.raw OR EXISTS(SELECT 1 FROM json_each(json_extract(${json},'$.image_urls')) image WHERE image.value=input.raw)) OR ${table}='member_profile_images' AND json_extract(${json},'$.image_url')=input.raw OR ${table}='naver_cafe_posts' AND json_extract(${json},'$.thumbnail_url')=input.raw)`;
const rowSelectedOrHeld=(table:string,row:string)=>`(${selectedFileRowSql(table,row)} OR EXISTS(SELECT 1 FROM content_transition_membership m WHERE m.transition_id=t.id AND m.row_table='${table}' AND m.row_key=json_array(${row}.id)))`;

/** Produces a same-site representation; never fetches or redirects to raw URLs. */
export class D1ProtectedAssetReferenceResolver implements ProtectedAssetReferenceResolver {
  private readonly db:D1Database;
  private readonly site:SiteId;
  private readonly resource:string;
  private readonly origins:readonly string[];
  private readonly noticeMembers:NoticeImageMemberValidator;
  constructor(db:D1Database,site:SiteId,resource:string,origins:readonly string[],noticeMembers:NoticeImageMemberValidator) {this.db=db;this.site=site;this.resource=resource;this.origins=origins;this.noticeMembers=noticeMembers;}
  private async noticeContext(raw:string,context:ProtectedAssetReferenceContext) {
    let restricted=false;
    const plans:TransitionPlan[]=[];
    if(context.id!==undefined) {
      const notice=await this.db.prepare(`SELECT n.content_access,${contentRowHeldSql("notices","n")} held,${contentRowMovedSql("notices","n")} moved,n.thumbnail_url,n.image_urls FROM notices n WHERE n.id=?`).bind(context.id).first<{content_access:string;held:number;moved:number;thumbnail_url:string|null;image_urls:string}>();
      if(!notice) throw new Error("Missing actual notice context");
      if(context.kind==="notice" && notice.thumbnail_url!==raw && !(JSON.parse(notice.image_urls) as string[]).includes(raw)) throw new Error("Notice image identity mismatch");
      if(context.kind==="notice-draft" && (notice.content_access!=="normal" || notice.moved)) throw new Error("Notice is not editable here");
      restricted=notice.content_access!=="normal" || !!notice.held;
      const rows=(await this.db.prepare(`SELECT t.plan_json FROM content_transitions t JOIN notices owner ON owner.id=? WHERE t.local_site=? AND ${rowSelectedOrHeld("notices","owner")}`).bind(context.id,this.site).all<{plan_json:string}>()).results;
      plans.push(...rows.map(row=>JSON.parse(row.plan_json) as TransitionPlan));
    }
    if(context.kind==="notice-draft") {
      if(!await this.noticeMembers.areRelatedMembersValid(context.relatedMemberUids)) throw new Error("Invalid actual notice members");
      const rows=(await this.db.prepare("SELECT t.plan_json FROM content_transitions t WHERE t.local_site=? AND EXISTS(SELECT 1 FROM json_each(t.plan_json,'$.members') member JOIN json_each(?) draft ON draft.value=iif(t.local_site=t.source_site,json_extract(member.value,'$.uid'),json_extract(member.value,'$.targetUid')))").bind(this.site,JSON.stringify(context.relatedMemberUids)).all<{plan_json:string}>()).results;
      plans.push(...rows.map(row=>JSON.parse(row.plan_json) as TransitionPlan));
    }
    return {restricted,plans};
  }
  private async protectedRaw(raw:string) {
    // Read actual raw inputs, including missing/stale derived-index cases. Draft
    // coordinates cannot erase an existing current, sealed or recovery hold.
    const selected=tables.map(table=>`(f.row_table='${table}' AND EXISTS(SELECT 1 FROM ${table} owner WHERE f.row_id=owner.id AND ${rowSelectedOrHeld(table,"owner")}))`).join(" OR ");
    const plans=(await this.db.prepare(`WITH input(raw) AS (SELECT ?) SELECT DISTINCT t.plan_json FROM content_transitions t,input WHERE t.local_site=? AND (
      EXISTS(SELECT 1 FROM asset_file_reference_inputs f WHERE f.raw_url=input.raw AND (${selected})) OR
      EXISTS(SELECT 1 FROM content_transition_journal j JOIN content_transition_commits c ON c.seq=j.commit_seq WHERE j.transition_id=t.id AND c.sealed=1 AND (${imageMatches("j.row_table","j.before_json")} OR ${imageMatches("j.row_table","j.after_json")})) OR
      EXISTS(SELECT 1 FROM content_transition_baseline_rows b WHERE b.transition_id=t.id AND ${imageMatches("b.row_table","json_extract(b.record_json,'$.value')")}) OR
      EXISTS(SELECT 1 FROM content_transition_file_inventory_rows r WHERE r.transition_id=t.id AND r.kind='reference' AND json_extract(r.value_json,'$.rawUrl')=input.raw))`).bind(raw,this.site).all<{plan_json:string}>()).results;
    const archived=await this.db.prepare(`WITH input(raw) AS (SELECT ?) SELECT EXISTS(SELECT 1 FROM asset_file_reference_inputs f,input WHERE f.raw_url=input.raw AND (
      f.row_table='notices' AND EXISTS(SELECT 1 FROM notices n WHERE n.id=f.row_id AND n.content_access='admin_archive') OR
      f.row_table='member_profile_images' AND EXISTS(SELECT 1 FROM member_profile_images p JOIN members m ON m.uid=p.member_uid WHERE p.id=f.row_id AND m.content_access='admin_archive') OR
      f.row_table='naver_cafe_posts' AND EXISTS(SELECT 1 FROM naver_cafe_posts n WHERE n.id=f.row_id AND n.content_access='admin_archive')))
      OR EXISTS(SELECT 1 FROM content_historical_records h,input WHERE ${imageMatches("h.source_table","h.record_json")}) restricted`).bind(raw).first<number>("restricted");
    return {restricted:!!archived,plans:plans.map(row=>JSON.parse(row.plan_json) as TransitionPlan)};
  }
  async resolve(raw:string,context?:ProtectedAssetReferenceContext):Promise<string|null> {
    const value=raw.trim(),url=new URL(value);
    if(!["http:","https:"].includes(url.protocol)) throw new Error("Invalid asset URL");
    const canonical=!url.username && !url.password && value.startsWith(`${url.origin}/`);
    const notice=context?await this.noticeContext(raw,context):null;
    if(this.origins.includes(url.origin)) {
      if(!canonical) throw new Error("Invalid canonical asset URL");
      return normalizeOwnedFilePath(url.pathname);
    }
    const protectedRaw=await this.protectedRaw(raw);
    const plans=[...notice?.plans??[],...protectedRaw.plans];
    if(notice && !notice.restricted && !protectedRaw.restricted && !plans.length) return null;
    if(!canonical) throw new Error("Invalid canonical asset URL");
    const paths=new Set<string>();
    let external=false;
    for(const plan of plans) {
      if(!plan.fileOrigins?.some(entry=>entry.origin===url.origin)) throw new Error("Unclassified protected asset origin");
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
