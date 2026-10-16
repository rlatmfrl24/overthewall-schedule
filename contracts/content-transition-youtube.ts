/** Closed control for the installed admin channel metadata GET. No URL, key,
 * caller headers or arbitrary provider method crosses the private relay. */
export interface YouTubeChannelReadRequest {
  path:"channels";
  parameters:{part:"snippet";id:string;maxResults:"1"};
  httpAttemptLimit:4;
}
export type YouTubeMetadataFailure={message:string;code:"timeout"|"network"|"upstream_5xx"|"invalid_response"|"rate_limited"|"quota_exceeded"|"configuration"|"provider_auth"|"invalid_request";retryable:boolean;retryAfterMs:number|null};
export type YouTubeChannelReadResponse={status:"success";channel:{channelId:string;displayName:string}|null}|{status:"error";error:YouTubeMetadataFailure};
export interface YouTubeChannelReadReceipt {
  transitionId:string;operationId:string;payloadHash:string;requestKey:string;requestHash:string;
  request:YouTubeChannelReadRequest;response:YouTubeChannelReadResponse|null;responseHash:string|null;
  attempt:number;claim:string|null;retryAt:number;exhausted:boolean;
}
export interface YouTubeChannelCompletion {
  requestKey:string;requestHash:string;responseHash:string|null;
  disposition:"consumed"|"exhausted_unknown";
  result:import("./otw-play").OtwPlayAdminCommandResponse<import("./otw-play").OtwPlayAdminChannelDto>|null;
  failure:YouTubeMetadataFailure|{code:"channel_unverified";message:string;retryable:false;retryAfterMs:null}|null;
}

/** Exact installed readVideo -> videos.list request, one original source position. */
export type YouTubeVideoReadRequest = {
  path:"videos";
  parameters:{part:"snippet,contentDetails,status,player,liveStreamingDetails";id:string;maxWidth:"480"};
  httpAttemptLimit:4;
  result?:'observation';
} | YouTubeChannelReadRequest;
export interface YouTubeVideoMetadata {
  videoId:string;channelId:string;channelTitle:string;title:string;
  thumbnailUrl:string|null;durationSeconds:number|null;publishedAt:number|null;
  availabilityStatus:import("./otw-play").OtwPlaySourceAvailabilityStatus;
  madeForKids?:boolean|null;scopeReview?:boolean;description?:string;tags?:string[];
  privacyStatus?:string;actualStartTime?:string|null;
}
export type YouTubeVideoReadResponse={status:'channel';channel:{channelId:string;displayName:string}|null}|{status:"success";video:YouTubeVideoMetadata|null}|{status:'observation';observation:{videoId:string;availabilityStatus:import('./otw-play').OtwPlaySourceAvailabilityStatus;video:YouTubeVideoMetadata|null}}|{status:"error";error:YouTubeMetadataFailure};
export interface YouTubeVideoReadReceipt extends Omit<YouTubeChannelReadReceipt,"request"|"response"> {
  request:YouTubeVideoReadRequest;response:YouTubeVideoReadResponse|null;
}
export interface YouTubeVideoReadCompletion {
  requestKey:string;requestHash:string;responseHash:string|null;
  disposition:"consumed"|"exhausted_unknown"|"not_issued";
}
export interface YouTubeVideoCompletion {
  flow?:'candidate_channel_approve';
  reads:YouTubeVideoReadCompletion[];
  failure:YouTubeMetadataFailure|null;
}
export interface YouTubeVideoDependency {
  status:'ready';transitionId:string;operationId:string;payloadHash:string;generation:number;
  requestKey:string;requestHash:string;responseHash:string;externalChannelId:string;
  matchedChannelId:string|null;recognizedChannelAllowed:boolean|null;recognizedExternalEntityId:string|null;capture:string;
}
export type YouTubeVideoFailure=({kind:'service';code:'invalid_request'|'not_found'|'stale_write'|'validation_failed'|'policy_unresolved'|'external_service_unavailable'}
  |{kind:'ingestion';code:'not_found'|'stale_message'|'stale_write'|'validation_failed'|'unavailable'}
  |{kind:'repository';code:'not_found'|'stale_write'|'validation_failed'|'duplicate_source'}
  |{kind:'metadata';code:YouTubeMetadataFailure['code']}) & {message:string;fields?:Record<string,string>;sqlError?:string;conversionOutcome?:CandidateConversionOutcomePreparation};
export interface CandidateConversionOutcomePreparation {outcome:'duplicate'|'stale'|'validation_failed'|'retryable_failed';performanceId:string|null;errorCode:string|null}
export interface YouTubeVideoFailurePreparation {control:YouTubeVideoCompletion;failure:YouTubeVideoFailure}

/** Hash/control only. The actual approved DTO remains at its owning site. */
export interface YouTubeVideoNoopPreparation {control:YouTubeVideoCompletion;resultHash:string}
export interface CandidateConversionPreflightStage {
  site:'otw'|'luvdia';
  transitionId:string;
  operationId:string;
  payloadHash:string;
  generation:number;
  requestHash:string;
  responseHash:string;
  result:Pick<import('./otw-play').OtwPlayAdminCatalogEntryPreflightDto,'catalogRevision'|'duplicate'> & {
    channel:Pick<import('./otw-play').OtwPlayAdminCatalogEntryPreflightDto['channel'],'state'|'catalogChannelId'|'channelRole'>;
  };
}
export interface CandidateMetadataFacts {
  existingSource:boolean;
  existingProposal:boolean;
  channel:{verification_status:'pending'|'approved'|'revoked';active:number;channel_role:string}|null;
}
export interface CandidateMetadataStage {
  transitionId:string;operationId:string;payloadHash:string;generation:number;
  requestKey:string;requestHash:string;responseHash:string;
  externalChannelId:string|null;matchedChannelId:string|null;
  facts:CandidateMetadataFacts;capture:string;
}

/** Only the original approve_channel parent's four fixed request positions.
 * Actor identities and the final private candidate DTO are never stage wire. */
export interface CandidateChannelApprovalSnapshot {
  externalChannelId:string;
  channelTitle:string;
  requestHash:string;
  responseHash:string;
  entities:Array<{id:string;archivedAt:number|null;isMember:boolean}>;
  existing:import('./otw-play').OtwPlayAdminChannelDto|null;
  expectedState:string;
  capture:string|null;
}
export type CandidateChannelApprovalChildCommand=(
  |{action:'create';id:string;input:import('./otw-play').OtwPlayAdminCreateChannelRequest}
  |{action:'update';id:string;input:import('./otw-play').OtwPlayAdminUpdateChannelRequest}
) & {eventId:string;now:number};
export interface CandidateChannelApprovalChild {
  command:CandidateChannelApprovalChildCommand;
  expectedState:string;
  result:import('./otw-play').OtwPlayAdminCommandResponse<import('./otw-play').OtwPlayAdminChannelDto>|null;
  resultState:string|null;
}
export interface CandidateChannelApprovalRefresh {
  command:{action:'candidate_refresh';candidateId:string;expectedVersion:number;videoId:string;eventId:string;now:number};
  resultHash:string|null;
  facts:(Omit<CandidateMetadataStage,'capture'> & {site:'otw'|'luvdia';capture:string|null})|null;
}
export interface CandidateChannelApprovalStages {
  snapshot:CandidateChannelApprovalSnapshot|null;
  create:CandidateChannelApprovalChild|null;
  update:CandidateChannelApprovalChild|null;
  refresh:CandidateChannelApprovalRefresh|null;
}
