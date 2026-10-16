import type {OtwPlayAdminChannelDto,OtwPlayAdminCommandResponse} from "@contracts/otw-play";
import type {ChannelMutationCommand} from "../../domain/channel-mutation";
import type {OtwPlayYouTubeMetadataReader} from "./youtube-metadata";

export interface ChannelTransitionPort {
  run(command:ChannelMutationCommand,execute:(command:ChannelMutationCommand,reader:OtwPlayYouTubeMetadataReader)=>Promise<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>):Promise<OtwPlayAdminCommandResponse<OtwPlayAdminChannelDto>>;
}
