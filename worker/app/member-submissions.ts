import {catalogImportProjection} from "../features/otw-play";
import {D1MemberSubmissionRepository,D1MemberSubmissionWriter,MemberSubmissionService,YouTubeOtwPlayMetadataReader} from "../features/otw-play";
import {D1TransitionRepository} from "../features/content-transition";
import {parseSiteStorageResources} from "@contracts/site-definition";
import type {TransitionOperationMessage} from "@contracts/content-transition-queue";
import type {Env} from "../platform/types";
export function createOtwPlayMemberSubmissionService(env:Env,requestKey?:string,resume?:TransitionOperationMessage) {
  const {site,database,bucket}=parseSiteStorageResources(env);
  const writer=new D1MemberSubmissionWriter(new D1TransitionRepository(env.otw_db,site,database,bucket, null, catalogImportProjection),site,requestKey,resume);
  return new MemberSubmissionService(new D1MemberSubmissionRepository(env.otw_db,writer,site),()=>crypto.randomUUID(),Date.now,new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY,fetch,{db:env.otw_db,siteId:site,priority:'core',origin:'otw_play_member_preflight'}));
}
