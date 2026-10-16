import type {OtwPlayAdminCatalogEntryResultDto,OtwPlayAdminCommandResponse,OtwPlayAdminPerformanceDto,OtwPlayAdminProposalDto} from '@contracts/otw-play';
import type {VideoCatalogCommand} from '../../domain/video-catalog-command';
import type {OtwPlayYouTubeMetadataReader} from './youtube-metadata';

export type VideoCatalogResultData=OtwPlayAdminPerformanceDto|OtwPlayAdminCatalogEntryResultDto|OtwPlayAdminProposalDto;
export interface VideoCatalogTransitionPort {
  run<T extends VideoCatalogResultData>(command:VideoCatalogCommand,execute:(command:VideoCatalogCommand,reader:OtwPlayYouTubeMetadataReader)=>Promise<OtwPlayAdminCommandResponse<T>>):Promise<OtwPlayAdminCommandResponse<T>>;
}
