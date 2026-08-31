import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SCHEDULED_JOB_LEASE_MS,
  SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS,
} from "./job-policy";
import { D1ScheduledJobRepository } from "./d1-scheduled-job-repository";

type TestEnv = Env & {
  SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;
const db = testEnv.otw_db;
let timestamp = Date.UTC(2026, 7, 31, 0);
let sequence = 0;

const createRepository = () =>
  new D1ScheduledJobRepository(
    db,
    () => timestamp,
    () => `id-${++sequence}`,
  );

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.SCHEDULED_OPERATIONS_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM scheduled_outbox"),
    db.prepare("DELETE FROM scheduled_job_items"),
    db.prepare("DELETE FROM scheduled_job_runs"),
    db.prepare("DELETE FROM scheduled_usage_daily"),
  ]);
  timestamp = Date.UTC(2026, 7, 31, 0);
  sequence = 0;
});

describe("D1 scheduled job state machine", () => {
  it("중복 coordinator 실행을 전역 idempotency key 하나로 합친다", async () => {
    const repository = createRepository();
    const first = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:bucket-1",
    });
    const duplicate = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:bucket-1",
    });

    expect(duplicate.id).toBe(first.id);
    const count = await db.prepare(
      "SELECT COUNT(*) AS count FROM scheduled_job_runs",
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("item/outbox 중복을 제거하고 outbox를 CAS로 한 번만 claim한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "manual",
      idempotencyKey: "manual:naver:1",
    });
    const item = {
      targetKey: "source:1",
      phase: "collect",
      lane: "naver" as const,
    };
    await repository.addItems(run.id, [item]);
    await repository.addItems(run.id, [item]);

    const firstClaim = await repository.claimPendingOutbox(run.id, 10);
    const duplicateClaim = await repository.claimPendingOutbox(run.id, 10);
    expect(firstClaim).toHaveLength(1);
    expect(duplicateClaim).toHaveLength(0);

    const counts = await db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM scheduled_job_items) AS itemCount,
         (SELECT COUNT(*) FROM scheduled_outbox) AS outboxCount`,
    ).first<{ itemCount: number; outboxCount: number }>();
    expect(counts).toEqual({ itemCount: 1, outboxCount: 1 });
  });

  it("5배 규모 item도 10개 단위 bulk insert와 단일 outbox fan-out으로 저장한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "schedule_auto_update",
      source: "scheduled",
      idempotencyKey: "scheduled:auto-update:five-x",
    });
    await repository.addItems(
      run.id,
      Array.from({ length: 25 }, (_, index) => ({
        targetKey: `member:${index + 1}:date:2026-08-31`,
        phase: "match",
        lane: "auto-update" as const,
        continuation: { memberUid: index + 1, date: "2026-08-31" },
      })),
    );

    const counts = await db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM scheduled_job_items WHERE run_id = ?) AS itemCount,
         (SELECT COUNT(*) FROM scheduled_outbox WHERE run_id = ?) AS outboxCount`,
    ).bind(run.id, run.id).first<{ itemCount: number; outboxCount: number }>();
    expect(counts).toEqual({ itemCount: 25, outboxCount: 25 });
  });

  it("hard termination으로 만료된 lease를 queued item과 pending outbox로 복구한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "retention_prune",
      source: "scheduled",
      idempotencyKey: "scheduled:retention:1",
    });
    await repository.addItems(run.id, [{
      targetKey: "target:1",
      phase: "prune",
      lane: "maintenance",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    expect(outbox).toBeDefined();
    await repository.markOutboxDispatched(outbox!.id);
    const claimed = await repository.claimItem(outbox!.item_id);
    expect(claimed?.status).toBe("running");

    timestamp += SCHEDULED_JOB_LEASE_MS + 1;
    expect(await repository.recoverStaleItems(10)).toBe(1);
    const recovered = await repository.claimPendingOutbox(run.id, 1);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.item_id).toBe(outbox!.item_id);
  });

  it("Queue 보존기간이 지난 dispatched item을 pending outbox로 복구한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "ingestion_recovery",
      source: "scheduled",
      idempotencyKey: "scheduled:ingestion:expired-delivery",
    });
    await repository.addItems(run.id, [{
      targetKey: "recover-scheduled",
      phase: "recover-scheduled",
      lane: "ingestion",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    expect(outbox).toBeDefined();
    await repository.markOutboxDispatched(outbox!.id);

    timestamp += SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS - 1;
    expect(await repository.recoverStaleItems(10)).toBe(0);
    expect(await repository.claimPendingOutbox(run.id, 1)).toEqual([]);

    timestamp += 2;
    expect(await repository.recoverStaleItems(10)).toBe(1);
    const recovered = await repository.claimPendingOutbox(run.id, 1);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.item_id).toBe(outbox!.item_id);
  });

  it("오래된 queued item의 execute outbox가 누락되면 다시 생성한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "websub_maintenance",
      source: "scheduled",
      idempotencyKey: "scheduled:websub:missing-outbox",
    });
    await repository.addItems(run.id, [{
      targetKey: "renew",
      phase: "renew",
      lane: "websub",
    }]);
    await db.prepare(
      "DELETE FROM scheduled_outbox WHERE run_id = ?",
    ).bind(run.id).run();

    timestamp += SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS + 1;
    expect(await repository.recoverStaleItems(10)).toBe(1);
    const recovered = await repository.claimPendingOutbox(run.id, 1);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.run_id).toBe(run.id);
  });

  it("lease를 다시 획득한 worker만 item 완료 상태를 기록한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:lease-cas",
    });
    await repository.addItems(run.id, [{
      targetKey: "handle:lease-owner",
      phase: "collect",
      lane: "x",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    expect(outbox).toBeDefined();
    await repository.markOutboxDispatched(outbox!.id);

    const firstOwner = await repository.claimItem(outbox!.item_id);
    expect(firstOwner?.lease_token).toBeTruthy();
    timestamp += SCHEDULED_JOB_LEASE_MS + 1;
    const secondOwner = await repository.claimItem(outbox!.item_id);
    expect(secondOwner?.lease_token).toBeTruthy();
    expect(secondOwner?.lease_token).not.toBe(firstOwner?.lease_token);

    expect(
      await repository.completeItem(firstOwner!, {
        status: "succeeded",
        result: { owner: "expired" },
      }),
    ).toBe(false);
    expect(await repository.readItem(outbox!.item_id)).toMatchObject({
      status: "running",
      lease_token: secondOwner!.lease_token,
    });
    expect(
      await repository.completeItem(secondOwner!, {
        status: "succeeded",
        result: { owner: "current" },
      }),
    ).toBe(true);
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "succeeded",
      progress: { succeeded: 1 },
    });
  });

  it("run 실패는 아직 dispatch되지 않은 item과 outbox를 함께 종료한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "manual",
      idempotencyKey: "manual:naver:failed-control",
    });
    await repository.addItems(run.id, [{
      targetKey: "source:1",
      phase: "collect",
      lane: "naver",
    }]);

    await repository.markRunFailed(run.id, "scheduled_control_queue_unavailable");

    expect(await repository.claimPendingOutbox(run.id, 10)).toEqual([]);
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "failed",
      progress: { failed: 1 },
    });
  });

  it("admission control로 throttled 된 item의 failed outbox를 재전송하지 않는다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "retention_prune",
      source: "scheduled",
      idempotencyKey: "scheduled:retention:throttled",
    });
    await repository.addItems(run.id, [{
      targetKey: "target:throttled",
      phase: "prune",
      lane: "maintenance",
    }]);

    await repository.markRunThrottled(run.id, "daily_budget_guard");

    expect(await repository.claimPendingOutbox(run.id, 10)).toHaveLength(0);
    const item = await db.prepare(
      "SELECT status FROM scheduled_job_items WHERE run_id = ?",
    ).bind(run.id).first<{ status: string }>();
    expect(item?.status).toBe("throttled");
  });

  it("성공한 terminal run은 retry로 queued 상태로 되돌리지 않는다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "manual",
      idempotencyKey: "manual:naver:terminal-retry",
    });
    await repository.addItems(run.id, [{
      targetKey: "source:terminal",
      phase: "collect",
      lane: "naver",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);
    expect(await repository.completeItem(item!, { status: "succeeded" })).toBe(
      true,
    );

    expect(await repository.retryRun(run.id)).toEqual({
      kind: "not_retryable",
      status: "succeeded",
    });
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "succeeded",
      progress: { succeeded: 1, queued: 0 },
    });
    expect(await repository.claimPendingOutbox(run.id, 10)).toEqual([]);
  });

  it("실패한 run retry는 failed item과 outbox만 다시 queued로 만든다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "retention_prune",
      source: "manual",
      idempotencyKey: "manual:retention:retryable",
    });
    await repository.addItems(run.id, [{
      targetKey: "retention:retryable",
      phase: "prune",
      lane: "maintenance",
    }]);
    await repository.markRunFailed(run.id, "temporary_control_failure");

    const retry = await repository.retryRun(run.id);

    expect(retry).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    const pending = await repository.claimPendingOutbox(run.id, 10);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ lane: "maintenance" });
  });

  it("후속 조정 실패 retry는 terminal item을 재실행하지 않는 reconcile outbox를 만든다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "schedule_auto_update",
      source: "scheduled",
      idempotencyKey: "scheduled:auto-update:reconcile-retry",
    });
    await repository.addItems(run.id, [{
      targetKey: "channel:reconcile",
      phase: "scan",
      lane: "auto-update",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);
    expect(await repository.completeItem(item!, { status: "succeeded" })).toBe(
      true,
    );
    const [nextItemId] = await repository.addItems(run.id, [{
      targetKey: "member:1:date:2026-08-31",
      phase: "match",
      lane: "auto-update",
    }]);
    await repository.markRunFailed(
      run.id,
      "post_completion_reconciliation_failed:d1_unavailable",
      true,
    );

    expect(await repository.retryRun(run.id)).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    const reconciliation = await repository.claimPendingOutbox(run.id, 10);
    expect(reconciliation).toHaveLength(2);
    expect(reconciliation).toEqual(expect.arrayContaining([
      expect.objectContaining({ item_id: item!.id, lane: "auto-update" }),
      expect.objectContaining({ item_id: nextItemId, lane: "auto-update" }),
    ]));
    expect(await repository.claimItem(item!.id)).toBeNull();
    expect(await repository.claimItem(nextItemId!)).toMatchObject({
      status: "running",
    });
  });

  it("failed terminal item의 후속 조정 retry도 executor 재실행 대상으로 되돌리지 않는다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:failed-reconcile-retry",
    });
    await repository.addItems(run.id, [{
      targetKey: "handle:failed-reconcile",
      phase: "collect",
      lane: "x",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);
    expect(
      await repository.completeItem(item!, {
        status: "failed",
        error: "upstream_failed",
      }),
    ).toBe(true);
    await repository.markRunFailed(
      run.id,
      "post_completion_reconciliation_failed:d1_unavailable",
      true,
    );

    expect(await repository.retryRun(run.id)).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    const reconciliation = await repository.claimPendingOutbox(run.id, 10);
    expect(reconciliation).toHaveLength(1);
    expect(await repository.readItem(item!.id)).toMatchObject({
      status: "failed",
    });
    expect(await repository.claimItem(item!.id)).toBeNull();
  });

  it("last_error가 없는 partial run도 실패 item만 다시 dispatch한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "manual",
      idempotencyKey: "manual:naver:partial-retry",
    });
    await repository.addItems(run.id, [
      { targetKey: "source:ok", phase: "collect", lane: "naver" },
      { targetKey: "source:failed", phase: "collect", lane: "naver" },
    ]);
    const outbox = await repository.claimPendingOutbox(run.id, 2);
    expect(outbox).toHaveLength(2);
    for (const record of outbox) {
      await repository.markOutboxDispatched(record.id);
      const item = await repository.claimItem(record.item_id);
      await repository.completeItem(item!, {
        status: record.item_id === outbox[0]!.item_id ? "succeeded" : "failed",
        error: record.item_id === outbox[0]!.item_id ? null : "temporary",
      });
    }
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "partial",
      lastError: null,
    });

    expect(await repository.retryRun(run.id)).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    const retryOutbox = await repository.claimPendingOutbox(run.id, 10);
    expect(retryOutbox).toHaveLength(1);
    expect(retryOutbox[0]?.item_id).toBe(outbox[1]!.item_id);
  });

  it("모든 lane이 공유하는 Queue 5,000 operations 일일 한도를 원자 적용한다", async () => {
    const repository = createRepository();
    expect(await repository.reserveQueueOperations("x", 4_997)).toBe(true);
    expect(await repository.reserveQueueOperations("naver", 3)).toBe(true);
    expect(await repository.reserveQueueOperations("websub", 1)).toBe(false);
    expect(await repository.getQueueUsagePercent()).toBe(100);
  });

  it("Queue와 D1 read/write 일일 예산을 한 번에 예약하고 하나라도 초과하면 모두 거부한다", async () => {
    const repository = createRepository();
    expect(await repository.reserveDispatchBudget("x", {
      rowsRead: 1_999_500,
      rowsWritten: 39_950,
    })).toBe(true);
    expect(await repository.reserveDispatchBudget("naver", {
      rowsRead: 501,
      rowsWritten: 1,
    })).toBe(false);

    const rows = await db.prepare(
      `SELECT resource, used FROM scheduled_usage_daily
       ORDER BY resource`,
    ).all<{ resource: string; used: number }>();
    expect(rows.results).toEqual([
      { resource: "d1_rows_read", used: 1_999_500 },
      { resource: "d1_rows_written", used: 39_950 },
      { resource: "queue_operations", used: 3 },
    ]);
  });
});
