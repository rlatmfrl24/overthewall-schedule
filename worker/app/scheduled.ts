import {
  normalizeAutoUpdateIntervalHours,
  normalizeAutoUpdateRangeDays,
  parseAutoUpdateIntervalHours,
  parseAutoUpdateRangeDays,
} from "@contracts/configuration";
import { settings } from "@db/schema";
import { inArray } from "drizzle-orm";
import { runScheduledNaverCafeCollection } from "../features/naver-cafe";
import {
  CloudflarePlayTelemetryWriter,
  D1SourceHealthRepository,
  SourceHealthService,
  YouTubeOtwPlayMetadataReader,
} from "../features/otw-play";
import { runScheduledDataRetentionPrune } from "../features/operations";
import { runAutoUpdateWithHistory } from "../features/schedules";
import { runScheduledXCollection } from "../features/x-posts";
import { runScheduledYouTubeFeedCollection } from "../features/youtube";
import { getDb } from "../platform/db";
import { updateSetting } from "../platform/http-helpers";
import type { Env } from "../platform/types";
import { createOtwPlayIngestionService } from "./ingestion";
import { createOtwPlayChannelMonitorService } from "./channel-monitors";
import { createOtwPlayWebsubService } from "./websub";

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

export const checkScheduledOtwPlaySources = async (env: Env) => {
  const result = await new SourceHealthService(
    new D1SourceHealthRepository(env.otw_db),
    new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY, fetch, {
      db: env.otw_db,
      priority: "low",
      origin: "otw_play_source_health",
    }),
    () => crypto.randomUUID(),
    Date.now,
    new CloudflarePlayTelemetryWriter(env.OTW_PLAY_ANALYTICS),
  ).runScheduled();
  console.log("[scheduled] OTW Play source health completed", result);
  return result;
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

const requeueScheduledOtwPlayIngestion = async (env: Env) => {
  const service = createOtwPlayIngestionService(env);
  const clearedApiData = await service.clearExpiredApiData();
  if (clearedApiData > 0) {
    console.log("[scheduled] OTW Play ingestion API data cleared", {
      clearedApiData,
    });
  }
  if (!env.OTW_PLAY_INGESTION_QUEUE) return;
  const enqueued = await service.requeuePending();
  if (enqueued > 0) {
    console.log("[scheduled] OTW Play ingestion messages requeued", {
      enqueued,
    });
  }
};

export const reconcileScheduledOtwPlayChannels = async (env: Env) => {
  const results = await createOtwPlayChannelMonitorService(env).runDue();
  if (results.length > 0) {
    console.log("[scheduled] OTW Play channel reconciliation completed", results);
  }
  return results;
};

export const reconcileRecentScheduledOtwPlayChannels = async (env: Env) => {
  const results = await createOtwPlayChannelMonitorService(env).runRecentDue();
  if (results.length > 0) {
    console.log("[scheduled] OTW Play daily recent reconciliation completed", results);
  }
  return results;
};

export const maintainScheduledOtwPlayWebsub = async (env: Env) => {
  const service = createOtwPlayWebsubService(env);
  const recoveredDeliveries = await service.recoverPending();
  const cleanupRequests = await service.cleanupInvalidSubscriptions();
  const recoveredIntents = await service.recoverStaleIntents();
  const renewals = await service.renewDue();
  if (
    recoveredDeliveries > 0 || cleanupRequests.length > 0 ||
    recoveredIntents.length > 0 || renewals.length > 0
  ) {
    console.log("[scheduled] OTW Play WebSub maintenance completed", {
      recoveredDeliveries,
      cleanupRequests,
      recoveredIntents,
      renewals,
    });
  }
  return { recoveredDeliveries, cleanupRequests, recoveredIntents, renewals };
};

export const runIndependentScheduledTasks = async (env: Env) => {
  const independentTasks = [
    {
      label: "X collection",
      run: () => collectScheduledXPosts(env),
    },
    {
      label: "Naver Cafe collection",
      run: () => collectScheduledNaverCafePosts(env),
    },
    {
      label: "YouTube feed collection",
      run: () => runScheduledYouTubeFeedCollection(env),
    },
    {
      label: "OTW Play ingestion recovery",
      run: () => requeueScheduledOtwPlayIngestion(env),
    },
    {
      label: "OTW Play channel reconciliation",
      run: () => reconcileScheduledOtwPlayChannels(env),
    },
    {
      label: "OTW Play daily recent reconciliation",
      run: () => reconcileRecentScheduledOtwPlayChannels(env),
    },
    {
      label: "OTW Play WebSub maintenance",
      run: () => maintainScheduledOtwPlayWebsub(env),
    },
    {
      label: "D1 data retention prune",
      run: () => pruneScheduledD1Data(env),
    },
  ];

  const runTask = async (task: {
    label: string;
    run: () => Promise<unknown>;
  }) => {
    try {
      await task.run();
    } catch (error) {
      console.error(`[scheduled] ${task.label} failed`, error);
    }
  };

  const runYouTubePriorityTasks = () =>
    runTask({
      label: "OTW Play source health",
      run: () => checkScheduledOtwPlaySources(env),
    });

  // These flows do not depend on one another. Start them together so a slow
  // external source or maintenance path cannot starve collection. YouTube
  // source health remains an OTW Play critical operation; public media cache
  // refresh is demand-driven and intentionally absent from this scheduler.
  await Promise.all([
    ...independentTasks.map(runTask),
    runYouTubePriorityTasks(),
  ]);
};

export const runScheduledAutoUpdate = async (env: Env) => {
  const db = getDb(env);
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

export const handleScheduled = async (
  _controller: ScheduledController,
  env: Env,
) => {
  const [autoUpdateOutcome, independentOutcome] = await Promise.allSettled([
    runScheduledAutoUpdate(env),
    runIndependentScheduledTasks(env),
  ]);

  // Independent jobs record their own failures and continue. Preserve the
  // auto-update rejection so Cloudflare still marks a failed cron invocation.
  if (autoUpdateOutcome.status === "rejected") {
    throw autoUpdateOutcome.reason;
  }
  if (independentOutcome.status === "rejected") {
    throw independentOutcome.reason;
  }
};
