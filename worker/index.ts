import { inArray } from "drizzle-orm";
import { getDb } from "./db";
import { settings } from "../src/db/schema";
import { autoUpdateSchedules } from "./services/schedule";
import { handleLiveStatus } from "./routes/live";
import { handleVods } from "./routes/vods";
import { handleMembers } from "./routes/members";
import { handleSchedules } from "./routes/schedules";
import { handleNotices } from "./routes/notices";
import { handleDDays } from "./routes/ddays";
import { handleKirinuki } from "./routes/kirinuki";
import { handleSettings } from "./routes/settings";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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

    if (url.pathname.startsWith("/api/settings")) {
      return handleSettings(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        name: "Cloudflare",
      });
    }

    return new Response(null, { status: 404 });
  },

  // Cron Trigger로 실행되는 스케줄 자동 업데이트
  async scheduled(_controller: ScheduledController, env: Env) {
    const db = getDb(env);

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
    const intervalHours = parseInt(intervalHoursStr || "2", 10);
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
