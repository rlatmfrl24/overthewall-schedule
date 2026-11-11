import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { D1ScheduledJobRepository, ScheduledRunClient } from "../../../platform/scheduled-jobs";
import { siteEnv } from "../../../test-support/site-env";
import { handleWorkerQueue } from "../../../app/worker-queue";
import { meterD1 } from "../../../test-support/d1-meter";

const bindings = { ...env, SITE_ID: "otw" } as Env & { X_REFERENCE_MIGRATIONS: D1Migration[]; SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[] };
const db = bindings.otw_db;
const time = Date.parse("2026-11-03T00:23:00Z");

beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(time);
  await applyD1Migrations(db, [...new Map([...bindings.X_REFERENCE_MIGRATIONS, ...bindings.SCHEDULED_OPERATIONS_MIGRATIONS].map(migration => [migration.name, migration])).values()]);
  await db.batch([...["scheduled_outbox", "scheduled_job_items", "scheduled_job_runs", "scheduled_usage_daily"].map(table => db.prepare(`DELETE FROM ${table}`))]);
});
afterEach(() => vi.restoreAllMocks());

it("does not dispatch a new retry with an older successful control admission", async () => {
  const repo = new D1ScheduledJobRepository(db);
  const controlSend = vi.fn().mockResolvedValue(undefined), backgroundSend = vi.fn().mockResolvedValue(undefined);
  const runtime = { ...bindings, ...siteEnv(), OTW_OPS_CONTROL_QUEUE: { send: controlSend } as unknown as Queue<unknown>, OTW_OPS_BACKGROUND_QUEUE: { send: backgroundSend } as unknown as Queue<unknown> };
  const budget = (used: number) => db.prepare("INSERT OR REPLACE INTO scheduled_usage_daily(day,lane,resource,reserved,used,limit_value,updated_at) VALUES('2026-11-03','all','queue_operations',0,?,5000,?)").bind(used, time).run();
  const run = await repo.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: "stale-successful-control" });
  const [id] = await repo.addItems(run.id, [{ targetKey: "member_a", phase: "collect", lane: "x", continuation: { provider: "fxembed", mode: "rss_candidates", handles: ["member_a"] } }]);
  await repo.completeItem((await repo.claimItem(id))!, { status: "failed" }, true);
  await repo.retryRun(run.id);
  await budget(4744);
  const control = () => ({ queue: "otw-ops-control", messages: [{ body: { schemaVersion: 1, messageType: "scheduled_job_control", runId: run.id, deliveryGeneration: 1 }, ack: vi.fn(), retry: vi.fn() }] }) as unknown as MessageBatch<unknown>;
  const original = D1ScheduledJobRepository.prototype.getBackgroundUsagePercent;
  vi.spyOn(D1ScheduledJobRepository.prototype, "getBackgroundUsagePercent").mockImplementationOnce(async function (this: D1ScheduledJobRepository) {
    const admittedUsage = await original.call(this);
    await budget(4750);
    await handleWorkerQueue(control(), runtime);
    expect((await repo.readRun(run.id))?.status).toBe("throttled");
    await new ScheduledRunClient(runtime).retryRun(run.id);
    return admittedUsage;
  });
  const meter = meterD1(db, 50), message = control();
  await handleWorkerQueue(message, { ...runtime, otw_db: meter.db });
  expect(backgroundSend).not.toHaveBeenCalled();
  expect(controlSend).toHaveBeenCalledOnce();
  expect((await repo.readItem(id))?.status).toBe("queued");
  expect(JSON.parse((await repo.readRun(run.id))!.summary_json!).controlGeneration).toBe(2);
  expect(await db.prepare("SELECT used FROM scheduled_usage_daily WHERE resource='queue_operations'").first("used")).toBe(4753);
  expect(message.messages[0].ack).toHaveBeenCalledOnce();
  expect(meter.quotaDenials).toBe(0);
});
