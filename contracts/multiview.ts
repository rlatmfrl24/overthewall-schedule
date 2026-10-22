import type { ChzzkLiveContentDto } from "./chzzk";

export const MAX_SAVED_MULTIVIEW_CHANNELS = 30;

export interface MultiviewChannelMetadata {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
}
export interface SavedMultiviewChannel extends MultiviewChannelMetadata { addedAt: number }
export interface MultiviewChannelListResponse { items: SavedMultiviewChannel[]; limit: typeof MAX_SAVED_MULTIVIEW_CHANNELS }
export interface MultiviewChannelAddResponse { item: SavedMultiviewChannel }
export interface MultiviewChannelDeleteResponse { deleted: true }
export type MultiviewLiveContentDto = Pick<ChzzkLiveContentDto, "channelId" | "status" | "liveTitle" | "concurrentUserCount"> & Partial<Omit<ChzzkLiveContentDto, "channelId" | "status" | "liveTitle" | "concurrentUserCount">>;
export interface MultiviewLiveStatusItemDto { channelId: string; content: MultiviewLiveContentDto | null }
export interface MultiviewLiveStatusResponse { items: MultiviewLiveStatusItemDto[]; updatedAt: string }
export type MultiviewErrorCode = "MULTIVIEW_INVALID_INPUT" | "MULTIVIEW_AUTH_REQUIRED" | "MULTIVIEW_CHANNEL_NOT_FOUND" | "MULTIVIEW_CHANNEL_LIMIT" | "MULTIVIEW_BODY_TOO_LARGE" | "MULTIVIEW_RATE_LIMITED" | "MULTIVIEW_UNAVAILABLE";

export function parsePersonalMultiviewChannelInput(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value || value.length > 2048) return null;
  if (/^[a-f0-9]{32}$/i.test(value)) return value.toLowerCase();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "chzzk.naver.com" || url.username || url.password || url.port) return null;
    return url.pathname.match(/^\/(?:(?:live|channel)\/)?([a-f0-9]{32})\/?$/i)?.[1]?.toLowerCase() ?? null;
  } catch { return null; }
}
