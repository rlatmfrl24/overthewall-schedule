import {parseSiteId} from "@contracts/site-definition";
import {D1IngestionRepository,CloudflareIngestionReadBudget,IngestionService,YouTubeOtwPlayMetadataReader} from "../features/otw-play";
import type {Env} from "../platform/types";
import {createOtwPlayAdminCatalogService} from "./admin-catalog";

export const createOtwPlayIngestionService=(env:Env)=>new IngestionService(
  new D1IngestionRepository(env.otw_db,parseSiteId(env.SITE_ID)),
  new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY,fetch,{db:env.otw_db,siteId:parseSiteId(env.SITE_ID),priority:"core",origin:"otw_play_ingestion"}),
  {send:async message=>{if(!env.OTW_PLAY_INGESTION_QUEUE)throw new Error("OTW Play ingestion queue is not configured");await env.OTW_PLAY_INGESTION_QUEUE.send(message);}},
  ()=>crypto.randomUUID(),Date.now,createOtwPlayAdminCatalogService(env),
  new CloudflareIngestionReadBudget(env.CLOUDFLARE_ACCOUNT_ID,env.CLOUDFLARE_D1_TOKEN,env.OTW_PLAY_D1_READ_DAILY_TARGET),
);
