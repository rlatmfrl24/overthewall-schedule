import type { PlayDefaultPlaylist, PlayPlaylist, PlayPlaylistSummary, PlayPlaylistWrite } from "@contracts/otw-play-playlists";
import type { PublicCatalogPerformanceDetail } from "./public-catalog-reader";

import type { PlaylistPerformanceQuery } from "../../domain/playlist-query";
export type { PlaylistPerformanceQuery } from "../../domain/playlist-query";
export { PlaylistError } from "../../domain/playlist-error";

export interface PlaylistCatalogReader {
  readPlaylistDefaults(): Promise<PlayDefaultPlaylist[]>;
  readPlaylistPerformances(query: PlaylistPerformanceQuery): Promise<PublicCatalogPerformanceDetail[]>;
  resolvePlaylistPerformances(ids: string[]): Promise<PublicCatalogPerformanceDetail[]>;
}

export interface PlaylistRepository {
  list(owner: string): Promise<PlayPlaylistSummary[]>;
  read(owner: string, id: string): Promise<PlayPlaylist | null>;
  create(owner: string, requestId: string, input: PlayPlaylistWrite): Promise<PlayPlaylist>;
  save(owner: string, id: string, expectedVersion: number, input: PlayPlaylistWrite): Promise<boolean>;
  delete(owner: string, id: string, expectedVersion: number): Promise<boolean>;
}
