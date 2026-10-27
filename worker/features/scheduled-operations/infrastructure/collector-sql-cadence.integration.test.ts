import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { meterD1 } from "../../../test-support/d1-meter";
import { siteEnv } from "../../../test-support/site-env";
import type { Env } from "../../../platform/types";
import { ScheduledJobPlanner } from "./scheduled-job-planner";
import { ScheduledJobExecutor } from "./scheduled-job-executor";
import { handleScheduledJobQueue } from "../../../app/scheduled-queue";
import { D1ScheduledJobRepository } from "../../../platform/scheduled-jobs";
import { collectNaverCafePostsForSources, readEnabledNaverCafeSources } from "../../naver-cafe";
import { hasScheduledYouTubeFeedWork, runScheduledYouTubeFeedCollection } from "../../youtube";
import { D1NaverCafeApplication } from "../../naver-cafe/infrastructure/d1-naver-cafe-application";
import { D1SharedXBudget, D1SharedXApiGateway } from "../../x-posts/infrastructure/x-shared-budget";
import { clearXServiceCachesForTests } from "../../x-posts/infrastructure/x-api";
import { clearActiveXHandlesCacheForTests } from "../../x-posts/infrastructure/d1-active-handles";

const db = env.otw_db;
const hour = 3_600_000;
const scheduledFor = Date.parse("2026-10-22T00:13:00Z");
const runtime = (database = db): Env => ({ ...env, ...siteEnv(), otw_db: database } as Env);

beforeAll(async () => {
  for (const migration of await readSiteSchemaMigrations()) {
    if (migration.name.startsWith("0030_")) {
      await db.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) =>
        db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000 - index, code, "migration bootstrap")));
    }
    await applyD1Migrations(db, [migration]);
  }
}, 120_000);

afterEach(() => vi.restoreAllMocks());

it("recovers only a pending X cursor within the shared budget without moving the site cadence", async () => {
  const actual=Date.now(), day=new Date(actual).toISOString().slice(0,10);
  const user="1607408138545950791", base="2114000000000000000", newest="2115000000000000001";
  clearXServiceCachesForTests(); clearActiveXHandlesCacheForTests();
  await db.batch([
    ...["x_post_references","x_post_facts","x_posts","x_post_sources","x_api_cache","x_api_usage_events","x_api_usage_daily","x_api_resource_daily","scheduled_usage_daily","x_shared_requests","x_shared_budgets"].map(table=>db.prepare("DELETE FROM "+table)),
    db.prepare("UPDATE members SET url_twitter=NULL"),
    ...[["x_collection_enabled","true"],["x_cost_optimizer_enabled","true"],["x_collection_interval_hours","24"],["x_reference_preview_mode","link_only"],["x_collection_daily_budget_cents","100"],["x_collection_last_run","123456"]].map(([key,value])=>db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value)),
    ...["pending_member","other_member"].map((handle,i)=>db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET url_twitter=excluded.url_twitter").bind(902000+i,handle,handle,"https://x.com/"+handle)),
    db.prepare("INSERT INTO x_post_sources(handle,user_id,last_seen_post_id,last_checked_at,next_check_at,collection_started_at,initialization_completed_at,updated_at,sync_pagination_token,sync_base_post_id,sync_newest_post_id) VALUES('pending_member',?,?,0,0,1,1,0,'page-two',?,?)").bind(user,base,base,newest),
    db.prepare("INSERT INTO x_post_sources(handle,last_checked_at,next_check_at,updated_at,sync_pagination_token) VALUES('other_member',0,0,0,'other-page')"),
    db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:user:v1:pending_member','user',?,?,?)").bind(JSON.stringify({user:{id:user,username:"pending_member"}}),actual,actual+hour),
  ]);
  await new D1SharedXBudget(db).initialize([{day,used:250000,reserved:0},{day,used:0,reserved:0}]);
  const calls=vi.spyOn(globalThis,"fetch").mockImplementation(async input=>{
    const url=new URL(String(input));
    expect(url.pathname).toBe(`/2/users/${user}/tweets`);
    expect(url.searchParams.get("pagination_token")).toBe("page-two");
    return Response.json({data:[{id:newest,author_id:user,text:"pending page",created_at:new Date(actual-60000).toISOString()}]});
  });
  const application={...runtime(),SITE_ID:"otw",X_BEARER_TOKEN:"local-test",X_API_GATEWAY:new D1SharedXApiGateway({db,site:"otw",token:"local-test",admitD1:async()=>true})} as Env;
  const repository=new D1ScheduledJobRepository(db),planner=new ScheduledJobPlanner(application,repository),executor=new ScheduledJobExecutor(application,repository);
  const run=await repository.createRun({jobType:"x_collection",source:"manual",idempotencyKey:"pending-only:"+actual,initialSummary:{xCollectionScope:"pending"}});
  const items=await planner.plan(run);expect(items).toHaveLength(1);
  await db.prepare("UPDATE x_post_sources SET sync_pagination_token=NULL WHERE handle='other_member'").run();
  const item=await repository.claimItem(items[0]);expect(JSON.parse(item!.continuation_json!).handles).toEqual(expect.arrayContaining(["pending_member","other_member"]));
  const outcome=await executor.execute(item!);expect(outcome.status).toBe("succeeded");
  await repository.completeItem(item!,outcome);await executor.finalizeLegacyState(run.id);
  expect(calls).toHaveBeenCalledTimes(1);
  expect(await db.prepare("SELECT sync_pagination_token,last_seen_post_id FROM x_post_sources WHERE handle='pending_member'").first()).toEqual({sync_pagination_token:null,last_seen_post_id:newest});
  expect(await db.prepare("SELECT COUNT(*) AS n FROM x_posts WHERE handle='pending_member'").first("n")).toBe(1);
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe("123456");
  expect((await new D1SharedXBudget(db).read()).used).toBeLessThanOrEqual(1000000);
});

it("recovers affordable X accounts and retries blocked ranges at the next 24-hour scheduled run", async () => {
  let actual = Date.parse("2026-10-27T04:53:00Z");
  const users=["1607408138545950791","1607408138545950792"];
  vi.spyOn(Date,"now").mockImplementation(()=>actual);
  clearXServiceCachesForTests();
  await db.batch([
    ...["x_post_references","x_post_facts","x_posts","x_post_sources","x_api_cache","x_api_usage_events","x_api_usage_daily","x_api_resource_daily","scheduled_usage_daily","x_shared_requests","x_shared_budgets"].map(table=>db.prepare("DELETE FROM "+table)),
    db.prepare("UPDATE members SET url_twitter=NULL"),
    db.prepare("DELETE FROM settings WHERE key IN ('x_collection_last_run','x_collection_last_success','x_collection_cadence_state')"),
    ...[["x_collection_enabled","true"],["x_cost_optimizer_enabled","true"],["x_collection_interval_hours","24"],["x_reference_preview_mode","link_only"],["x_collection_daily_budget_cents","100"]].map(([key,value])=>db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value)),
    ...["recovery_a","recovery_b"].flatMap((handle,i)=>[
      db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(?,?,?,?)").bind(901790+i,handle,handle,"https://x.com/"+handle),
      db.prepare("INSERT INTO x_post_sources(handle,user_id,last_seen_post_id,last_checked_at,next_check_at,collection_started_at,initialization_completed_at,updated_at) VALUES(?,?,?,0,0,1,1,0)").bind(handle,users[i],"2114000000000000000"),
      db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'user',?,?,?)").bind("x:user:v1:"+handle,JSON.stringify({user:{id:users[i],username:handle}}),actual,actual+30*24*hour),
    ]),
  ]);
  await new D1SharedXBudget(db).initialize([{day:"2026-10-27",used:0,reserved:0},{day:"2026-10-27",used:875000,reserved:0}]);
  const calls=vi.spyOn(globalThis,"fetch").mockImplementation(async input=>{
    const url=new URL(String(input));
    const user=url.pathname.split("/")[3],id=user==="1607408138545950791"?"2115000000000000001":"2115000000000000002";
    if(!url.pathname.endsWith("/tweets"))throw new Error("Unexpected paid lookup: "+url.pathname);
    return Response.json({data:url.searchParams.get("since_id")===id?[]:[{id,author_id:user,text:"scheduled recovery",created_at:new Date(actual-60000).toISOString()}]});
  });
  const application={...runtime(),SITE_ID:"otw",X_BEARER_TOKEN:"local-test",X_API_GATEWAY:new D1SharedXApiGateway({db,site:"otw",token:"local-test",admitD1:async()=>true})} as Env;
  const repository=new D1ScheduledJobRepository(db),planner=new ScheduledJobPlanner(application,repository),executor=new ScheduledJobExecutor(application,repository);
  const execute=async()=>{
    const run=await repository.createRun({jobType:"x_collection",source:"scheduled",idempotencyKey:"budget-recovery:"+actual,scheduledFor:actual});
    const items=await planner.plan(run);expect(items).toHaveLength(1);
    const item=await repository.claimItem(items[0]);expect(item).not.toBeNull();
    const outcome=await executor.execute(item!);await repository.completeItem(item!,outcome);await executor.finalizeLegacyState(run.id);return outcome;
  };
  const first=await execute();
  expect(first.result).toMatchObject({refreshedHandles:1,error:"budget_exceeded"});
  expect(calls).toHaveBeenCalledTimes(1);
  const blocked=await db.prepare("SELECT handle,last_seen_post_id FROM x_post_sources WHERE last_error_code='budget_exceeded'").first<{handle:string;last_seen_post_id:string}>();
  expect(blocked?.last_seen_post_id).toBe("2114000000000000000");
  expect(await db.prepare("SELECT COUNT(*) AS n FROM x_posts").first("n")).toBe(1);
  actual=Date.parse("2026-10-28T00:01:00Z");
  expect(await planner.planScheduled("x_collection",actual)).toEqual([]);
  actual=Date.parse("2026-10-28T04:53:00Z")+1;
  await execute();
  expect(await db.prepare("SELECT COUNT(*) AS n FROM x_posts").first("n")).toBe(2);
  expect(await db.prepare("SELECT last_error_code FROM x_post_sources WHERE handle=?").bind(blocked!.handle).first("last_error_code")).toBeNull();
  expect(await new D1SharedXBudget(db).read()).toMatchObject({day:"2026-10-28",reserved:0,used:5000});
});

it.each(["otw", "luvdia"] as const)("keeps the newer X slot due after an older retry finishes last on %s", async site => {
  const oldSlot = Date.parse("2026-10-24T02:23:28.140Z"), newerSlot = oldSlot + hour / 2;
  const newerComplete = newerSlot + 28_273, lateComplete = oldSlot + 40 * 60_000 + 15_620;
  await db.batch([
    db.prepare("DELETE FROM settings WHERE key IN ('x_collection_last_run','x_collection_last_success','x_collection_cadence_state')"),
    db.prepare("UPDATE members SET url_twitter=NULL"),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(901700,'late_x_retry','Late X retry','https://x.com/late_x_retry') ON CONFLICT(uid) DO UPDATE SET url_twitter=excluded.url_twitter"),
    ...[["x_collection_enabled", "true"], ["x_collection_interval_hours", "0.5"]].map(([key,value]) =>
      db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value)),
  ]);
  await finalizeX("scheduled", "succeeded", newerComplete, newerSlot);
  const meter = meterD1(db);
  await finalizeX("scheduled", "succeeded", lateComplete, oldSlot, meter.db);
  const planner = new ScheduledJobPlanner({ ...runtime(), ...siteEnv(site) }, {} as never);
  const nextSlot = newerSlot + hour / 2;
  expect(await planner.planScheduled("x_collection", nextSlot - 1)).toEqual([]);
  expect(await planner.planScheduled("x_collection", nextSlot)).toMatchObject([
    { continuation: { handles: ["late_x_retry"] } },
  ]);
  expect(JSON.parse(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first<string>("value") ?? "null"))
    .toEqual({ completedAt: lateComplete, anchorAt: newerSlot });
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_success'").first("value")).toBe(String(lateComplete));
  const replay = meterD1(db);
  await finalizeX("scheduled", "succeeded", lateComplete, oldSlot, replay.db);
  expect(replay.summary().rowsWritten).toBe(0);
  console.info("X_LATE_RETRY_FINALIZER_COST", JSON.stringify({ site, completion: meter.summary(), replay: replay.summary() }));
});

it.each(["mismatched", "malformed", "null"])("keeps actual-time fallback when an old X finalizer finds %s cadence", async state => {
  const oldSlot = Date.parse("2026-10-24T02:23:28.140Z"), newerSlot = oldSlot + hour / 2;
  const newerComplete = newerSlot + 28_273, lateComplete = oldSlot + 40 * 60_000 + 15_620;
  await db.prepare("DELETE FROM settings WHERE key IN ('x_collection_last_run','x_collection_last_success','x_collection_cadence_state')").run();
  await finalizeX("scheduled", "succeeded", newerComplete, newerSlot);
  await db.batch([
    db.prepare("UPDATE settings SET value=? WHERE key='x_collection_last_run'").bind(String(newerSlot + 5 * 60_000)),
    db.prepare("UPDATE settings SET value=? WHERE key='x_collection_cadence_state'")
      .bind(state === "mismatched" ? JSON.stringify({ completedAt: newerComplete, anchorAt: newerSlot }) : state === "null" ? "null" : "bad json"),
  ]);
  await finalizeX("scheduled", "succeeded", lateComplete, oldSlot);
  expect(JSON.parse(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first<string>("value") ?? "null"))
    .toEqual({ completedAt: lateComplete, anchorAt: lateComplete });
});

it("acknowledges a cooldown retry without fetching again or postponing the newer X slot", async () => {
  const oldSlot = Date.parse("2026-10-24T02:23:28.140Z"), newerSlot = oldSlot + hour / 2;
  let actual = oldSlot + 45_000;
  vi.spyOn(Date, "now").mockImplementation(() => actual);
  const provider = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected provider request"));
  const repository = new D1ScheduledJobRepository(db);
  await db.prepare("DELETE FROM settings WHERE key IN ('x_collection_last_run','x_collection_last_success','x_collection_cadence_state')").run();
  const run = await repository.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "late-cooldown-retry", scheduledFor: oldSlot });
  const items = await repository.addItems(run.id, ["finished-shard", "retry-shard"].map(targetKey => ({
    targetKey, phase: "collect", lane: "x", continuation: { handles: ["late_cooldown"] },
  })));
  const sibling = await repository.claimItem(items[0]);
  await repository.completeItem(sibling!, { status: "succeeded", result: { status: "success" } });
  const firstAttempt = await repository.claimItem(items[1]);
  await repository.releaseItemForRetry(firstAttempt!, "fixture_interruption", "Local replay of interrupted delivery");
  const newerComplete = newerSlot + 28_273;
  await finalizeX("scheduled", "succeeded", newerComplete, newerSlot);
  await db.batch([
    db.prepare("UPDATE members SET url_twitter=NULL"),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(901701,'late_cooldown','Late cooldown','https://x.com/late_cooldown')"),
    ...[["x_collection_enabled", "true"], ["x_collection_interval_hours", "0.5"], ["x_cost_optimizer_enabled", "true"], ["x_reference_preview_mode", "link_only"]].map(([key,value]) =>
      db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key,value)),
    db.prepare(`INSERT INTO x_post_sources(handle,user_id,last_seen_post_id,last_checked_at,last_attempt_at,last_success_at,cadence_anchor_at,next_check_at,collection_started_at,initialization_completed_at,updated_at)
      VALUES('late_cooldown','local-user','200',?,?,?,?,?,1,1,?)`).bind(newerComplete,newerComplete,newerComplete,newerSlot,newerSlot + hour / 2,newerComplete),
  ]);
  actual = oldSlot + 40 * 60_000 + 15_620;
  const ack = vi.fn(), retry = vi.fn();
  await handleScheduledJobQueue({ queue: "otw-ops-background", messages: [{
    body: { schemaVersion: 1, messageType: "scheduled_job_item", runId: run.id, itemId: items[1], phase: "collect" }, ack, retry,
  }] } as unknown as MessageBatch<unknown>, { ...runtime(), X_BEARER_TOKEN: "local-unused" });
  expect(ack).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
  const item = await repository.readItem(items[1]);
  expect(item).toMatchObject({ attempts: 2, status: "skipped", last_error_code: "all_handles_cooldown" });
  expect(JSON.parse(item!.result_json!)).toMatchObject({ success: false, error: "all_handles_cooldown", apiCalls: 0 });
  expect(await repository.readRun(run.id)).toMatchObject({ status: "succeeded", finished_at: actual });
  expect(await db.prepare("SELECT last_seen_post_id,lease_token,next_check_at FROM x_post_sources WHERE handle='late_cooldown'").first())
    .toEqual({ last_seen_post_id: "200", lease_token: null, next_check_at: newerSlot + hour / 2 });
  expect((await new ScheduledJobPlanner(runtime(), repository).planScheduled("x_collection", newerSlot + hour / 2)).length).toBeGreaterThan(0);
});

it.each([1, 3, 6])("does not replay a %sh cafe slot already checked after its scheduled time", async interval => {
  const id = 901500 + interval;
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  await seedCafeSource(id, interval).run();
  await seedCafePost(id, id, interval === 1 ? 0 : interval === 3 ? 2 : 8).run();
  await db.prepare("UPDATE naver_cafe_sources SET last_attempt_at=?,cadence_anchor_at=? WHERE id=?")
    .bind(scheduledFor + 45_000, scheduledFor - interval * hour, id).run();
  expect(await new ScheduledJobPlanner(runtime(), {} as never).planScheduled("naver_cafe_collection", scheduledFor)).toEqual([]);
});

it("keeps cafe cadence out of the serialized source DTO", async () => {
  const id = 901600;
  await seedCafeSource(id, 6).run();
  const sources = await new D1NaverCafeApplication(runtime()).listSources(true);
  const serialized = await Response.json(sources).json<Array<Record<string, unknown>>>();
  expect(serialized.find(source => source.id === id)).toHaveProperty("last_attempt_at");
  expect(serialized.some(source => "cadence_anchor_at" in source)).toBe(false);
});

it.each(["complete", "retry", "continuation"])("revalidates an old cafe item against latest %s progress", async state => {
  const id = 901610 + ["complete", "retry", "continuation"].indexOf(state), actual = scheduledFor + 2 * hour;
  vi.spyOn(Date, "now").mockReturnValue(actual);
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  await seedCafeSource(id, 6).run();
  await db.prepare(`UPDATE naver_cafe_sources SET initialization_completed_at=1,collection_started_at=1,
    last_attempt_at=?,cadence_anchor_at=?,last_seen_article_id=100,sync_page=?,last_error_code=? WHERE id=?`)
    .bind(scheduledFor + hour, scheduledFor + hour, state === "continuation" ? 2 : null,
      state === "retry" ? "provider_error" : null, id).run();
  const provider = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ result: { articleList: [] } }));
  const sources = await readEnabledNaverCafeSources(runtime());
  await collectNaverCafePostsForSources(sources, { cacheDb: db, siteId: "otw", trigger: "scheduled", scheduledFor });
  expect(provider).toHaveBeenCalledTimes(state === "complete" ? 0 : 1);
  expect(await db.prepare("SELECT cadence_anchor_at FROM naver_cafe_sources WHERE id=?").bind(id).first("cadence_anchor_at"))
    .toBe(state === "complete" ? scheduledFor + hour : actual);
});

it("keeps X success history and cadence monotonic when finalizers arrive out of order", async () => {
  await db.prepare("DELETE FROM settings WHERE key IN ('x_collection_last_run','x_collection_last_success','x_collection_cadence_state')").run();
  await finalizeX("scheduled", "succeeded", scheduledFor - hour, scheduledFor - hour);
  await finalizeX("scheduled", "failed", scheduledFor + 60_000, scheduledFor);
  await finalizeX("scheduled", "succeeded", scheduledFor, scheduledFor - hour);
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_success'").first("value")).toBe(String(scheduledFor));
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(String(scheduledFor + 60_000));
  await finalizeX("scheduled", "succeeded", scheduledFor + 120_000, scheduledFor - hour);
  expect(JSON.parse(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first<string>("value") ?? "null"))
    .toEqual({ completedAt: scheduledFor + 120_000, anchorAt: scheduledFor + 60_000 });
  const replay = meterD1(db);
  await finalizeX("scheduled", "succeeded", scheduledFor + 120_000, scheduledFor - hour, replay.db);
  expect(replay.summary().rowsWritten).toBe(0);
});

it.each([1, 3, 6])("plans cafe at the %sh scheduled boundary without rounding actual attempts", async interval => {
  const id = 900500 + interval;
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  await seedCafeSource(id, interval).run();
  await db.prepare("UPDATE naver_cafe_sources SET last_attempt_at=?,cadence_anchor_at=? WHERE id=?")
    .bind(scheduledFor - interval * hour + 45_000, scheduledFor - interval * hour, id).run();
  await seedCafePost(id, id, interval === 1 ? 0 : interval === 3 ? 2 : 8).run();
  const planner = new ScheduledJobPlanner(runtime(), {} as never);
  expect(await planner.planScheduled("naver_cafe_collection", scheduledFor - 1)).toEqual([]);
  expect((await planner.planScheduled("naver_cafe_collection", scheduledFor))[0].continuation).toMatchObject({ sourceIds: [id] });
});

it.each(["scheduled", "manual"] as const)("persists cafe actual timestamps and %s cadence in the same progress update", async trigger => {
  const actual = scheduledFor + 45_000, id = trigger === "scheduled" ? 900611 : 900612;
  vi.spyOn(Date, "now").mockReturnValue(actual);
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  await seedCafeSource(id, 6).run();
  await db.prepare("UPDATE naver_cafe_sources SET collection_started_at=1,initialization_completed_at=1,last_seen_article_id=1 WHERE id=?").bind(id).run();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ result: { articleList: [] } }));
  const sources = await readEnabledNaverCafeSources(runtime());
  const meter = meterD1(db);
  expect(await collectNaverCafePostsForSources(sources, { cacheDb: meter.db, siteId: "otw", trigger, scheduledFor })).toMatchObject({ success: true });
  expect(await db.prepare("SELECT last_attempt_at,last_success_at,cadence_anchor_at FROM naver_cafe_sources WHERE id=?").bind(id).first()).toEqual({
    last_attempt_at: actual, last_success_at: actual, cadence_anchor_at: trigger === "scheduled" ? scheduledFor : actual,
  });
  const progress = meter.entries.find(entry => entry.sql.startsWith("UPDATE naver_cafe_sources SET"))!;
  const before = await db.prepare(progress.sql.replace("cadence_anchor_at = ?,", ""))
    .bind(...progress.args.slice(0, 7), ...progress.args.slice(8)).run();
  expect(progress.rowsWritten).toBe(before.meta.rows_written);
  console.info("CAFE_CADENCE_WRITE_COST", JSON.stringify({ trigger, before: before.meta.rows_written, after: progress.rowsWritten }));
});

const finalizeX = (source: "manual" | "scheduled", status: string, completedAt: number, slot: number, database = db) =>
  new ScheduledJobExecutor(runtime(database), { readRunDto: async () => ({ jobType: "x_collection", source, status, finishedAt: completedAt, scheduledFor: slot }) } as never)
    .finalizeLegacyState("fixture-x");

it("atomically records X cadence while preserving real completion and rejecting stale finalizers", async () => {
  await db.prepare("DELETE FROM settings WHERE key IN ('x_collection_last_run','x_collection_last_success','x_collection_cadence_state')").run();
  const complete = scheduledFor + 45_000, meter = meterD1(db);
  const legacy = meterD1(db);
  for (const key of ["x_collection_last_run", "x_collection_last_success"]) {
    await legacy.db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
      WHERE CAST(settings.value AS INTEGER)<CAST(excluded.value AS INTEGER)`)
      .bind(key, String(complete), String(complete)).run();
  }
  await db.prepare("DELETE FROM settings WHERE key IN ('x_collection_last_run','x_collection_last_success')").run();
  await finalizeX("scheduled", "succeeded", complete, scheduledFor, meter.db);
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(String(complete));
  expect(JSON.parse(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first<string>("value") ?? "null"))
    .toEqual({ completedAt: complete, anchorAt: scheduledFor });
  const snapshot = (await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'x_collection_%' ORDER BY key").all()).results;
  await finalizeX("scheduled", "failed", complete - 1, scheduledFor - hour);
  expect((await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'x_collection_%' ORDER BY key").all()).results).toEqual(snapshot);
  const repeat = meterD1(db);
  await finalizeX("scheduled", "succeeded", complete, scheduledFor, repeat.db);
  expect(repeat.summary().rowsWritten).toBe(0);
  await db.prepare("CREATE TRIGGER cadence_fail BEFORE UPDATE ON settings WHEN NEW.key='x_collection_cadence_state' BEGIN SELECT RAISE(ABORT,'cadence write failed'); END").run();
  try {
    await expect(finalizeX("scheduled", "succeeded", complete + hour, scheduledFor + hour)).rejects.toThrow();
    expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(String(complete));
  } finally { await db.prepare("DROP TRIGGER cadence_fail").run(); }
  console.info("X_CADENCE_STATE_D1_COST", JSON.stringify({ legacy: legacy.summary(), initial: meter.summary(), replay: repeat.summary() }));
});

it.each([["scheduled", "partial"], ["scheduled", "failed"], ["manual", "succeeded"]] as const)("uses actual time for %s/%s X completion", async (source, status) => {
  const complete = scheduledFor + 2 * hour;
  await db.prepare("DELETE FROM settings WHERE key='x_collection_cadence_state' OR key='x_collection_last_run'").run();
  await finalizeX(source, status, complete, scheduledFor);
  expect(JSON.parse(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first<string>("value") ?? "null"))
    .toEqual({ completedAt: complete, anchorAt: complete });
});

const seedCafeSource = (id: number, attemptedHoursAgo: number, enabled = 1) => db.prepare(
  `INSERT INTO naver_cafe_sources(id,name,cafe_id,menu_id,cafe_url,enabled,last_attempt_at)
   VALUES(?,?,'123',?,'https://cafe.naver.com/test',?,?)`,
).bind(id, `source-${id}`, String(id), enabled, scheduledFor - attemptedHoursAgo * hour);

const seedCafePost = (id: number, sourceId: number, daysAgo: number, hidden = false) => db.prepare(
  `INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,title,summary,created_at,url,fetched_at,hidden_at)
   VALUES(?,?,?,'test','123','1','post','summary',?,'https://cafe.naver.com/test',?,?)`,
).bind(`cadence-post-${id}`, id, sourceId, new Date(scheduledFor - daysAgo * 24 * hour).toISOString(), scheduledFor, hidden ? scheduledFor : null);

it("seeks only eligible cafe sources and stays bounded as unrelated history grows", async () => {
  vi.spyOn(Date, "now").mockReturnValue(scheduledFor);
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  await db.batch([
    seedCafeSource(900301, 1), seedCafeSource(900302, 2), seedCafeSource(900303, 6),
    seedCafeSource(900304, 4), seedCafeSource(900305, 3), seedCafeSource(900306, 6, 0),
    seedCafePost(1, 900301, 0), seedCafePost(2, 900302, 2),
    seedCafePost(3, 900304, 8), seedCafePost(4, 900304, 0, true), seedCafePost(5, 900305, 2),
  ]);
  const small = meterD1(db);
  const first = await new ScheduledJobPlanner(runtime(small.db), {} as never).planScheduled("naver_cafe_collection", scheduledFor);
  expect(first.map(item => item.continuation)).toEqual([{ sourceIds: [900301, 900303, 900305], size: 15 }]);
  await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000)
    INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,title,summary,created_at,url,fetched_at)
    SELECT 'cadence-noise-'||x,10000+x,900306,'noise','123','2','noise','','2020-01-01','https://cafe.naver.com/noise',1 FROM n`).run();
  const grown = meterD1(db);
  expect(await new ScheduledJobPlanner(runtime(grown.db), {} as never).planScheduled("naver_cafe_collection", scheduledFor)).toEqual(first);
  const legacy = meterD1(db);
  await legacy.db.prepare("SELECT source_id,MAX(created_at) FROM naver_cafe_posts WHERE hidden_at IS NULL GROUP BY source_id").all();
  console.info("CAFE_PLANNER_D1_COST", JSON.stringify({ small: small.summary(), grown: grown.summary(), legacy: legacy.summary() }));
  expect(grown.summary().rowsWritten).toBe(0);
  expect(grown.summary().rowsRead).toBeLessThanOrEqual(small.summary().rowsRead + 16);
  const latestQuery = grown.entries.find(entry => entry.sql.includes("naver_cafe_posts"))!;
  const plan = await db.prepare(`EXPLAIN QUERY PLAN ${latestQuery.sql}`).bind(...latestQuery.args).all<{ detail: string }>();
  expect(plan.results.some(row => row.detail.includes("SEARCH") && row.detail.includes("idx_naver_cafe_posts_source_hidden_created"))).toBe(true);
});

it("does not inspect cafe post history when no source is eligible", async () => {
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  const meter = meterD1(db);
  expect(await new ScheduledJobPlanner(runtime(meter.db), {} as never).planScheduled("naver_cafe_collection", scheduledFor)).toEqual([]);
  expect(meter.entries.some(entry => entry.sql.includes("naver_cafe_posts"))).toBe(false);
  expect(meter.summary().rowsWritten).toBe(0);
});

it("indexes YouTube ownership without changing shared owners, site policy or fenced metadata", async () => {
  vi.spyOn(Date, "now").mockReturnValue(scheduledFor);
  await db.batch([
    db.prepare("DELETE FROM youtube_feed_videos"),db.prepare("DELETE FROM youtube_feed_sources"),
    db.prepare("DELETE FROM kirinuki_channels"),db.prepare("UPDATE members SET youtube_channel_id=NULL"),
    db.prepare("UPDATE member_links SET youtube_channel_id=NULL"),
    db.prepare("INSERT INTO members(uid,code,name) VALUES(903001,'owner-visible','Owner'),(903002,'owner-main','Main'),(903003,'owner-held','Held')"),
    db.prepare(`WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000)
      INSERT INTO members(uid,code,name) SELECT 910000+x,'owner-noise-'||x,'Noise' FROM n`),
    db.prepare(`WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000)
      INSERT INTO member_links(member_uid,type,label,url,enabled) SELECT 903001,'youtube_vod','Noise','https://youtube.com/noise',1 FROM n`),
    db.prepare(`INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json,phase)
      VALUES('owner-fence','otw','luvdia','otw-db','luvdia-db','otw','otw-db',2,1,'owner','{}','source_fenced')`),
  ]);
  const hidden=await db.prepare("SELECT uid FROM members WHERE code='bing_hayu'").first<number>('uid');
  const channels=[1,2,3,4].map(n=>`UC${String(903100+n).padStart(22,'0')}`);
  await db.batch([
    db.prepare("UPDATE members SET youtube_channel_id=?,is_deprecated=0 WHERE uid=?").bind(channels[1],hidden),
    db.prepare("UPDATE members SET youtube_channel_id=? WHERE uid=903002").bind(channels[2]),
    db.prepare("UPDATE members SET youtube_channel_id=? WHERE uid=903003").bind(channels[3]),
    ...[hidden,903001].map(uid=>db.prepare("INSERT INTO member_links(member_uid,type,label,url,youtube_channel_id,enabled) VALUES(?,'youtube_vod','Shared','https://youtube.com/shared',?,1)").bind(uid,channels[0])),
  ]);
  for(let n=0;n<4;n++)await db.batch([
    db.prepare(`INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,uploads_playlist_id,enabled,collection_started_at,initialization_completed_at,backfill_exhausted_at,next_check_at,created_at,updated_at)
      VALUES(?,'official',?,?,'uploads',1,1,1,1,?,1,1)`).bind(903101+n,[903001,hidden,903002,903003][n],channels[n],scheduledFor+24*hour),
    db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at) VALUES(?,?,'Owner',1,?)").bind('owner-video-'+n,903101+n,scheduledFor-48*hour),
  ]);
  await db.prepare("INSERT INTO content_transition_membership(transition_id,root_table,root_key,row_table,row_key) VALUES('owner-fence','youtube_feed_sources','[903104]','youtube_feed_sources','[903104]')").run();
  vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
    const url=new URL(String(input));
    if(!url.pathname.endsWith('/videos'))throw new Error('Unexpected provider '+url.pathname);
    return Response.json({items:(url.searchParams.get('id')??'').split(',').map(id=>({id,snippet:{title:id,publishedAt:'2026-10-21T00:00:00Z'},contentDetails:{duration:'PT30S'},statistics:{viewCount:'1'}}))});
  });
  const capture=meterD1(db),collectorEnv={...runtime(capture.db),YOUTUBE_API_KEY:'local-fixture'};
  expect(await hasScheduledYouTubeFeedWork(collectorEnv,scheduledFor)).toBe(true);
  expect(await runScheduledYouTubeFeedCollection(collectorEnv)).toMatchObject({metadataRefreshed:2,failed:0});
  const work=capture.entries.find(row=>row.sql.includes('AS has_work'))!;
  const metadata=capture.entries.find(row=>row.sql.includes('json_group_array(row_key)'))!;
  const read=async()=>{
    await db.prepare("UPDATE youtube_feed_videos SET fetched_at=?").bind(scheduledFor-48*hour).run();
    const meter=meterD1(db);
    await meter.db.prepare(work.sql).bind(...work.args).all();
    const rows=await meter.db.prepare(metadata.sql).bind(...metadata.args).all<{video_id:string}>();
    return {cost:meter.summary(),metadataReads:meter.entries[1].rowsRead,ids:rows.results.map(row=>row.video_id)};
  };
  const indexed=await read();
  expect(indexed.ids).toEqual(['owner-video-0','owner-video-2']);
  console.info('YOUTUBE_OWNER_INDEXED_COST',JSON.stringify({total:indexed.cost,metadataReads:indexed.metadataReads}));
  expect(indexed.metadataReads).toBeLessThan(200);
  expect(indexed.cost.rowsWritten).toBe(0);
  const indexes=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE name IN ('idx_members_youtube_channel','idx_member_links_youtube_owner')").all<{name:string;sql:string}>()).results;
  expect(indexes).toHaveLength(2);
  await db.batch(indexes.map(index=>db.prepare(`DROP INDEX ${index.name}`)));
  try {
    const unindexed=await read();expect(unindexed.ids).toEqual(indexed.ids);
    expect(indexed.cost.rowsRead).toBeLessThan(unindexed.cost.rowsRead/4);
    expect(indexed.metadataReads).toBeLessThan(unindexed.metadataReads/10);
    const memberInsert=(uid:number)=>db.prepare("INSERT INTO members(uid,code,name,youtube_channel_id) VALUES(?,?,'Write',?)").bind(uid,'write-'+uid,channels[0]);
    const linkInsert=()=>db.prepare("INSERT INTO member_links(member_uid,type,label,url,youtube_channel_id) VALUES(903001,'youtube_vod','Write','https://youtube.com/write',?)").bind(channels[0]);
    const writesBefore=await db.batch([memberInsert(903010),linkInsert()]);
    const builds=await db.batch(indexes.map(index=>db.prepare(index.sql)));
    const writesAfter=await db.batch([memberInsert(903011),linkInsert()]);
    expect(writesAfter.map((row,i)=>row.meta.rows_written-writesBefore[i].meta.rows_written)).toEqual([1,1]);
    console.info('YOUTUBE_OWNER_D1_COST',JSON.stringify({before:unindexed.cost,after:indexed.cost,metadataBefore:unindexed.metadataReads,metadataAfter:indexed.metadataReads,builds:builds.map(row=>row.meta),insertBefore:writesBefore.map(row=>row.meta.rows_written),insertAfter:writesAfter.map(row=>row.meta.rows_written)}));
  } finally {await db.batch(indexes.map(index=>db.prepare(index.sql.replace('CREATE INDEX','CREATE INDEX IF NOT EXISTS'))));}
  const luv=meterD1(db);
  expect(await runScheduledYouTubeFeedCollection({...runtime(luv.db),...siteEnv('luvdia'),YOUTUBE_API_KEY:'local-fixture'} as Env)).toMatchObject({metadataRefreshed:3,failed:0});
  expect(await db.prepare("SELECT fetched_at FROM youtube_feed_videos WHERE video_id='owner-video-3'").first('fetched_at')).toBe(scheduledFor-48*hour);
});

it("seeks YouTube policy membership without changing fenced metadata candidates", async () => {
  vi.spyOn(Date, "now").mockReturnValue(scheduledFor);
  const index = await db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_content_transition_membership_lookup'").first<{ sql: string }>();
  expect(index, "migration must install the row-first membership index").not.toBeNull();
  await db.batch([
    db.prepare("DELETE FROM youtube_feed_videos"), db.prepare("DELETE FROM youtube_feed_sources"),
    db.prepare("DELETE FROM kirinuki_channels"), db.prepare("UPDATE members SET youtube_channel_id=NULL"),
    db.prepare("UPDATE member_links SET youtube_channel_id=NULL"),
    db.prepare(`INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json,phase)
      VALUES('cadence-fence','otw','luvdia','otw-db','luvdia-db','otw','otw-db',2,1,'cadence','{}','complete')`),
  ]);
  for (let n = 1; n <= 20; n++) {
    const id = 900400 + n, channel = `UC${String(n).padStart(22, "0")}`;
    await db.batch([
      db.prepare("INSERT INTO kirinuki_channels(id,channel_name,channel_url,youtube_channel_id) VALUES(?,'cost','https://youtube.com',?)").bind(id, channel),
      db.prepare(`INSERT INTO youtube_feed_sources(id,source_kind,kirinuki_channel_id,youtube_channel_id,uploads_playlist_id,enabled,collection_started_at,initialization_completed_at,backfill_exhausted_at,next_check_at,created_at,updated_at)
        VALUES(?,'kirinuki',?,?,'uploads',1,1,1,1,?,?,?)`).bind(id, id, channel, scheduledFor + 24 * hour, scheduledFor, scheduledFor),
      db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at) VALUES(?,?,'cost',1,?)").bind(`cadence-video-${n}`, id, scheduledFor - 48 * hour),
    ]);
  }
  await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000)
    INSERT INTO content_transition_membership(transition_id,root_table,root_key,row_table,row_key)
    SELECT 'cadence-fence','youtube_feed_sources',json_array(10000+x),'youtube_feed_sources',json_array(10000+x) FROM n`).run();
  await db.prepare("INSERT INTO content_transition_membership(transition_id,root_table,root_key,row_table,row_key) VALUES('cadence-fence','youtube_feed_sources','[900420]','youtube_feed_sources','[900420]')").run();
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/videos")) throw new Error(`Unexpected provider ${url.pathname}`);
    return Response.json({ items: (url.searchParams.get("id") ?? "").split(",").map(id => ({
      id, snippet: { title: id, publishedAt: "2026-10-21T00:00:00Z" }, contentDetails: { duration: "PT30S" }, statistics: { viewCount: "1" },
    })) });
  });
  const capture = meterD1(db), collectorEnv = { ...runtime(capture.db), YOUTUBE_API_KEY: "local-fixture" };
  expect(await hasScheduledYouTubeFeedWork(collectorEnv, scheduledFor)).toBe(true);
  expect(await runScheduledYouTubeFeedCollection(collectorEnv)).toMatchObject({ metadataRefreshed: 19, failed: 0 });
  const work = capture.entries.find(entry => entry.sql.includes("AS has_work"))!;
  const metadata = capture.entries.find(entry => entry.sql.includes("json_group_array(row_key)"))!;
  await db.prepare("UPDATE youtube_feed_videos SET fetched_at=?").bind(scheduledFor - 48 * hour).run();
  const read = async () => {
    const meter = meterD1(db);
    const workRows = await meter.db.prepare(work.sql).bind(...work.args).all();
    const metadataRows = await meter.db.prepare(metadata.sql).bind(...metadata.args).all();
    return { entries: meter.entries, summary: meter.summary(), workRows: workRows.results, metadataRows: metadataRows.results };
  };
  const indexed = await read();
  expect(indexed.metadataRows).toHaveLength(19);
  expect(indexed.metadataRows.some(row => row.video_id === "cadence-video-20")).toBe(false);
  const plan = await db.prepare(`EXPLAIN QUERY PLAN ${metadata.sql}`).bind(...metadata.args).all<{ detail: string }>();
  expect(plan.results.some(row => row.detail.includes("SEARCH held USING COVERING INDEX idx_content_transition_membership_lookup"))).toBe(true);
  await db.prepare("DROP INDEX idx_content_transition_membership_lookup").run();
  try {
    const membershipWrite = async () => {
      const insert = await db.prepare("INSERT INTO content_transition_membership(transition_id,root_table,root_key,row_table,row_key) VALUES('cadence-fence','youtube_feed_sources','[999999]','youtube_feed_sources','[999999]')").run();
      const update = await db.prepare("UPDATE content_transition_membership SET row_key='[999998]' WHERE transition_id='cadence-fence' AND row_table='youtube_feed_sources' AND row_key='[999999]'").run();
      const remove = await db.prepare("DELETE FROM content_transition_membership WHERE transition_id='cadence-fence' AND row_key='[999998]'").run();
      return { insertRowsWritten: insert.meta.rows_written, updateRowsWritten: update.meta.rows_written, deleteRowsWritten: remove.meta.rows_written };
    };
    const writesBefore = await membershipWrite();
    const unindexed = await read();
    expect(indexed.workRows).toEqual(unindexed.workRows);
    expect(indexed.metadataRows).toEqual(unindexed.metadataRows);
    expect(indexed.summary.rowsRead).toBeLessThan(unindexed.summary.rowsRead / 10);
    const recreate = await db.prepare(index!.sql).run();
    const writesAfter = await membershipWrite();
    expect(writesAfter.insertRowsWritten).toBe(writesBefore.insertRowsWritten + 1);
    expect(writesAfter.deleteRowsWritten).toBe(writesBefore.deleteRowsWritten);
    console.info("YOUTUBE_MEMBERSHIP_D1_COST", JSON.stringify({ before: unindexed.summary, after: indexed.summary, indexBuild: recreate.meta, writesBefore, writesAfter }));
  } finally {
    await db.prepare(index!.sql.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS")).run();
  }
});
