import { apiFetch } from "./client";

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

export interface YouTubeWarmupSettingsSummary {
  enabled: boolean;
  intervalHours: number;
  dailyQuotaUnits: number;
  officialEnabled: boolean;
  kirinukiEnabled: boolean;
  lastRun: number | null;
}

export interface YouTubeWarmupRunSummary {
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

export interface YouTubeWarmupStatusSummary {
  settings: YouTubeWarmupSettingsSummary;
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
  latestRun: YouTubeWarmupRunSummary | null;
  recentRuns: YouTubeWarmupRunSummary[];
}

export interface YouTubeCacheStatusResponse {
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
  warmup?: YouTubeWarmupStatusSummary;
}

export async function fetchYouTubeCacheStatus(
  windowHours = 24,
): Promise<YouTubeCacheStatusResponse> {
  return apiFetch<YouTubeCacheStatusResponse>(
    `/api/youtube/cache/status?windowHours=${windowHours}`,
    { cache: "no-store" },
  );
}

export async function runYouTubeWarmupNow(): Promise<YouTubeWarmupRunSummary> {
  return apiFetch<YouTubeWarmupRunSummary>("/api/youtube/cache/warmup/run", {
    method: "POST",
  });
}
