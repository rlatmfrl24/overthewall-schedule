import type {
  ScheduledJobQueueMessage,
  ScheduledJobType,
} from "@contracts/scheduled-operations";
import type { Env } from "../../../platform/types";
import { getDb } from "../../../platform/db";
import { readAutoUpdateMatchTargets } from "../../schedules";
import {
  getLaneForJob,
  getEstimatedD1RowsPerItem,
  getScheduledBucket,
  shouldThrottleAtUsage,
  type ScheduledLane,
} from "../../../platform/scheduled-jobs";
import {
  D1ScheduledJobRepository,
  type ScheduledJobItemRecord,
} from "../../../platform/scheduled-jobs";
import { ScheduledJobPlanner } from "./scheduled-job-planner";

const SCHEDULED_DISPATCH_BATCH_SIZE = 8;

export const getScheduledLaneQueue = (
  env: Env,
  lane: ScheduledLane,
): Queue<unknown> | null => {
  switch (lane) {
    case "control":
      return env.OTW_OPS_CONTROL_QUEUE ?? null;
    case "x":
    case "naver":
    case "auto-update":
    case "maintenance":
      return env.OTW_OPS_BACKGROUND_QUEUE ?? null;
    case "websub":
    case "ingestion":
    case "youtube-critical":
      return env.OTW_OPS_CRITICAL_QUEUE ?? null;
  }
};

export class ScheduledJobCoordinator {
  readonly repository: D1ScheduledJobRepository;
  private readonly planner: ScheduledJobPlanner;
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
    this.repository = new D1ScheduledJobRepository(env.otw_db);
    this.planner = new ScheduledJobPlanner(env, this.repository);
  }

  async runScheduled(jobType: ScheduledJobType, scheduledFor = Date.now()) {
    const scheduledBucket = getScheduledBucket(jobType, scheduledFor);
    const run = await this.repository.createRun({
      jobType,
      source: "scheduled",
      idempotencyKey: `scheduled:${jobType}:${scheduledBucket}`,
      scheduledBucket,
      scheduledFor,
    });
    if (run.status !== "queued") return run;
    const rollout = await this.env.otw_db.prepare(
      `SELECT value FROM settings WHERE key = ?`,
    ).bind(`scheduled_v2_${jobType}_enabled`).first<{ value: string | null }>();
    if (rollout?.value !== "true") {
      await this.repository.skipRun(run.id, "v2_rollout_disabled");
      return this.repository.readRun(run.id);
    }
    const usagePercent = await this.repository.getBackgroundUsagePercent();
    if (shouldThrottleAtUsage(jobType, usagePercent)) {
      await this.repository.markRunThrottled(
        run.id,
        `daily_queue_budget_${Math.floor(usagePercent)}pct`,
      );
      return this.repository.readRun(run.id);
    }
    const itemIds = await this.planner.plan(run);
    if (itemIds.length === 0) {
      await this.repository.skipRun(run.id);
      return this.repository.readRun(run.id);
    }
    await this.dispatchRun(run.id);
    return this.repository.readRun(run.id);
  }

  async planManualRun(runId: string) {
    const run = await this.repository.readRun(runId);
    if (!run || run.status !== "queued") return run;
    const usagePercent = await this.repository.getBackgroundUsagePercent();
    if (shouldThrottleAtUsage(run.job_type, usagePercent)) {
      await this.repository.markRunThrottled(
        run.id,
        `daily_queue_budget_${Math.floor(usagePercent)}pct`,
      );
      return this.repository.readRun(run.id);
    }
    const itemIds = await this.planner.plan(run);
    if (itemIds.length === 0) {
      await this.repository.skipRun(run.id);
      return this.repository.readRun(run.id);
    }
    await this.dispatchRun(run.id);
    return this.repository.readRun(run.id);
  }

  async dispatchRun(runId: string) {
    return this.dispatchPending(SCHEDULED_DISPATCH_BATCH_SIZE, runId);
  }

  async dispatchPending(
    limit = SCHEDULED_DISPATCH_BATCH_SIZE,
    runId?: string,
  ) {
    const outbox = await this.repository.claimPendingOutbox(runId, limit);
    let dispatched = 0;
    let failed = 0;
    for (const record of outbox) {
      const queue = getScheduledLaneQueue(this.env, record.lane);
      if (!queue) {
        await this.repository.markOutboxFailed(
          record.id,
          `queue_unavailable:${record.lane}`,
        );
        failed += 1;
        continue;
      }
      const reserved = await this.repository.reserveDispatchBudget(
        record.lane,
        getEstimatedD1RowsPerItem(record.job_type),
      );
      if (!reserved) {
        await this.repository.markRunThrottled(
          record.run_id,
          "daily_background_budget_exhausted",
        );
        break;
      }
      const message: ScheduledJobQueueMessage = {
        schemaVersion: 1,
        messageType: "scheduled_job_item",
        runId: record.run_id,
        itemId: record.item_id,
        phase: record.phase,
      };
      try {
        await queue.send(message, { contentType: "json" });
        await this.repository.markOutboxDispatched(record.id);
        dispatched += 1;
      } catch (error) {
        await this.repository.markOutboxFailed(
          record.id,
          error instanceof Error ? error.message : String(error),
        );
        failed += 1;
      }
    }
    return { claimed: outbox.length, dispatched, failed };
  }

  async advanceRun(item: ScheduledJobItemRecord) {
    const run = await this.repository.readRun(item.run_id);
    if (run?.job_type !== "schedule_auto_update") {
      return false;
    }
    if (item.phase === "scan") {
      const progress = await this.repository.readPhaseProgress(
        item.run_id,
        "scan",
      );
      if (progress.queued > 0 || progress.running > 0) return false;
      if (progress.failed > 0 || progress.throttled > 0) return false;
      const setting = await this.env.otw_db.prepare(
        `SELECT value FROM settings WHERE key = 'auto_update_range_days'`,
      ).first<{ value: string | null }>();
      const parsedRangeDays = Number.parseInt(setting?.value ?? "", 10);
      const rangeDays = Number.isInteger(parsedRangeDays) &&
          parsedRangeDays >= 1 && parsedRangeDays <= 7
        ? parsedRangeDays
        : 3;
      const targets = await readAutoUpdateMatchTargets(
        getDb(this.env),
        rangeDays,
      );
      await this.repository.addItems(
        item.run_id,
        targets.length > 0
          ? targets.map((target) => ({
              targetKey: `member:${target.memberUid}:date:${target.date}`,
              phase: "match",
              lane: "auto-update" as const,
              continuation: target,
            }))
          : [{
              targetKey: "finalizer",
              phase: "finalize",
              lane: "auto-update" as const,
            }],
      );
    } else if (item.phase === "match") {
      const progress = await this.repository.readPhaseProgress(
        item.run_id,
        "match",
      );
      if (progress.queued > 0 || progress.running > 0) return false;
      if (progress.failed > 0 || progress.throttled > 0) return false;
      await this.repository.addItems(item.run_id, [{
        targetKey: "finalizer",
        phase: "finalize",
        lane: "auto-update",
      }]);
    } else {
      return false;
    }
    await this.dispatchRun(item.run_id);
    return true;
  }

  getDefaultLane(jobType: ScheduledJobType) {
    return getLaneForJob(jobType);
  }
}
