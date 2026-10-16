/** Closed control receipts for the existing read-only CHZZK schedule scan. */
import type {AutoUpdateRunResultDto} from "./operations";
export type ChzzkMatchResult=Omit<AutoUpdateRunResultDto,"success">;
export interface ChzzkChildResult {
  status:"succeeded"|"partial"|"failed";result:ChzzkMatchResult;
  /** The source coordinator did not admit this potential target to matching. */
  notAdmitted?:{scanItemId:string;status:"failed"|"throttled"};
}
export interface ChzzkChildTransfer {
  transitionId:string;operationId:string;payloadHash:string;childKey:string;
  input:unknown|null;
  batches:Array<{key:string;command:unknown;results:Array<{results:Record<string,unknown>[];affectedCount?:number;conflicted?:true}>}>;
  result:ChzzkChildResult|null;
}
export interface ChzzkFinalizerReceipt {
  transitionId:string;operationId:string;payloadHash:string;parent:ChzzkScanParent;
  itemId:string;status:"succeeded"|"partial"|"failed";
  children:Array<{key:string;result:ChzzkChildResult}>;
}
export interface ChzzkScanCommand {
  members: Array<{uid:number;code:string;name:string;channelId:string}>;
  rangeDays:number;
  startedAt:number;
  startDate:string;
  today:string;
  parent?:ChzzkScanParent;
}
export type ChzzkScanParent={kind:"scheduled";runId:string;itemId:string};
export interface ChzzkMatchContinuation {key:string;memberUid:number;memberCode:string;date:string}
export interface ChzzkScanStage {
  transitionId:string;operationId:string;payloadHash:string;
  parent:ChzzkScanParent;completion:ChzzkScanCompletion;targets:ChzzkMatchContinuation[];
  owner:{site:"otw"|"luvdia";resource:string;generation:number;commitSequence:number};
}
export type ChzzkScanRequest = {kind:"videos";channelId:string;page:number;size:5}
  | {kind:"live";channelId:string};
export interface ChzzkScanVideo {
  videoId:string;
  videoTitle:string;
  publishDateAt:number|null;
  duration:number|null;
  thumbnailImageUrl:string|null;
}
export type ChzzkScanResponse = {kind:"videos";videos:ChzzkScanVideo[]|null}
  | {kind:"live";content:{status:"OPEN"|"CLOSE"|"CLOSED";openDate:string|null}|null;error:string|null;staleCacheUsed:boolean};
export interface ChzzkReadReceipt {
  transitionId:string;
  operationId:string;
  payloadHash:string;
  requestKey:string;
  requestHash:string;
  request:ChzzkScanRequest;
  response:ChzzkScanResponse|null;
  responseHash:string|null;
  attempt:number;
  claim:string|null;
  retryAt:number;
}
export interface ChzzkScanResult {
  channels:number;
  observations:number;
  channelResults:Array<{channelId:string;status:"complete"|"failed"|"incomplete"}>;
}
export interface ChzzkScanCompletion {
  result:ChzzkScanResult;
  reads:Array<{requestKey:string;requestHash:string;responseHash:string}>;
}
