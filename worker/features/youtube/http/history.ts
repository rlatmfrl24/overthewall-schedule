import type { AdminYouTubeHistoryReader } from "../application/history-reader";
import { requireAdminUser } from "../../../platform/auth";
import { badRequest, json, methodNotAllowed } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import { YOUTUBE_CHANNEL_ID_PATTERN, parseYouTubeMaxResults } from "../domain/channel-targets";
import { decodeYouTubeShortsCursor, YouTubeShortsCursorError } from "../domain/shorts-cursor";

export const createYouTubeHistoryHandler = (reader: (env: Env) => AdminYouTubeHistoryReader) => async (request: Request, env: Env) => {
  if (request.method !== "GET") return methodNotAllowed();
  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  const params = new URL(request.url).searchParams;
  const channelId = params.get("channelId");
  const limit = parseYouTubeMaxResults(params.get("limit"));
  if (channelId !== null && !YOUTUBE_CHANNEL_ID_PATTERN.test(channelId)) return badRequest("Invalid channelId");
  if (limit === null) return badRequest("limit must be an integer between 1 and 20");
  const cursor = params.get("cursor");
  try {
    decodeYouTubeShortsCursor(cursor, channelId ? [channelId] : []);
    return json(await reader(env).read({ channelId, cursor, limit }), 200, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error) {
    if (error instanceof YouTubeShortsCursorError) return badRequest("Invalid cursor");
    console.error("Failed to read stored YouTube history", error);
    return json({ error: "youtube_history_unavailable" }, 503, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  }
};
