import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { D1ScheduleImageBudget } from "./d1-schedule-image-budget";

const db = env.otw_db;
beforeAll(async () => applyD1Migrations(db, (env as unknown as { IMAGE_IMPORT_MIGRATIONS: D1Migration[] }).IMAGE_IMPORT_MIGRATIONS));
beforeEach(async () => { await db.prepare("DELETE FROM schedule_image_reads").run(); });
it("reserves_site_budget_atomically_before_inference and enforces_approved_budget_under_concurrency", async () => {
  const budget = new D1ScheduleImageBudget(db, "otw");
  const results = await Promise.all(Array.from({ length: 50 }, (_, i) => budget.reserve(`user-${i}`, Date.now())));
  expect(results.filter(Boolean).length).toBe(40);
  expect(await db.prepare("SELECT SUM(reserved_nano_usd) AS total FROM schedule_image_reads").first("total")).toBe(490000000);
  expect(await new D1ScheduleImageBudget(db, "luvdia").reserve("other-site", Date.now())).not.toBeNull();
});
it("counts_manual_retries_and_limits_ten_daily_one_active_per_account", async () => {
  const budget = new D1ScheduleImageBudget(db, "otw");
  const [a, b] = await Promise.all([budget.reserve("user", Date.now()), budget.reserve("user", Date.now())]);
  expect([a, b].filter(Boolean)).toHaveLength(1);
  const first = (a ?? b)!;
  await budget.start(first); await budget.settle(first, { inputTokens: 1, outputTokens: 1 });
  for (let i = 1; i < 10; i++) { const id = await budget.reserve("user", Date.now()); expect(id).not.toBeNull(); await budget.start(id!); await budget.finishUnknown(id!); }
  expect(await budget.reserve("user", Date.now())).toBeNull();
});
it("retains_uncertain_cost_after_timeout", async () => {
  const budget = new D1ScheduleImageBudget(db, "otw");
  const id = (await budget.reserve("user", Date.now()))!;
  await budget.start(id); await budget.finishUnknown(id);
  expect(await db.prepare("SELECT reserved_nano_usd, cost_nano_usd, started FROM schedule_image_reads WHERE id=?").bind(id).first()).toEqual({ reserved_nano_usd: 12250000, cost_nano_usd: null, started: 1 });
});
