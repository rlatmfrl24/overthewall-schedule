import type { ChzzkLiveStatusMap, Member } from "@/lib/types";

export type MultiviewLayoutMode = "auto" | "dense";
export type MultiviewFrameSize = "compact" | "comfortable" | "source";

export interface MultiviewSource {
  channelId: string;
  member?: Member;
  liveStatus?: ChzzkLiveStatusMap[number];
  isLive: boolean;
}

export interface SelectedMultiviewSource {
  channelId: string;
  source?: MultiviewSource;
}

export interface MultiviewUrlState {
  channelIds: string[];
  chatChannelId: string | null;
  layout: MultiviewLayoutMode;
}

export interface MultiviewFrameSizePreset {
  frameMinHeight: number;
  frameMinWidth: number;
  tileMinHeight: number;
  tileMinWidth: number;
}

export interface MultiviewGridPlan {
  columns: number;
  rows: number;
}
