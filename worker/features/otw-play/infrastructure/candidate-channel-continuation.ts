import type {OtwPlayAdminChannelDto,OtwPlayAdminCommandResponse,OtwPlayIngestionReviewCandidateDto} from '@contracts/otw-play';
import type {CandidateMetadataFacts} from '@contracts/content-transition-youtube';
import type {ChannelMutationCommand} from '../domain/channel-mutation';
import type {CandidateMetadataCommand} from '../domain/candidate-metadata-command';
import type {AdminCatalogActor} from '../application/ports/admin-catalog-repository';
import type {OtwPlayYouTubeMetadataReader,OtwPlayYouTubeVideoObservation} from '../application/ports/youtube-metadata';

/** Infrastructure-only composition of the two existing writers inside the
 * exact admitted approve_channel parent. No application port carries D1. */
export interface CandidateChannelContinuation {
  readonly channelActive:boolean;
  readonly refreshActive:boolean;
  runChannelChild(command:ChannelMutationCommand,execute:(command:ChannelMutationCommand,reader:OtwPlayYouTubeMetadataReader)=>Promise<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>):Promise<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>;
  writeChannelChild(statements:D1PreparedStatement[]):Promise<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>;
  channelChildEvent(event:{id:string;channelId:string;eventType:'channel.created'|'channel.updated';beforeJson:string|null;afterJson:string|null;now:number}):Promise<D1PreparedStatement[]>;
  runRefreshChild(identity:{candidateId:string;expectedVersion:number;actor:AdminCatalogActor|null},execute:(command:CandidateMetadataCommand,read:()=>Promise<OtwPlayYouTubeVideoObservation>)=>Promise<OtwPlayIngestionReviewCandidateDto>):Promise<OtwPlayIngestionReviewCandidateDto>;
  refreshFacts(read:()=>Promise<CandidateMetadataFacts>):Promise<CandidateMetadataFacts>;
  assertRefreshChild(command:{candidateId:string;expectedVersion:number;observation:{videoId:string};actorUserId:string|null;eventId:string;now:number}):void;
  refreshEvent(detailJson:string,ordinary:()=>D1PreparedStatement[]):Promise<D1PreparedStatement[]>;
  refreshEventExists(eventId:string):Promise<boolean|null>;
  writeRefreshChild(statements:D1PreparedStatement[],capture:{sql:string;bindings:(string|number|null)[]}):Promise<void>;
}
