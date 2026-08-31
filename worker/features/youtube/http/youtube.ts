import { requireAdminUser } from "../../../platform/auth";
import {
  badRequest,
  getActorInfo,
  json,
  methodNotAllowed,
} from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  parseYouTubeChannelTargets,
  parseYouTubeMaxResults,
} from "../domain/channel-targets";
import {
  YouTubeAllowlistUnavailableError,
  YouTubeCacheRefreshInProgressError,
  YouTubeTargetsNotAllowedError,
  type YouTubeApplication,
} from "../application/youtube-service";

const YOUTUBE_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const PRIVATE_YOUTUBE_CACHE_CONTROL = "no-store";

export type BuildYouTubeApplication = (env: Env) => YouTubeApplication;

const parseWindowHours = (value: string | null) => {
  if (value === null || value.trim() === "") return 24;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 168
    ? parsed
    : null;
};

export const createYouTubeHandler =
  (buildApplication: BuildYouTubeApplication) =>
  async (request: Request, env: Env, ctx?: ExecutionContext) => {
  const url = new URL(request.url);
  const application = buildApplication(env);

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

    const cacheStatus = await application.readCacheOverview(windowHours);

    return json(
      cacheStatus,
      200,
      {
        headers: {
          "Cache-Control": PRIVATE_YOUTUBE_CACHE_CONTROL,
          Vary: "Authorization",
        },
      },
    );
  }

  if (
    url.pathname === "/api/youtube/cache/refresh" ||
    url.pathname === "/api/youtube/cache/warmup/run"
  ) {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;

    const actor = getActorInfo(request, admin.user);
    try {
      const result = await application.runManualCacheRefresh(actor);
      return json(result, 200, {
        headers: {
          "Cache-Control": PRIVATE_YOUTUBE_CACHE_CONTROL,
          Vary: "Authorization",
        },
      });
    } catch (error) {
      if (error instanceof YouTubeCacheRefreshInProgressError) {
        return json(
          { error: "youtube_cache_refresh_in_progress" },
          409,
          {
            headers: {
              "Cache-Control": PRIVATE_YOUTUBE_CACHE_CONTROL,
              Vary: "Authorization",
            },
          },
        );
      }
      throw error;
    }
  }

  if (url.pathname === "/api/youtube/videos") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const parsedTargets = parseYouTubeChannelTargets(
      url.searchParams.get("channelIds"),
    );
    if (!parsedTargets.ok) return badRequest(parsedTargets.message);

    const maxResults = parseYouTubeMaxResults(
      url.searchParams.get("maxResults"),
    );
    if (maxResults === null) {
      return badRequest("maxResults must be an integer between 1 and 20");
    }

    try {
      const content = await application.readVideos(
        parsedTargets.channelIds,
        maxResults,
        ctx,
      );
      const { targetCount, availableTargetCount, ...responseContent } = content;
      const status = targetCount > 0 && availableTargetCount === 0 ? 503 : 200;
      return json(
        {
          updatedAt: new Date().toISOString(),
          ...responseContent,
        },
        status,
        {
          headers: {
            "Cache-Control":
              content.cache.state === "fresh"
                ? YOUTUBE_CACHE_CONTROL
                : PRIVATE_YOUTUBE_CACHE_CONTROL,
            ...(status === 503 ? { "Retry-After": "15" } : {}),
          },
        },
      );
    } catch (error) {
      if (error instanceof YouTubeAllowlistUnavailableError) {
        return new Response(error.message, {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (error instanceof YouTubeTargetsNotAllowedError) {
        return badRequest("Unapproved channelIds");
      }
      console.error("Failed to handle /api/youtube/videos", error);
      return new Response("Failed to fetch YouTube videos", { status: 502 });
    }
  }

  return new Response(null, { status: 404 });
  };
