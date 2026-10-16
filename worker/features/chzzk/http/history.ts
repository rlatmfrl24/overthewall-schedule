import type { AdminChzzkHistoryReader } from "../application/history-reader";
import { requireAdminUser } from "../../../platform/auth";
import { badRequest, json, methodNotAllowed } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import { CHZZK_CHANNEL_ID_PATTERN } from "../domain/channel-targets";

export const createChzzkHistoryHandler = (reader: (env: Env) => AdminChzzkHistoryReader) => async (request: Request, env: Env) => {
  if (request.method !== "GET") return methodNotAllowed();
  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  const params = new URL(request.url).searchParams;
  const channelId = params.get("channelId");
  const cursor = params.get("cursor");
  if (cursor && (!channelId || cursor.length > 512 || !/^(vods|clips):[^:]+:[a-f0-9]{32}:[0-9:]+$/.test(cursor) || cursor.split(":")[2] !== channelId)) return badRequest("Invalid cursor");
  if (channelId !== null && !CHZZK_CHANNEL_ID_PATTERN.test(channelId)) return badRequest("Invalid channelId");
  try {
    return json(await reader(env).read(channelId, cursor), 200, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  } catch (error) {
    console.error("Failed to read stored CHZZK history", error);
    return json({ error: "chzzk_history_unavailable" }, 503, { headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
  }
};
