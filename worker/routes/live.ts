import {
  fetchChzzkLiveStatus,
  fetchChzzkLiveStatusWithDebug,
} from "../services/chzzk";
import { badRequest, methodNotAllowed } from "../utils/helpers";
import type { Env } from "../types";

export const handleLiveStatus = async (request: Request, _env: Env) => {
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const channelIdsParam = url.searchParams.get("channelIds");
  const debug = url.searchParams.get("debug") === "1";
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

  const items = await Promise.all(
    channelIds.map(async (channelId) => {
      if (debug) {
        const result = await fetchChzzkLiveStatusWithDebug(channelId);
        return { channelId, content: result.content, debug: result.debug };
      }
      return {
        channelId,
        content: await fetchChzzkLiveStatus(channelId),
      };
    }),
  );

  return Response.json(
    {
      updatedAt: new Date().toISOString(),
      items,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
