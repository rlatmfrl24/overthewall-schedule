import {parseSiteId} from "@contracts/site-definition";
import {D1MemberSubmissionRepository,MemberSubmissionService,YouTubeOtwPlayMetadataReader} from "../features/otw-play";
import type {Env} from "../platform/types";
export const createOtwPlayMemberSubmissionService=(env:Env)=>new MemberSubmissionService(
  new D1MemberSubmissionRepository(env.otw_db,parseSiteId(env.SITE_ID)),()=>crypto.randomUUID(),Date.now,
  new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY,fetch,{db:env.otw_db,siteId:parseSiteId(env.SITE_ID),priority:"core",origin:"otw_play_member_preflight"}),
);
