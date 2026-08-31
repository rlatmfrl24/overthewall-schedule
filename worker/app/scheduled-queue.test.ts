import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";

const mocks = vi.hoisted(() => ({
  claimItem: vi.fn(),
  readItem: vi.fn(),
  completeItem: vi.fn(),
  releaseItemForRetry: vi.fn(),
  reserveQueueOperations: vi.fn(),
  markRunFailed: vi.fn(),
  markItemDeadLetter: vi.fn(),
  refreshRun: vi.fn(),
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
    reserveQueueOperations = mocks.reserveQueueOperations;
    markRunFailed = mocks.markRunFailed;
    markItemDeadLetter = mocks.markItemDeadLetter;
    refreshRun = mocks.refreshRun;
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
    mocks.execute.mockResolvedValue({ ok: true });
    mocks.completeItem.mockResolvedValue(true);
    mocks.releaseItemForRetry.mockResolvedValue(true);
    mocks.reserveQueueOperations.mockResolvedValue(true);
    mocks.advanceRun.mockResolvedValue(false);
    mocks.dispatchRun.mockResolvedValue({ dispatched: 1 });
    mocks.finalizeLegacyState.mockResolvedValue(undefined);
    mocks.refreshRun.mockResolvedValue(undefined);
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
    } as unknown as MessageBatch<unknown>, {} as Env);

    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1");
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
    } as unknown as MessageBatch<unknown>, {} as Env);

    expect(mocks.advanceRun).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1", status: "succeeded" }),
    );
    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1");
    expect(mocks.finalizeLegacyState).toHaveBeenCalledWith("run-1");
    expect(mocks.refreshRun).toHaveBeenCalledWith("run-1");
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
    } as unknown as MessageBatch<unknown>, {} as Env);

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
    } as unknown as MessageBatch<unknown>, {} as Env);

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
    } as unknown as MessageBatch<unknown>, {} as Env);

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1");
    expect(mocks.finalizeLegacyState).toHaveBeenCalledWith("run-1");
    expect(mocks.refreshRun).toHaveBeenCalledWith("run-1");
    expect(mocks.markItemDeadLetter).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
  });
});
