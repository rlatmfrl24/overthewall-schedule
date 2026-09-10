import type { OtwPlayPublicPerformanceResponseDto } from "./otw-play";

export interface PlayPerformanceQuery {
  q?: string;
  member?: number;
  relation?: "original" | "cover";
  cursor?: string;
  limit?: number;
}

export interface PlayDefaultPlaylist {
  id: string;
  version: number;
  title: string;
  description: string;
  imageUrl: string | null;
  songCount: number;
  performanceCount: number;
  query: PlayPerformanceQuery;
}

export interface PlayPlaylistSummary {
  id: string;
  title: string;
  description: string;
  version: number;
  itemCount: number;
  originDefaultId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PlayPlaylist extends PlayPlaylistSummary {
  performanceIds: string[];
}

export interface PlayPlaylistWrite {
  title: string;
  description: string;
  performanceIds: string[];
  originDefaultId: string | null;
}

export interface PlayResolvedPerformances {
  items: OtwPlayPublicPerformanceResponseDto[];
  unavailableIds: string[];
}
