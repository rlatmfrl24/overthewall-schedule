import {
  fetchChzzkLiveStatus,
  fetchChzzkLiveStatusWithDebug,
} from "../services/chzzk";
import { getDb } from "../db";
import {
  autoFillUndecidedLiveSchedules,
  isLiveScheduleAutoFillEnabled,
} from "../services/live-schedule";
import { authenticateOptionalRequest, isAdminUser } from "../auth";
import { badRequest, methodNotAllowed, pMap } from "../utils/helpers";
import type { Env } from "../types";

const LIVE_STATUS_CONCURRENCY = 6;

const canAutoFillSchedules = async (request: Request, env: Env) => {
  const user = await authenticateOptionalRequest(request, env);
  return user ? isAdminUser(env, user.id) : false;
};

export const handleLiveStatus = async (request: Request, env: Env) => {
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

  const items = await pMap(
    channelIds,
    async (channelId) => {
      if (debug) {
        const result = await fetchChzzkLiveStatusWithDebug(channelId);
        return { channelId, content: result.content, debug: result.debug };
      }
      return {
        channelId,
        content: await fetchChzzkLiveStatus(channelId),
      };
    },
    LIVE_STATUS_CONCURRENCY,
  );

  let scheduleAutoFill = { updated: 0 };
  try {
    if (await canAutoFillSchedules(request, env)) {
      const db = getDb(env);
      if (await isLiveScheduleAutoFillEnabled(db)) {
        const result = await autoFillUndecidedLiveSchedules(db, items);
        scheduleAutoFill = { updated: result.updated };
        if (result.updated > 0) {
          console.log("[live-status] Auto-filled live schedules", result);
        }
      }
    }
  } catch (error) {
    console.error("[live-status] Failed to auto-fill live schedules", error);
  }

  return Response.json(
    {
      updatedAt: new Date().toISOString(),
      items,
      scheduleAutoFill,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Vary: "Authorization",
      },
    },
  );
};
