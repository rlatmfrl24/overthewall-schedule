import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { applyD1Migrations, env, introspectWorkflow } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { handleScheduledWorkflowCron, SCHEDULED_WORKFLOW_CRON } from "../../../app/scheduled-workflow-cron";
import type { Env } from "../../../platform/types";
import type { ScheduledOperationsWorkflowParams } from "@contracts/scheduled-operations";
import { siteEnv } from "../../../test-support/site-env";
import { getDb } from "../../../platform/db";
import { recordAutoUpdateResultWithHistory, type AutoUpdateResult } from "../../schedules/infrastructure/auto-update-runs";

const bindings = env as unknown as Env & {
  NATIVE_SCHEDULED_WORKFLOW: Workflow<ScheduledOperationsWorkflowParams>;
  NATIVE_WORKFLOW_PROVIDER: Fetcher;
};
const db = bindings.otw_db;

beforeAll(async () => {
  for (const migration of (await readSiteSchemaMigrations())) {
    if (migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) => db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000 - index, code, "migration bootstrap")));
    await applyD1Migrations(db, [migration]);
  }
}, 120000);

it("completes the ordinary Cron, native Workflow and native Queue without creating transfer responsibility", async () => {
  const inspector = await introspectWorkflow(bindings.NATIVE_SCHEDULED_WORKFLOW);
  const started = Date.now();
  const scheduledFor = Math.floor(started / 3600000) * 3600000 + 180000;
  const channel = "e".repeat(32);
  await db.batch([
    db.prepare("UPDATE members SET url_chzzk=NULL"),
    db.prepare("INSERT INTO members(uid,code,name,url_chzzk) VALUES(900001,'workflow_owner','Workflow owner',?)").bind(`https://chzzk.naver.com/${channel}`),
    ...["auto_update_enabled", "scheduled_v2_schedule_auto_update_enabled"].map(key => db.prepare("INSERT INTO settings(key,value) VALUES(?,'true') ON CONFLICT(key) DO UPDATE SET value='true'").bind(key)),
    db.prepare("INSERT INTO settings(key,value) VALUES('auto_update_last_run','0') ON CONFLICT(key) DO UPDATE SET value='0'"),
  ]);
  const runtime = { ...bindings, ...siteEnv("otw"), SCHEDULED_OPERATIONS_WORKFLOW: bindings.NATIVE_SCHEDULED_WORKFLOW } as unknown as Env;
  try {
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: scheduledFor } as ScheduledController, runtime);
    const instances = await inspector.get();
    expect(instances).toHaveLength(1);
    await instances[0].waitForStatus("complete");
    const output = await instances[0].getOutput() as { id: string; source: string };
    expect(output.source).toBe("scheduled");
    await expect.poll(() => db.prepare("SELECT status FROM scheduled_job_runs WHERE id=?").bind(output.id).first("status"), { timeout: 20000, interval: 100 }).toBe("succeeded");
    expect(await db.prepare("SELECT count(*) n FROM pending_schedules WHERE vod_id='chzzk:native-workflow-original'").first("n")).toBe(1);
    const items = (await db.prepare("SELECT phase,status,result_json FROM scheduled_job_items WHERE run_id=?").bind(output.id).all()).results;
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.every(item => item.status === "succeeded" && item.result_json !== null)).toBe(true);
    expect(await db.prepare("SELECT count(*) n FROM auto_update_runs WHERE source='scheduled' AND started_at>=?").bind(started).first("n")).toBe(1);
    expect(await db.prepare("SELECT count(*) n FROM content_transitions").first("n")).toBe(0);
    expect(await db.prepare("SELECT count(*) n FROM content_transition_operations").first("n")).toBe(0);
    const calls = await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json<string[]>();
    expect(calls[0]).toBe(`GET https://api.chzzk.naver.com/service/v1/channels/${channel}/videos?sortType=LATEST&pagingType=PAGE&page=0&size=5`);
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: scheduledFor } as ScheduledController, runtime);
    expect(await inspector.get()).toHaveLength(1);
    expect(await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json()).toEqual(calls);
  } finally {
    await inspector.dispose();
  }
}, 60000);

it("finalizes and replays an ordinary scheduled receipt without consulting retired execution tables", async () => {
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO scheduled_job_runs(id,job_type,source,status,scheduled_for,idempotency_key,accepted_at,created_at,updated_at) VALUES('owning-finalizer','schedule_auto_update','scheduled','running',?,'owning-finalizer',?,?,?)").bind(now, now, now, now),
    db.prepare("INSERT INTO scheduled_job_items(id,run_id,target_key,phase,lane,status,lease_token,available_at,created_at,updated_at) VALUES('owning-finalizer-item','owning-finalizer','finalize','finalize','background','running','owning-lease',?,?,?)").bind(now, now, now),
  ]);
  const owningDatabase = new Proxy(db, { get(target, property) {
    if (property === "prepare") return (sql: string) => {
      if (/\bcontent_transition_chzzk_/.test(sql)) throw new Error("Ordinary finalization consulted retired execution state");
      return target.prepare(sql);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const database = getDb({ ...bindings, otw_db: owningDatabase } as Env);
  const result: AutoUpdateResult = { updated: 0, checked: 0, segmentCount: 0, sessionCount: 0, resumeMergedCount: 0, rejectedSuppressed: 0, duplicatePending: 0, shortSuppressed: 0, holidaySuppressed: 0, ambiguous: 0, obsoletePending: 0, details: [] };
  const options = { source: "scheduled" as const, rangeDays: 3, originalItem: { id: "owning-finalizer-item", runId: "owning-finalizer", leaseToken: "owning-lease" } };
  const before = await db.prepare("SELECT count(*) n FROM auto_update_runs").first<number>("n");
  await expect(recordAutoUpdateResultWithHistory(database, { ...options, originalItem: { ...options.originalItem, leaseToken: "stale-lease" } }, result, now)).rejects.toThrow();
  await db.prepare("INSERT INTO scheduled_job_items(id,run_id,target_key,phase,lane,status,available_at,created_at,updated_at) VALUES('owning-pending-match','owning-finalizer','member','match','background','queued',?,?,?)").bind(now, now, now).run();
  await expect(recordAutoUpdateResultWithHistory(database, options, result, now)).rejects.toThrow();
  expect(await db.prepare("SELECT count(*) n FROM auto_update_runs").first("n")).toBe(before);
  expect(await db.prepare("SELECT result_json FROM scheduled_job_items WHERE id='owning-finalizer-item'").first("result_json")).toBeNull();
  await db.prepare("DELETE FROM scheduled_job_items WHERE id='owning-pending-match'").run();
  await expect(recordAutoUpdateResultWithHistory(database, options, result, now)).resolves.toEqual(result);
  await expect(recordAutoUpdateResultWithHistory(database, options, result, now)).resolves.toEqual(result);
  expect(await db.prepare("SELECT count(*) n FROM auto_update_runs").first("n")).toBe(before! + 1);
  expect(JSON.parse((await db.prepare("SELECT result_json FROM scheduled_job_items WHERE id='owning-finalizer-item'").first<string>("result_json"))!)).toEqual(result);
});
