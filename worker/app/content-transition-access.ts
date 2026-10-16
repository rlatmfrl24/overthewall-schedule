import {catalogImportProjection} from "../features/otw-play";
import { apiRoutes } from "@contracts/api-routes";
import { parseSiteStorageResources } from "@contracts/site-definition";
import { D1TransitionRepository,assertTransitionAdmission } from "../features/content-transition";
import { authenticateOptionalRequest, isAdminUser } from "../platform/auth";
import type { Env } from "../platform/types";

export const privateTransitionResponse = (response:Response,head=false) => {
  const headers=new Headers(response.headers);
  headers.set("Cache-Control","private, no-store");
  headers.set("Vary",[headers.get("Vary"),"Authorization","Cookie"].filter(Boolean).join(", "));
  headers.set("X-Robots-Tag","noindex, nofollow");
  return new Response(head?null:response.body,{status:response.status,statusText:response.statusText,headers});
};

/** Runs before SEO, asset resolution, route dispatch, or any read cache. Auth
 * admits inspection only; each owning handler still applies its normal policy. */
export async function readTransitionAccess(request:Request,env:Env,assetPath:string) {
  const {site,database}=parseSiteStorageResources(env);
  const path=new URL(request.url).pathname;
  const read=["GET","HEAD","OPTIONS"].includes(request.method) || path===apiRoutes.assets.protectedReference.pattern || path===apiRoutes.otwPlay.resolvePerformances.pattern;
  if(!read) await assertTransitionAdmission(env.otw_db);
  const workspace=await new D1TransitionRepository(env.otw_db,site,database, null, null, catalogImportProjection).readInactiveTargetWorkspace();
  if(!workspace) return {inactive:false,response:null};
  const api=path==="/api" || path.startsWith("/api/");
  const asset=assetPath.startsWith("/profile/") && /\.[a-z0-9]+$/i.test(assetPath) || assetPath.startsWith("/r2-assets/");
  if(!read) return {inactive:true,response:null};
  // App/auth/config contain no staged content and remain usable for sign-in.
  if(path===apiRoutes.auth.adminStatus.pattern || path===apiRoutes.configuration.settings.pattern || path===apiRoutes.otwPlay.config.pattern) return {inactive:true,response:null};
  if(!api && !asset && path!=="/sitemap.xml" && !path.startsWith("/cache/")) {
    const shell=env.ASSETS?await env.ASSETS.fetch(request):new Response(null,{status:404});
    return {inactive:true,response:privateTransitionResponse(shell,request.method==="HEAD")};
  }
  const user=await authenticateOptionalRequest(request,env);
  if(user && (workspace.nativeReady || isAdminUser(env,user.id))) return {inactive:true,response:null};
  return {inactive:true,response:privateTransitionResponse(Response.json({error:{code:"CONTENT_PREPARING",message:"사이트 콘텐츠를 준비 중입니다. 승인된 사이트 계정으로 로그인해 주세요."}},{status:403}),request.method==="HEAD")};
}
