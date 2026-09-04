import {
  collectNaverCafePostsForSources,
  NAVER_CAFE_COLLECTION_SIZE,
  readEnabledNaverCafeSources,
} from "../../naver-cafe";
import {
  CloudflarePlayTelemetryWriter,
  D1SourceHealthRepository,
  SourceHealthService,
  YouTubeOtwPlayMetadataReader,
} from "../../otw-play";
import {
  runDataRetentionPolicyPrune,
  summarizeDataRetentionRun,
} from "../../operations";
import {
  autoUpdateSchedules,
  recordAutoUpdateResultWithHistory,
  scanAndPersistRecentChzzkObservations,
  type AutoUpdateResult,
} from "../../schedules";
import { runXCollectionForHandles } from "../../x-posts";
import { runScheduledYouTubeFeedCollection } from "../../youtube";
import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";
import { createOtwPlayChannelMonitorService } from "../../../app/channel-monitors";
import { createOtwPlayIngestionService } from "../../../app/ingestion";
import { createOtwPlayWebsubService } from "../../../app/websub";
import type {
  D1ScheduledJobRepository,
  ScheduledJobItemRecord,
} from "../../../platform/scheduled-jobs";
import { ScheduledJobCoordinator } from "./scheduled-job-coordinator";

export type ScheduledJobExecutionOutcome = {
  status: "succeeded" | "partial" | "failed" | "skipped" | "throttled";
  result: unknown;
  attempted?: number;
  succeeded?: number;
  failed?: number;
  retryScheduled?: number;
  retryAt?: number | null;
  errorCode?: string | null;
  error?: string | null;
};

const succeeded = (result: unknown): ScheduledJobExecutionOutcome => ({
  status: "succeeded",
  result,
});

const batchOutcome = (result: unknown): ScheduledJobExecutionOutcome => {
  const items = Array.isArray(result)
    ? result
    : result && typeof result === "object" && Array.isArray((result as { results?: unknown }).results)
      ? (result as { results: unknown[] }).results
      : [];
  if (items.length === 0) return { ...succeeded(result), attempted: 0, succeeded: 0, failed: 0 };
  const failures = items.filter((item) =>
    item && typeof item === "object" && (item as { ok?: boolean }).ok === false
  );
  const partials = items.filter((item) =>
    item && typeof item === "object" && (item as { partial?: boolean }).partial === true
  );
  const throttled = failures.every((item) => {
    const code = String((item as { errorCode?: unknown; error?: unknown }).errorCode ??
      (item as { error?: unknown }).error ?? "");
    return code.includes("quota") || code.includes("budget");
  });
  const status = failures.length === 0
    ? partials.length > 0 ? "partial" : "succeeded"
    : throttled
      ? "throttled"
      : failures.length === items.length ? "failed" : "partial";
  const firstFailure = failures[0] as { errorCode?: string; error?: string; retryAt?: number } | undefined;
  return {
    status,
    result,
    attempted: items.length,
    succeeded: items.length - failures.length,
    failed: failures.length,
    retryScheduled: failures.filter((item) =>
      Boolean((item as { retryAt?: unknown }).retryAt)
    ).length,
    retryAt: firstFailure?.retryAt ?? null,
    errorCode: firstFailure?.errorCode ?? firstFailure?.error ?? null,
    error: firstFailure?.error ?? firstFailure?.errorCode ?? null,
  };
};

export const toXCollectionOutcome = (
  result: Awaited<ReturnType<typeof runXCollectionForHandles>>,
): ScheduledJobExecutionOutcome => {
  if ("referenceHydration" in result && result.referenceHydration?.failed) {
    return { status: result.refreshedHandles > 0 ? "partial" : "failed", result,
      errorCode: result.referenceHydration.errorCode, error: "X 원문 보강 재시도 대기" };
  }
  if (result.status === "success") return succeeded(result);
  const error = result.error ?? `x_collection_${result.status}`;
  return {
    status: result.status === "skipped" ? "skipped" : "failed",
    result,
    errorCode: error,
    error,
  };
};

export const toYouTubeFeedCollectionOutcome = (
  result: Pick<
    Awaited<ReturnType<typeof runScheduledYouTubeFeedCollection>>,
    "status" | "attempted" | "succeeded" | "failed"
  > & Partial<Awaited<ReturnType<typeof runScheduledYouTubeFeedCollection>>>,
): ScheduledJobExecutionOutcome => {
  if (result.status === "skipped") {
    return {
      status: "skipped",
      result,
      attempted: result.attempted,
      succeeded: result.succeeded,
      failed: result.failed,
    };
  }
  const completed = result.succeeded + result.failed;
  const backfillIncomplete = result.quotaBlocked === true ||
    Number(result.backoffSources ?? 0) > 0 ||
    Number(result.backfillFailed ?? 0) > 0;
  const status = result.failed > 0
    ? result.succeeded > 0 ? "partial" : "failed"
    : backfillIncomplete
      ? "partial"
    : completed === result.attempted
      ? "succeeded"
      : "partial";
  const errorCode = result.failed > 0
    ? "youtube_feed_collection_failed"
    : backfillIncomplete
      ? result.quotaBlocked === true
        ? "youtube_feed_collection_quota_blocked"
        : "youtube_feed_collection_backfill_pending"
      : null;
  const error = result.failed > 0
    ? `YouTube feed collection failed for ${result.failed} of ${result.attempted} sources`
    : backfillIncomplete
      ? "YouTube Shorts backfill is waiting for quota or source retry"
      : null;
  return {
    status,
    result,
    attempted: result.attempted,
    succeeded: result.succeeded,
    failed: result.failed,
    errorCode,
    error,
  };
};

const parseContinuation = (item: ScheduledJobItemRecord) => {
  if (!item.continuation_json) return {} as Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(item.continuation_json);
    return typeof value === "object" && value !== null
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const getStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const getNumberArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is number => Number.isSafeInteger(item))
    : [];

const readAutoUpdateRangeDays = async (env: Env) => {
  const row = await env.otw_db.prepare(
    `SELECT value FROM settings WHERE key = 'auto_update_range_days'`,
  ).first<{ value: string | null }>();
  const parsed = Number.parseInt(row?.value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 7 ? parsed : 3;
};

const writeSetting = (env: Env, key: string, value: string) =>
  env.otw_db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
       updated_at = excluded.updated_at`,
  ).bind(key, value, String(Date.now())).run();

const isAutoUpdateResult = (value: unknown): value is AutoUpdateResult => {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  return [
    "updated",
    "checked",
    "segmentCount",
    "sessionCount",
    "resumeMergedCount",
    "rejectedSuppressed",
    "duplicatePending",
    "shortSuppressed",
    "holidaySuppressed",
    "ambiguous",
    "obsoletePending",
  ].every((key) => typeof result[key] === "number") &&
    Array.isArray(result.details);
};

const aggregateAutoUpdateResults = (results: unknown[]): AutoUpdateResult => {
  const aggregate: AutoUpdateResult = {
    updated: 0,
    checked: 0,
    segmentCount: 0,
    sessionCount: 0,
    resumeMergedCount: 0,
    rejectedSuppressed: 0,
    duplicatePending: 0,
    shortSuppressed: 0,
    holidaySuppressed: 0,
    ambiguous: 0,
    obsoletePending: 0,
    details: [],
  };
  for (const result of results.filter(isAutoUpdateResult)) {
    aggregate.updated += result.updated;
    aggregate.checked += result.checked;
    aggregate.segmentCount += result.segmentCount;
    aggregate.sessionCount += result.sessionCount;
    aggregate.resumeMergedCount += result.resumeMergedCount;
    aggregate.rejectedSuppressed += result.rejectedSuppressed;
    aggregate.duplicatePending += result.duplicatePending;
    aggregate.shortSuppressed += result.shortSuppressed;
    aggregate.holidaySuppressed += result.holidaySuppressed;
    aggregate.ambiguous += result.ambiguous;
    aggregate.obsoletePending += result.obsoletePending;
    aggregate.details.push(...result.details);
  }
  return aggregate;
};

export class ScheduledJobExecutor {
  private readonly env: Env;
  private readonly repository: D1ScheduledJobRepository;

  constructor(
    env: Env,
    repository: D1ScheduledJobRepository,
  ) {
    this.env = env;
    this.repository = repository;
  }

  async execute(
    item: ScheduledJobItemRecord,
  ): Promise<ScheduledJobExecutionOutcome> {
    const run = await this.repository.readRun(item.run_id);
    if (!run) throw new Error("scheduled_run_not_found");
    const continuation = parseContinuation(item);
    switch (run.job_type) {
      case "x_collection": {
        const handles = getStringArray(continuation.handles);
        if (handles.length === 0 || handles.length > 4) {
          throw new Error("invalid_x_collection_shard");
        }
        return toXCollectionOutcome(
          await runXCollectionForHandles(this.env, handles, run.source),
        );
      }
      case "naver_cafe_collection": {
        const sourceIds = new Set(getNumberArray(continuation.sourceIds));
        if (sourceIds.size === 0 || sourceIds.size > 4) {
          throw new Error("invalid_naver_collection_shard");
        }
        const sources = (await readEnabledNaverCafeSources(this.env)).filter(
          (source) => sourceIds.has(source.id),
        );
        const result = await collectNaverCafePostsForSources(sources, {
          cacheDb: this.env.otw_db,
          size: Number(continuation.size) || NAVER_CAFE_COLLECTION_SIZE,
          trigger: run.source,
        });
        const failed = result.sources.filter((source) =>
          !["ok", "stale", "disabled"].includes(source.status)
        ).length;
        return {
          status: failed === 0 ? "succeeded" : failed === result.sources.length ? "failed" : "partial",
          result,
          attempted: result.sources.length,
          succeeded: result.sources.length - failed,
          failed,
          errorCode: failed > 0 ? result.sources.find((source) => source.error)?.error ?? "naver_collection_failed" : null,
        };
      }
      case "youtube_feed_collection": {
        const result = await runScheduledYouTubeFeedCollection(this.env);
        return toYouTubeFeedCollectionOutcome(result);
      }
      case "schedule_auto_update": {
        const rangeDays = await readAutoUpdateRangeDays(this.env);
        if (item.phase === "scan") {
          const channelIds = getStringArray(continuation.channelIds);
          if (channelIds.length === 0 || channelIds.length > 2) {
            throw new Error("invalid_auto_update_scan_shard");
          }
          return succeeded(await scanAndPersistRecentChzzkObservations(
            getDb(this.env),
            rangeDays,
            channelIds,
            this.env.otw_db,
          ));
        }
        if (item.phase === "match") {
          const memberUid = Number(continuation.memberUid);
          const date = typeof continuation.date === "string"
            ? continuation.date
            : "";
          if (!Number.isSafeInteger(memberUid) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new Error("invalid_auto_update_match_target");
          }
          return succeeded(await autoUpdateSchedules(getDb(this.env), rangeDays, {
            skipScan: true,
            matchTarget: { memberUid, date },
          }));
        }
        if (item.phase === "finalize") {
          const results = await this.repository.readSuccessfulPhaseResults(
            item.run_id,
            "match",
          );
          return succeeded(await recordAutoUpdateResultWithHistory(
            getDb(this.env),
            { source: run.source, rangeDays },
            aggregateAutoUpdateResults(results),
            run.started_at ?? run.accepted_at,
          ));
        }
        throw new Error("invalid_auto_update_phase");
      }
      case "source_health":
        return batchOutcome(await new SourceHealthService(
          new D1SourceHealthRepository(this.env.otw_db),
          new YouTubeOtwPlayMetadataReader(this.env.YOUTUBE_API_KEY, fetch, {
            db: this.env.otw_db,
            priority: "low",
            origin: "otw_play_source_health",
          }),
          () => crypto.randomUUID(),
          Date.now,
          new CloudflarePlayTelemetryWriter(this.env.OTW_PLAY_ANALYTICS),
        ).runScheduled(2));
      case "channel_reconcile":
        return batchOutcome(
          await createOtwPlayChannelMonitorService(this.env).runDue(1),
        );
      case "recent_reconcile":
        return batchOutcome(
          await createOtwPlayChannelMonitorService(this.env).runRecentDue(1),
        );
      case "websub_maintenance": {
        const service = createOtwPlayWebsubService(this.env);
        switch (item.phase) {
          case "recover-delivery":
            return succeeded({ recovered: await service.recoverPending(1) });
          case "cleanup":
            return succeeded(await service.cleanupInvalidSubscriptions(
              "system:websub-cleanup",
              1,
            ));
          case "recover-intent":
            return succeeded(await service.recoverStaleIntents(
              "system:websub-intent-recovery",
              1,
            ));
          case "renew":
            return succeeded(
              await service.renewDue("system:websub-renewal", 1),
            );
          default:
            throw new Error("invalid_websub_phase");
        }
      }
      case "ingestion_recovery": {
        if (item.phase === "recover-scheduled") {
          const recovered = await this.repository.recoverStaleItems(10);
          const dispatched = await new ScheduledJobCoordinator(this.env)
            .dispatchPending();
          return succeeded({ recovered, ...dispatched });
        }
        const service = createOtwPlayIngestionService(this.env);
        if (item.phase === "cleanup") {
          return succeeded({ cleared: await service.clearExpiredApiData(20) });
        }
        if (item.phase === "requeue") {
          return succeeded({ enqueued: await service.requeuePending(20) });
        }
        throw new Error("invalid_ingestion_recovery_phase");
      }
      case "retention_prune": {
        const policyId = typeof continuation.policyId === "string"
          ? continuation.policyId
          : item.target_key;
        const result = await runDataRetentionPolicyPrune(
          this.env,
          policyId,
          250,
        );
        if (result.hasMore) {
          await this.repository.addItems(item.run_id, [{
            targetKey: `${policyId}:after:${item.id}`,
            phase: "prune",
            lane: "maintenance",
            continuation: { policyId },
          }]);
          await new ScheduledJobCoordinator(this.env).dispatchRun(item.run_id);
        }
        return succeeded(result);
      }
    }
    throw new Error("unsupported_scheduled_job_type");
  }

  async finalizeLegacyState(runId: string) {
    const run = await this.repository.readRunDto(runId);
    if (!run || !["succeeded", "partial", "failed", "skipped", "throttled"].includes(run.status)) {
      return;
    }
    const completedAt = String(run.finishedAt ?? Date.now());
    if (run.jobType === "x_collection") {
      await writeSetting(this.env, "x_collection_last_run", completedAt);
      if (run.status === "succeeded") {
        await writeSetting(this.env, "x_collection_last_success", completedAt);
      }
    } else if (run.jobType === "naver_cafe_collection") {
      await writeSetting(
        this.env,
        "naver_cafe_collection_last_run",
        completedAt,
      );
      if (run.status === "succeeded") {
        await writeSetting(
          this.env,
          "naver_cafe_collection_last_success",
          completedAt,
        );
      }
    } else if (run.jobType === "retention_prune" && run.status === "succeeded") {
      await this.repository.updateRunSummary(runId, {
        retentionPrune: await summarizeDataRetentionRun(this.env, runId),
      });
      await writeSetting(this.env, "data_retention_last_prune", completedAt);
    }
  }
}
