import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  YouTubeCacheStatus as YouTubeCacheStatusContract,
  YouTubeCacheStatusResponseDto,
  YouTubeCacheType as YouTubeCacheTypeContract,
  YouTubeUsageOperation as YouTubeUsageOperationContract,
  YouTubeWarmupRunStatus as YouTubeWarmupRunStatusContract,
  YouTubeWarmupRunSummaryDto,
  YouTubeWarmupSettingsSummaryDto,
  YouTubeWarmupSource as YouTubeWarmupSourceContract,
  YouTubeWarmupStatusSummaryDto,
} from "@contracts/youtube";

export type YouTubeCacheType = YouTubeCacheTypeContract;
export type YouTubeCacheStatus = YouTubeCacheStatusContract;
export type YouTubeUsageOperation = YouTubeUsageOperationContract;
export type YouTubeWarmupSource = YouTubeWarmupSourceContract;
export type YouTubeWarmupRunStatus = YouTubeWarmupRunStatusContract;
export type YouTubeWarmupSettingsSummary = YouTubeWarmupSettingsSummaryDto;
export type YouTubeWarmupRunSummary = YouTubeWarmupRunSummaryDto;
export type YouTubeWarmupStatusSummary = YouTubeWarmupStatusSummaryDto;
export type YouTubeCacheStatusResponse = YouTubeCacheStatusResponseDto;

export async function fetchYouTubeCacheStatus(
  windowHours = 24,
): Promise<YouTubeCacheStatusResponse> {
  return apiFetch<YouTubeCacheStatusResponse>(
    withRouteSearch(
      apiRoutes.youtube.cacheStatus.build(),
      `windowHours=${windowHours}`,
    ),
    { cache: "no-store" },
  );
}

export async function runYouTubeWarmupNow(): Promise<YouTubeWarmupRunSummary> {
  return apiFetch<YouTubeWarmupRunSummary>(
    apiRoutes.youtube.cacheWarmup.build(),
    { method: "POST" },
  );
}
