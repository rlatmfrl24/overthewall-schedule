import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  YouTubeCacheStatus as YouTubeCacheStatusContract,
  YouTubeCacheStatusResponseDto,
  YouTubeCacheRefreshRunSummaryDto,
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
export type YouTubeCacheRefreshRunSummary = YouTubeCacheRefreshRunSummaryDto;

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

export async function refreshYouTubeCache(): Promise<YouTubeCacheRefreshRunSummary> {
  return apiFetch<YouTubeCacheRefreshRunSummary>(
    apiRoutes.youtube.cacheRefresh.build(),
    { method: "POST" },
  );
}
