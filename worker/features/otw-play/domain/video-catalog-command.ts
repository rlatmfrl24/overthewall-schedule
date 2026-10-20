import type {OtwPlayAdminCreatePerformanceRequest,OtwPlayAdminUpdatePerformanceRequest,OtwPlayAdminCreateCatalogEntryRequest,OtwPlayAdminApproveProposalRequest,OtwPlayIngestionReviewInput} from '@contracts/otw-play';

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
