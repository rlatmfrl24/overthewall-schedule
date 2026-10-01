import type { OperationRunDto } from "./scheduled-operations";

export type YouTubeFeedRole = "official" | "vod" | "kirinuki";
export type YouTubeFeedState = "misconfigured" | "failed" | "initializing" | "paused" | "due" | "delayed" | "healthy" | "unknown";
export interface YouTubeFeedChannelDto {
  channelId: string;
  names: string[];
  roles: YouTubeFeedRole[];
  state: YouTubeFeedState;
  initialized: boolean;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  nextCheckAt: number | null;
  videoCount: number;
  metadataPending: number;
  oldestMetadataAt: number | null;
  error: string | null;
}
export interface YouTubeFeedStatusDto {
  updatedAt: number;
  window: { hours: 24 | 168; since: number; until: number };
  automaticEnabled: boolean;
  apiConfigured: boolean;
  channels: YouTubeFeedChannelDto[];
  configurationIssues: Array<{ channelId: string | null; name: string; issue: string }>;
  summary: { channels: number; states: Record<YouTubeFeedState, number>; videos: number; metadataPending: number; oldestMetadataAt: number | null };
  usage: { apiCalls: number; quotaUnits: number; failures: number; byOrigin: Array<{ origin: YouTubeUsageRequestOrigin; apiCalls: number; quotaUnits: number; failures: number }> };
  quota: { day: string; since: number; nextResetAt: number; used: number; limit: number | null; lowPriorityLimit: number | null };
  recentRuns: OperationRunDto[];
}
export interface YouTubeVideoDto {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  duration: number;
  viewCount: number;
  channelId: string;
  channelTitle: string;
  isShort: boolean;
}

export interface YouTubeVideosResponseDto {
  videos: YouTubeVideoDto[];
  shorts: YouTubeVideoDto[];
  updatedAt: string;
  cache: YouTubePublicCacheMetadataDto;
}

export type YouTubeShortsCollectionState =
  | "ready"
  | "refreshing"
  | "partial"
  | "exhausted";

export interface YouTubeShortsResponseDto {
  items: YouTubeVideoDto[];
  nextCursor: string | null;
  hasMore: boolean;
  updatedAt: string;
  collection: {
    state: YouTubeShortsCollectionState;
    baselineTarget: 20;
    requested: number;
    returned: number;
    revalidateAfterMs: 15000 | null;
  };
}

export interface KirinukiChannelDto {
  id: number;
  channel_name: string;
  channel_url: string;
  youtube_channel_id: string;
  created_at: string | number | null;
}

export interface CreateKirinukiChannelDto {
  channel_name: string;
  channel_url: string;
  youtube_channel_id: string;
}

export interface UpdateKirinukiChannelDto extends CreateKirinukiChannelDto {
  id: number;
}

export interface KirinukiVideosResponseDto {
  updatedAt: string;
  videos: YouTubeVideoDto[];
  shorts: YouTubeVideoDto[];
  byChannel: Array<{
    channelId: string;
    channelName: string;
    content: {
      videos: YouTubeVideoDto[];
      shorts: YouTubeVideoDto[];
    } | null;
  }>;
  cache: YouTubePublicCacheMetadataDto;
}

export type YouTubePublicCacheState =
  | "fresh"
  | "refreshing"
  | "stale"
  | "partial"
  | "empty";

export interface YouTubePublicCacheMetadataDto {
  state: YouTubePublicCacheState;
  oldestFetchedAt: string | null;
  refreshScheduledCount: number;
  pendingCount: number;
  revalidateAfterMs: 15000 | null;
}

export type YouTubeUsageOperation = "channels.list" | "playlistItems.list" | "videos.list";
export type YouTubeUsageRequestOrigin = "demand" | "manual" | "scheduled" | "legacy_unknown";

export interface YouTubeVodsRequest {
  memberUids: number[];
  limit: number;
  cursor: string | null;
}

export interface YouTubeVodsResponseDto {
  items: Array<YouTubeVideoDto & { memberUids: number[] }>;
  availableMemberUids: number[];
  nextCursor: string | null;
  hasMore: boolean;
  updatedAt: string | null;
  collection: { state: "unregistered" | "initializing" | "ready" | "partial" | "disabled" | "error" };
}
