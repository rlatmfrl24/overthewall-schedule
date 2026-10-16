import type {FileIntentEnvelope,IngressReadiness,OperationEnvelope,OutcomeReceipt,SourceFence,TransitionIdentity} from "../../../../../contracts/content-transition";
import type {SiteId} from "../../../../../contracts/site-definition";
import type {ChzzkReadReceipt,ChzzkScanResponse,ChzzkScanStage,ChzzkChildTransfer,ChzzkChildResult,ChzzkFinalizerReceipt} from "@contracts/content-transition-chzzk";
import type {YouTubeChannelReadReceipt,YouTubeChannelReadResponse,YouTubeVideoReadReceipt,YouTubeVideoReadResponse,YouTubeVideoCompletion,YouTubeVideoFailure,YouTubeVideoFailurePreparation,YouTubeVideoDependency,YouTubeVideoNoopPreparation} from "@contracts/content-transition-youtube";

export interface TransitionPeerDescription {
  identity:TransitionIdentity;
  site:SiteId;
  resource:string;
  role:"source"|"target";
  schema:1;
  schemaDigest:string;
  approvalDigest:string;
  receiverContract:string;
  phase:import('../../../../../contracts/content-transition').TransitionPhase;
  maintenanceState:'open'|'draining'|'stopped';
}
export type TransitionTransferReply<T>={accepted:true;receipt:T}|{accepted:false;reason:"original_receipt_mismatch"};
/** Internal Service Binding capability. No actor or caller-site claim is trust. */
export interface TransitionPeer {
  aiUnknown(id:string,operationId:string,payloadHash:string):Promise<import('../../domain/ai-review-continuation').AiUnknownTransfer>;
  aiResume(id:string,operationId:string,payloadHash:string):Promise<import('../../domain/ai-review-continuation').AiResumeTransfer>;
  candidateChannelStages(id:string,operationId:string,payloadHash:string):Promise<import('@contracts/content-transition-youtube').CandidateChannelApprovalStages>;
  prepareCandidateChannelChild(id:string,operationId:string,payloadHash:string,step:'create'|'update',command:import('@contracts/content-transition-youtube').CandidateChannelApprovalChildCommand):Promise<import('@contracts/content-transition-youtube').CandidateChannelApprovalChild>;
  prepareCandidateChannelRefresh(id:string,operationId:string,payloadHash:string,command:import('@contracts/content-transition-youtube').CandidateChannelApprovalRefresh['command']):Promise<import('@contracts/content-transition-youtube').CandidateChannelApprovalRefresh>;
  candidateChannelChildReceipt(id:string,operationId:string,payloadHash:string,step:'create'|'update'):Promise<import('@contracts/content-transition-youtube').CandidateChannelApprovalChild>;
  acknowledgeCandidateChannelChild(id:string,operationId:string,payloadHash:string,step:'create'|'update'):Promise<import('@contracts/content-transition-youtube').CandidateChannelApprovalChild>;
  conversionPreflight(id:string,operationId:string,payloadHash:string):Promise<import('@contracts/content-transition-youtube').CandidateConversionPreflightStage|null>;
  candidateMetadataStage(id:string,operationId:string,payloadHash:string):Promise<import('@contracts/content-transition-youtube').CandidateMetadataStage|null>;
  videoApprovalNoop(id:string,operationId:string,payloadHash:string):Promise<YouTubeVideoNoopPreparation|null>;
  prepareVideoApprovalNoop(id:string,operationId:string,payloadHash:string):Promise<YouTubeVideoNoopPreparation>;
  youtubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string):Promise<YouTubeVideoReadReceipt>;
  claimYouTubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string):Promise<{receipt:YouTubeVideoReadReceipt;claimed:boolean}>;
  startYouTubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,claim:string):Promise<YouTubeVideoReadReceipt>;
  completeYouTubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,response:YouTubeVideoReadResponse):Promise<YouTubeVideoReadReceipt>;
  exhaustYouTubeVideoRead(id:string,operationId:string,payloadHash:string,requestKey:string):Promise<YouTubeVideoReadReceipt>;
  youtubeVideoCompletion(id:string,operationId:string,payloadHash:string):Promise<YouTubeVideoCompletion>;
  youtubeVideoFailure(id:string,operationId:string,payloadHash:string):Promise<YouTubeVideoFailurePreparation|null>;
  prepareYouTubeVideoFailure(id:string,operationId:string,payloadHash:string,control:YouTubeVideoCompletion,failure:YouTubeVideoFailure):Promise<YouTubeVideoFailurePreparation>;
  youtubeVideoDependency(id:string,operationId:string,payloadHash:string):Promise<YouTubeVideoDependency|null>;
  youtubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string):Promise<YouTubeChannelReadReceipt>;
  claimYouTubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string):Promise<{receipt:YouTubeChannelReadReceipt;claimed:boolean}>;
  startYouTubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,claim:string):Promise<YouTubeChannelReadReceipt>;
  completeYouTubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,response:YouTubeChannelReadResponse):Promise<YouTubeChannelReadReceipt>;
  exhaustYouTubeChannelRead(id:string,operationId:string,payloadHash:string,requestKey:string):Promise<YouTubeChannelReadReceipt>;
  describe(id:string):Promise<TransitionPeerDescription>;
  openIngress(id:string):Promise<IngressReadiness>;
  operation(id:string,operationId:string):Promise<OperationEnvelope>;
  fileIntent(id:string,intentId:string):Promise<FileIntentEnvelope>;
  sourceFence(id:string):Promise<SourceFence>;
  targetActivationReceipt(id:string):Promise<import('@contracts/content-transition').TargetActivationReceipt|null>;
  targetAbortReceipt(id:string):Promise<import('@contracts/content-transition').TargetAbortReceipt|null>;
  resumeSourceAfterAbort(id:string):Promise<{resumed:true}|{resumed:false;reason:'target_not_aborted'}>;
  resumeRemainingSource(id:string):Promise<{resumed:true}|{resumed:false;reason:'target_not_activated_or_archived'}>;
  receiveOperation(id:string,operationId:string,payloadHash:string):Promise<TransitionTransferReply<{operationId:string;payloadHash:string}>>;
  receiveFileIntent(id:string,intentId:string,versionKey:string):Promise<TransitionTransferReply<{intentId:string;versionKey:string}>>;
  outcome(id:string,kind:"operation"|"file",recordId:string):Promise<OutcomeReceipt>;
  acknowledgeOutcome(id:string,kind:"operation"|"file",recordId:string):Promise<OutcomeReceipt>;
  chzzkRead(id:string,operationId:string,payloadHash:string,requestKey:string):Promise<ChzzkReadReceipt>;
  claimChzzkRead(id:string,operationId:string,payloadHash:string,requestKey:string):Promise<{receipt:ChzzkReadReceipt;claimed:boolean}>;
  completeChzzkRead(id:string,operationId:string,payloadHash:string,requestKey:string,requestHash:string,attempt:number,claim:string,response:ChzzkScanResponse):Promise<ChzzkReadReceipt>;
  chzzkStage(id:string,operationId:string):Promise<ChzzkScanStage|null>;
  receiveChzzkStage(id:string,operationId:string,payloadHash:string):Promise<ChzzkScanStage>;
  chzzkChild(id:string,operationId:string,childKey:string):Promise<ChzzkChildTransfer>;
  executeChzzkChild(id:string,operationId:string,childKey:string):Promise<ChzzkChildResult>;
  executeChzzkSourceHoliday(id:string,operationId:string,childKey:string):Promise<{withdrawn:number;conflicted:boolean}>;
  chzzkFinalizer(id:string,operationId:string):Promise<ChzzkFinalizerReceipt|null>;
  finishChzzkParent(id:string,operationId:string):Promise<boolean>;
}
