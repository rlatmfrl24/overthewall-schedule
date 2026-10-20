import {AdminCatalogService,D1AdminCatalogRepository,DrizzleAdminCatalogAudit,YouTubeOtwPlayMetadataReader} from "../features/otw-play";
import {parseSiteId} from "@contracts/site-definition";
import {getDb} from "../platform/db";
import type {Env} from "../platform/types";
import type {AdminCatalogRequest} from "../features/otw-play";

export const createOtwPlayAdminCatalogService=(env:Env,_requestKey?:string,request?:AdminCatalogRequest)=>new AdminCatalogService(
  new D1AdminCatalogRepository(env.otw_db,parseSiteId(env.SITE_ID),request),
  new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY,fetch,{db:env.otw_db,siteId:parseSiteId(env.SITE_ID),priority:"core",origin:"otw_play_admin_preflight"}),
  new DrizzleAdminCatalogAudit(getDb(env)),()=>crypto.randomUUID(),true,Date.now,
);
