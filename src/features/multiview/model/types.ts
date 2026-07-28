import type { Member } from "@/features/members";
import type { ChzzkLiveStatusMap } from "@/features/chzzk";

export interface MultiviewSource {
  channelId: string;
  member?: Member;
  liveStatus?: ChzzkLiveStatusMap[number];
  isLive: boolean;
}

export interface MultiviewUrlState {
  channelIds: string[];
}
