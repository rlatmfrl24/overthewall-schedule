import type {OtwPlayIngestionReviewCandidateDto} from '@contracts/otw-play';
import type {CandidateMetadataCommand} from '../../domain/candidate-metadata-command';
import type {AdminCatalogActor} from './admin-catalog-repository';
import type {OtwPlayYouTubeVideoObservation} from './youtube-metadata';

/** Admission precedes the original metadata request; only the original owner
 * service can consume that observation and persist the candidate result. */
export interface CandidateMetadataTransitionPort {
  runRefresh(identity:{candidateId:string;expectedVersion:number;actor:AdminCatalogActor|null},prepare:()=>Promise<CandidateMetadataCommand>,execute:(command:CandidateMetadataCommand,read:()=>Promise<OtwPlayYouTubeVideoObservation>)=>Promise<OtwPlayIngestionReviewCandidateDto>):Promise<OtwPlayIngestionReviewCandidateDto>;
}
