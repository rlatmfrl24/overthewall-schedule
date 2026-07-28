import {
  normalizeAutoUpdateIntervalHours,
  normalizeAutoUpdateRangeDays,
  parseAutoUpdateIntervalHours,
  parseAutoUpdateRangeDays,
} from "@contracts/configuration";
import { settings } from "@db/schema";
import { inArray } from "drizzle-orm";
import { runScheduledNaverCafeCollection } from "../features/naver-cafe";
import { runScheduledDataRetentionPrune } from "../features/operations";
import { runAutoUpdateWithHistory } from "../features/schedules";
import { runScheduledXCollection } from "../features/x-posts";
import { runScheduledYouTubeWarmup } from "../features/youtube";
import { getDb } from "../platform/db";
import { updateSetting } from "../platform/http-helpers";
import type { Env } from "../platform/types";

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

const warmScheduledYouTubeCache = async (env: Env) => {
  const result = await runScheduledYouTubeWarmup(env);
  if (result.status === "skipped") {
    console.log("[scheduled] YouTube warmup skipped", result.error);
    return;
  }
  console.log("[scheduled] YouTube warmup completed", result);
};

const collectScheduledNaverCafePosts = async (env: Env) => {
  const outcome = await runScheduledNaverCafeCollection(env);
  if (outcome.skipped) {
    console.log(
      `[scheduled] Naver Cafe collection skipped - last run was ${Math.round(
        outcome.elapsedMs / 60000,
      )}min ago, interval is ${outcome.intervalHours}h`,
    );
    return;
  }
  console.log("[scheduled] Naver Cafe collection completed", outcome.result);
};

const pruneScheduledD1Data = async (env: Env) => {
  const result = await runScheduledDataRetentionPrune(env);
  if (result.skipped) {
    console.log("[scheduled] D1 data retention prune skipped", {
      lastRun: result.lastRun,
      nextEligibleAt: result.nextEligibleAt,
    });
    return;
  }
  console.log("[scheduled] D1 data retention prune completed", {
    totalPrunableRows: result.totalPrunableRows,
    totalDeletedRows: result.totalDeletedRows,
  });
};

const runIndependentScheduledTasks = async (env: Env) => {
  const tasks = [
    {
      label: "X collection",
      run: () => collectScheduledXPosts(env),
    },
    {
      label: "YouTube warmup",
      run: () => warmScheduledYouTubeCache(env),
    },
    {
      label: "Naver Cafe collection",
      run: () => collectScheduledNaverCafePosts(env),
    },
    {
      label: "D1 data retention prune",
      run: () => pruneScheduledD1Data(env),
    },
  ];

  for (const task of tasks) {
    try {
      await task.run();
    } catch (error) {
      console.error(`[scheduled] ${task.label} failed`, error);
    }
  }
};

export const handleScheduled = async (
  _controller: ScheduledController,
  env: Env,
) => {
  const db = getDb(env);
  await runIndependentScheduledTasks(env);

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
  const settingsMap = new Map(allSettings.map((setting) => [
    setting.key,
    setting.value,
  ]));

  if (settingsMap.get("auto_update_enabled") !== "true") {
    console.log("[scheduled] Auto update is disabled");
    return;
  }

  const intervalHoursValue = settingsMap.get("auto_update_interval_hours");
  const normalizedIntervalHours =
    normalizeAutoUpdateIntervalHours(intervalHoursValue);
  if (intervalHoursValue !== normalizedIntervalHours) {
    await updateSetting(
      db,
      "auto_update_interval_hours",
      normalizedIntervalHours,
    );
  }
  const intervalHours = parseAutoUpdateIntervalHours(normalizedIntervalHours);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  const lastRunValue = settingsMap.get("auto_update_last_run");
  const lastRun = lastRunValue ? Number.parseInt(lastRunValue, 10) : 0;
  const now = Date.now();
  if (now - lastRun < intervalMs) {
    console.log(
      `[scheduled] Skipping - last run was ${Math.round(
        (now - lastRun) / 60000,
      )}min ago, interval is ${intervalHours}h`,
    );
    return;
  }

  const rangeDaysValue = settingsMap.get("auto_update_range_days");
  const normalizedRangeDays = normalizeAutoUpdateRangeDays(rangeDaysValue);
  if (rangeDaysValue !== normalizedRangeDays) {
    await updateSetting(db, "auto_update_range_days", normalizedRangeDays);
  }
  const rangeDays = parseAutoUpdateRangeDays(normalizedRangeDays);

  console.log("[scheduled] Running auto update...");
  const result = await runAutoUpdateWithHistory(db, {
    source: "scheduled",
    rangeDays,
    cacheDb: env.otw_db,
  });
  console.log("[scheduled] Auto update completed", result);
};
