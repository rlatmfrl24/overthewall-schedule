import { fetchChzzkClips, fetchChzzkVideos } from "../services/chzzk";
import { fetchYouTubeVideosForChannel } from "../services/youtube";
import { badRequest, json, methodNotAllowed } from "../utils/helpers";
import type { YouTubeVideoItem, Env } from "../types";

export const handleVods = async (request: Request, env: Env) => {
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

      const items = await Promise.all(
        channelIds.map(async (id) => ({
          channelId: id,
          content: await fetchChzzkVideos(id, page, size),
        })),
      );

      return json({
        updatedAt: new Date().toISOString(),
        items,
      });
    }

    if (!channelId) {
      return badRequest("channelId query required");
    }

    const content = await fetchChzzkVideos(channelId, page, size);
    return json({
      updatedAt: new Date().toISOString(),
      content,
    });
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

      const items = await Promise.all(
        channelIds.map(async (id) => ({
          channelId: id,
          content: await fetchChzzkClips(id, size),
        })),
      );

      return json({
        updatedAt: new Date().toISOString(),
        items,
      });
    }

    if (!channelId) {
      return badRequest("channelId query required");
    }

    const content = await fetchChzzkClips(channelId, size);
    return json({
      updatedAt: new Date().toISOString(),
      content,
    });
  }

  // YouTube Videos API
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
      const items = await Promise.all(
        channelIds.map(async (channelId: string) => ({
          channelId,
          content: await fetchYouTubeVideosForChannel(
            channelId,
            apiKey,
            maxResults,
          ),
        })),
      );

      // 모든 채널의 동영상을 합쳐서 최신순 정렬
      const allVideos: YouTubeVideoItem[] = [];
      const allShorts: YouTubeVideoItem[] = [];

      for (const item of items) {
        if (item.content) {
          allVideos.push(...item.content.videos);
          allShorts.push(...item.content.shorts);
        }
      }

      // 최신순 정렬
      allVideos.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
      allShorts.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );

      return json({
        updatedAt: new Date().toISOString(),
        videos: allVideos,
        shorts: allShorts,
        byChannel: items,
      });
    } catch (error) {
      console.error("Failed to handle /api/youtube/videos", error);
      return new Response("Failed to fetch YouTube videos", { status: 502 });
    }
  }

  return new Response(null, { status: 404 });
};
