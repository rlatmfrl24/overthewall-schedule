import type { PlayDefaultPlaylist, PlayPlaylist, PlayPlaylistWrite, PlayDefaultPlaylistWrite } from "@contracts/otw-play-playlists";
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
  list(owner: string): Promise<PlayPlaylist[]>;
  read(owner: string, id: string): Promise<PlayPlaylist | null>;
  findCreate(owner: string, requestId: string, input: PlayPlaylistWrite): Promise<PlayPlaylist | null>;
  create(owner: string, requestId: string, input: PlayPlaylistWrite): Promise<PlayPlaylist>;
  save(owner: string, id: string, expectedVersion: number, input: PlayPlaylistWrite): Promise<boolean>;
  delete(owner: string, id: string, expectedVersion: number): Promise<boolean>;
}

export interface DefaultPlaylistSetting extends PlayDefaultPlaylistWrite {
  id: string;
  version: number;
}
export interface DefaultPlaylistSettingsRepository {
  list(): Promise<DefaultPlaylistSetting[]>;
  save(id: string, expectedVersion: number, input: PlayDefaultPlaylistWrite,
    actor: { userId: string; displayName: string | null; ipAddress: string | null }): Promise<boolean>;
}
