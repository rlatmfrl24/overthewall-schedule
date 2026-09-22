import { afterEach, describe, expect, it, vi } from "vitest";
import type { XReferenceHydrationResultDto } from "@contracts/x-posts";
import type { Env } from "../../../platform/types";
import type { ScheduledJobItemRecord } from "../../../platform/scheduled-jobs";
import { AiReviewService, IngestionService } from "../../otw-play";
import * as schedules from "../../schedules";
import { ScheduledJobCoordinator } from "./scheduled-job-coordinator";
import {
  ScheduledJobExecutor,
  toXCollectionOutcome,
  toYouTubeFeedCollectionOutcome,
  toScheduledBatchOutcome,
  toSourceHealthOutcome,
} from "./scheduled-job-executor";

const result = (
  status: "success" | "skipped" | "failed",
  error: string | null = null,
) => ({
  checkedHandles: 1,
  refreshedHandles: status === "success" ? 1 : 0,
  postsReturned: 0,
  postsStored: 0,
  apiCalls: 0,
  estimatedCostMicros: 0,
  status,
  success: status === "success",
  error,
  updatedAt: "2026-02-13T00:00:00.000Z",
});

describe("scheduled job executor outcomes", () => {
  afterEach(() => vi.restoreAllMocks());

  const executeScheduleScan = async (statuses: ("complete" | "failed" | "incomplete")[], attempts = 3) => {
    const channelResults = statuses.map((status, index) => ({ channelId: String(index), status }));
    vi.spyOn(schedules, "scanAndPersistRecentChzzkObservations")
      .mockResolvedValue({ channels: statuses.length, observations: 0, channelResults });
    const statement = { bind: vi.fn(), first: vi.fn(async () => ({ value: "1" })) };
    statement.bind.mockReturnValue(statement);
    const env = { otw_db: { prepare: vi.fn(() => statement) } } as unknown as Env;
    const repository = { readRun: vi.fn(async () => ({ job_type: "schedule_auto_update", source: "scheduled" })) };
    return new ScheduledJobExecutor(env, repository as never).execute({
      run_id: "run", phase: "scan", attempts,
      continuation_json: JSON.stringify({ channelIds: ["a".repeat(32)] }),
    } as ScheduledJobItemRecord);
  };

  it("정상 빈 조회는 성공하고 전체 조회 실패는 실패로 기록한다", async () => {
    // 계획 이후 멤버가 비활성화되어도 후속 판정/완료 단계는 진행해야 한다.
    expect(await executeScheduleScan([])).toMatchObject({
      status: "succeeded", attempted: 0, succeeded: 0, failed: 0,
    });
    expect(await executeScheduleScan(["complete"])).toMatchObject({
      status: "succeeded", attempted: 1, succeeded: 1, failed: 0, errorCode: null,
    });
    expect(await executeScheduleScan(["failed"])).toMatchObject({
      status: "failed", attempted: 1, succeeded: 0, failed: 1, errorCode: "schedule_scan_failed",
    });
  });

  it.each([1, 2])("조회 실패의 %i번째 시도는 큐 재시도 경로로 전달한다", async attempts => {
    await expect(executeScheduleScan(["complete", "failed"], attempts))
      .rejects.toMatchObject({ name: "schedule_scan_failed" });
  });

  it("재시도 소진 후 일부 실패와 페이지 확인 미완료를 성공으로 숨기지 않는다", async () => {
    expect(await executeScheduleScan(["complete", "failed"])).toMatchObject({
      status: "partial", result: { attempted: 2, succeeded: 1, failed: 1, queryFailed: 1 },
    });
    expect(await executeScheduleScan(["complete", "incomplete"], 1)).toMatchObject({
      status: "partial", failed: 1, errorCode: "schedule_scan_incomplete",
      result: { incomplete: 1 },
    });
    expect(await executeScheduleScan(["incomplete"], 1)).toMatchObject({
      status: "failed", succeeded: 0, failed: 1, errorCode: "schedule_scan_incomplete",
    });
  });

  it("rechecks paused automation when an already dispatched source-health item arrives", async () => {
    const statement = { bind: vi.fn(), first: vi.fn(async () => ({ value: "true" })) };
    statement.bind.mockReturnValue(statement);
    const env = { otw_db: { prepare: vi.fn(() => statement) } } as unknown as Env;
    const repository = { readRun: vi.fn(async () => ({ job_type: "source_health", source: "scheduled" })) };
    const result = await new ScheduledJobExecutor(env, repository as never)
      .execute({ run_id: "run", phase: "check" } as ScheduledJobItemRecord);
    expect(result).toEqual({ status: "skipped", result: { reason: "otw_play_automation_paused" } });
  });

  it("continues common recovery and metadata cleanup while Play automation is paused", async () => {
    const env = { otw_db: {}, YOUTUBE_API_KEY: "test-key" } as Env;
    const repository = {
      readRun: vi.fn(async () => ({ job_type: "ingestion_recovery", source: "scheduled" })),
      recoverStaleItems: vi.fn(async () => 1),
    };
    vi.spyOn(ScheduledJobCoordinator.prototype, "dispatchPending")
      .mockResolvedValue({ claimed: 1, dispatched: 1, failed: 0 });
    const cleanup = vi.spyOn(IngestionService.prototype, "clearExpiredApiData").mockResolvedValue(2);
    const aiCleanup = vi.spyOn(AiReviewService.prototype, "clearExpired").mockResolvedValue(1);
    const executor = new ScheduledJobExecutor(env, repository as never);

    expect(await executor.execute({ run_id: "run", phase: "recover-scheduled" } as ScheduledJobItemRecord))
      .toMatchObject({ status: "succeeded", result: { recovered: 1, dispatched: 1 } });
    expect(await executor.execute({ run_id: "run", phase: "cleanup" } as ScheduledJobItemRecord))
      .toMatchObject({ status: "succeeded", result: { cleared: 2, aiCleared: 1 } });
    expect(cleanup).toHaveBeenCalledWith(20);
    expect(aiCleanup).toHaveBeenCalledOnce();
  });

  it.each(["websub_maintenance", "recent_reconcile"])("skips already dispatched retired %s work without D1 mutations", async (jobType) => {
    const prepare = vi.fn();
    const repository = { readRun: vi.fn(async () => ({ job_type: jobType, source: "scheduled" })) };
    expect(await new ScheduledJobExecutor({ otw_db: { prepare } } as unknown as Env, repository as never)
      .execute({ run_id: "run", phase: "recover-intent" } as ScheduledJobItemRecord))
      .toEqual({ status: "skipped", result: { reason: "channel_polling_replaced_websub" } });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("exposes common queue recovery failures rather than marking them successful", async () => {
    const repository = {
      readRun: vi.fn(async () => ({ job_type: "ingestion_recovery", source: "scheduled" })),
      recoverStaleItems: vi.fn(async () => 0),
    };
    const dispatch = vi.spyOn(ScheduledJobCoordinator.prototype, "dispatchPending")
      .mockResolvedValue({ claimed: 2, dispatched: 1, failed: 1 });
    const executor = new ScheduledJobExecutor({ otw_db: {} } as Env, repository as never);
    const item = { run_id: "run", phase: "recover-scheduled" } as ScheduledJobItemRecord;
    await expect(executor.execute(item)).resolves.toMatchObject({
      status: "partial", attempted: 2, succeeded: 1, failed: 1,
      errorCode: "scheduled_dispatch_failed",
    });
    dispatch.mockResolvedValue({ claimed: 0, dispatched: 0, failed: 0 });
    await expect(executor.execute(item)).resolves.toMatchObject({ status: "skipped" });
    dispatch.mockResolvedValue({ claimed: 2, dispatched: 0, failed: 0 });
    await expect(executor.execute(item)).resolves.toMatchObject({
      status: "throttled", result: { deferred: 2 }, errorCode: "daily_background_budget_exhausted",
    });
    dispatch.mockResolvedValue({ claimed: 2, dispatched: 1, failed: 0 });
    await expect(executor.execute(item)).resolves.toMatchObject({
      status: "partial", result: { deferred: 1 }, errorCode: "daily_background_budget_exhausted",
    });
  });

  it("checks the current pause flag for each ingestion requeue and exposes dispatch failure", async () => {
    let paused = false;
    const statement = { bind: vi.fn(), first: vi.fn(async () => ({ value: String(paused) })) };
    statement.bind.mockReturnValue(statement);
    const env = { otw_db: { prepare: vi.fn(() => statement) }, YOUTUBE_API_KEY: "test-key" } as unknown as Env;
    const repository = { readRun: vi.fn(async () => ({ job_type: "ingestion_recovery", source: "scheduled" })) };
    vi.spyOn(IngestionService.prototype, "requeuePendingWithOutcome")
      .mockImplementation(async (_limit, canContinue) => {
        await expect(canContinue!()).resolves.toBe(true);
        paused = true;
        await expect(canContinue!()).resolves.toBe(false);
        return { attempted: 1, enqueued: 0, failed: 1 };
      });
    await expect(new ScheduledJobExecutor(env, repository as never)
      .execute({ run_id: "run", phase: "requeue" } as ScheduledJobItemRecord))
      .resolves.toMatchObject({ status: "failed", failed: 1, errorCode: "ingestion_dispatch_failed" });
  });

  it("does not mark a failed WebSub maintenance result as succeeded", () => {
    expect(toScheduledBatchOutcome([{ id: "monitor-1", ok: false }]))
      .toMatchObject({ status: "failed", attempted: 1, succeeded: 0, failed: 1,
        errorCode: "scheduled_target_failed" });
    expect(toScheduledBatchOutcome([{ id: "a", ok: true }, { id: "b", ok: false }]))
      .toMatchObject({ status: "partial", attempted: 2, succeeded: 1, failed: 1 });
    expect(toScheduledBatchOutcome([])).toMatchObject({ status: "skipped", attempted: 0 });
  });

  const health = {
    claimed: 2, checked: 2, changed: 0, recovered: 0,
    retryScheduled: 0, staleSkipped: 0, failed: 0,
  };

  it("preserves the actual source-health checks and failures", () => {
    expect(toSourceHealthOutcome(health))
      .toMatchObject({ status: "succeeded", attempted: 2, succeeded: 2, failed: 0 });
    expect(toSourceHealthOutcome({ ...health, checked: 1, failed: 1 }))
      .toMatchObject({ status: "partial", attempted: 2, succeeded: 1, failed: 1 });
    expect(toSourceHealthOutcome({ ...health, checked: 0, failed: 2 }))
      .toMatchObject({ status: "failed", errorCode: "source_health_check_failed" });
  });

  it("keeps source-health retries and lost CAS checks incomplete", () => {
    expect(toSourceHealthOutcome({ ...health, checked: 0, retryScheduled: 2 }))
      .toMatchObject({ status: "partial", retryScheduled: 2, errorCode: "source_health_retry_pending" });
    expect(toSourceHealthOutcome({ ...health, checked: 1, staleSkipped: 1 }))
      .toMatchObject({ status: "partial", errorCode: "source_health_check_incomplete" });
    expect(toSourceHealthOutcome({ ...health, claimed: 0, checked: 0 }))
      .toMatchObject({ status: "skipped", attempted: 0, succeeded: 0 });
  });

  it("keeps preview budget deferral neutral but exposes actual hydration errors", () => {
    const referenceHydration: XReferenceHydrationResultDto = { status: "deferred", scanned: 1, hydrated: 0, authorsResolved: 0,
      deferred: 1, failed: 0, terminal: 0, coalesced: 0, retryAt: 1, errorCode: "preview_budget_exceeded" };
    expect(toXCollectionOutcome({ ...result("success"), referenceHydration }).status).toBe("succeeded");
    referenceHydration.failed = 1;
    referenceHydration.status = "failed";
    referenceHydration.errorCode = "x_api_503";
    expect(toXCollectionOutcome({ ...result("success"), referenceHydration })).toMatchObject({ status: "partial", errorCode: "x_api_503" });
    expect(toXCollectionOutcome({ ...result("failed"), referenceHydration }).status).toBe("failed");
  });

  it("maps a successful X collection to a succeeded item", () => {
    expect(toXCollectionOutcome(result("success"))).toMatchObject({
      status: "succeeded",
      result: { status: "success" },
    });
  });

  it("maps admission protection to a skipped item", () => {
    expect(
      toXCollectionOutcome(result("skipped", "budget_exceeded")),
    ).toMatchObject({
      status: "skipped",
      errorCode: "budget_exceeded",
      error: "budget_exceeded",
    });
  });

  it("maps an external collection failure to a failed item", () => {
    expect(
      toXCollectionOutcome(result("failed", "rate_limited")),
    ).toMatchObject({
      status: "failed",
      errorCode: "rate_limited",
      error: "rate_limited",
    });
  });

  it("normalizes a fully completed YouTube result from partial to succeeded", () => {
    expect(toYouTubeFeedCollectionOutcome({
      status: "partial",
      attempted: 1,
      succeeded: 1,
      failed: 0,
    })).toMatchObject({
      status: "succeeded",
      attempted: 1,
      succeeded: 1,
      failed: 0,
      errorCode: null,
    });
  });

  it("preserves a genuine YouTube partial and exposes its failure", () => {
    expect(toYouTubeFeedCollectionOutcome({
      status: "partial",
      attempted: 5,
      succeeded: 4,
      failed: 1,
    })).toMatchObject({
      status: "partial",
      attempted: 5,
      succeeded: 4,
      failed: 1,
      errorCode: "youtube_feed_collection_failed",
      error: "YouTube feed collection failed for 1 of 5 sources",
    });
  });

  it("keeps an incomplete YouTube result partial even without a reported failure", () => {
    expect(toYouTubeFeedCollectionOutcome({
      status: "partial",
      attempted: 2,
      succeeded: 1,
      failed: 0,
    })).toMatchObject({
      status: "partial",
      attempted: 2,
      succeeded: 1,
      failed: 0,
    });
  });

  it("preserves a completed source pass as partial when Shorts backfill hit quota", () => {
    expect(toYouTubeFeedCollectionOutcome({
      status: "partial",
      attempted: 8,
      succeeded: 8,
      failed: 0,
      quotaBlocked: true,
    })).toMatchObject({
      status: "partial",
      attempted: 8,
      succeeded: 8,
      failed: 0,
      errorCode: "youtube_feed_collection_quota_blocked",
    });
  });
});
