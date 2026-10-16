import type {OtwPlayAdminCatalogDto,OtwPlayAdminCatalogEntryPreflightDto,OtwPlayAdminChannelDto,OtwPlayAdminCommandResponse,OtwPlayIngestionReviewCandidateDto} from '@contracts/otw-play';
import type {CandidateChannelCommand,CandidateChannelInput} from '../../domain/candidate-channel-command';
import type {ChannelMutationCommand} from '../../domain/channel-mutation';
import type {CandidateMetadataCommand} from '../../domain/candidate-metadata-command';
import type {AdminCatalogActor} from './admin-catalog-repository';
import type {OtwPlayYouTubeMetadataReader} from './youtube-metadata';

export type CandidateChannelIdentity={candidateId:string;expectedVersion:number;channel:CandidateChannelInput;actor:AdminCatalogActor|null};
export type CandidateChannelSnapshot={entities:Array<Pick<OtwPlayAdminCatalogDto['entities'][number],'id'|'archivedAt'> & {isMember:boolean}>;channels:OtwPlayAdminCatalogDto['channels']};
/** These are the actual original stages, with separate owning business batches.
 * A channel result never implies completion of the parent candidate command. */
export interface CandidateChannelExecution {
  preflight(read:(reader:OtwPlayYouTubeMetadataReader)=>Promise<OtwPlayAdminCatalogEntryPreflightDto>):Promise<Pick<OtwPlayAdminCatalogEntryPreflightDto,'video'>>;
  snapshot(read:()=>Promise<CandidateChannelSnapshot>):Promise<CandidateChannelSnapshot>;
  channel(step:'create'|'update',command:ChannelMutationCommand,execute:(command:ChannelMutationCommand)=>Promise<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>):Promise<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>;
  refresh(prepare:()=>Promise<CandidateMetadataCommand>,execute:(command:CandidateMetadataCommand)=>Promise<OtwPlayIngestionReviewCandidateDto>):Promise<OtwPlayIngestionReviewCandidateDto>;
}
export interface CandidateChannelTransitionPort {
  run(identity:CandidateChannelIdentity,prepare:()=>Promise<CandidateChannelCommand>,execute:(command:CandidateChannelCommand,execution?:CandidateChannelExecution)=>Promise<OtwPlayIngestionReviewCandidateDto>):Promise<OtwPlayIngestionReviewCandidateDto>;
}
