import type { Member } from "@/features/members";
import type { SavedMultiviewChannel, MultiviewLiveContentDto } from "@contracts/multiview";

export interface MultiviewSource {
  saved?: SavedMultiviewChannel;
  statusError?: boolean;
  channelId: string;
  member?: Member;
  liveStatus?: MultiviewLiveContentDto | null;
  isLive: boolean;
}

export interface MultiviewUrlState {
  channelIds: string[];
}
