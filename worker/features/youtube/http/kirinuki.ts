import { requireAdminUser } from "../../../platform/auth";
import { badRequest, parseNumericId } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  KIRINUKI_MAX_RESULTS,
  parseKirinukiMaxResults,
  YOUTUBE_CHANNEL_ID_PATTERN,
} from "../domain/channel-targets";
import {
  isJsonObject,
  parseJsonRequest,
} from "../../../platform/http/json";
import type { YouTubeApplication } from "../application/youtube-service";

const KIRINUKI_VIDEOS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export type BuildKirinukiApplication = (env: Env) => YouTubeApplication;

export const createKirinukiHandler =
  (buildApplication: BuildKirinukiApplication) =>
  async (request: Request, env: Env, ctx?: ExecutionContext) => {
  const url = new URL(request.url);
  if (url.pathname === "/api/kirinuki/channels") {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
  }

  const application = buildApplication(env);

  // GET /api/kirinuki/channels - 전체 채널 목록 조회
  if (request.method === "GET" && url.pathname === "/api/kirinuki/channels") {
    const data = await application.listKirinukiChannels();
    return Response.json(data);
  }

  // POST /api/kirinuki/channels - 채널 추가
  if (request.method === "POST" && url.pathname === "/api/kirinuki/channels") {
    const parsedBody = await parseJsonRequest<{
      channel_name?: string;
      channel_url?: string;
      youtube_channel_id?: string;
    }>(request);
    if (!parsedBody.ok) return parsedBody.response;
    if (!isJsonObject(parsedBody.value)) return badRequest("Invalid JSON body");
    const body = parsedBody.value;
    if (
      !body.channel_name?.trim() ||
      !body.channel_url?.trim() ||
      !body.youtube_channel_id?.trim()
    ) {
      return badRequest(
        "channel_name, channel_url, and youtube_channel_id are required",
      );
    }
    if (!YOUTUBE_CHANNEL_ID_PATTERN.test(body.youtube_channel_id.trim())) {
      return badRequest("Invalid youtube_channel_id");
    }

    const success = await application.createKirinukiChannel({
      channel_name: body.channel_name.trim(),
      channel_url: body.channel_url.trim(),
      youtube_channel_id: body.youtube_channel_id.trim(),
    });

    if (success) {
      return new Response("Created", { status: 201 });
    }
    return new Response("Failed to create", { status: 500 });
  }

  // PUT /api/kirinuki/channels - 채널 수정
  if (request.method === "PUT" && url.pathname === "/api/kirinuki/channels") {
    const parsedBody = await parseJsonRequest<{
      id?: number | string;
      channel_name?: string;
      channel_url?: string;
      youtube_channel_id?: string;
    }>(request);
    if (!parsedBody.ok) return parsedBody.response;
    if (!isJsonObject(parsedBody.value)) return badRequest("Invalid JSON body");
    const body = parsedBody.value;
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
    if (!YOUTUBE_CHANNEL_ID_PATTERN.test(body.youtube_channel_id.trim())) {
      return badRequest("Invalid youtube_channel_id");
    }

    const success = await application.updateKirinukiChannel({
      id: numericId,
      channel_name: body.channel_name.trim(),
      channel_url: body.channel_url.trim(),
      youtube_channel_id: body.youtube_channel_id.trim(),
    });

    if (success) {
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

    const success = await application.deleteKirinukiChannel(numericId);

    if (success) {
      return new Response("Deleted", { status: 200 });
    }
    return new Response("Failed to delete", { status: 500 });
  }

  // GET /api/kirinuki/videos - 등록된 채널들의 영상 조회
  if (request.method === "GET" && url.pathname === "/api/kirinuki/videos") {
    const maxResults = parseKirinukiMaxResults(
      url.searchParams.get("maxResults"),
    );
    if (maxResults === null) {
      return badRequest(
        `maxResults must be an integer between 1 and ${KIRINUKI_MAX_RESULTS}`,
      );
    }

    const content = await application.readKirinukiVideos(maxResults, ctx);
    if (content.byChannel.length === 0) {
      return Response.json(
        {
          updatedAt: new Date().toISOString(),
          videos: [],
          shorts: [],
          byChannel: [],
          cache: content.cache,
        },
        { headers: { "Cache-Control": KIRINUKI_VIDEOS_CACHE_CONTROL } },
      );
    }

    const status = content.byChannel.some((channel) => channel.content)
      ? 200
      : 503;
    return Response.json(
      {
        updatedAt: new Date().toISOString(),
        ...content,
      },
      {
        status,
        headers: {
          "Cache-Control":
            content.cache.state === "fresh"
              ? KIRINUKI_VIDEOS_CACHE_CONTROL
              : "no-store",
          ...(status === 503 ? { "Retry-After": "15" } : {}),
        },
      },
    );
  }

  return new Response(null, { status: 404 });
  };
