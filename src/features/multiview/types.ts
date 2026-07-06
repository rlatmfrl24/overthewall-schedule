import type { ChzzkLiveStatusMap, Member } from "@/lib/types";

export interface MultiviewSource {
  channelId: string;
  member?: Member;
  liveStatus?: ChzzkLiveStatusMap[number];
  isLive: boolean;
}

export interface MultiviewUrlState {
  channelIds: string[];
}
