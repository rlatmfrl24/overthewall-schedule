import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { applyD1Migrations, env, introspectWorkflow } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { handleScheduledWorkflowCron, SCHEDULED_WORKFLOW_CRON } from "../../../app/scheduled-workflow-cron";
import type { Env } from "../../../platform/types";
import type { ScheduledOperationsWorkflowParams } from "@contracts/scheduled-operations";
import { siteEnv } from "../../../test-support/site-env";

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
