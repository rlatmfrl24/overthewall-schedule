import { fetchChzzkClips, fetchChzzkVideos } from "../services/chzzk";
import { badRequest, json, methodNotAllowed, pMap } from "../utils/helpers";
import type { Env } from "../types";

const CHZZK_BATCH_CONCURRENCY = 6;
const MEDIA_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export const handleVods = async (request: Request, env: Env) => {
  void env;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/vods/chzzk")) {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const channelIdsParam = url.searchParams.get("channelIds");
    const channelId = url.searchParams.get("channelId");
    const page = parseInt(url.searchParams.get("page") || "0", 10);
    const size = parseInt(url.searchParams.get("size") || "24", 10);

    if (channelIdsParam) {
      const channelIds = channelIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (channelIds.length === 0) {
        return badRequest("No valid channelIds");
      }

      const items = await pMap(
        channelIds,
        async (id) => ({
          channelId: id,
          content: await fetchChzzkVideos(id, page, size),
        }),
        CHZZK_BATCH_CONCURRENCY,
      );

      return json(
        {
          updatedAt: new Date().toISOString(),
          items,
        },
        200,
        { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
      );
    }

    if (!channelId) {
      return badRequest("channelId query required");
    }

    const content = await fetchChzzkVideos(channelId, page, size);
    return json(
      {
        updatedAt: new Date().toISOString(),
        content,
      },
      200,
      { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
    );
  }

  // Chzzk Clips API
  if (url.pathname.startsWith("/api/clips/chzzk")) {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const channelIdsParam = url.searchParams.get("channelIds");
    const channelId = url.searchParams.get("channelId");
    const size = parseInt(url.searchParams.get("size") || "30", 10);

    if (channelIdsParam) {
      const channelIds = channelIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (channelIds.length === 0) {
        return badRequest("No valid channelIds");
      }

      const items = await pMap(
        channelIds,
        async (id) => ({
          channelId: id,
          content: await fetchChzzkClips(id, size),
        }),
        CHZZK_BATCH_CONCURRENCY,
      );

      return json(
        {
          updatedAt: new Date().toISOString(),
          items,
        },
        200,
        { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
      );
    }

    if (!channelId) {
      return badRequest("channelId query required");
    }

    const content = await fetchChzzkClips(channelId, size);
    return json(
      {
        updatedAt: new Date().toISOString(),
        content,
      },
      200,
      { headers: { "Cache-Control": MEDIA_CACHE_CONTROL } },
    );
  }

  return new Response(null, { status: 404 });
};
