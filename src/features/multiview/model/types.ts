import type { Member } from "@/features/members";
import type { ChzzkLiveStatusMap } from "@/features/chzzk";
import type { SavedMultiviewChannel } from "@contracts/multiview";

export interface MultiviewSource {
  saved?: SavedMultiviewChannel;
  statusError?: boolean;
  channelId: string;
  member?: Member;
  liveStatus?: ChzzkLiveStatusMap[number];
  isLive: boolean;
}

export interface MultiviewUrlState {
  channelIds: string[];
}
