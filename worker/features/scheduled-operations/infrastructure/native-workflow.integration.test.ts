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

beforeEach(async () => {
  await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/reset");
  await db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_collection_primary_source','x_api')").run();
  await db.prepare("UPDATE x_activity_coordinator SET ready=1").run();
  await db.prepare("INSERT INTO x_shared_budgets(day,used,reserved,limit_value,seed_detail,updated_at) VALUES(?,0,0,1000000,'{}',0) ON CONFLICT(day) DO UPDATE SET used=0,reserved=0").bind(new Date(Date.now()).toISOString().slice(0,10)).run();
});


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
  if (jobType === "x_collection") await db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at,initialization_completed_at,next_check_at) VALUES('native_collect','1000000000001','native_collect','100',0,0,1,1,0)").run();
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

it("recovers a pending X page through the native Workflow before full cadence is due", async () => {
  const started=Date.now();
  let slot=Math.floor(started/3_600_000)*3_600_000+23*60_000;
  if(slot>started)slot-=3_600_000;
  const full=slot-2*3_600_000, cadence=JSON.stringify({completedAt:full,anchorAt:full});
  const inspector=await introspectWorkflow(bindings.NATIVE_SCHEDULED_WORKFLOW);
  await db.batch([
    db.prepare("DELETE FROM scheduled_job_runs WHERE job_type='x_collection'"),
    db.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled'"),
    db.prepare("UPDATE members SET url_twitter=NULL"),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(900050,'native_collect','Native collector','https://x.com/native_collect') ON CONFLICT(uid) DO UPDATE SET url_twitter=excluded.url_twitter"),
    ...["x_posts","x_post_facts","x_post_references","x_post_sources"].map(table=>db.prepare("DELETE FROM "+table)),
    ...[["scheduled_v2_x_collection_enabled","true"],["x_collection_enabled","true"],["x_collection_interval_hours","24"],
      ["x_collection_daily_budget_cents","100"],["x_cost_optimizer_enabled","true"],["x_reference_preview_mode","link_only"],
      ["x_collection_last_run",String(full)],["x_collection_cadence_state",cadence]]
      .map(([key,value])=>db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value)),
    db.prepare(`INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,
      collection_started_at,initialization_completed_at,next_check_at,sync_pagination_token,sync_base_post_id,
      sync_newest_post_id,last_error,last_error_code,consecutive_failures)
      VALUES('native_collect','1000000000001','native_collect','100',?,?,1,1,?,'pending-page','100','200','budget_exceeded','budget_exceeded',1)`)
      .bind(full,full,slot-1),
  ]);
  vi.stubGlobal("fetch",(input:RequestInfo|URL,init?:RequestInit)=>bindings.NATIVE_WORKFLOW_PROVIDER.fetch(input,init));
  const runtime={...bindings,...siteEnv(),CLOUDFLARE_ACCOUNT_ID:"native-test",CLOUDFLARE_D1_TOKEN:"native-test",
    SCHEDULED_OPERATIONS_WORKFLOW:bindings.NATIVE_SCHEDULED_WORKFLOW} as unknown as Env;
  try {
    await handleScheduledWorkflowCron({cron:SCHEDULED_WORKFLOW_CRON,scheduledTime:slot} as ScheduledController,runtime);
    const instances=await inspector.get();
    expect(instances).toHaveLength(1);
    await instances[0].waitForStatus("complete");
    const output=await instances[0].getOutput() as {id:string}|null;
    expect(output,"a completed recovery Workflow must create the planned collection run").not.toBeNull();
    await expect.poll(()=>db.prepare("SELECT status FROM scheduled_job_runs WHERE id=?").bind(output!.id).first("status"),
      {timeout:20_000,interval:100}).toBe("succeeded");
    expect(JSON.parse((await db.prepare("SELECT summary_json FROM scheduled_job_runs WHERE id=?").bind(output!.id).first<string>("summary_json"))!)).toMatchObject({xCollectionScope:"pending"});
    expect(await db.prepare("SELECT last_seen_post_id,sync_pagination_token,last_error_code,next_check_at FROM x_post_sources WHERE handle='native_collect'").first())
      .toEqual({last_seen_post_id:"200",sync_pagination_token:null,last_error_code:null,next_check_at:full+24*3_600_000});
    expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first("value")).toBe(cadence);
    expect(await db.prepare("SELECT count(*) n FROM x_posts WHERE handle='native_collect' AND id='200'").first("n")).toBe(1);
    expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_daily_budget_cents'").first("value")).toBe("100");
  } finally {vi.unstubAllGlobals();await inspector.dispose();}
},60_000);

it("resumes a durable RSS partial in a separate ordinary Cron Workflow and Queue run", async () => {
  const started = Date.now();
  const currentSlot = Math.floor((started - 23 * 60_000) / (30 * 60_000)) * 30 * 60_000 + 23 * 60_000;
  const firstSlot = currentSlot - 30 * 60_000;
  const inspector = await introspectWorkflow(bindings.NATIVE_SCHEDULED_WORKFLOW);
  await db.batch([
    db.prepare("DELETE FROM scheduled_job_runs WHERE job_type='x_collection'"),
    db.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled'"),
    db.prepare("UPDATE members SET url_twitter=NULL"),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(900050,'native_collect','Native collector','https://x.com/native_collect') ON CONFLICT(uid) DO UPDATE SET url_twitter=excluded.url_twitter"),
    ...["x_posts", "x_post_facts", "x_post_references", "x_post_sources", "x_fx_sources", "scheduled_usage_daily"].map(table => db.prepare(`DELETE FROM ${table}`)),
    ...[["scheduled_v2_x_collection_enabled", "true"], ["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"],
      ["x_collection_hybrid_policy", "rss_v1"], ["x_collection_hybrid_activated_at", "1"], ["x_collection_last_run", String(started)], ["otw_play_automation_paused", "true"]]
      .map(([key, value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key, value)),
    db.prepare("INSERT INTO x_post_sources(handle,user_id,last_seen_post_id,last_checked_at,updated_at,collection_started_at,regular_completed_at,last_completed_at) VALUES('native_collect','1000000000001','100',0,0,1,?,?)").bind(started, started),
  ]);
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => bindings.NATIVE_WORKFLOW_PROVIDER.fetch(input, init));
  const runtime = { ...bindings, ...siteEnv(), CLOUDFLARE_ACCOUNT_ID: "native-test", CLOUDFLARE_D1_TOKEN: "native-test", SCHEDULED_OPERATIONS_WORKFLOW: bindings.NATIVE_SCHEDULED_WORKFLOW } as unknown as Env;
  try {
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: firstSlot } as ScheduledController, runtime);
    await Promise.all((await inspector.get()).map(instance => instance.waitForStatus("complete")));
    await expect.poll(() => db.prepare("SELECT count(*) n FROM x_posts WHERE CAST(id AS INTEGER) BETWEEN 501 AND 506").first("n"), { timeout: 20_000, interval: 100 }).toBe(5);
    const pendingId = await db.prepare("SELECT rss_pending_item_id FROM x_fx_sources WHERE handle='native_collect'").first<string>("rss_pending_item_id");
    await expect.poll(() => db.prepare("SELECT status FROM scheduled_job_items WHERE id=?").bind(pendingId).first("status"), { timeout: 10_000 }).toBe("partial");
    const pending = JSON.parse((await db.prepare("SELECT continuation_json FROM scheduled_job_items WHERE id=?").bind(pendingId).first<string>("continuation_json"))!);
    expect(pending.candidates).toHaveLength(1);
    // Represent the elapsed half hour without making the local test wait 30 minutes.
    pending.nextAttemptAt = currentSlot;
    for (const candidate of pending.candidates) candidate.nextAttemptAt = currentSlot;
    await db.prepare("UPDATE scheduled_job_items SET continuation_json=? WHERE id=?").bind(JSON.stringify(pending), pendingId).run();
    const sourceBeforeGuard = await db.prepare("SELECT * FROM x_fx_sources WHERE handle='native_collect'").first();
    const officialBeforeGuard = await db.prepare("SELECT * FROM x_post_sources WHERE handle='native_collect'").first();
    const beforeGuardCalls = await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json();
    const day = new Date().toISOString().slice(0, 10);
    await db.prepare("INSERT OR REPLACE INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES(?,'all','d1_rows_written',1,0,1,0)").bind(day).run();
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: currentSlot } as ScheduledController, runtime);
    expect(await inspector.get()).toHaveLength(1);
    await db.prepare("DELETE FROM scheduled_usage_daily WHERE resource='d1_rows_written'").run();
    await db.prepare("INSERT OR REPLACE INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES(?,'x','queue_operations',1,0,1,0)").bind(day).run();
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: currentSlot } as ScheduledController, runtime);
    await Promise.all((await inspector.get()).map(instance => instance.waitForStatus("complete")));
    expect(await db.prepare("SELECT status FROM scheduled_job_runs WHERE job_type='x_collection' AND scheduled_for=?").bind(currentSlot).first("status")).toBe("throttled");
    expect(await db.prepare("SELECT * FROM x_fx_sources WHERE handle='native_collect'").first()).toEqual(sourceBeforeGuard);
    expect(await db.prepare("SELECT * FROM x_post_sources WHERE handle='native_collect'").first()).toEqual(officialBeforeGuard);
    expect(await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json()).toEqual(beforeGuardCalls);
    await db.prepare("DELETE FROM scheduled_usage_daily WHERE resource='queue_operations'").run();
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: currentSlot + 30 * 60_000 } as ScheduledController, runtime);
    await Promise.all((await inspector.get()).map(instance => instance.waitForStatus("complete")));
    await expect.poll(() => db.prepare("SELECT rss_pending_item_id FROM x_fx_sources WHERE handle='native_collect'").first("rss_pending_item_id"), { timeout: 20_000, interval: 100 }).toBeNull();
    expect(await db.prepare("SELECT count(*) n FROM x_posts WHERE CAST(id AS INTEGER) BETWEEN 501 AND 506").first("n")).toBe(6);
    const items = (await db.prepare("SELECT run_id,status,continuation_json,result_json FROM scheduled_job_items WHERE json_extract(continuation_json,'$.mode')='rss_candidates'").all<{ run_id: string; status: string; continuation_json: string; result_json: string }>()).results;
    expect(new Set(items.map(item => item.run_id)).size).toBe(2);
    expect(items.map(item => item.status).sort()).toEqual(["partial", "succeeded"]);
    const calls = await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json<string[]>();
    expect(calls.filter(call => call.includes("/feed.xml"))).toHaveLength(1);
    expect(calls.filter(call => call.includes("/2/status/"))).toHaveLength(6);
    expect(calls.some(call => call.includes("api.x.com"))).toBe(false);
    expect(await db.prepare("SELECT last_seen_post_id,regular_completed_at,last_completed_at FROM x_post_sources WHERE handle='native_collect'").first()).toEqual({ last_seen_post_id: "100", regular_completed_at: started, last_completed_at: started });
    // Advance only persisted feed eligibility; this is not a six-hour wall-clock observation.
    await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/reset?scenario=rss-shrink");
    await db.prepare("UPDATE x_fx_sources SET rss_cadence_anchor_at=0,cadence_anchor_at=0 WHERE handle='native_collect'").run();
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: currentSlot + 60 * 60_000 } as ScheduledController, runtime);
    await Promise.all((await inspector.get()).map(instance => instance.waitForStatus("complete")));
    await expect.poll(() => db.prepare("SELECT rss_last_raw_count FROM x_fx_sources WHERE handle='native_collect'").first("rss_last_raw_count"), { timeout: 20_000 }).toBe(0);
    await expect.poll(() => db.prepare("SELECT count(*) n FROM x_posts WHERE id='151'").first("n"), { timeout: 20_000 }).toBe(1);
    expect(await db.prepare("SELECT rss_previous_raw_count,rss_last_candidate_count,rss_pending_item_id FROM x_fx_sources WHERE handle='native_collect'").first()).toEqual({ rss_previous_raw_count: 6, rss_last_candidate_count: 0, rss_pending_item_id: null });
    expect(await db.prepare("SELECT last_seen_post_id,regular_completed_at,last_completed_at FROM x_post_sources WHERE handle='native_collect'").first()).toEqual({ last_seen_post_id: "100", regular_completed_at: started, last_completed_at: started });
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

it.each([false,true])("collects Fx and official regular items through native Cron Workflow and Queue with independent completion (UTC rollover=%s)", async rollover => {
  const started = Date.now();
  let slot = Math.floor(started / 3_600_000) * 3_600_000 + 23 * 60_000;
  if (slot > started) slot -= 3_600_000;
  const inspector = await introspectWorkflow(bindings.NATIVE_SCHEDULED_WORKFLOW);
  if(rollover){
    const day=new Date(started-86400000).toISOString().slice(0,10);
    await db.prepare("DELETE FROM x_shared_budgets").run();
    await db.prepare("INSERT INTO x_shared_budgets(day,used,reserved,limit_value,seed_detail,updated_at) VALUES(?,0,0,1000000,'{}',0)").bind(day).run();
  }
  await db.batch([
    db.prepare("DELETE FROM scheduled_job_runs WHERE job_type='x_collection'"),
    db.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled'"),
    db.prepare("UPDATE members SET url_twitter=NULL"),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(900050,'native_collect','Native collector','https://x.com/native_collect') ON CONFLICT(uid) DO UPDATE SET url_twitter=excluded.url_twitter"),
    ...["x_post_references", "x_post_facts", "x_posts", "x_fx_sources", "x_post_sources", "x_api_cache"].map(table => db.prepare(`DELETE FROM ${table}`)),
    ...[["scheduled_v2_x_collection_enabled", "true"], ["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"], ["x_collection_interval_hours", "24"], ["x_collection_daily_budget_cents", "100"], ["x_cost_optimizer_enabled", "true"], ["x_reference_preview_mode", "link_only"], ["x_collection_last_run", String(slot - 25 * 3_600_000)]].map(([key, value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key, value)),
    db.prepare("DELETE FROM settings WHERE key IN ('x_collection_cadence_state','x_api_backoff_until')"),
    db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at,initialization_completed_at) VALUES('native_collect','1000000000001','native_collect','100',0,0,1,1)"),
    db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:user:v1:native_collect','user',?,?,?)").bind(JSON.stringify({ user: { id: "1000000000001", username: "native_collect" } }), started, started + 86400000),
  ]);
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => bindings.NATIVE_WORKFLOW_PROVIDER.fetch(input, init));
  try {
    const runtime = { ...bindings, ...siteEnv(), CLOUDFLARE_ACCOUNT_ID: "native-test", CLOUDFLARE_D1_TOKEN: "native-test", SCHEDULED_OPERATIONS_WORKFLOW: bindings.NATIVE_SCHEDULED_WORKFLOW } as unknown as Env;
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: slot } as ScheduledController, runtime);
    const instances = await inspector.get();
    expect(instances).toHaveLength(1);
    await instances[0].waitForStatus("complete");
    const output = await instances[0].getOutput() as { id: string };
    await expect.poll(() => db.prepare("SELECT status FROM scheduled_job_runs WHERE id=?").bind(output.id).first("status"), { timeout: 70000, interval: 100 }).toBe("partial");
    await expect.poll(() => db.prepare("SELECT COUNT(*) AS n FROM x_posts WHERE id IN ('150','200')").first("n"), { timeout: 5000 }).toBe(2);
    expect(await db.prepare("SELECT cursor,last_completed_at FROM x_fx_sources WHERE handle='native_collect'").first()).toEqual({ cursor: "fx_4", last_completed_at: null });
    await expect.poll(async () => JSON.parse(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first<string>("value") ?? "null")?.anchorAt).toBe(slot);
    expect(await db.prepare("SELECT last_seen_post_id,regular_completed_at FROM x_post_sources WHERE handle='native_collect'").first()).toMatchObject({ last_seen_post_id: "200", regular_completed_at: expect.any(Number) });
    expect(await db.prepare("SELECT enabled FROM x_activity_sites WHERE site='otw'").first("enabled")).toBe(0);
  } finally { vi.unstubAllGlobals(); await inspector.dispose(); }
}, 90000);

it("preserves regular origin across budget exhaustion while a due peer completes through native Cron and Queue", async () => {
  const started = Date.now(), hour = 3_600_000;
  const day = new Date(started).toISOString().slice(0,10);
  const slot = Math.floor((started - 23 * 60_000) / (30 * 60_000)) * 30 * 60_000 + 23 * 60_000;
  await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/reset?scenario=account-budget");
  await db.batch([
    db.prepare("DELETE FROM scheduled_job_runs WHERE job_type='x_collection'"),
    db.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled'"),
    db.prepare("UPDATE members SET url_twitter=NULL"),
    ...["x_post_references", "x_post_facts", "x_posts", "x_fx_sources", "x_post_sources", "x_api_cache", "x_shared_requests", "x_api_usage_events", "x_api_usage_daily", "x_api_resource_daily", "scheduled_usage_daily"].map(table => db.prepare(`DELETE FROM ${table}`)),
    ...[[900050, "native_collect", "1000000000001", 13], [900051, "native_peer", "1000000000002", 12]].flatMap(([uid, handle, userId, age]) => [
      db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET url_twitter=excluded.url_twitter").bind(uid, handle, handle, `https://x.com/${handle}`),
      db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at,initialization_completed_at,regular_completed_at,last_completed_at) VALUES(?,?,?,'100',0,0,1,1,?,?)").bind(handle, userId, handle, slot - Number(age) * hour, slot - Number(age) * hour),
      db.prepare("INSERT INTO x_fx_sources(handle,user_id,collection_started_at,cadence_anchor_at,rss_cadence_anchor_at,updated_at) VALUES(?,?,1,?,?,0)").bind(handle, userId, started + 24 * hour, started + 24 * hour),
      db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'user',?,?,?)").bind(`x:user:v1:${handle}`, JSON.stringify({ user: { id: userId, username: handle } }), started, started + 24 * hour),
    ]),
    ...[["scheduled_v2_x_collection_enabled", "true"], ["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"], ["x_collection_hybrid_policy", "rss_v1"], ["x_collection_hybrid_activated_at", "1"], ["x_collection_daily_budget_cents", "100"], ["x_cost_optimizer_enabled", "true"], ["x_reference_preview_mode", "link_only"], ["x_api_backoff_until", "0"]].map(([key,value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key,value)),
    db.prepare("DELETE FROM x_shared_budgets"),
    db.prepare("INSERT INTO x_shared_budgets(day,used,reserved,limit_value,seed_detail,updated_at) VALUES(?,0,875000,1000000,'{}',0)").bind(day),
  ]);
  const inspector = await introspectWorkflow(bindings.NATIVE_SCHEDULED_WORKFLOW);
  await db.exec("CREATE TRIGGER adverse_priority_ids AFTER INSERT ON scheduled_outbox WHEN NEW.event_type='execute' BEGIN UPDATE scheduled_outbox SET id=CASE WHEN (SELECT json_extract(continuation_json,'$.handles[0]') FROM scheduled_job_items WHERE id=NEW.item_id)='native_peer' THEN 'a-' ELSE 'z-' END || NEW.id WHERE id=NEW.id; END;");
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => bindings.NATIVE_WORKFLOW_PROVIDER.fetch(input,init));
  const runtime = { ...bindings, ...siteEnv(), CLOUDFLARE_ACCOUNT_ID: "native-test", CLOUDFLARE_D1_TOKEN: "native-test", SCHEDULED_OPERATIONS_WORKFLOW: bindings.NATIVE_SCHEDULED_WORKFLOW } as unknown as Env;
  const tick = async (at: number) => {
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: at } as ScheduledController, runtime);
    await Promise.all((await inspector.get()).map(instance => instance.waitForStatus("complete")));
    await expect.poll(() => db.prepare("SELECT count(*) n FROM scheduled_job_runs WHERE job_type='x_collection' AND status IN ('queued','running')").first("n"), { timeout: 70_000 }).toBe(0);
  };
  try {
    await tick(slot);
    const firstCalls = await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json<string[]>();
    expect(firstCalls.find(call => call.includes("/tweets"))).toContain("/1000000000001/tweets");
    expect(await db.prepare("SELECT sync_pagination_token,sync_origin_scope,regular_completed_at FROM x_post_sources WHERE handle='native_collect'").first()).toEqual({ sync_pagination_token: "native-page-2", sync_origin_scope: "regular", regular_completed_at: slot - 13 * hour });
    expect(await db.prepare("SELECT count(*) n FROM scheduled_job_items WHERE json_extract(continuation_json,'$.provider')='x_api' AND json_extract(continuation_json,'$.scope')='regular'").first("n")).toBe(2);
    const incurred = await db.prepare("SELECT used,reserved FROM x_shared_budgets WHERE day=?").bind(day).first();
    expect(Number(incurred?.used)).toBeGreaterThan(0);
    const checkpoint = await db.prepare("SELECT sync_pagination_token,sync_base_post_id,sync_newest_post_id,sync_origin_scope,collection_started_at FROM x_post_sources WHERE handle='native_collect'").first();
    await tick(slot + 30 * 60_000);
    expect(await db.prepare("SELECT sync_pagination_token,sync_base_post_id,sync_newest_post_id,sync_origin_scope,collection_started_at FROM x_post_sources WHERE handle='native_collect'").first()).toEqual(checkpoint);
    expect(await db.prepare("SELECT used,reserved FROM x_shared_budgets WHERE day=?").bind(day).first()).toEqual(incurred);
    // Release only the fixture's pre-existing reservation; incurred request cost remains.
    expect((await db.prepare("UPDATE x_shared_budgets SET reserved=reserved-875000 WHERE day=? AND reserved=875000").bind(day).run()).meta.changes).toBe(1);
    expect(await db.prepare("SELECT used,reserved FROM x_shared_budgets WHERE day=?").bind(day).first()).toEqual({ used: incurred!.used, reserved: 0 });
    await db.prepare("UPDATE x_post_sources SET next_check_at=CASE WHEN handle='native_collect' THEN ? ELSE 0 END").bind(started + 3 * hour).run();
    await tick(slot + hour);
    expect(await db.prepare("SELECT regular_completed_at FROM x_post_sources WHERE handle='native_peer'").first<number>("regular_completed_at")).toBeGreaterThan(slot - 12 * hour);
    expect(await db.prepare("SELECT sync_pagination_token,sync_base_post_id,sync_newest_post_id,sync_origin_scope,collection_started_at FROM x_post_sources WHERE handle='native_collect'").first()).toEqual(checkpoint);
    await db.prepare("UPDATE x_post_sources SET next_check_at=0 WHERE handle='native_collect'").run();
    await tick(slot + 90 * 60_000);
    expect(await db.prepare("SELECT sync_pagination_token,sync_origin_scope,last_seen_post_id FROM x_post_sources WHERE handle='native_collect'").first()).toEqual({ sync_pagination_token: null, sync_origin_scope: null, last_seen_post_id: "200" });
    expect(await db.prepare("SELECT regular_completed_at FROM x_post_sources WHERE handle='native_collect'").first<number>("regular_completed_at")).toBeGreaterThan(slot - 13 * hour);
    const calls = await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json<string[]>();
    expect(calls.filter(call => call.includes("/1000000000001/tweets"))).toHaveLength(2);
    expect(calls.filter(call => call.includes("/1000000000002/tweets"))).toHaveLength(1);
    expect(calls.some(call => call.includes("pagination_token=native-page-2"))).toBe(true);
    expect(Number(await db.prepare("SELECT used FROM x_shared_budgets WHERE day=?").bind(day).first("used"))).toBeGreaterThan(Number(incurred!.used));
  } finally { await db.exec("DROP TRIGGER IF EXISTS adverse_priority_ids;"); vi.unstubAllGlobals(); await inspector.dispose(); }
}, 90_000);

it("budget_blocked_candidate_plan_creates_no_item or run through ordinary native Cron", async () => {
  const started = Date.now();
  const slot = Math.floor((started - 23 * 60_000) / (30 * 60_000)) * 30 * 60_000 + 23 * 60_000;
  const inspector = await introspectWorkflow(bindings.NATIVE_SCHEDULED_WORKFLOW);
  const pending = { provider: "fxembed", mode: "rss_candidates", scope: "pending", handles: ["native_collect"], phase: "hydrate", nextAttemptAt: null,
    candidates: [{ id: "511", firstSeenAt: started - 1000, createdAtHint: started - 1000, attempts: 2, nextAttemptAt: 0, stage: "official", error: "fx_http_404" }] };
  await db.batch([
    db.prepare("DELETE FROM scheduled_job_runs WHERE job_type='x_collection'"),
    db.prepare("UPDATE settings SET value='false' WHERE key LIKE 'scheduled_v2_%_enabled'"),
    db.prepare("UPDATE members SET url_twitter=NULL"),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(900050,'native_collect','Native collector','https://x.com/native_collect') ON CONFLICT(uid) DO UPDATE SET url_twitter=excluded.url_twitter"),
    ...["x_post_sources", "x_fx_sources", "scheduled_usage_daily"].map(table => db.prepare(`DELETE FROM ${table}`)),
    ...[["scheduled_v2_x_collection_enabled", "true"], ["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"],
      ["x_collection_hybrid_policy", "rss_v1"], ["x_collection_hybrid_activated_at", "1"], ["otw_play_automation_paused", "true"]]
      .map(([key,value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key,value)),
    db.prepare("INSERT INTO x_post_sources(handle,user_id,last_checked_at,updated_at,collection_started_at,last_completed_at,regular_completed_at) VALUES('native_collect','1000000000001',0,0,1,?,?)").bind(started,started),
    db.prepare("INSERT INTO x_fx_sources(handle,user_id,collection_started_at,cadence_anchor_at,rss_cadence_anchor_at,rss_pending_item_id,updated_at) VALUES('native_collect','1000000000001',1,?,?,'blocked-candidate-item',0)").bind(started,started),
    db.prepare("INSERT INTO scheduled_job_runs(id,job_type,source,idempotency_key,status,accepted_at,created_at,updated_at) VALUES('blocked-candidate-run','x_collection','scheduled','blocked-candidate-run','partial',0,0,0)"),
    db.prepare("INSERT INTO scheduled_job_items(id,run_id,target_key,phase,lane,status,continuation_json,available_at,created_at,updated_at) VALUES('blocked-candidate-item','blocked-candidate-run','rss','collect','x','partial',?,0,0,0)").bind(JSON.stringify(pending)),
    db.prepare("UPDATE x_shared_budgets SET used=limit_value"),
  ]);
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => bindings.NATIVE_WORKFLOW_PROVIDER.fetch(input,init));
  const runtime = { ...bindings, ...siteEnv(), CLOUDFLARE_ACCOUNT_ID: "native-test", CLOUDFLARE_D1_TOKEN: "native-test", SCHEDULED_OPERATIONS_WORKFLOW: bindings.NATIVE_SCHEDULED_WORKFLOW } as unknown as Env;
  try {
    const before = await db.prepare("SELECT * FROM x_fx_sources WHERE handle='native_collect'").first();
    await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: slot } as ScheduledController, runtime);
    expect(await inspector.get()).toHaveLength(0);
    expect(await db.prepare("SELECT count(*) n FROM scheduled_job_runs WHERE job_type='x_collection'").first("n")).toBe(1);
    expect(await db.prepare("SELECT count(*) n FROM scheduled_job_items WHERE lane='x'").first("n")).toBe(1);
    expect(await db.prepare("SELECT * FROM x_fx_sources WHERE handle='native_collect'").first()).toEqual(before);
    const calls = await (await bindings.NATIVE_WORKFLOW_PROVIDER.fetch("https://fixture.invalid/calls")).json<string[]>();
    expect(calls.some(call => call.includes("api.x.com") || call.includes("api.fxtwitter.com"))).toBe(false);
  } finally { vi.unstubAllGlobals(); await inspector.dispose(); }
}, 60_000);
