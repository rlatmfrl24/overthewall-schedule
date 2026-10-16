import type {OtwPlayAdminCatalogEntryPreflightDto,OtwPlayIngestionConversionResultDto} from '@contracts/otw-play';
import type {VideoCatalogCommand} from '../../domain/video-catalog-command';
import type {AdminCatalogActor} from './admin-catalog-repository';
import type {OtwPlayYouTubeMetadataReader} from './youtube-metadata';

export type CandidateConversionCommand=Extract<VideoCatalogCommand,{action:'candidate_convert'}>;
export type CandidateConversionIdentity={jobId:string|null;candidateId:string;expectedVersion:number;actor:AdminCatalogActor|null};
export type CandidateConversionPreflight=Pick<OtwPlayAdminCatalogEntryPreflightDto,'catalogRevision'|'duplicate'> & {channel:Pick<OtwPlayAdminCatalogEntryPreflightDto['channel'],'state'|'catalogChannelId'|'channelRole'>};
export interface CandidateConversionExecution {
  preparedOutcome?:import('@contracts/content-transition-youtube').CandidateConversionOutcomePreparation;
  reader:OtwPlayYouTubeMetadataReader;
  preflight(read:()=>Promise<OtwPlayAdminCatalogEntryPreflightDto>):Promise<CandidateConversionPreflight>;
}
/** The original conversion owns its structured outcome, including the separate
 * required failure/outcome batch. Metadata acceptance is never that outcome. */
export interface CandidateConversionTransitionPort {
  runConversion(identity:CandidateConversionIdentity,prepare:()=>Promise<CandidateConversionCommand>,execute:(command:CandidateConversionCommand,execution:CandidateConversionExecution)=>Promise<OtwPlayIngestionConversionResultDto>,reject:(error:unknown)=>Promise<OtwPlayIngestionConversionResultDto>):Promise<OtwPlayIngestionConversionResultDto>;
}
