import { requireAdminUser } from "../auth";
import {
  fetchYouTubeVideosForChannel,
  getYouTubeCacheStatus,
} from "../services/youtube";
import {
  getYouTubeWarmupStatus,
  runYouTubeWarmup,
} from "../services/youtube-warmup";
import { badRequest, json, methodNotAllowed, pMap } from "../utils/helpers";
import type { Env, YouTubeVideoItem } from "../types";

const YOUTUBE_BATCH_CONCURRENCY = 4;
const YOUTUBE_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const PRIVATE_YOUTUBE_CACHE_CONTROL = "no-store";

const parseWindowHours = (value: string | null) => {
  if (value === null || value.trim() === "") return 24;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 168
    ? parsed
    : null;
};

export const handleYouTube = async (request: Request, env: Env) => {
  const url = new URL(request.url);

  if (url.pathname === "/api/youtube/cache/status") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;

    const windowHours = parseWindowHours(url.searchParams.get("windowHours"));
    if (windowHours === null) {
      return badRequest("windowHours must be an integer between 1 and 168");
    }

    const [cacheStatus, warmupStatus] = await Promise.all([
      getYouTubeCacheStatus(env.otw_db, windowHours),
      getYouTubeWarmupStatus(env.otw_db, windowHours),
    ]);

    return json(
      {
        ...cacheStatus,
        warmup: warmupStatus,
      },
      200,
      {
        headers: {
          "Cache-Control": PRIVATE_YOUTUBE_CACHE_CONTROL,
          Vary: "Authorization",
        },
      },
    );
  }

  if (url.pathname === "/api/youtube/cache/warmup/run") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;

    return json(await runYouTubeWarmup(env, "manual"), 200, {
      headers: {
        "Cache-Control": PRIVATE_YOUTUBE_CACHE_CONTROL,
        Vary: "Authorization",
      },
    });
  }

  if (url.pathname.startsWith("/api/youtube/videos")) {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const apiKey = env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) {
      console.error("YouTube API key not configured for this worker");
      return new Response("YouTube API key not configured", { status: 500 });
    }

    const channelIdsParam = url.searchParams.get("channelIds");
    if (!channelIdsParam) {
      return badRequest("channelIds query required");
    }

    const channelIds = channelIdsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (channelIds.length === 0) {
      return badRequest("No valid channelIds");
    }

    const maxResults = parseInt(url.searchParams.get("maxResults") || "20", 10);

    try {
      const items = await pMap(
        channelIds,
        async (channelId: string) => ({
          channelId,
          content: await fetchYouTubeVideosForChannel(
            channelId,
            apiKey,
            maxResults,
            env.otw_db,
          ),
        }),
        YOUTUBE_BATCH_CONCURRENCY,
      );

      const allVideos: YouTubeVideoItem[] = [];
      const allShorts: YouTubeVideoItem[] = [];

      for (const item of items) {
        if (item.content) {
          allVideos.push(...item.content.videos);
          allShorts.push(...item.content.shorts);
        }
      }

      allVideos.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
      allShorts.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );

      return json(
        {
          updatedAt: new Date().toISOString(),
          videos: allVideos,
          shorts: allShorts,
          byChannel: items,
        },
        200,
        { headers: { "Cache-Control": YOUTUBE_CACHE_CONTROL } },
      );
    } catch (error) {
      console.error("Failed to handle /api/youtube/videos", error);
      return new Response("Failed to fetch YouTube videos", { status: 502 });
    }
  }

  return new Response(null, { status: 404 });
};
