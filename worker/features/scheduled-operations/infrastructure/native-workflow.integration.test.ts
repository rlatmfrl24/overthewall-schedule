import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { applyD1Migrations, env, introspectWorkflow } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
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

beforeEach(async () => { await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/reset"); });

it.each(["x_collection", "naver_cafe_collection", "youtube_feed_collection"] as const)("persists %s cadence through ordinary Cron, native Workflow and Queue", async jobType => {
  const started = Date.now(), minute = jobType === "naver_cafe_collection" ? 13 : 23;
  let slot = Math.floor(started / 3_600_000) * 3_600_000 + minute * 60_000;
  if (slot > started) slot -= 3_600_000;
  const channel = `UC${"C".repeat(22)}`, inspector = await introspectWorkflow(bindings.NATIVE_SCHEDULED_WORKFLOW);
  await db.batch([
    db.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled'"),
    db.prepare("UPDATE members SET url_twitter=NULL,youtube_channel_id=NULL,url_chzzk=NULL"),
    db.prepare("UPDATE member_links SET youtube_channel_id=NULL"),
    db.prepare("UPDATE naver_cafe_sources SET enabled=0"),
    db.prepare("DELETE FROM youtube_feed_videos"), db.prepare("DELETE FROM youtube_feed_sources"), db.prepare("DELETE FROM kirinuki_channels"),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter,youtube_channel_id) VALUES(900050,'native_collect','Native collector','https://x.com/native_collect',?) ON CONFLICT(uid) DO UPDATE SET url_twitter=excluded.url_twitter,youtube_channel_id=excluded.youtube_channel_id").bind(channel),
    ...[[`scheduled_v2_${jobType}_enabled`, "true"], ["x_collection_enabled", "true"], ["x_collection_interval_hours", "0.5"],
      ["x_cost_optimizer_enabled", "true"], ["x_reference_preview_mode", "link_only"], ["x_collection_last_run", "0"], ["otw_play_automation_paused", "true"]]
      .map(([key, value]) => db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, value)),
  ]);
  if (jobType === "x_collection") await db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at,initialization_completed_at,next_check_at) VALUES('native_collect','native-collector-user','native_collect','100',0,0,1,1,0)").run();
  if (jobType === "naver_cafe_collection") await db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_id,menu_id,cafe_url,member_uid,enabled,collection_started_at,initialization_completed_at,last_seen_article_id) VALUES(900050,'Native cafe','98765432','1','https://cafe.naver.com/native',900050,1,1,1,1)").run();
  if (jobType === "youtube_feed_collection") await db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,uploads_playlist_id,collection_started_at,initialization_completed_at,backfill_exhausted_at,next_check_at,created_at,updated_at) VALUES(900050,'official',900050,?,'native-uploads',1,1,1,0,1,1)").bind(channel).run();
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => bindings.NATIVE_WORKFLOW_PROVIDER.fetch(input, init));
  const runtime = { ...bindings, CLOUDFLARE_ACCOUNT_ID: "native-test", CLOUDFLARE_D1_TOKEN: "native-test", YOUTUBE_API_KEY: "native-fixture", ...siteEnv(), SCHEDULED_OPERATIONS_WORKFLOW: bindings.NATIVE_SCHEDULED_WORKFLOW } as unknown as Env;
  try {
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: slot } as ScheduledController, runtime);
    const instances = await inspector.get();
    expect(instances.length).toBeGreaterThan(0);
    await Promise.all(instances.map(instance => instance.waitForStatus("complete")));
    await expect.poll(() => db.prepare("SELECT status FROM scheduled_job_runs WHERE job_type=? AND scheduled_for=?").bind(jobType, slot).first("status"), { timeout: 20_000, interval: 100 }).toBe("succeeded");
    const run = await db.prepare("SELECT id,finished_at FROM scheduled_job_runs WHERE job_type=? AND scheduled_for=?").bind(jobType, slot).first<{ id: string; finished_at: number }>();
    expect(run!.finished_at).toBeGreaterThanOrEqual(started);
    if (jobType === "x_collection") {
      await expect.poll(async () => JSON.parse(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first<string>("value") ?? "null")?.anchorAt, { timeout: 5_000 }).toBe(slot);
      expect(await db.prepare("SELECT last_seen_post_id,next_check_at,lease_token FROM x_post_sources WHERE handle='native_collect'").first()).toEqual({ last_seen_post_id: "200", next_check_at: slot + 30 * 60_000, lease_token: null });
      expect(await db.prepare("SELECT count(*) n FROM x_posts WHERE handle='native_collect'").first("n")).toBe(1);
    } else if (jobType === "naver_cafe_collection") {
      expect(await db.prepare("SELECT cadence_anchor_at FROM naver_cafe_sources WHERE id=900050").first("cadence_anchor_at")).toBe(slot);
      expect(await db.prepare("SELECT article_id FROM naver_cafe_posts WHERE source_id=900050").first("article_id")).toBe(200);
    } else {
      expect(await db.prepare("SELECT next_check_at FROM youtube_feed_sources WHERE id=900050").first("next_check_at")).toBe(slot + 6 * 3_600_000);
      expect(await db.prepare("SELECT video_id FROM youtube_feed_videos WHERE source_id=900050").first("video_id")).toBe("NCadence001");
    }
    expect((await db.prepare("SELECT status FROM scheduled_job_items WHERE run_id=?").bind(run!.id).all()).results.every(row => row.status === "succeeded")).toBe(true);
    const calls = await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json();
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: slot } as ScheduledController, runtime);
    expect(await db.prepare("SELECT count(*) n FROM scheduled_job_runs WHERE job_type=? AND scheduled_for=?").bind(jobType, slot).first("n")).toBe(1);
    expect(await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json()).toEqual(calls);
    console.info("NATIVE_COLLECTOR_READBACK", JSON.stringify({ jobType, scheduledFor: slot, runId: run!.id, finishedAt: run!.finished_at }));
  } finally { vi.unstubAllGlobals(); await inspector.dispose(); }
}, 60_000);

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
  vi.stubGlobal("fetch",(input:RequestInfo|URL,init?:RequestInit)=>bindings.NATIVE_WORKFLOW_PROVIDER.fetch(input,init));
  const runtime = { ...bindings, CLOUDFLARE_ACCOUNT_ID:"native-test", CLOUDFLARE_D1_TOKEN:"native-test", ...siteEnv("otw"), SCHEDULED_OPERATIONS_WORKFLOW: bindings.NATIVE_SCHEDULED_WORKFLOW } as unknown as Env;
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
    vi.unstubAllGlobals();
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
  await db.prepare("INSERT INTO pending_schedules(member_uid,member_name,date,status,action_type,candidate_kind) VALUES(999999,'Other','2020-01-01','휴방','create','holiday_suggestion')").run();
  const options = { holidaySiteId: "otw" as const, source: "scheduled" as const, rangeDays: 3, originalItem: { id: "owning-finalizer-item", runId: "owning-finalizer", leaseToken: "owning-lease" } };
  const before = await db.prepare("SELECT count(*) n FROM auto_update_runs").first<number>("n");
  await expect(recordAutoUpdateResultWithHistory(database, { ...options, originalItem: { ...options.originalItem, leaseToken: "stale-lease" } }, result, now)).rejects.toThrow();
  await db.prepare("INSERT INTO scheduled_job_items(id,run_id,target_key,phase,lane,status,available_at,created_at,updated_at) VALUES('owning-pending-match','owning-finalizer','member','match','background','queued',?,?,?)").bind(now, now, now).run();
  await expect(recordAutoUpdateResultWithHistory(database, options, result, now)).rejects.toThrow();
  expect(await db.prepare("SELECT count(*) n FROM auto_update_runs").first("n")).toBe(before);
  expect(await db.prepare("SELECT result_json FROM scheduled_job_items WHERE id='owning-finalizer-item'").first("result_json")).toBeNull();
  expect(await db.prepare("SELECT count(*) n FROM pending_schedules WHERE member_uid=999999").first("n")).toBe(1);
  await db.prepare("DELETE FROM scheduled_job_items WHERE id='owning-pending-match'").run();
  await expect(recordAutoUpdateResultWithHistory(database, options, result, now)).resolves.toEqual({...result,obsoletePending:1});
  await expect(recordAutoUpdateResultWithHistory(database, options, result, now)).resolves.toEqual({...result,obsoletePending:1});
  expect(await db.prepare("SELECT count(*) n FROM auto_update_runs").first("n")).toBe(before! + 1);
  expect(JSON.parse((await db.prepare("SELECT result_json FROM scheduled_job_items WHERE id='owning-finalizer-item'").first<string>("result_json"))!)).toEqual({...result,obsoletePending:1});
});
