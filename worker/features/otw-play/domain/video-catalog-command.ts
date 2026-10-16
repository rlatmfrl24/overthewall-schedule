import type {OtwPlayAdminCreatePerformanceRequest,OtwPlayAdminUpdatePerformanceRequest,OtwPlayAdminCreateCatalogEntryRequest,OtwPlayAdminApproveProposalRequest,OtwPlayIngestionReviewInput} from '@contracts/otw-play';
import {parseCandidateReviewInput} from './candidate-review-input';
import {parseCreatePerformance,parseUpdatePerformance,parseCreateCatalogEntry,parseApproveProposal} from './admin-catalog-input';
import {extractYouTubeVideoId} from './youtube-video-id';
import {normalizeOtwPlaySearchText} from './search-normalization';

type EntityIds={entityIds:Record<string,string>;entityEventIds:Record<string,string>};
export type VideoEntryIds=EntityIds & {channelId:string;channelEventId:string;songId:string;songEventId:string;performanceId:string;performanceEventId:string;sourceId:string};
type EntryIds=VideoEntryIds;
export type CandidateConversionInput={candidateId:string;expectedVersion:number;jobId:string|null;videoId:string;candidateKind:'official_video'|'singing_clip';catalogChannelId:string;reviewInput:OtwPlayIngestionReviewInput};
export type VideoCatalogMutation =
  | {action:'performance_create';input:OtwPlayAdminCreatePerformanceRequest;ids:{performanceId:string;eventId:string};sourceIds:string[];now:number}
  | {action:'performance_update';input:OtwPlayAdminUpdatePerformanceRequest;ids:EntityIds & {eventId:string};sourceIds:string[];now:number}
  | {action:'catalog_create';input:OtwPlayAdminCreateCatalogEntryRequest;ids:EntryIds;now:number}
  | {action:'proposal_approve';proposalId:string;proposalVideoId:string;input:OtwPlayAdminApproveProposalRequest;ids:EntryIds & {proposalEventId:string};now:number}
  | {action:'candidate_convert';input:CandidateConversionInput;ids:EntryIds & {candidateEventId:string;outcomeEventId:string};now:number};
export type VideoCatalogCommand=VideoCatalogMutation & {actor:{userId:string;displayName:string|null;ipAddress:string|null}|null;reviewLockToken?:string};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=128;
const integer=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
function ids(raw:unknown,fields:readonly string[],entities=false) {
  if(!object(raw)||Object.keys(raw).some(key=>!fields.includes(key)&&!(entities&&['entityIds','entityEventIds'].includes(key)))||fields.some(key=>!text(raw[key]))) return null;
  if(entities) {
    for(const name of ['entityIds','entityEventIds']) if(!object(raw[name])||Object.keys(raw[name]).length>100||Object.entries(raw[name]).some(([key,value])=>!key||key.length>200||!text(value))) return null;
    if(Object.keys(raw.entityIds as object).sort().join(',')!==Object.keys(raw.entityEventIds as object).sort().join(',')) return null;
  }
  return raw;
}
const entryFields=['channelId','channelEventId','songId','songEventId','performanceId','performanceEventId','sourceId'] as const;
/** Parser retains original IDs and validated catalog input, never actors or arbitrary HTTP requests. */
export function parseVideoCatalogMutation(raw:unknown):VideoCatalogMutation|null {
  if(!object(raw)||!integer(raw.now)) return null;
  if(raw.action==='performance_create') {
    const input=parseCreatePerformance(raw.input),identity=ids(raw.ids,['performanceId','eventId']);
    if(!input.ok||!identity||!Array.isArray(raw.sourceIds)||raw.sourceIds.length!==input.value.sources.length||!raw.sourceIds.every(text)) return null;
    return {action:raw.action,input:input.value,ids:{performanceId:String(identity.performanceId),eventId:String(identity.eventId)},sourceIds:raw.sourceIds,now:raw.now};
  }
  if(raw.action==='performance_update') {
    const input=parseUpdatePerformance(raw.input),identity=ids(raw.ids,['eventId'],true);
    if(!input.ok||!identity||!Array.isArray(raw.sourceIds)||raw.sourceIds.length!==input.value.sources.length||!raw.sourceIds.every(text)) return null;
    return {action:raw.action,input:input.value,ids:identity as EntityIds & {eventId:string},sourceIds:raw.sourceIds,now:raw.now};
  }
  if(raw.action==='catalog_create') {
    const input=parseCreateCatalogEntry(raw.input),identity=ids(raw.ids,entryFields,true);
    if(!input.ok||!identity||raw.candidateConversion!==undefined) return null;
    return {action:raw.action,input:input.value,ids:identity as EntryIds,now:raw.now};
  }
  if(raw.action==='proposal_approve') {
    const input=parseApproveProposal(raw.input),identity=ids(raw.ids,[...entryFields,'proposalEventId'],true);
    if(!input.ok||!identity||!text(raw.proposalId)||typeof raw.proposalVideoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(raw.proposalVideoId)) return null;
    return {action:raw.action,proposalId:raw.proposalId,proposalVideoId:raw.proposalVideoId,input:input.value,ids:identity as EntryIds & {proposalEventId:string},now:raw.now};
  }
  if(raw.action==='candidate_convert') {
    const input=raw.input,identity=ids(raw.ids,[...entryFields,'candidateEventId','outcomeEventId'],true);
    if(!object(input)||!identity||!text(input.candidateId)||!integer(input.expectedVersion)||(input.jobId!==null&&!text(input.jobId))||typeof input.videoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(input.videoId)||!['official_video','singing_clip'].includes(String(input.candidateKind))||!text(input.catalogChannelId)) return null;
    const review=parseCandidateReviewInput(input.reviewInput);if(!review.ok) return null;
    return {action:raw.action,input:{candidateId:input.candidateId,expectedVersion:input.expectedVersion,jobId:input.jobId as string|null,videoId:input.videoId,candidateKind:input.candidateKind as CandidateConversionInput['candidateKind'],catalogChannelId:input.catalogChannelId,reviewInput:review.value},ids:identity as EntryIds & {candidateEventId:string;outcomeEventId:string},now:raw.now};
  }
  return null;
}
export function videoCatalogReads(command:VideoCatalogMutation) {
  const videos=command.action==='candidate_convert'?[command.input.videoId,command.input.videoId]:command.action==='proposal_approve'?[command.proposalVideoId]:command.action==='catalog_create'?[extractYouTubeVideoId(command.input.youtubeUrl)]:command.input.sources.map(source=>extractYouTubeVideoId(source.youtubeUrl));
  if(videos.some(id=>!id)) throw new Error('Invalid original video metadata identity');
  // Distinct original source positions remain distinct logical reads even if
  // their video IDs coincide. This preserves the installed caller's quota use.
  return videos.map((videoId,index)=>({videoId:videoId!,index}));
}
export function parseVideoReadCommand(codec:string,raw:unknown):VideoCatalogMutation|null {
  const command=parseVideoCatalogMutation(raw);
  return command&&((codec==='otw-play.candidate.convert'&&command.action==='candidate_convert')||(codec==='otw-play.video.mutate'&&command.action!=='candidate_convert'))?command:null;
}
/** Only references actually read by these four original catalog callers. */
export function videoCatalogReferences(command:VideoCatalogMutation) {
  const entities:string[]=[],members:number[]=[],songs:string[]=[],channels:string[]=[],performances:string[]=[],proposals:string[]=[];
  const external:Array<{entityKind:string;normalizedName:string}>=[];
  if(command.action==='candidate_convert') {
    const input=command.input.reviewInput;
    channels.push(command.input.catalogChannelId);
    if(input.song.kind==='existing') songs.push(input.song.songId);
    const subjects=[...input.participants.map(item=>item.subject),...(input.song.kind==='create'?input.song.originalArtists.map(item=>item.subject):[])];
    for(const subject of subjects) {
      if(subject.kind==='entity') entities.push(subject.entityId);
      else if(subject.kind==='member') members.push(subject.memberUid);
      else external.push({entityKind:subject.entityKind,normalizedName:normalizeOtwPlaySearchText(subject.displayName)});
    }
  } else if(command.action==='performance_create') {
    entities.push(...command.input.participants.map(item=>item.entityId));songs.push(command.input.songId);channels.push(...command.input.sources.map(item=>item.channelId));
  } else {
    const input=command.input;
    const subjects=[...input.participants.map(item=>item.subject)];
    if(command.action==='performance_update') {songs.push(command.input.songId);channels.push(...command.input.sources.map(item=>item.channelId));performances.push(command.input.id);}
    else {
      if(command.input.song.kind==='existing') songs.push(command.input.song.songId);
      if(command.input.song.kind==='create') subjects.push(...command.input.song.originalArtists.map(item=>item.subject));
      if(command.input.channel.kind==='existing') channels.push(command.input.channel.channelId);
      else if(command.input.channel.kind==='recognized_member') subjects.push({kind:'member',memberUid:command.input.channel.memberUid});
      else subjects.push(...command.input.channel.owners);
      if(command.action==='proposal_approve') proposals.push(command.proposalId);
    }
    for(const subject of subjects) {
      if(subject.kind==='entity') entities.push(subject.entityId);
      else if(subject.kind==='member') members.push(subject.memberUid);
      else external.push({entityKind:subject.entityKind,normalizedName:normalizeOtwPlaySearchText(subject.displayName)});
    }
  }
  return {entities:[...new Set(entities)],members:[...new Set(members)],songs:[...new Set(songs)],channels:[...new Set(channels)],performances,proposals,external};
}
