import { siteEnv } from "../test-support/site-env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";

const mocks = vi.hoisted(() => ({
  claimItem: vi.fn(),
  readItem: vi.fn(),
  completeItem: vi.fn(),
  releaseItemForRetry: vi.fn(),
  hasOriginalTransitionWork:vi.fn(),
  deferOriginalTransitionItem:vi.fn(),
  reserveQueueOperations: vi.fn(),
  markRunFailed: vi.fn(),
  markItemDeadLetter: vi.fn(),
  refreshRun: vi.fn(),
  acknowledgeReconciliation: vi.fn(),
  execute: vi.fn(),
  finalizeLegacyState: vi.fn(),
  advanceRun: vi.fn(),
  dispatchRun: vi.fn(),
}));

vi.mock("../platform/scheduled-jobs", () => ({
  D1ScheduledJobRepository: class {
    claimItem = mocks.claimItem;
    readItem = mocks.readItem;
    completeItem = mocks.completeItem;
    releaseItemForRetry = mocks.releaseItemForRetry;
    hasOriginalTransitionWork=mocks.hasOriginalTransitionWork;
    deferOriginalTransitionItem=mocks.deferOriginalTransitionItem;
    reserveQueueOperations = mocks.reserveQueueOperations;
    markRunFailed = mocks.markRunFailed;
    markItemDeadLetter = mocks.markItemDeadLetter;
    refreshRun = mocks.refreshRun;
    acknowledgeReconciliation = mocks.acknowledgeReconciliation;
  },
}));

vi.mock("../features/scheduled-operations", () => ({
  ScheduledJobCoordinator: class {
    repository = {};
    advanceRun = mocks.advanceRun;
    dispatchRun = mocks.dispatchRun;
  },
  ScheduledJobExecutor: class {
    execute = mocks.execute;
    finalizeLegacyState = mocks.finalizeLegacyState;
  },
}));

import { handleScheduledJobQueue } from "./scheduled-queue";

describe("scheduled job queue", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const item = {
      id: "item-1",
      run_id: "run-1",
      phase: "collect",
      lane: "x",
      status: "running",
      attempts: 1,
    };
    mocks.claimItem.mockResolvedValue(item);
    mocks.readItem.mockResolvedValue({ ...item, status: "succeeded" });
    mocks.execute.mockResolvedValue({
      status: "succeeded",
      result: { ok: true },
    });
    mocks.completeItem.mockImplementation(async (current, outcome) => {
      mocks.readItem.mockResolvedValue({ ...current, status: outcome.status });
      return true;
    });
    mocks.releaseItemForRetry.mockResolvedValue(true);
    mocks.hasOriginalTransitionWork.mockResolvedValue(false);
    mocks.reserveQueueOperations.mockResolvedValue(true);
    mocks.advanceRun.mockResolvedValue(false);
    mocks.dispatchRun.mockResolvedValue({ dispatched: 1 });
    mocks.finalizeLegacyState.mockResolvedValue(undefined);
    mocks.refreshRun.mockResolvedValue(undefined);
  });

  it("marks LuvDia scheduled item/control dead letters before acknowledging", async () => {
    mocks.readItem.mockResolvedValue(null);
    const item = { body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: "run", itemId: "item", phase: "collect" }, ack: vi.fn() };
    const control = { body: { schemaVersion: 1, messageType: "scheduled_job_control", runId: "run" }, ack: vi.fn() };
    await handleScheduledJobQueue({ queue: "luvdia-dead-letter", messages: [item, control] } as unknown as MessageBatch<unknown>, siteEnv("luvdia") as Env);
    expect(mocks.markItemDeadLetter).toHaveBeenCalledWith("item");
    expect(mocks.markItemDeadLetter).toHaveBeenCalledBefore(item.ack);
    expect(mocks.markRunFailed).toHaveBeenCalledWith("run", "control_queue_retries_exhausted");
    expect(mocks.markRunFailed).toHaveBeenCalledBefore(control.ack);
    expect(mocks.claimItem).not.toHaveBeenCalled();
  });

  it("성공한 item마다 다음 pending outbox를 dispatch한다", async () => {
    const ack = vi.fn();
    await handleScheduledJobQueue({
      queue: "otw-ops-background",
      messages: [{
        body: {
          schemaVersion: 1,
          messageType: "scheduled_job_item",
          runId: "run-1",
          itemId: "item-1",
          phase: "collect",
        },
        ack,
      }],
    } as unknown as MessageBatch<unknown>, siteEnv() as Env);

    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1");
    expect(ack).toHaveBeenCalledOnce();
  });

  it("부분 성공한 item도 다음 단계와 outbox를 조정한다", async () => {
    const ack = vi.fn();
    mocks.execute.mockResolvedValueOnce({
      status: "partial",
      result: { attempted: 2, succeeded: 1, failed: 1 },
    });

    await handleScheduledJobQueue({
      queue: "otw-ops-background",
      messages: [{
        body: {
          schemaVersion: 1,
          messageType: "scheduled_job_item",
          runId: "run-1",
          itemId: "item-1",
          phase: "collect",
        },
        ack,
      }],
    } as unknown as MessageBatch<unknown>, siteEnv() as Env);

    expect(mocks.completeItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "partial" }),
    );
    expect(mocks.advanceRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "partial" }),
    );
    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1");
    expect(ack).toHaveBeenCalledOnce();
  });

  it("보호 정책으로 건너뛴 X 수집은 skipped로 완료하고 재시도하지 않는다", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    mocks.execute.mockResolvedValueOnce({
      status: "skipped",
      result: {
        status: "skipped",
        error: "budget_exceeded",
      },
      errorCode: "budget_exceeded",
      error: "budget_exceeded",
    });

    await handleScheduledJobQueue({
      queue: "otw-ops-background",
      messages: [{
        body: {
          schemaVersion: 1,
          messageType: "scheduled_job_item",
          runId: "run-1",
          itemId: "item-1",
          phase: "collect",
        },
        ack,
        retry,
      }],
    } as unknown as MessageBatch<unknown>, siteEnv() as Env);

    expect(mocks.completeItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "skipped",
        errorCode: "budget_exceeded",
      }),
    );
    expect(mocks.advanceRun).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
  });

  it("도메인 실패 결과는 failed로 완료하고 외부 작업을 재실행하지 않는다", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    mocks.execute.mockResolvedValueOnce({
      status: "failed",
      result: {
        status: "failed",
        error: "rate_limited",
      },
      errorCode: "rate_limited",
      error: "rate_limited",
    });

    await handleScheduledJobQueue({
      queue: "otw-ops-background",
      messages: [{
        body: {
          schemaVersion: 1,
          messageType: "scheduled_job_item",
          runId: "run-1",
          itemId: "item-1",
          phase: "collect",
        },
        ack,
        retry,
      }],
    } as unknown as MessageBatch<unknown>, siteEnv() as Env);

    expect(mocks.completeItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "failed",
        errorCode: "rate_limited",
      }),
    );
    expect(retry).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
  });

  it("완료 후 재전달된 item은 다음 단계와 outbox를 다시 조정한다", async () => {
    const ack = vi.fn();
    mocks.claimItem.mockResolvedValue(null);

    await handleScheduledJobQueue({
      queue: "otw-ops-background",
      messages: [{
        body: {
          schemaVersion: 1,
          messageType: "scheduled_job_item",
          runId: "run-1",
          itemId: "item-1",
          phase: "scan",
        },
        ack,
      }],
    } as unknown as MessageBatch<unknown>, siteEnv() as Env);

    expect(mocks.advanceRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1", status: "succeeded" }),
    );
    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1");
    expect(mocks.finalizeLegacyState).toHaveBeenCalledWith("run-1");
    expect(mocks.refreshRun).toHaveBeenCalledWith("run-1");
    expect(mocks.refreshRun.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.finalizeLegacyState.mock.invocationCallOrder[0],
    );
    expect(ack).toHaveBeenCalledOnce();
  });

  it("완료 뒤 다음 단계 생성이 실패하면 terminal item을 재시도한다", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    mocks.advanceRun.mockRejectedValueOnce(new Error("temporary d1 failure"));

    await handleScheduledJobQueue({
      queue: "otw-ops-background",
      messages: [{
        body: {
          schemaVersion: 1,
          messageType: "scheduled_job_item",
          runId: "run-1",
          itemId: "item-1",
          phase: "scan",
        },
        ack,
        retry,
      }],
    } as unknown as MessageBatch<unknown>, siteEnv() as Env);

    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(ack).not.toHaveBeenCalled();
    expect(mocks.releaseItemForRetry).not.toHaveBeenCalled();
  });

  it("후속 조정 retry 예산이 소진되면 terminal run을 복구 가능한 실패로 표시한다", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    mocks.claimItem.mockResolvedValue(null);
    mocks.advanceRun.mockRejectedValueOnce(new Error("temporary d1 failure"));
    mocks.reserveQueueOperations.mockResolvedValue(false);

    await handleScheduledJobQueue({
      queue: "otw-ops-background",
      messages: [{
        body: {
          schemaVersion: 1,
          messageType: "scheduled_job_item",
          runId: "run-1",
          itemId: "item-1",
          phase: "scan",
        },
        ack,
        retry,
      }],
    } as unknown as MessageBatch<unknown>, siteEnv() as Env);

    expect(mocks.markRunFailed).toHaveBeenCalledWith(
      "run-1",
      "post_completion_reconciliation_failed:temporary d1 failure",
      true,
    );
    expect(retry).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
  });

  it("DLQ의 failed terminal item도 외부 작업 재실행 없이 후속 조정한다", async () => {
    const ack = vi.fn();
    mocks.claimItem.mockResolvedValue(null);
    mocks.readItem.mockResolvedValue({
      id: "item-1",
      run_id: "run-1",
      phase: "collect",
      lane: "x",
      status: "failed",
      attempts: 3,
    });

    await handleScheduledJobQueue({
      queue: "otw-dead-letter",
      messages: [{
        body: {
          schemaVersion: 1,
          messageType: "scheduled_job_item",
          runId: "run-1",
          itemId: "item-1",
          phase: "collect",
        },
        ack,
      }],
    } as unknown as MessageBatch<unknown>, siteEnv() as Env);

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1");
    expect(mocks.finalizeLegacyState).toHaveBeenCalledWith("run-1");
    expect(mocks.refreshRun).toHaveBeenCalledWith("run-1");
    expect(mocks.markItemDeadLetter).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
  });
});
