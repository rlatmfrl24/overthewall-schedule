import {catalogImportProjection} from "../features/otw-play";
import {
  AdminCatalogService,
  D1AdminCatalogRepository,
  D1SongTransitionWriter,
  D1EntityTransitionWriter,
  D1PublicationTransitionWriter,
  D1CatalogDeleteWriter,
  D1ChannelTransitionWriter,
  type CandidateChannelContinuation,
  D1VideoCatalogWriter,
  D1ProposalRejectionWriter,
  DrizzleAdminCatalogAudit,
  YouTubeOtwPlayMetadataReader,
} from "../features/otw-play";
import { getDb } from "../platform/db";
import type { Env } from "../platform/types";
import {D1TransitionRepository,D1YouTubeChannelReadJournal,D1YouTubeVideoReadJournal} from "../features/content-transition";
import {transitionPeer} from "./content-transition";
import {parseSiteStorageResources} from "@contracts/site-definition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";

export const createOtwPlayVideoCatalogWriter=(env:Env,requestKey?:string,resume?:TransitionOperationMessage)=>{
  const {site,database,bucket}=parseSiteStorageResources(env);
  return new D1VideoCatalogWriter(new D1TransitionRepository(env.otw_db,site,database,bucket,null,catalogImportProjection),new D1YouTubeVideoReadJournal(env.otw_db,site,database),new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY,fetch,{db:env.otw_db,siteId:site,priority:'core',origin:'otw_play_admin_preflight'}),site,async message=>{
    if(!env.OTW_OPS_BACKGROUND_QUEUE) throw new Error('Missing selected recovery queue');
    await env.OTW_OPS_BACKGROUND_QUEUE.send(message);
  },async()=>(await transitionPeer(env,resume?.transitionId??'','target')).peer,requestKey,resume);
};
export const createOtwPlayAdminCatalogService = (env: Env,requestKey?:string,resume?:TransitionOperationMessage,conversionWriter?:D1VideoCatalogWriter,approval?:CandidateChannelContinuation) => {
  const {site,database,bucket}=parseSiteStorageResources(env);
  const repository=new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection);
  const dispatch=async(message:TransitionOperationMessage)=>{
    if(!env.OTW_OPS_BACKGROUND_QUEUE) throw new Error("Missing selected recovery queue");
    await env.OTW_OPS_BACKGROUND_QUEUE.send(message);
  };
  const metadata=new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY,fetch,{db:env.otw_db,siteId:site,priority:"core",origin:"otw_play_admin_preflight"});
  const channelWriter=new D1ChannelTransitionWriter(repository,new D1YouTubeChannelReadJournal(env.otw_db,site,database),metadata,site,dispatch,async()=>(await transitionPeer(env,resume?.transitionId??"","target")).peer,requestKey,resume,approval);
  const videoWriter=conversionWriter??createOtwPlayVideoCatalogWriter(env,requestKey,resume);
  return new AdminCatalogService(
    new D1AdminCatalogRepository(env.otw_db,new D1SongTransitionWriter(repository,site,requestKey,resume),new D1EntityTransitionWriter(repository,site,requestKey,resume),new D1PublicationTransitionWriter(repository,site,requestKey,resume),new D1CatalogDeleteWriter(repository,site,requestKey,resume),channelWriter,new D1ProposalRejectionWriter(repository,site,requestKey,resume),videoWriter,site),
    metadata,
    new DrizzleAdminCatalogAudit(getDb(env)),
    () => crypto.randomUUID(),
    true,
    Date.now,
    channelWriter,
    videoWriter,
  );
};
