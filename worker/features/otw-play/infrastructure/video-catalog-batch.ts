import type {OtwPlayAdminCommandResponse} from '@contracts/otw-play';
import type {VideoCatalogResultData} from '../application/ports/video-catalog-transition';

export type VideoCatalogEvent={id:string;aggregateType:'entity'|'channel'|'song'|'performance'|'proposal';aggregateId:string;eventType:string;afterJson:string|null;now:number};
export type VideoCatalogResultCapture={kind:'performance';id:string}|{kind:'entry';songId:string;performanceId:string;channelId:string;entityIds:readonly string[];proposalId?:string};
export interface VideoCatalogBatchWriter {
  write<T extends VideoCatalogResultData>(statements:D1PreparedStatement[],capture:VideoCatalogResultCapture):Promise<OtwPlayAdminCommandResponse<T>|null>;
  historicalEvent(event:VideoCatalogEvent):Promise<D1PreparedStatement[]>;
  transferredApproval(proposalId:string,lockToken:string):Promise<boolean>;
  conversionJobScope(jobId:string|null,candidateId:string,alias?:'candidate'|'music_ingestion_candidates'):Promise<{historical:boolean;sql:string;bindings:Array<string|number|null>}|null>;
  conversionEvent(event:{eventId:string;jobId:string|null;candidateId:string;eventType:string;detailJson:string;now:number;fromChanges?:boolean}):Promise<D1PreparedStatement[]>;
}
