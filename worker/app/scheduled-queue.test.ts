import { siteEnv } from "../test-support/site-env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";

const mocks = vi.hoisted(() => ({
  claimItem: vi.fn(),
  readItems: vi.fn(),
  readItem: vi.fn(),
  rearmDeferredPriorityItem: vi.fn(),
  completeItem: vi.fn(),
  releaseItemForRetry: vi.fn(),
  reserveQueueOperations: vi.fn(),
  reserveControlRetry: vi.fn(),
  reserveReconciliationRetry: vi.fn(),
  markRunFailed: vi.fn(),
  completeUnplannedRun: vi.fn(),
  markItemDeadLetter: vi.fn(),
  refreshRun: vi.fn(),
  acknowledgeReconciliation: vi.fn(),
  execute: vi.fn(),
  finalizeLegacyState: vi.fn(),
  enrichCompletedXReplies: vi.fn(),
  advanceRun: vi.fn(),
  dispatchRun: vi.fn(),
  planManualRun: vi.fn(),
  markRunThrottled: vi.fn(),
}));

vi.mock("../platform/scheduled-jobs", () => ({
  D1ScheduledJobRepository: class {
    claimItem = mocks.claimItem;
    readItems = mocks.readItems;
    readItem = mocks.readItem;
    rearmDeferredPriorityItem = mocks.rearmDeferredPriorityItem;
    completeItem = mocks.completeItem;
    completeItemWithReadback = async (...args: unknown[]) => await mocks.completeItem(...args) ? mocks.readItem((args[0] as {id:string}).id) : false;
    releaseItemForRetry = mocks.releaseItemForRetry;
    reserveQueueOperations = mocks.reserveQueueOperations;
    reserveReconciliationRetry = mocks.reserveReconciliationRetry;
    markRunFailed = mocks.markRunFailed;
    completeUnplannedRun = mocks.completeUnplannedRun;
    markItemDeadLetter = mocks.markItemDeadLetter;
    refreshRun = mocks.refreshRun;
    acknowledgeReconciliation = mocks.acknowledgeReconciliation;
  },
}));

vi.mock("../features/scheduled-operations", () => ({
  ScheduledJobCoordinator: class {
    repository = {reserveControlRetry:mocks.reserveControlRetry,reserveQueueOperations:mocks.reserveQueueOperations,markRunThrottled:mocks.markRunThrottled,completeUnplannedRun:mocks.completeUnplannedRun};
    planManualRun = mocks.planManualRun;
    advanceRun = mocks.advanceRun;
    dispatchRun = mocks.dispatchRun;
  },
  ScheduledJobExecutor: class {
    execute = mocks.execute;
    finalizeLegacyState = mocks.finalizeLegacyState;
    enrichCompletedXReplies = mocks.enrichCompletedXReplies;
  },
}));

import { handleScheduledControlQueue, handleScheduledJobQueue } from "./scheduled-queue";

describe("scheduled job queue", () => {
  it("rearms a priority-deferred delivery before acknowledging and redispatches the run", async () => {
    mocks.claimItem.mockResolvedValue(null);
    mocks.readItem.mockResolvedValue({ id: "low", run_id: "ranked", status: "queued" });
    mocks.rearmDeferredPriorityItem.mockResolvedValue(true);
    const message = { body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: "ranked", itemId: "low", phase: "collect" }, ack: vi.fn(), retry: vi.fn() };
    await handleScheduledJobQueue({ queue: "background", messages: [message] } as unknown as MessageBatch<unknown>, { ...siteEnv() } as Env);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.rearmDeferredPriorityItem).toHaveBeenCalledWith("low", 0);
    expect(mocks.dispatchRun).toHaveBeenCalledWith("ranked");
    expect(mocks.rearmDeferredPriorityItem.mock.invocationCallOrder[0]).toBeLessThan(message.ack.mock.invocationCallOrder[0]);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });
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
    mocks.reserveQueueOperations.mockResolvedValue(true);
    mocks.reserveControlRetry.mockResolvedValue("reserved");
    mocks.reserveReconciliationRetry.mockResolvedValue(true);
    mocks.advanceRun.mockResolvedValue(false);
    mocks.dispatchRun.mockResolvedValue({ dispatched: 1 });
    mocks.finalizeLegacyState.mockResolvedValue(undefined);
    mocks.refreshRun.mockResolvedValue(undefined);
  });

  it.each([true,false])("preserves control planning failure admission: %s",async reserved=>{
    mocks.planManualRun.mockRejectedValue(new Error('planning failed'));
    mocks.reserveControlRetry.mockResolvedValue(reserved ? "reserved" : "denied");
    const message={body:{schemaVersion:1,messageType:'scheduled_job_control',runId:'control-run'},ack:vi.fn(),retry:vi.fn()};
    await handleScheduledControlQueue({queue:'otw-ops-control',messages:[message]} as unknown as MessageBatch<unknown>,siteEnv() as Env);
    expect(mocks.reserveControlRetry).toHaveBeenCalledWith('control-run', 0);
    expect(mocks.reserveQueueOperations).not.toHaveBeenCalled();
    expect(mocks.reserveReconciliationRetry).not.toHaveBeenCalled();
    if(reserved){expect(message.retry).toHaveBeenCalledWith({delaySeconds:60});expect(message.ack).not.toHaveBeenCalled();expect(mocks.markRunThrottled).not.toHaveBeenCalled();}
    else {expect(mocks.completeUnplannedRun).toHaveBeenCalledWith('control-run','throttled','daily_queue_budget_exhausted_during_retry',0);expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();}
  });

  it.each([true,false])("preserves nonterminal non-RSS execution failure admission: %s",async reserved=>{
    mocks.claimItem.mockResolvedValue({id:'item-1',run_id:'run-1',phase:'collect',lane:'naver',status:'running',attempts:1});
    mocks.readItem.mockResolvedValue({id:'item-1',run_id:'run-1',phase:'collect',lane:'naver',status:'running',attempts:1});
    mocks.execute.mockRejectedValue(new Error('collector failed'));
    mocks.reserveQueueOperations.mockResolvedValue(reserved);
    const message={body:{schemaVersion:1,messageType:'scheduled_job_item',runId:'run-1',itemId:'item-1',phase:'collect'},ack:vi.fn(),retry:vi.fn()};
    await handleScheduledJobQueue({queue:'otw-ops-background',messages:[message]} as unknown as MessageBatch<unknown>,siteEnv() as Env);
    expect(mocks.reserveQueueOperations).toHaveBeenCalledWith('naver');
    expect(mocks.reserveReconciliationRetry).not.toHaveBeenCalled();
    if(reserved){expect(mocks.releaseItemForRetry).toHaveBeenCalledOnce();expect(message.retry).toHaveBeenCalledWith({delaySeconds:60});expect(message.ack).not.toHaveBeenCalled();}
    else {expect(mocks.completeItem).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({status:'throttled',errorCode:'queue_budget_exhausted'}));expect(message.ack).toHaveBeenCalledOnce();expect(message.retry).not.toHaveBeenCalled();}
  });

  it("marks LuvDia scheduled item/control dead letters before acknowledging", async () => {
    const queued = { id: "item", run_id: "run", status: "queued" };
    mocks.readItem.mockResolvedValue(queued);
    const item = { body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: "run", itemId: "item", phase: "collect" }, ack: vi.fn() };
    const control = { body: { schemaVersion: 1, messageType: "scheduled_job_control", runId: "run" }, ack: vi.fn() };
    await handleScheduledJobQueue({ queue: "luvdia-dead-letter", messages: [item, control] } as unknown as MessageBatch<unknown>, siteEnv("luvdia") as Env);
    expect(mocks.markItemDeadLetter).toHaveBeenCalledWith("item", undefined, queued, 0);
    expect(mocks.markItemDeadLetter).toHaveBeenCalledBefore(item.ack);
    expect(mocks.completeUnplannedRun).toHaveBeenCalledWith("run", "failed", "control_queue_retries_exhausted",0);
    expect(mocks.completeUnplannedRun).toHaveBeenCalledBefore(control.ack);
    expect(mocks.claimItem).not.toHaveBeenCalled();
  });

  it("ignores a late execution error after a newer generation completed", async () => {
    mocks.claimItem.mockResolvedValue({ id: "item-1", run_id: "run-1", phase: "collect", lane: "x", status: "running", attempts: 1 });
    mocks.execute.mockRejectedValue(new Error("old execution failed"));
    mocks.readItem.mockResolvedValue({ id: "item-1", run_id: "run-1", status: "succeeded", continuation_json: '{"deliveryGeneration":1}' });
    const message = { body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: "run-1", itemId: "item-1", phase: "collect" }, ack: vi.fn(), retry: vi.fn() };
    await handleScheduledJobQueue({ queue: "otw-ops-background", messages: [message] } as unknown as MessageBatch<unknown>, siteEnv() as Env);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(mocks.reserveReconciliationRetry).not.toHaveBeenCalled();
    expect(mocks.dispatchRun).not.toHaveBeenCalled();
    expect(mocks.markRunFailed).not.toHaveBeenCalled();
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

    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1", { items: [expect.objectContaining({ id: "item-1" })] });
    expect(mocks.acknowledgeReconciliation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enrichCompletedXReplies.mock.invocationCallOrder[0],
    );
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
      expect.objectContaining({ status: "partial" }), false,
    );
    expect(mocks.advanceRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "partial" }),
    );
    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1", { items: [expect.objectContaining({ id: "item-1" })] });
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
      }), false,
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
      }), false,
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
    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1", { items: [expect.objectContaining({ id: "item-1" })] });
    expect(mocks.finalizeLegacyState).toHaveBeenCalledWith("run-1");
    expect(mocks.refreshRun).toHaveBeenCalledWith("run-1", [expect.objectContaining({ id: "item-1" })]);
    expect(mocks.refreshRun.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.finalizeLegacyState.mock.invocationCallOrder[0],
    );
    expect(mocks.enrichCompletedXReplies).not.toHaveBeenCalled();
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
    expect(mocks.reserveReconciliationRetry).toHaveBeenCalledWith("run-1", "post_completion_reconciliation_failed:temporary d1 failure", [expect.objectContaining({ id: "item-1" })]);
  });

  it("후속 조정 retry 예산이 소진되면 terminal run을 복구 가능한 실패로 표시한다", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    mocks.claimItem.mockResolvedValue(null);
    mocks.advanceRun.mockRejectedValueOnce(new Error("temporary d1 failure"));
    mocks.reserveReconciliationRetry.mockResolvedValue(false);

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

    expect(mocks.reserveReconciliationRetry).toHaveBeenCalledWith(
      "run-1",
      "post_completion_reconciliation_failed:temporary d1 failure",
      [expect.objectContaining({ id: "item-1" })],
    );
    expect(mocks.markRunFailed).not.toHaveBeenCalled();
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
    expect(mocks.dispatchRun).toHaveBeenCalledWith("run-1", { items: [expect.objectContaining({ id: "item-1" })] });
    expect(mocks.finalizeLegacyState).toHaveBeenCalledWith("run-1");
    expect(mocks.refreshRun).toHaveBeenCalledWith("run-1", [expect.objectContaining({ id: "item-1" })]);
    expect(mocks.markItemDeadLetter).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledOnce();
  });
});
