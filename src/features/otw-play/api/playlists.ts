import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { OTW_PLAY_ADMIN_PREVIEW_HEADER, type OtwPlayPublicEnvelope, type OtwPlayPublicPerformanceResponseDto } from "@contracts/otw-play";
import type { PlayAdminDefaultPlaylist, PlayDefaultPlaylistWrite, PlayDefaultPlaylist, PlayPerformanceQuery, PlayPlaylist, PlayPlaylistSummary, PlayPlaylistWrite, PlayResolvedPerformances } from "@contracts/otw-play-playlists";
import { apiFetch } from "@/shared/api/client";

export interface PlaylistRequestOptions { adminPreview?: boolean; signal?: AbortSignal }
const options = (request: PlaylistRequestOptions, member = false) => ({ signal: request.signal,
  auth: member || request.adminPreview ? "required" as const : "omit" as const,
  headers: request.adminPreview ? { [OTW_PLAY_ADMIN_PREVIEW_HEADER]: "1" } : undefined });
export const fetchDefaultPlaylists = (request: PlaylistRequestOptions = {}) =>
  apiFetch<OtwPlayPublicEnvelope<{ items: PlayDefaultPlaylist[] }>>(apiRoutes.otwPlay.playlistDefaults.build(), options(request));
export const fetchPlaylistPerformances = (query: PlayPerformanceQuery, request: PlaylistRequestOptions = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
  return apiFetch<OtwPlayPublicEnvelope<{ items: OtwPlayPublicPerformanceResponseDto[] }>>(
    withRouteSearch(apiRoutes.otwPlay.performances.build(), params), options(request));
};
export const resolvePlaylistPerformances = (performanceIds: string[], request: PlaylistRequestOptions = {}) =>
  apiFetch<OtwPlayPublicEnvelope<PlayResolvedPerformances>>(apiRoutes.otwPlay.resolvePerformances.build(),
    { ...options(request), method: "POST", json: { performanceIds } });
export const fetchMyPlaylists = (request: PlaylistRequestOptions = {}) =>
  apiFetch<{ data: PlayPlaylistSummary[] }>(apiRoutes.otwPlay.myPlaylists.build(), options(request, true));
export const fetchMyPlaylist = (id: string, request: PlaylistRequestOptions = {}) =>
  apiFetch<{ data: PlayPlaylist }>(apiRoutes.otwPlay.myPlaylist.build(id), options(request, true));
export const createMyPlaylist = (input: PlayPlaylistWrite, requestId: string, request: PlaylistRequestOptions = {}) =>
  apiFetch<{ data: PlayPlaylist }>(apiRoutes.otwPlay.myPlaylists.build(), { ...options(request, true), method: "POST", json: { ...input, requestId } });
export const saveMyPlaylist = (id: string, input: PlayPlaylistWrite, expectedVersion: number, request: PlaylistRequestOptions = {}) =>
  apiFetch<{ data: PlayPlaylist }>(apiRoutes.otwPlay.myPlaylist.build(id), { ...options(request, true), method: "PUT", json: { ...input, expectedVersion } });
export const deleteMyPlaylist = (id: string, expectedVersion: number, request: PlaylistRequestOptions = {}) =>
  apiFetch<{ data: { deleted: true } }>(apiRoutes.otwPlay.myPlaylist.build(id), { ...options(request, true), method: "DELETE", json: { expectedVersion } });

export const fetchAdminDefaultPlaylists = (signal?: AbortSignal) =>
  apiFetch<{ data: PlayAdminDefaultPlaylist[] }>(apiRoutes.otwPlay.admin.playlistDefaults.build(), { auth: "required", signal });
export const fetchAdminDefaultPlaylist = (id: string, signal?: AbortSignal) =>
  apiFetch<{ data: PlayAdminDefaultPlaylist }>(apiRoutes.otwPlay.admin.playlistDefault.build(id), { auth: "required", signal });
export const saveAdminDefaultPlaylist = (id: string, input: PlayDefaultPlaylistWrite, expectedVersion: number) =>
  apiFetch<{ data: PlayAdminDefaultPlaylist }>(apiRoutes.otwPlay.admin.playlistDefault.build(id),
    { auth: "required", method: "PUT", json: { ...input, expectedVersion } });
