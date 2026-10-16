import type {AutoUpdateRunResultDto} from "./operations";
export type ChzzkMatchResult=Omit<AutoUpdateRunResultDto,"success">;
export interface ChzzkChildResult {
  status:"succeeded"|"partial"|"failed";result:ChzzkMatchResult;
  /** The source coordinator did not admit this potential target to matching. */
  notAdmitted?:{scanItemId:string;status:"failed"|"throttled"};
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
export interface ChzzkScanResult {
  channels:number;
  observations:number;
  channelResults:Array<{channelId:string;status:"complete"|"failed"|"incomplete"}>;
}
