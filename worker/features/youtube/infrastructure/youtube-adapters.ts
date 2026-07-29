import { getDb } from "../../../platform/db";
import {
  insertAdminAuditLog,
} from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import { createYouTubeApplication } from "../application/youtube-service";
import { createD1KirinukiRepository } from "./d1-kirinuki-repository";
import { readActiveYouTubeChannels } from "./d1-active-channels";
import {
  fetchYouTubeVideosForChannel,
  getYouTubeCacheStatus,
} from "./youtube-api";
import {
  getYouTubeWarmupStatus,
  runYouTubeWarmup,
} from "./youtube-warmup";

export const buildYouTubeApplication = (env: Env) => {
  const db = getDb(env);
  const kirinukiRepository = createD1KirinukiRepository(db);

  return createYouTubeApplication({
    isApiConfigured: () => Boolean(env.YOUTUBE_API_KEY?.trim()),
    readAllowedChannelIds: () => readActiveYouTubeChannels(env.otw_db),
    fetchChannelVideos: (channelId, maxResults) =>
      fetchYouTubeVideosForChannel(
        channelId,
        env.YOUTUBE_API_KEY?.trim() ?? "",
        maxResults,
        env.otw_db,
      ),
    readCacheStatus: (windowHours) =>
      getYouTubeCacheStatus(env.otw_db, windowHours),
    readWarmupStatus: (windowHours) =>
      getYouTubeWarmupStatus(env.otw_db, windowHours),
    runWarmup: () => runYouTubeWarmup(env, "manual"),
    writeWarmupAudit: async ({ result, ...actor }) => {
      await insertAdminAuditLog(db, {
        eventType: "manual_collection.youtube_warmup",
        resourceType: "youtube_warmup",
        action: "run_now",
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
