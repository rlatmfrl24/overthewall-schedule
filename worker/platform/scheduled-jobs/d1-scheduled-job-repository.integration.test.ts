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
  it("keeps idle atomic outbox updates bounded after retained history outgrows planner statistics", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "ingestion_recovery", source: "scheduled", idempotencyKey: "retained-history",
    });
    await db.prepare(`WITH RECURSIVE history(n) AS (
      VALUES (0) UNION ALL SELECT n + 1 FROM history WHERE n < 2129
    ) INSERT INTO scheduled_job_items (
      id, run_id, target_key, phase, lane, status, available_at,
      finished_at, created_at, updated_at
    ) SELECT 'retained-item-' || n, ?, 'history:' || n, 'cleanup', 'ingestion',
        'succeeded', ?, ?, ?, ? FROM history`)
      .bind(run.id, timestamp, timestamp, timestamp, timestamp).run();
    const insertHistoryOutbox = `INSERT INTO scheduled_outbox (
      id, run_id, item_id, lane, event_type, status, attempts,
      available_at, dispatched_at, created_at, updated_at
    ) SELECT 'retained-outbox-' || id, run_id, id, lane, 'execute', 'dispatched',
        1, ?, ?, ?, ? FROM scheduled_job_items WHERE run_id = ?`;
    await db.prepare(`${insertHistoryOutbox} LIMIT 22`)
      .bind(timestamp, timestamp, timestamp, timestamp, run.id).run();
    // Production retained statistics for 22 outbox rows after the table grew
    // past 2,000. Without this stale-statistics condition the outer UPDATE
    // happened to use its PK in local tests and hid the production full scan.
    await db.prepare("ANALYZE scheduled_outbox").run();
    await db.prepare(`${insertHistoryOutbox} ON CONFLICT(id) DO NOTHING`)
      .bind(timestamp, timestamp, timestamp, timestamp, run.id).run();
    expect(await db.prepare(
      "SELECT stat FROM sqlite_stat1 WHERE idx = 'sqlite_autoindex_scheduled_outbox_1'",
    ).first("stat")).toBe("22 1");
    await db.batch([
      db.prepare("UPDATE scheduled_job_runs SET status = 'succeeded', finished_at = ?").bind(timestamp),
    ]);
    timestamp += SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS + 1;

    const measurements: Array<{ operation: string; rowsRead: number; rowsWritten: number }> = [];
    let operation = "scoped-claim";
    const native = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
    const record = <T>(result: D1Result<T>) => {
      measurements.push({ operation,
        rowsRead: Number(result.meta.rows_read ?? 0),
        rowsWritten: Number(result.meta.rows_written ?? 0),
      });
      return result;
    };
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
      const wrapped = {
        bind: (...values: unknown[]) => wrap(statement.bind(...values)),
        all: async <T>() => record(await statement.all<T>()),
        run: async <T>() => record(await statement.run<T>()),
        first: statement.first.bind(statement),
        raw: statement.raw.bind(statement),
      } as D1PreparedStatement;
      native.set(wrapped, statement);
      return wrapped;
    };
    const measuredDb = {
      prepare: (sql: string) => wrap(db.prepare(sql)),
      batch: async <T>(statements: D1PreparedStatement[]) =>
        (await db.batch<T>(statements.map((statement) => native.get(statement) ?? statement))).map(record),
    } as D1Database;
    const measured = new D1ScheduledJobRepository(measuredDb, () => timestamp);

    expect(await measured.claimPendingOutbox(run.id, 8)).toEqual([]);
    operation = "global-claim";
    expect(await measured.claimPendingOutbox(undefined, 8)).toEqual([]);
    operation = "recovery-probe";
    expect(await measured.hasRecoveryWork()).toBe(false);
    operation = "recovery";
    expect(await measured.recoverStaleItems()).toBe(0);
    expect(measurements.filter((row) => row.operation === "scoped-claim")).toHaveLength(1);
    expect(measurements.filter((row) => row.operation === "global-claim")).toHaveLength(1);
    expect(measurements.filter((row) => row.operation === "recovery-probe")).toHaveLength(4);
    expect(measurements.filter((row) => row.operation === "recovery")).toHaveLength(4);
    expect(measurements.some((row) => row.rowsRead > 0)).toBe(true);
    for (const measurement of measurements) {
      expect(measurement.rowsRead, measurement.operation).toBeLessThanOrEqual(10);
      expect(measurement.rowsWritten, measurement.operation).toBe(0);
    }

    const activeRun = await repository.createRun({
      jobType: "x_collection", source: "scheduled", idempotencyKey: "after-retained-history",
    });
    await repository.addItems(activeRun.id, ["first", "second", "third"].map((targetKey) => ({
      targetKey, phase: "collect", lane: "x" as const,
    })));
    operation = "active-claim";
    const claimed = await measured.claimPendingOutbox(activeRun.id, 2);
    expect(claimed).toHaveLength(2);
    expect(claimed.every((row) => row.run_id === activeRun.id &&
      row.phase === "collect" && row.job_type === "x_collection")).toBe(true);
    expect(measurements.at(-1)?.rowsRead).toBeLessThanOrEqual(100);
    const remaining = await measured.claimPendingOutbox(undefined, 2);
    expect(remaining).toHaveLength(1);
    expect(new Set([...claimed, ...remaining].map((row) => row.id)).size).toBe(3);
    expect(measurements.at(-1)?.rowsRead).toBeLessThanOrEqual(100);
  });

  it("uses the same read-only recovery eligibility for pending, expired, and missing deliveries", async () => {
    const repository = createRepository();
    const readOnly = new D1ScheduledJobRepository({
      prepare(sql: string) {
        expect(sql.trim()).toMatch(/^SELECT\b/i);
        return db.prepare(sql);
      },
      batch: db.batch.bind(db),
    } as D1Database, () => timestamp);
    const run = await repository.createRun({
      jobType: "x_collection", source: "scheduled", idempotencyKey: "recovery-eligibility",
    });
    expect(await readOnly.hasRecoveryWork()).toBe(false);
    await repository.addItems(run.id, [{ targetKey: "target", phase: "collect", lane: "x" }]);
    expect(await readOnly.hasRecoveryWork()).toBe(true);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    expect(await repository.hasRecoveryWork()).toBe(false);
    await repository.markOutboxDispatched(outbox.id);
    expect(await repository.hasRecoveryWork()).toBe(false);
    timestamp += SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS;
    expect(await repository.hasRecoveryWork()).toBe(true);
    expect(await repository.recoverStaleItems()).toBe(1);
    await db.prepare("DELETE FROM scheduled_outbox WHERE id = ?").bind(outbox.id).run();
    expect(await repository.hasRecoveryWork()).toBe(true);
    expect(await repository.recoverStaleItems()).toBe(1);
  });

  it("keeps failed and expired dispatches eligible while respecting future and live leases", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "x_collection", source: "scheduled", idempotencyKey: "dispatch-status-eligibility",
    });
    const targets = ["pending", "failed", "expired", "leased", "future", "null-lease", "delivered"];
    await repository.addItems(run.id, targets.map((targetKey) => ({ targetKey, phase: "collect", lane: "x" as const })));
    const updateOutbox = (target: string, status: string, availableAt: number, leaseUntil: number | null) =>
      db.prepare(`UPDATE scheduled_outbox SET status = ?, available_at = ?, lease_until = ?
        WHERE item_id = (SELECT id FROM scheduled_job_items WHERE run_id = ? AND target_key = ?)`)
        .bind(status, availableAt, leaseUntil, run.id, target);
    await db.batch([
      updateOutbox("failed", "failed", timestamp, null),
      updateOutbox("expired", "dispatching", timestamp, timestamp - 1),
      updateOutbox("leased", "dispatching", timestamp, timestamp),
      updateOutbox("future", "pending", timestamp + 1, null),
      updateOutbox("null-lease", "dispatching", timestamp, null),
      updateOutbox("delivered", "dispatched", timestamp, null),
    ]);
    const expected = await db.prepare(`SELECT id FROM scheduled_job_items
      WHERE run_id = ? AND target_key IN ('pending', 'failed', 'expired') ORDER BY id`).bind(run.id).all<{ id: string }>();
    const claimed = await repository.claimPendingOutbox(run.id, 20);
    expect(claimed.map((row) => row.item_id).sort()).toEqual(expected.results.map((row) => row.id).sort());
  });

  it("exposes source-health retry partials in the operation failure readback", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "source_health", source: "scheduled", idempotencyKey: "source-health-retry",
    });
    await repository.addItems(run.id, [{ targetKey: "due:0", phase: "check", lane: "youtube-critical" }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox.id);
    const item = await repository.claimItem(outbox.item_id);
    expect(await repository.completeItem(item!, {
      status: "partial", result: { claimed: 2, checked: 0, failed: 0, retryScheduled: 2 },
      errorCode: "source_health_retry_pending", error: "2 sources are waiting for retry",
    })).toBe(true);
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "partial",
      failures: [{ code: "source_health_retry_pending", message: "2 sources are waiting for retry" }],
    });
    expect((await repository.readLatestSuccessfulRunTimes()).some((row) => row.jobType === "source_health")).toBe(false);
  });

  it("reads every X shard result without normalizing partials or inventing missing hydration", async () => {
    const repository = createRepository();
    const run = await repository.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "x-observability" });
    await repository.addItems(run.id, ["succeeded", "partial", "failed", "skipped"].map((status) => ({
      targetKey: status, phase: "collect", lane: "x" as const,
    })));
    const hydration = { status: "deferred", scanned: 1, hydrated: 0, authorsResolved: 0, deferred: 1, failed: 0, terminal: 0, coalesced: 0, retryAt: timestamp + 1000, errorCode: "preview_budget_exceeded" };
    for (const status of ["succeeded", "partial", "failed", "skipped"]) {
      const result = status === "failed" ? "invalid-json" : JSON.stringify({
        status: status === "skipped" ? "skipped" : "success", checkedHandles: 4, refreshedHandles: status === "skipped" ? 0 : 4,
        postsReturned: 3, postsStored: 3,
        ...(status === "succeeded" ? {} : { referenceHydration: status === "partial" ? { ...hydration, scope: "quotes", status: "failed", failed: 1, errorCode: "x_api_503" } : hydration }),
      });
      await db.prepare("UPDATE scheduled_job_items SET status=?,result_json=? WHERE run_id=? AND target_key=?").bind(status, result, run.id, status).run();
    }
    await db.prepare("UPDATE scheduled_job_runs SET status='partial' WHERE id=?").bind(run.id).run();
    const before = await db.prepare("SELECT * FROM scheduled_job_items ORDER BY id").all();
    const readOnly = new D1ScheduledJobRepository({ prepare(sql: string) {
      expect(sql.trim()).toMatch(/^SELECT\b/i);
      return db.prepare(sql);
    } } as D1Database);
    const result = await readOnly.readRunDto(run.id);
    expect(result?.status).toBe("partial");
    expect(result?.xCollection?.items).toHaveLength(4);
    expect(result?.xCollection?.items.find((item) => item.status === "partial")).toMatchObject({ collection: { status: "success", postsStored: 3 }, referenceHydration: { scope: "quotes", status: "failed", failed: 1 } });
    expect(result?.xCollection?.items.find((item) => item.status === "skipped")?.referenceHydration?.scope).toBeUndefined();
    expect(result?.xCollection?.items.find((item) => item.status === "skipped")).toMatchObject({ collection: { status: "skipped" }, referenceHydration: { status: "deferred" } });
    expect(result?.xCollection?.items.find((item) => item.status === "succeeded")?.referenceHydration).toBeNull();
    expect(result?.xCollection?.items.find((item) => item.status === "failed")?.collection).toBeNull();
    expect((await readOnly.listRunDtos({ jobType: "x_collection", limit: 10 }))[0]?.xCollection).toEqual(result?.xCollection);
    expect((await db.prepare("SELECT * FROM scheduled_job_items ORDER BY id").all()).results).toEqual(before.results);
  });

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

  it("terminal run에 남은 outbox는 다시 claim하지 않는다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:terminal-outbox",
    });
    await repository.addItems(run.id, [{
      targetKey: "handle:terminal",
      phase: "collect",
      lane: "x",
    }]);
    await repository.skipRun(run.id, "operator_closed");
    await db.prepare(
      `UPDATE scheduled_outbox
       SET status = 'failed', last_error = 'historical_failure'
       WHERE run_id = ?`,
    ).bind(run.id).run();

    expect(await repository.claimPendingOutbox(run.id, 10)).toEqual([]);
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

    const concurrentClaims = await Promise.all([
      repository.claimPendingOutbox(run.id, 10),
      repository.claimPendingOutbox(undefined, 10),
    ]);
    expect(concurrentClaims.map((claim) => claim.length).sort()).toEqual([0, 1]);
    const duplicateClaim = await repository.claimPendingOutbox(run.id, 10);
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

  it("오류와 미완료가 없는 YouTube partial을 succeeded로 정규화한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "youtube_feed_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:youtube:resolved-partial",
    });
    await repository.addItems(run.id, [{
      targetKey: "youtube-feed",
      phase: "collect",
      lane: "maintenance",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);

    expect(await repository.completeItem(item!, {
      status: "partial",
      result: { status: "partial", attempted: 1, succeeded: 1, failed: 0 },
    })).toBe(true);

    expect(await repository.readRun(run.id)).toMatchObject({
      status: "succeeded",
    });
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "succeeded",
      progress: { total: 1, succeeded: 1, failed: 0 },
      failures: [],
    });

    await db.prepare(
      "UPDATE scheduled_job_runs SET status = 'partial' WHERE id = ?",
    ).bind(run.id).run();
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "succeeded",
      progress: { total: 1, succeeded: 1, failed: 0 },
    });
    expect((await repository.listRunDtos({
      status: "succeeded",
      limit: 10,
    })).map((entry) => entry.runId)).toContain(run.id);
    expect((await repository.listRunDtos({
      status: "partial",
      limit: 10,
    })).map((entry) => entry.runId)).not.toContain(run.id);
    expect(await repository.readLatestSuccessfulRunTimes()).toContainEqual({
      jobType: "youtube_feed_collection",
      latestSuccessAt: timestamp,
    });
  });

  it("작업별 최신 점검과 과거의 마지막 성공 시각을 서로 분리한다", async () => {
    const repository = createRepository();
    const succeeded = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:succeeded",
    });
    await repository.addItems(succeeded.id, [{
      targetKey: "handle:member",
      phase: "collect",
      lane: "x",
    }]);
    const [outbox] = await repository.claimPendingOutbox(succeeded.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);
    expect(await repository.completeItem(item!, { status: "succeeded" })).toBe(true);
    const latestSuccessAt = timestamp;

    timestamp += 60_000;
    const neutralSkip = await repository.createRun({
      jobType: "x_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:x:not-due",
    });
    await repository.skipRun(neutralSkip.id, "all_handles_cooldown");

    timestamp += 60_000;
    const failed = await repository.createRun({
      jobType: "naver_cafe_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:naver:failed",
    });
    await repository.markRunFailed(failed.id, "upstream_unavailable");

    const latestByType = await repository.listLatestRunDtosByJobType();
    expect(latestByType.find((run) => run.jobType === "x_collection")).toMatchObject({
      runId: neutralSkip.id,
      status: "skipped",
      summary: { reason: "all_handles_cooldown" },
    });
    expect(latestByType.find((run) => run.jobType === "naver_cafe_collection")).toMatchObject({
      runId: failed.id,
      status: "failed",
    });
    expect(await repository.readLatestSuccessfulRunTimes()).toContainEqual({
      jobType: "x_collection",
      latestSuccessAt,
    });
  });

  it("실제 소스 실패가 있는 YouTube partial과 내부 진행률을 보존한다", async () => {
    const repository = createRepository();
    const run = await repository.createRun({
      jobType: "youtube_feed_collection",
      source: "scheduled",
      idempotencyKey: "scheduled:youtube:true-partial",
    });
    await repository.addItems(run.id, [{
      targetKey: "youtube-feed",
      phase: "collect",
      lane: "maintenance",
    }]);
    const [outbox] = await repository.claimPendingOutbox(run.id, 1);
    await repository.markOutboxDispatched(outbox!.id);
    const item = await repository.claimItem(outbox!.item_id);

    expect(await repository.completeItem(item!, {
      status: "partial",
      result: { status: "partial", attempted: 5, succeeded: 4, failed: 1 },
      errorCode: "youtube_feed_collection_failed",
      error: "YouTube feed collection failed for 1 of 5 sources",
    })).toBe(true);

    expect(await repository.readRun(run.id)).toMatchObject({
      status: "partial",
    });
    const counters = await db.prepare(
      `SELECT total_items AS total, completed_items AS completed,
              failed_items AS failed
       FROM scheduled_job_runs WHERE id = ?`,
    ).bind(run.id).first<{ total: number; completed: number; failed: number }>();
    expect(counters).toEqual({ total: 5, completed: 5, failed: 1 });
    expect(await repository.readRunDto(run.id)).toMatchObject({
      status: "partial",
      progress: { total: 5, succeeded: 4, failed: 1 },
      failures: [{
        code: "youtube_feed_collection_failed",
        message: "YouTube feed collection failed for 1 of 5 sources",
      }],
    });
    expect((await repository.listRunDtos({
      status: "partial",
      limit: 10,
    })).map((entry) => entry.runId)).toContain(run.id);
    expect((await repository.listRunDtos({
      status: "succeeded",
      limit: 10,
    })).map((entry) => entry.runId)).not.toContain(run.id);

    expect(await repository.retryRun(run.id)).toMatchObject({
      kind: "accepted",
      run: { status: "queued" },
    });
    expect(await repository.readItem(item!.id)).toMatchObject({
      status: "queued",
      last_error_code: null,
      last_error: null,
    });
    const retryOutbox = await repository.claimPendingOutbox(run.id, 10);
    expect(retryOutbox).toHaveLength(1);
    expect(retryOutbox[0]?.item_id).toBe(item!.id);
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

  it("제거된 legacy job type은 조회 DTO와 retry 경로에서 차단한다", async () => {
    const repository = createRepository();
    await db.prepare(
      `INSERT INTO scheduled_job_runs (
         id, job_type, source, idempotency_key, status, accepted_at,
         last_error, created_at, updated_at
       ) VALUES (?, 'x_metrics_refresh', 'scheduled', ?, 'failed', ?, ?, ?, ?)`,
    ).bind(
      "legacy-x-metrics",
      "scheduled:x-metrics:legacy",
      timestamp,
      "legacy_job_type_removed",
      timestamp,
      timestamp,
    ).run();

    expect(await repository.readRunDto("legacy-x-metrics")).toBeNull();
    expect(await repository.retryRun("legacy-x-metrics")).toEqual({
      kind: "not_retryable",
      status: "failed",
    });
    const row = await db.prepare(
      "SELECT status FROM scheduled_job_runs WHERE id = ?",
    ).bind("legacy-x-metrics").first<{ status: string }>();
    expect(row?.status).toBe("failed");
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
