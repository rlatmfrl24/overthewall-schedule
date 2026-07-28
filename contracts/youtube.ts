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
}

export type YouTubeCacheType = "uploads_playlist" | "channel_videos";
export type YouTubeCacheStatus = "fresh" | "stale" | "expired";
export type YouTubeUsageOperation =
  | "channels.list"
  | "playlistItems.list"
  | "videos.list";
export type YouTubeWarmupSource = "scheduled" | "manual";
export type YouTubeWarmupRunStatus =
  | "success"
  | "skipped"
  | "partial"
  | "failed";

export interface YouTubeWarmupSettingsSummaryDto {
  enabled: boolean;
  intervalHours: number;
  dailyQuotaUnits: number;
  officialEnabled: boolean;
  kirinukiEnabled: boolean;
  lastRun: number | null;
}

export interface YouTubeWarmupRunSummaryDto {
  id: number | null;
  source: YouTubeWarmupSource;
  status: YouTubeWarmupRunStatus;
  targetCount: number;
  skippedFreshCount: number;
  refreshedCount: number;
  failedCount: number;
  staleFallbackCount: number;
  apiCalls: number;
  quotaUnits: number;
  durationMs: number;
  startedAt: number;
  finishedAt: number;
  error: string | null;
}

export interface YouTubeWarmupStatusSummaryDto {
  settings: YouTubeWarmupSettingsSummaryDto;
  quota: {
    limit: number;
    used: number;
    remaining: number;
    windowHours: number;
    since: number;
  };
  targets: {
    total: number;
    official: number;
    kirinuki: number;
  };
  latestRun: YouTubeWarmupRunSummaryDto | null;
  recentRuns: YouTubeWarmupRunSummaryDto[];
}

export interface YouTubeCacheStatusResponseDto {
  updatedAt: string;
  window: { hours: number; since: number };
  cache: {
    total: number;
    fresh: number;
    stale: number;
    expired: number;
    byType: Array<{
      type: YouTubeCacheType;
      total: number;
      fresh: number;
      stale: number;
      expired: number;
    }>;
  };
  usage: {
    apiCalls: number;
    quotaUnits: number;
    successCount: number;
    failureCount: number;
    rateLimitCount: number;
    quotaErrorCount: number;
    byOperation: Array<{
      operation: YouTubeUsageOperation;
      apiCalls: number;
      quotaUnits: number;
      failureCount: number;
    }>;
  };
  channels: Array<{
    channelId: string;
    cacheKey: string;
    maxResults: number | null;
    type: YouTubeCacheType;
    status: YouTubeCacheStatus;
    fetchedAt: number;
    expiresAt: number;
    staleUntil: number;
    lastStatus: number | null;
    lastError: string | null;
  }>;
  warmup?: YouTubeWarmupStatusSummaryDto;
}
