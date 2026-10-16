import {buildContentTransitionRepository,transitionPeer} from './content-transition';
import {D1YouTubeVideoReadJournal,D1CandidateChannelStages} from '../features/content-transition';
import {parseSiteStorageResources} from '@contracts/site-definition';
import type {TransitionOperationMessage} from '@contracts/content-transition-queue';
import {
  D1IngestionRepository,
  D1ReviewDeletionWriter,
  D1CandidateReviewWriter,
  D1CandidateMetadataWriter,
  D1CandidateChannelWriter,
  CloudflareIngestionReadBudget,
  IngestionService,
  YouTubeOtwPlayMetadataReader,
  type OtwPlayIngestionQueueMessage,
} from "../features/otw-play";
import type { Env } from "../platform/types";
import { createOtwPlayAdminCatalogService,createOtwPlayVideoCatalogWriter } from "./admin-catalog";

export const createOtwPlayIngestionService = (env: Env,resume?:TransitionOperationMessage) => {
  const conversionWriter=createOtwPlayVideoCatalogWriter(env,undefined,resume);
  const {site,database}=parseSiteStorageResources(env);
  const metadata=new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY,fetch,{db:env.otw_db,siteId:site,priority:'core',origin:'otw_play_ingestion'});
  const approvalWriter=new D1CandidateChannelWriter(buildContentTransitionRepository(env),new D1YouTubeVideoReadJournal(env.otw_db,site,database),new D1CandidateChannelStages(env.otw_db,site,database),new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY,fetch,{db:env.otw_db,siteId:site,priority:'core',origin:'otw_play_admin_preflight'}),metadata,site,async message=>{
    if(!env.OTW_OPS_BACKGROUND_QUEUE) throw new Error('Missing selected recovery queue');
    await env.OTW_OPS_BACKGROUND_QUEUE.send(message);
  },async()=>(await transitionPeer(env,resume?.transitionId??'','target')).peer,resume);
  const metadataWriter=new D1CandidateMetadataWriter(buildContentTransitionRepository(env),new D1YouTubeVideoReadJournal(env.otw_db,site,database),metadata,site,async message=>{
    if(!env.OTW_OPS_BACKGROUND_QUEUE) throw new Error('Missing selected recovery queue');
    await env.OTW_OPS_BACKGROUND_QUEUE.send(message);
  },async()=>(await transitionPeer(env,resume?.transitionId??'','target')).peer,resume,approvalWriter);
  return new IngestionService(
    new D1IngestionRepository(env.otw_db,new D1ReviewDeletionWriter(buildContentTransitionRepository(env),parseSiteStorageResources(env).site,resume),new D1CandidateReviewWriter(buildContentTransitionRepository(env),parseSiteStorageResources(env).site,async message=>{
      if(!env.OTW_OPS_BACKGROUND_QUEUE) throw new Error('Missing selected recovery queue');
      await env.OTW_OPS_BACKGROUND_QUEUE.send(message);
    },resume),conversionWriter,metadataWriter,(action,id,statements)=>buildContentTransitionRepository(env).commitIngestionBatch(action,id,statements),site),
    metadata,
    {
      send: async (message: OtwPlayIngestionQueueMessage) => {
        if (!env.OTW_PLAY_INGESTION_QUEUE) {
          throw new Error("OTW Play ingestion queue is not configured");
        }
        await env.OTW_PLAY_INGESTION_QUEUE.send(message);
      },
    },
    () => crypto.randomUUID(),
    Date.now,
    createOtwPlayAdminCatalogService(env,undefined,resume,conversionWriter,approvalWriter),
    new CloudflareIngestionReadBudget(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_D1_TOKEN, env.OTW_PLAY_D1_READ_DAILY_TARGET),
    conversionWriter,
    metadataWriter,
    approvalWriter,
  );
};
