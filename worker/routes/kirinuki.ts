import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { kirinukiChannels } from "../../src/db/schema";
import { badRequest, parseNumericId } from "../utils/helpers";
import type { Env, YouTubeVideoItem } from "../types";
import { fetchYouTubeVideosForChannel } from "../services/youtube";

export const handleKirinuki = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);

  // GET /api/kirinuki/channels - 전체 채널 목록 조회
  if (request.method === "GET" && url.pathname === "/api/kirinuki/channels") {
    const data = await db
      .select()
      .from(kirinukiChannels)
      .orderBy(kirinukiChannels.channel_name);
    return Response.json(data);
  }

  // POST /api/kirinuki/channels - 채널 추가
  if (request.method === "POST" && url.pathname === "/api/kirinuki/channels") {
    const body = (await request.json()) as {
      channel_name?: string;
      channel_url?: string;
      youtube_channel_id?: string;
    };
    if (
      !body.channel_name?.trim() ||
      !body.channel_url?.trim() ||
      !body.youtube_channel_id?.trim()
    ) {
      return badRequest(
        "channel_name, channel_url, and youtube_channel_id are required",
      );
    }

    const result = await db.insert(kirinukiChannels).values({
      channel_name: body.channel_name.trim(),
      channel_url: body.channel_url.trim(),
      youtube_channel_id: body.youtube_channel_id.trim(),
    });

    if (result.success) {
      return new Response("Created", { status: 201 });
    }
    return new Response("Failed to create", { status: 500 });
  }

  // PUT /api/kirinuki/channels - 채널 수정
  if (request.method === "PUT" && url.pathname === "/api/kirinuki/channels") {
    const body = (await request.json()) as {
      id?: number | string;
      channel_name?: string;
      channel_url?: string;
      youtube_channel_id?: string;
    };
    if (!body.id) {
      return badRequest("ID is required");
    }

    const numericId = parseNumericId(body.id);
    if (numericId === null) return badRequest("Invalid id");

    if (
      !body.channel_name?.trim() ||
      !body.channel_url?.trim() ||
      !body.youtube_channel_id?.trim()
    ) {
      return badRequest(
        "channel_name, channel_url, and youtube_channel_id are required",
      );
    }

    const result = await db
      .update(kirinukiChannels)
      .set({
        channel_name: body.channel_name.trim(),
        channel_url: body.channel_url.trim(),
        youtube_channel_id: body.youtube_channel_id.trim(),
      })
      .where(eq(kirinukiChannels.id, numericId));

    if (result.success) {
      return new Response("Updated", { status: 200 });
    }
    return new Response("Failed to update", { status: 500 });
  }

  // DELETE /api/kirinuki/channels - 채널 삭제
  if (
    request.method === "DELETE" &&
    url.pathname === "/api/kirinuki/channels"
  ) {
    const id = url.searchParams.get("id");
    if (!id) {
      return badRequest("ID parameter is required");
    }
    const numericId = parseNumericId(id);
    if (numericId === null) return badRequest("Invalid id");

    const result = await db
      .delete(kirinukiChannels)
      .where(eq(kirinukiChannels.id, numericId));

    if (result.success) {
      return new Response("Deleted", { status: 200 });
    }
    return new Response("Failed to delete", { status: 500 });
  }

  // GET /api/kirinuki/videos - 등록된 채널들의 영상 조회
  if (request.method === "GET" && url.pathname === "/api/kirinuki/videos") {
    const maxResults = parseInt(url.searchParams.get("maxResults") || "20", 10);

    // 1. 등록된 채널 목록 조회
    const channels = await db.select().from(kirinukiChannels);
    if (channels.length === 0) {
      return Response.json({
        updatedAt: new Date().toISOString(),
        videos: [],
        shorts: [],
        byChannel: [],
      });
    }

    // 2. 환경 변수에서 YouTube API 키 가져오기
    const apiKey = env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return new Response("YouTube API key not configured", {
        status: 500,
      });
    }

    // 3. 각 채널별로 영상 조회 (병렬 처리)
    const channelResults = await Promise.all(
      channels.map(async (channel) => {
        const content = await fetchYouTubeVideosForChannel(
          channel.youtube_channel_id,
          apiKey,
          maxResults,
        );
        return {
          channelId: channel.youtube_channel_id,
          channelName: channel.channel_name,
          channelUrl: channel.channel_url,
          content,
        };
      }),
    );

    // 4. 전체 영상/쇼츠 집계 (최신순 정렬)
    const allVideos: YouTubeVideoItem[] = [];
    const allShorts: YouTubeVideoItem[] = [];

    for (const result of channelResults) {
      if (result.content) {
        allVideos.push(...result.content.videos);
        allShorts.push(...result.content.shorts);
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

    return Response.json({
      updatedAt: new Date().toISOString(),
      videos: allVideos.slice(0, maxResults),
      shorts: allShorts.slice(0, maxResults),
      byChannel: channelResults.map((r) => ({
        channelId: r.channelId,
        channelName: r.channelName,
        content: r.content,
      })),
    });
  }

  return new Response(null, { status: 404 });
};
