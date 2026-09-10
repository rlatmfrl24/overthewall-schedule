import type { OtwPlayPublicPerformanceResponseDto } from "./otw-play";

export const PLAY_PLAYLIST_MAX_ITEMS = 1000;

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
  representativePerformanceId: string | null;
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
  representativePerformanceId: string | null;
  imageUrl: string | null;
}

export interface PlayPlaylist extends PlayPlaylistSummary {
  performanceIds: string[];
}

export interface PlayPlaylistWrite {
  title: string;
  description: string;
  performanceIds: string[];
  originDefaultId: string | null;
  /** Omitted on legacy updates: preserve the current choice. Null: automatic artwork. */
  representativePerformanceId?: string | null;
}

export interface PlayDefaultPlaylistWrite {
  title: string | null;
  description: string | null;
  representativePerformanceId: string | null;
}

export interface PlayAdminDefaultPlaylist extends PlayDefaultPlaylist {
  defaults: { title: string; description: string; imageUrl: string | null };
  overrides: PlayDefaultPlaylistWrite;
  representativeAvailable: boolean;
}

export interface PlayResolvedPerformances {
  items: OtwPlayPublicPerformanceResponseDto[];
  unavailableIds: string[];
}
