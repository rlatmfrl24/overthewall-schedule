import { inArray } from "drizzle-orm";
import { getDb } from "./db";
import { settings } from "../src/db/schema";
import {
  normalizeAutoUpdateIntervalHours,
  parseAutoUpdateIntervalHours,
} from "../src/lib/auto-update-interval";
import { autoUpdateSchedules } from "./services/schedule";
import { handleLiveStatus } from "./routes/live";
import { handleVods } from "./routes/vods";
import { handleMembers } from "./routes/members";
import { handleSchedules } from "./routes/schedules";
import { handleNotices } from "./routes/notices";
import { handleDDays } from "./routes/ddays";
import { handleKirinuki } from "./routes/kirinuki";
import { handleSettings } from "./routes/settings";
import { handleXPosts } from "./routes/x";
import { handleNaverCafe } from "./routes/naver-cafe";
import { updateSetting } from "./utils/helpers";
import { runScheduledXCollection } from "./services/x-collection";
import type { Env } from "./types";

const collectScheduledXPosts = async (env: Env) => {
  const outcome = await runScheduledXCollection(env);
  if (outcome.skipped) {
    console.log(
      `[scheduled] X collection skipped - last run was ${Math.round(
        outcome.elapsedMs / 60000,
      )}min ago, interval is ${outcome.intervalHours}h`,
    );
    return;
  }
  console.log("[scheduled] X collection completed", outcome.result);
};

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
};

const serializeError = (
  error: unknown,
  includeStack: boolean,
  depth = 0,
): SerializedError => {
  if (error instanceof Error) {
    const cause =
      depth < 3 && "cause" in error && error.cause !== undefined
        ? serializeError(error.cause, includeStack, depth + 1)
        : undefined;

    return {
      name: error.name,
      message: error.message,
      ...(includeStack && error.stack ? { stack: error.stack } : {}),
      ...(cause ? { cause } : {}),
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
};

const isLocalApiRequest = (request: Request) => {
  const { hostname } = new URL(request.url);
  return hostname === "localhost" || hostname === "127.0.0.1";
};

const handleApiRouteError = (request: Request, error: unknown) => {
  const url = new URL(request.url);
  const includeDetails = isLocalApiRequest(request);
  const details = serializeError(error, includeDetails);

  console.error("[api] request failed", {
    method: request.method,
    path: url.pathname,
    search: url.search,
    error: details,
  });

  return Response.json(
    includeDetails
      ? {
          error: "Internal Server Error",
          details,
        }
      : {
          error: "Internal Server Error",
        },
    { status: 500 },
  );
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/live-status")) {
        return handleLiveStatus(request, env);
      }

      if (
        url.pathname.startsWith("/api/vods/chzzk") ||
        url.pathname.startsWith("/api/clips/chzzk") ||
        url.pathname.startsWith("/api/youtube/videos")
      ) {
        return handleVods(request, env);
      }

      if (url.pathname.startsWith("/api/members")) {
        return handleMembers(request, env);
      }

      if (url.pathname.startsWith("/api/schedules")) {
        return handleSchedules(request, env);
      }

      if (url.pathname.startsWith("/api/notices")) {
        return handleNotices(request, env);
      }

      if (url.pathname.startsWith("/api/ddays")) {
        return handleDDays(request, env);
      }

      if (url.pathname.startsWith("/api/kirinuki")) {
        return handleKirinuki(request, env);
      }

      if (url.pathname.startsWith("/api/x/")) {
        return handleXPosts(request, env);
      }

      if (url.pathname.startsWith("/api/naver-cafe")) {
        return handleNaverCafe(request, env);
      }

      if (url.pathname.startsWith("/api/settings")) {
        return handleSettings(request, env);
      }

      if (url.pathname.startsWith("/api/")) {
        return Response.json({
          name: "Cloudflare",
        });
      }
    } catch (error) {
      if (url.pathname.startsWith("/api/")) {
        return handleApiRouteError(request, error);
      }
      throw error;
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(null, { status: 404 });
  },

  // Cron Trigger로 실행되는 스케줄 자동 업데이트
  async scheduled(_controller: ScheduledController, env: Env) {
    const db = getDb(env);

    try {
      await collectScheduledXPosts(env);
    } catch (error) {
      console.error("[scheduled] X collection failed", error);
    }

    // 1-3. 설정 일괄 조회
    const allSettings = await db
      .select()
      .from(settings)
      .where(
        inArray(settings.key, [
          "auto_update_enabled",
          "auto_update_interval_hours",
          "auto_update_last_run",
          "auto_update_range_days",
        ]),
      );

    const settingsMap = new Map(allSettings.map((s) => [s.key, s.value]));

    const enabled = settingsMap.get("auto_update_enabled");
    if (enabled !== "true") {
      console.log("[scheduled] Auto update is disabled");
      return;
    }

    const intervalHoursStr = settingsMap.get("auto_update_interval_hours");
    const normalizedIntervalHours =
      normalizeAutoUpdateIntervalHours(intervalHoursStr);
    if (intervalHoursStr !== normalizedIntervalHours) {
      await updateSetting(
        db,
        "auto_update_interval_hours",
        normalizedIntervalHours,
      );
    }
    const intervalHours = parseAutoUpdateIntervalHours(normalizedIntervalHours);
    const intervalMs = intervalHours * 60 * 60 * 1000;

    const lastRunStr = settingsMap.get("auto_update_last_run");
    const lastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;
    const now = Date.now();

    if (now - lastRun < intervalMs) {
      console.log(
        `[scheduled] Skipping - last run was ${Math.round(
          (now - lastRun) / 60000,
        )}min ago, interval is ${intervalHours}h`,
      );
      return;
    }

    const rangeDaysStr = settingsMap.get("auto_update_range_days");
    const rangeDays = parseInt(rangeDaysStr || "3", 10);

    console.log("[scheduled] Running auto update...");

    const result = await autoUpdateSchedules(db, rangeDays);

    // 마지막 실행 시간 업데이트
    await db
      .insert(settings)
      .values({
        key: "auto_update_last_run",
        value: Date.now().toString(),
        updated_at: Date.now().toString(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: Date.now().toString(),
          updated_at: Date.now().toString(),
        },
      });

    console.log("[scheduled] Auto update completed", result);
  },
} satisfies ExportedHandler<Env>;
