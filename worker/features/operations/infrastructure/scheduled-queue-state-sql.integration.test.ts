import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { SCHEDULED_QUEUE_STATE_SQL } from "./scheduled-queue-state-sql";

const testEnv = env as Env & { SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[] };
const db = testEnv.otw_db;
const now = Date.UTC(2026, 8, 9);

const insertRun = (id: string, status: string) => db.prepare(`
  INSERT INTO scheduled_job_runs (
    id, job_type, source, idempotency_key, status, accepted_at, created_at, updated_at
  ) VALUES (?, 'x_collection', 'scheduled', ?, ?, ?, ?, ?)`)
  .bind(id, id, status, now, now, now);

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.SCHEDULED_OPERATIONS_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM scheduled_outbox"),
    db.prepare("DELETE FROM scheduled_job_items"),
    db.prepare("DELETE FROM scheduled_job_runs"),
  ]);
});

const retainDeliveries = async (runId: string, count: number, status: string) => {
  await db.prepare(`WITH RECURSIVE history(n) AS (
    VALUES (1) UNION ALL SELECT n + 1 FROM history WHERE n < ?
  ) INSERT INTO scheduled_job_items (
    id, run_id, target_key, phase, lane, status, available_at, created_at, updated_at
  ) SELECT 'retained-' || n, ?, 'target-' || n, 'collect', 'x', 'succeeded', ?, ?, ? FROM history`)
    .bind(count, runId, now, now, now).run();
  await db.prepare(`INSERT INTO scheduled_outbox (
    id, run_id, item_id, lane, event_type, status, available_at, reconciled_at, created_at, updated_at
  ) SELECT id, run_id, id, lane, 'reconcile', ?, ?, ?, ?, ? FROM scheduled_job_items`)
    .bind(status, now, now, now, now).run();
};

describe("scheduled operations queue state", () => {
  it("skips retained pending reconciliation for completed runs while preserving global stale leases", async () => {
    await insertRun("closed", "succeeded").run();
    await retainDeliveries("closed", 2000, "pending");
    await db.prepare(`INSERT INTO scheduled_job_items (
      id, run_id, target_key, phase, lane, status, lease_until, available_at, created_at, updated_at
    ) VALUES ('stale', 'closed', 'stale', 'collect', 'x', 'running', ?, ?, ?, ?)`)
      .bind(now - 1, now, now, now).run();
    const result = await db.prepare(SCHEDULED_QUEUE_STATE_SQL).bind(now, now).all();
    expect(result.results).toEqual([{
      activeRunCount: 0, staleLeaseCount: 1, outboxBacklog: 0, oldestOutboxAvailableAt: null,
    }]);
    console.info("IDLE_QUEUE_D1_COST", JSON.stringify(result.meta));
    expect(result.meta.rows_read).toBeLessThanOrEqual(12);
    expect(result.meta.rows_written).toBe(0);
  });

  it("does not scan all completed items in a large active mostly-dispatched run", async () => {
    await insertRun("active", "running").run();
    await retainDeliveries("active", 2000, "dispatched");
    const result = await db.prepare(SCHEDULED_QUEUE_STATE_SQL).bind(now, now).all();
    expect(result.results).toEqual([{
      activeRunCount: 1, staleLeaseCount: 0, outboxBacklog: 0, oldestOutboxAvailableAt: null,
    }]);
    console.info("ACTIVE_QUEUE_D1_COST", JSON.stringify(result.meta));
    expect(result.meta.rows_read).toBeLessThanOrEqual(20);
    expect(result.meta.rows_written).toBe(0);
  });

  it("reads at most ten rows with no backlog and 2,130 retained deliveries under stale statistics", async () => {
    await insertRun("history", "succeeded").run();
    await db.prepare(`WITH RECURSIVE history(n) AS (
      VALUES (0) UNION ALL SELECT n + 1 FROM history WHERE n < 2129
    ) INSERT INTO scheduled_job_items (
      id, run_id, target_key, phase, lane, status, available_at, created_at, updated_at
    ) SELECT 'item-' || n, 'history', 'target-' || n, 'collect', 'x', 'succeeded',
      ?, ?, ? FROM history`).bind(now, now, now).run();
    const insertOutbox = `INSERT INTO scheduled_outbox (
      id, run_id, item_id, lane, event_type, status, available_at, created_at, updated_at
    ) SELECT 'outbox-' || id, run_id, id, lane, 'execute', 'dispatched', ?, ?, ?
      FROM scheduled_job_items ORDER BY id LIMIT ? OFFSET ?`;
    await db.prepare(insertOutbox).bind(now, now, now, 22, 0).run();
    await db.prepare("ANALYZE scheduled_outbox").run();
    await db.prepare(insertOutbox).bind(now, now, now, 2108, 22).run();

    const result = await db.prepare(SCHEDULED_QUEUE_STATE_SQL).bind(now, now).all();
    expect(result.results).toEqual([{
      activeRunCount: 0, staleLeaseCount: 0, outboxBacklog: 0,
      oldestOutboxAvailableAt: null,
    }]);
    expect(result.meta.rows_read).toBeLessThanOrEqual(10);
    expect(result.meta.rows_written).toBe(0);
  });

  it("keeps future retries and terminal-item reconciliation visible while excluding live leases and terminal runs", async () => {
    await db.batch([insertRun("active", "running"), insertRun("finished", "succeeded")]);
    const cases: Array<{
      status: string; itemStatus: string; event?: string;
      lease?: number | null; available?: number; run?: string;
    }> = [
      { status: "pending", itemStatus: "queued", available: now - 5000 },
      { status: "failed", itemStatus: "queued", available: now + 60_000 },
      { status: "dispatching", itemStatus: "queued", lease: now - 1 },
      { status: "dispatching", itemStatus: "queued", lease: now + 60_000 },
      { status: "dispatching", itemStatus: "queued", lease: null },
      { status: "dispatching", itemStatus: "queued", lease: now },
      { status: "dispatched", itemStatus: "queued" },
      { status: "pending", itemStatus: "succeeded" },
      ...["succeeded", "partial", "failed", "skipped", "throttled"].map(itemStatus => ({
        status: "pending", itemStatus, event: "reconcile",
      })),
      { status: "pending", itemStatus: "queued", event: "reconcile" },
      { status: "pending", itemStatus: "queued", run: "finished", available: now - 10_000 },
      { status: "pending", itemStatus: "running" },
    ];
    await db.batch(cases.flatMap((row, index) => {
      const id = `case-${index}`;
      const run = row.run ?? "active";
      return [
        db.prepare(`INSERT INTO scheduled_job_items (
          id, run_id, target_key, phase, lane, status, lease_until, available_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'collect', 'x', ?, ?, ?, ?, ?)`)
          .bind(id, run, id, row.itemStatus, now - 1, now, now, now),
        db.prepare(`INSERT INTO scheduled_outbox (
          id, run_id, item_id, lane, event_type, status, lease_until, available_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'x', ?, ?, ?, ?, ?, ?)`)
          .bind(id, run, id, row.event ?? "execute", row.status,
            row.lease ?? null, row.available ?? now, now, now),
      ];
    }));

    const result = await db.prepare(SCHEDULED_QUEUE_STATE_SQL).bind(now, now).all();
    expect(result.results).toEqual([{
      activeRunCount: 1, staleLeaseCount: 1, outboxBacklog: 8,
      oldestOutboxAvailableAt: now - 5000,
    }]);
    expect(result.meta.rows_written).toBe(0);
    const afterLease = await db.prepare(SCHEDULED_QUEUE_STATE_SQL)
      .bind(now + 1, now + 1).first();
    expect(afterLease).toMatchObject({ outboxBacklog: 9, oldestOutboxAvailableAt: now - 5000 });
  });
});
