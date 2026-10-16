import type {ChzzkScanCommand,ChzzkScanResult} from "@contracts/chzzk-scan";
import type {ChzzkVideoCatalog} from "../../chzzk";
import type {ChzzkVideoDto} from "@contracts/chzzk";

export type ScanVideo=Pick<ChzzkVideoDto,"videoId"|"videoTitle"|"publishDateAt"|"duration"|"thumbnailImageUrl">;
export interface ChzzkScanProvider {
  fetchVideosBatch(requests:Parameters<ChzzkVideoCatalog["fetchVideosBatch"]>[0],cacheDb?:Pick<D1Database,"prepare">,options?:Parameters<ChzzkVideoCatalog["fetchVideosBatch"]>[2]):Promise<Array<{channelId:string;content:{data:ScanVideo[]}|null}>>;
  fetchLiveStatus?:(channelId:string)=>Promise<{content:{status:string;openDate?:string|null}|null;debug:{error?:string|null;staleCacheUsed?:boolean|null}}>;
}
export type ChzzkScanExecution=(command:ChzzkScanCommand,provider:ChzzkScanProvider,commit?:(statements:D1PreparedStatement[],result:ChzzkScanResult)=>Promise<void>)=>Promise<ChzzkScanResult>;
export interface ChzzkScanExecutionResult {
  channels:number;
  observations:number;
  channelResults:Array<{channelId:string;status:"complete"|"failed"|"incomplete"}>;
}
