import { getDb } from "../../../platform/db";
import {
  insertAdminAuditLog,
} from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import { createYouTubeApplication } from "../application/youtube-service";
import { createD1KirinukiRepository } from "./d1-kirinuki-repository";
import { readActiveYouTubeChannels } from "./d1-active-channels";
import { getYouTubeCacheStatus } from "./youtube-api";
import { readYouTubeChannelsWithSWR } from "./youtube-cache-swr";
import { createYouTubeCacheTelemetryWriter } from "./youtube-cache-telemetry";
import { CloudflareYouTubeCacheAnalyticsReader } from "./youtube-cache-analytics-reader";
import {
  getYouTubeWarmupStatus,
  readYouTubeWarmupTargets,
  runManualYouTubeCacheRefresh,
} from "./youtube-warmup";
import {
  readOfficialYouTubeShorts,
  readStoredYouTubeFeed,
} from "./youtube-feed";

export const buildYouTubeApplication = (env: Env) => {
  const db = getDb(env);
  const kirinukiRepository = createD1KirinukiRepository(db);
  const analyticsReader = new CloudflareYouTubeCacheAnalyticsReader(
    env.CLOUDFLARE_ACCOUNT_ID,
    env.YOUTUBE_CACHE_ANALYTICS_READ_TOKEN ??
      env.OTW_PLAY_ANALYTICS_READ_TOKEN,
  );

  return createYouTubeApplication({
    isApiConfigured: () => Boolean(env.YOUTUBE_API_KEY?.trim()),
    readAllowedChannelIds: () => readActiveYouTubeChannels(env.otw_db),
    readChannelsWithSWR: (targets, ctx) =>
      readYouTubeChannelsWithSWR({
        db: env.otw_db,
        apiKey: env.YOUTUBE_API_KEY?.trim() ?? "",
        targets,
        ctx,
        telemetry: createYouTubeCacheTelemetryWriter(
          env.YOUTUBE_CACHE_ANALYTICS,
        ),
      }),
    readStoredFeed: (channelIds, maxResults, source) =>
      readStoredYouTubeFeed(env, channelIds, maxResults, source),
    readShorts: (channelIds, limit, cursor, ctx) =>
      readOfficialYouTubeShorts(env, channelIds, limit, cursor, ctx),
    readCacheTargets: () => readYouTubeWarmupTargets(env.otw_db),
    readCacheStatus: (windowHours, usageEndAt) =>
      getYouTubeCacheStatus(env.otw_db, windowHours, usageEndAt),
    readCacheAnalytics: (windowHours) => analyticsReader.read(windowHours),
    readWarmupStatus: (windowHours) =>
      getYouTubeWarmupStatus(env.otw_db, windowHours),
    runCacheRefresh: () => runManualYouTubeCacheRefresh(env),
    writeWarmupAudit: async ({ result, ...actor }) => {
      await insertAdminAuditLog(db, {
        eventType: "manual_collection.youtube_cache_refresh",
        resourceType: "youtube_cache",
        action: "refresh_all",
        status: result.status,
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorIp: actor.actorIp,
        targetCount: result.targetCount,
        successCount: result.refreshedCount,
        failureCount: result.failedCount,
        detail: {
          skippedFreshCount: result.skippedFreshCount,
          staleFallbackCount: result.staleFallbackCount,
          baselineCount: result.baselineCount,
          changedCount: result.changedCount,
          unchangedCount: result.unchangedCount,
          apiCalls: result.apiCalls,
          quotaUnits: result.quotaUnits,
          durationMs: result.durationMs,
        },
        error: result.error,
      });
    },
    listKirinukiChannels: () => kirinukiRepository.list(),
    createKirinukiChannel: (input) => kirinukiRepository.create(input),
    updateKirinukiChannel: (input) => kirinukiRepository.update(input),
    deleteKirinukiChannel: (id) => kirinukiRepository.delete(id),
  });
};
