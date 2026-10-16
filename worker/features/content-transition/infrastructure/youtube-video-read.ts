import type {YouTubeVideoReadRequest,YouTubeVideoReadResponse,YouTubeVideoMetadata,YouTubeVideoFailure} from "@contracts/content-transition-youtube";
import {OTW_PLAY_SOURCE_AVAILABILITY_STATUSES} from "@contracts/otw-play";
import {parseYouTubeMetadataFailure,parseYouTubeChannelResponse} from "./youtube-channel-read";
import {isPublicationCutoffSqlError} from './publication-access';

export const youtubeVideoRequest=(videoId:string,observation=false):YouTubeVideoReadRequest=>{
  if(!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid original YouTube video");
  return {path:"videos",parameters:{part:"snippet,contentDetails,status,player,liveStreamingDetails",id:videoId,maxWidth:"480"},httpAttemptLimit:4,...(observation?{result:'observation' as const}:{})};
};
export const candidateChannelRequestKey=(channelId:string,step:'create'|'update')=>`youtube:channels:${step}:${channelId}`;
export const youtubeVideoRequestKey=(videoId:string,index:number)=>`youtube:videos:${index}:${videoId}`;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const scalarText=(value:unknown):value is string=>typeof value==="string";
export function parseVideoCatalogFailure(value:unknown):YouTubeVideoFailure|null {
  if(!object(value)||Object.keys(value).some(key=>!['kind','code','message','fields','sqlError','conversionOutcome'].includes(key))||typeof value.message!=='string'||!value.message||typeof value.code!=='string') return null;
  const codes=value.kind==='ingestion'?['not_found','stale_message','stale_write','validation_failed','unavailable']:value.kind==='service'?['invalid_request','not_found','stale_write','validation_failed','policy_unresolved','external_service_unavailable']:value.kind==='repository'?['not_found','stale_write','validation_failed','duplicate_source']:value.kind==='metadata'?['timeout','network','upstream_5xx','invalid_response','rate_limited','quota_exceeded','configuration','provider_auth','invalid_request']:[];
  if(!codes.includes(value.code)||value.fields!==undefined&&(!object(value.fields)||Object.values(value.fields).some(field=>typeof field!=='string'))||value.sqlError!==undefined&&(value.kind!=='repository'||typeof value.sqlError!=='string'||!(isPublicationCutoffSqlError(value.sqlError)||/^D1_ERROR: (?:UNIQUE|NOT NULL|CHECK|FOREIGN KEY) constraint failed(?:: music_[A-Za-z0-9_. ,]+)?: SQLITE_CONSTRAINT\b/.test(value.sqlError)))) return null;
  if(value.conversionOutcome!==undefined) {
    const outcome=value.conversionOutcome;
    if(value.kind!=='repository'||!object(outcome)||Object.keys(outcome).sort().join(',')!=='errorCode,outcome,performanceId'||!['duplicate','stale','validation_failed','retryable_failed'].includes(String(outcome.outcome))||!(outcome.performanceId===null||typeof outcome.performanceId==='string'&&outcome.performanceId.length>0&&outcome.performanceId.length<=128)||!(outcome.errorCode===null||typeof outcome.errorCode==='string'&&outcome.errorCode.length<=128)) return null;
  }
  return value as unknown as YouTubeVideoFailure;
}
/** Persist the actual installed reader's bounded metadata shape, never raw HTTP. */
export function parseYouTubeVideoResponse(raw:unknown,request:YouTubeVideoReadRequest):YouTubeVideoReadResponse|null {
  if(!object(raw)) return null;
  if(raw.status==="error") {
    const error=parseYouTubeMetadataFailure(raw.error);
    return error&&Object.keys(raw).sort().join(",")==="error,status"?{status:"error",error}:null;
  }
  if(request.path==='channels') {
    if(raw.status!=='channel'||Object.keys(raw).sort().join(',')!=='channel,status') return null;
    const parsed=parseYouTubeChannelResponse({status:'success',channel:raw.channel},request);
    return parsed?.status==='success'?{status:'channel',channel:parsed.channel}:null;
  }
  if(request.result==='observation') {
    if(raw.status!=='observation'||Object.keys(raw).sort().join(',')!=='observation,status'||!object(raw.observation)) return null;
    const value=raw.observation;
    if(Object.keys(value).sort().join(',')!=='availabilityStatus,video,videoId'||value.videoId!==request.parameters.id||!OTW_PLAY_SOURCE_AVAILABILITY_STATUSES.some(status=>status===value.availabilityStatus)) return null;
    const video=parseYouTubeVideoResponse({status:'success',video:value.video},youtubeVideoRequest(request.parameters.id));
    if(video?.status!=='success'||video.video!==null&&video.video.availabilityStatus!==value.availabilityStatus) return null;
    return {status:'observation',observation:{videoId:request.parameters.id,availabilityStatus:value.availabilityStatus as import('@contracts/otw-play').OtwPlaySourceAvailabilityStatus,video:video.video}};
  }
  if(raw.status!=="success" || Object.keys(raw).sort().join(",")!=="status,video") return null;
  if(raw.video===null) return {status:"success",video:null};
  const v=raw.video;
  const required=["videoId","channelId","channelTitle","title","thumbnailUrl","durationSeconds","publishedAt","availabilityStatus"];
  const optional=["madeForKids","scopeReview","description","tags","privacyStatus","actualStartTime"];
  if(!object(v)||required.some(key=>!Object.hasOwn(v,key))||Object.keys(v).some(key=>!required.includes(key)&&!optional.includes(key))) return null;
  if(v.videoId!==request.parameters.id||![v.channelId,v.channelTitle,v.title].every(scalarText)||!/^[A-Za-z0-9_-]+$/.test(String(v.channelId))||!(v.thumbnailUrl===null||scalarText(v.thumbnailUrl))) return null;
  if(!(v.durationSeconds===null||Number.isFinite(v.durationSeconds)&&Number(v.durationSeconds)>=0)||!(v.publishedAt===null||Number.isFinite(v.publishedAt))||!OTW_PLAY_SOURCE_AVAILABILITY_STATUSES.some(status=>status===v.availabilityStatus)) return null;
  if(v.madeForKids!==undefined&&v.madeForKids!==null&&typeof v.madeForKids!=="boolean" || v.scopeReview!==undefined&&typeof v.scopeReview!=="boolean" || v.description!==undefined&&typeof v.description!=="string" || v.privacyStatus!==undefined&&typeof v.privacyStatus!=="string" || v.actualStartTime!==undefined&&v.actualStartTime!==null&&typeof v.actualStartTime!=="string" || v.tags!==undefined&&(!Array.isArray(v.tags)||!v.tags.every(scalarText))) return null;
  return {status:"success",video:v as unknown as YouTubeVideoMetadata};
}
