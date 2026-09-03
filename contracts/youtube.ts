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

export type YouTubeCacheType = "uploads_playlist" | "channel_videos";
export type YouTubeCacheStatus = "fresh" | "stale" | "expired";
export type YouTubeUsageOperation =
  | "channels.list"
  | "playlistItems.list"
  | "videos.list";
export type YouTubeUsageRequestOrigin =
  | "demand"
  | "manual"
  | "scheduled"
  | "legacy_unknown";
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
  baselineCount: number;
  changedCount: number;
  unchangedCount: number;
  apiCalls: number;
  quotaUnits: number;
  durationMs: number;
  startedAt: number;
  finishedAt: number;
  error: string | null;
}

export interface YouTubeCacheRefreshRunSummaryDto
  extends YouTubeWarmupRunSummaryDto {
  source: "manual";
}

export interface YouTubeWarmupStatusSummaryDto {
  settings: YouTubeWarmupSettingsSummaryDto;
  quota: {
    limit: number;
    used: number;
    remaining: number;
    windowHours: number;
    since: number;
    nextResetAt: number;
  };
  targets: {
    total: number;
    official: number;
    kirinuki: number;
    fresh: number;
    stale: number;
    expired: number;
    missing: number;
  };
  latestRun: YouTubeWarmupRunSummaryDto | null;
  recentRuns: YouTubeWarmupRunSummaryDto[];
}

export type YouTubeCacheAnalyticsStatus =
  | "available"
  | "unconfigured"
  | "unavailable";
export type YouTubeCacheActiveOrigin = "demand" | "manual";

export interface YouTubeCacheAnalyticsSliceDto {
  requestCount: number;
  nonBlockingServeCount: number;
  requestedTargetCount: number;
  immediateAvailableCount: number;
  refreshCount: number;
  baselineCount: number;
  changedCount: number;
  unchangedCount: number;
}

export interface YouTubeCacheAnalyticsDto {
  status: YouTubeCacheAnalyticsStatus;
  generatedAt: string;
  windowHours: number;
  /** Earliest sampled v2 event returned for the selected window. */
  observedSince: string | null;
  /** Conservative event-backed lower bound, not Analytics Engine uptime. */
  coverageHours: number | null;
  schemaVersion: "v2";
  sampled: true;
  summary: YouTubeCacheAnalyticsSliceDto;
  bySource: Array<
    YouTubeCacheAnalyticsSliceDto & { source: "official" | "kirinuki" }
  >;
  byOrigin: Array<
    YouTubeCacheAnalyticsSliceDto & { origin: YouTubeCacheActiveOrigin }
  >;
  reasonCode: "analytics_unconfigured" | "analytics_unavailable" | null;
}

export interface YouTubeCacheStatusResponseDto {
  updatedAt: string;
  window: { hours: number; since: number; until: number };
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
    byOrigin: Array<{
      origin: YouTubeUsageRequestOrigin;
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
  analytics: YouTubeCacheAnalyticsDto;
  effectiveness: {
    requestCount: number | null;
    nonBlockingServeCount: number | null;
    nonBlockingServeRate: number | null;
    externalApiCalls: number;
    activeQuotaUnits: number;
    baselineCount: number | null;
    changedCount: number | null;
    unchangedCount: number | null;
    changeRate: number | null;
    quotaPerChange: number | null;
  };
  targetStates: {
    official: { total: number; fresh: number; stale: number; expired: number; missing: number };
    kirinuki: { total: number; fresh: number; stale: number; expired: number; missing: number };
  };
  legacyScheduledRuns: YouTubeWarmupRunSummaryDto[];
}
