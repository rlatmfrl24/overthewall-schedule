import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { D1ScheduledJobRepository } from "../../../platform/scheduled-jobs";
import { D1SharedXApiGateway, D1SharedXBudget, runFxCollectionForHandles } from "../../x-posts";
import { ScheduledJobPlanner } from "./scheduled-job-planner";
import { ScheduledJobExecutor } from "./scheduled-job-executor";
import { writeStoredPosts } from "../../x-posts/infrastructure/x-api";

const bindings = { ...env, SITE_ID: "otw" } as Env & { X_REFERENCE_MIGRATIONS: D1Migration[]; SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[] };
const db = bindings.otw_db, hour = 3600000;
let time: number;
const runtime = () => ({ ...bindings, X_BEARER_TOKEN: "fixture", X_API_GATEWAY: new D1SharedXApiGateway({ db, site: "otw", token: "fixture", admitD1: async () => true }) });
beforeEach(async () => {
  time = Date.parse("2026-11-03T00:23:00Z");
  vi.spyOn(Date, "now").mockImplementation(() => time);
  await applyD1Migrations(db, [...new Map([...bindings.X_REFERENCE_MIGRATIONS, ...bindings.SCHEDULED_OPERATIONS_MIGRATIONS].map(migration => [migration.name, migration])).values()]);
  await db.batch([
    ...["scheduled_outbox", "scheduled_job_items", "scheduled_job_runs", "x_post_references", "x_post_facts", "x_posts", "x_fx_sources", "x_post_sources", "x_api_cache", "x_shared_requests", "x_shared_budgets", "members"].map(table => db.prepare(`DELETE FROM ${table}`)),
    ...[["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"], ["x_collection_interval_hours", "24"], ["x_cost_optimizer_enabled", "true"], ["x_reference_preview_mode", "link_only"], ["x_collection_daily_budget_cents", "100"], ["x_collection_last_run", String(time - 2 * hour)]].map(([key, value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key, value)),
    db.prepare("DELETE FROM settings WHERE key IN ('x_api_backoff_until','x_collection_cadence_state')"),
    ...["member_a", "member_b"].flatMap((handle, i) => [
      db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(?,?,?,?)").bind(i + 1, handle, handle, `https://x.com/${handle}`),
      db.prepare("INSERT INTO x_post_sources(handle,user_id,last_checked_at,updated_at,collection_started_at,last_completed_at,next_check_at,last_seen_post_id) VALUES(?,?,0,0,1,?,?, '100')").bind(handle, String(101 + i), time - 3 * hour, time + 21 * hour),
      db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,updated_at,cadence_anchor_at) VALUES(?,1,0,?)").bind(handle, time - hour),
      db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'user',?,?,?)").bind(`x:user:v1:${handle}`, JSON.stringify({ user: { id: String(101 + i), username: handle } }), time, time + 24 * hour),
    ]),
  ]);
  await new D1SharedXBudget(db).initialize([{ day: "2026-11-03", used: 0, reserved: 0 }, { day: "2026-11-03", used: 0, reserved: 0 }]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const plans = () => new ScheduledJobPlanner(runtime(), new D1ScheduledJobRepository(db)).planScheduled("x_collection", time);
it("keeps an empty official timeline cursor independent from stored Fx posts", async () => {
  await db.prepare("UPDATE settings SET value=? WHERE key='x_collection_last_run'").bind(String(time-25*hour)).run();
  await db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?").bind(time).run();
  await db.prepare("UPDATE x_post_sources SET last_seen_post_id=NULL").run();
  await writeStoredPosts(db,"member_a",{id:"101",username:"member_a"},[{id:"200",username:"member_a",text:"Fx only",url:"https://x.com/member_a/status/200",createdAt:new Date(time-1000).toISOString(),media:[],metrics:{likeCount:0,replyCount:0,repostCount:0,quoteCount:0}}],time,"otw",{origin:"fxembed",completeness:{text:true,media:true,relations:true}});
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>Response.json({data:[]})));
  const repository=new D1ScheduledJobRepository(db),executor=new ScheduledJobExecutor(runtime(),repository);
  const run=await repository.createRun({jobType:"x_collection",source:"scheduled",idempotencyKey:"empty-official",scheduledFor:time});
  const items=await new ScheduledJobPlanner(runtime(),repository).plan(run);
  for(const id of items){const item=(await repository.claimItem(id))!;await repository.completeItem(item,await executor.execute(item));}
  expect(await db.prepare("SELECT last_seen_post_id,collection_started_at FROM x_post_sources WHERE handle='member_a'").first()).toEqual({last_seen_post_id:null,collection_started_at:1});
});
it("retains the completed account when another account in the same regular shard fails", async () => {
  await db.prepare("UPDATE settings SET value=? WHERE key='x_collection_last_run'").bind(String(time-25*hour)).run();
  await db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?").bind(time).run();
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async(input:RequestInfo|URL)=>String(input).includes('/101/')?Response.json({data:[]}):new Response('provider down',{status:503})));
  const repository=new D1ScheduledJobRepository(db),executor=new ScheduledJobExecutor(runtime(),repository);
  const run=await repository.createRun({jobType:"x_collection",source:"scheduled",idempotencyKey:"partial-shard",scheduledFor:time});
  const [id]=await new ScheduledJobPlanner(runtime(),repository).plan(run);
  const item=(await repository.claimItem(id))!;
  expect(JSON.parse(item.continuation_json!).handles).toEqual(["member_a","member_b"]);
  const outcome=await executor.execute(item);
  await repository.completeItem(item,outcome);
  expect(await db.prepare("SELECT regular_completed_at FROM x_post_sources WHERE handle='member_a'").first("regular_completed_at")).toBe(time);
  time=Number(await db.prepare("SELECT next_check_at FROM x_post_sources WHERE handle='member_b'").first("next_check_at"))+1;
  const next=(await plans()).filter(item=>item.continuation?.provider==='x_api');
  expect(next.flatMap(item=>item.continuation?.handles??[])).toEqual(['member_b']);
  expect(await db.prepare("SELECT regular_completed_at FROM x_post_sources WHERE handle='member_b'").first("regular_completed_at")).toBeNull();
});
it.each([{ provider: "unknown" }, { provider: "x_api", scope: "unknown" }])("rejects malformed provider metadata before any external call", async metadata => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ data: [] })));
  const repository = new D1ScheduledJobRepository(db);
  const run = await repository.createRun({ jobType: "x_collection", source: "manual", idempotencyKey: JSON.stringify(metadata) });
  const [id] = await repository.addItems(run.id, [{ targetKey: "invalid", phase: "collect", lane: "x", continuation: { handles: ["member_a"], ...metadata } }]);
  await expect(new ScheduledJobExecutor(runtime(), repository).execute((await repository.claimItem(id))!)).rejects.toThrow(/invalid_x_collection/);
  expect(fetch).not.toHaveBeenCalled();
});
it("runs fallback only for the failed account and clears it after two successful Fx checks", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("down", { status: 503 })));
  await runFxCollectionForHandles(runtime(), ["member_a"], "scheduled", time);
  time += 30 * 60000;
  await runFxCollectionForHandles(runtime(), ["member_a"], "scheduled", time);
  expect(await db.prepare("SELECT fallback_active FROM x_fx_sources WHERE handle='member_a'").first("fallback_active")).toBe(1);
  const planned = await plans();
  expect(planned.filter(item => item.continuation?.scope === "fallback").map(item => item.continuation?.handles)).toEqual([["member_a"]]);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ code: 200, results: [], cursor: {} })));
  await runFxCollectionForHandles(runtime(), ["member_a"], "scheduled", time);
  expect(await db.prepare("SELECT fallback_active FROM x_fx_sources WHERE handle='member_a'").first("fallback_active")).toBe(1);
  await db.prepare("UPDATE x_post_sources SET sync_pagination_token='unfinished' WHERE handle='member_a'").run();
  time += 30 * 60000;
  await runFxCollectionForHandles(runtime(), ["member_a"], "scheduled", time);
  expect(await db.prepare("SELECT fallback_active FROM x_fx_sources WHERE handle='member_a'").first("fallback_active")).toBe(0);
  expect(await db.prepare("SELECT sync_pagination_token FROM x_post_sources WHERE handle='member_a'").first("sync_pagination_token")).toBe("unfinished");
});
it("official fallback independently discovers an Fx-missed post without changing the regular anchor", async () => {
  await db.prepare("UPDATE x_fx_sources SET fallback_active=1,cadence_anchor_at=? WHERE handle='member_a'").bind(time).run();
  await db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=? WHERE handle='member_b'").bind(time).run();
  const before = await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value");
  const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/2/users/101/tweets");
    expect(url.searchParams.get("since_id")).toBe("100");
    return Response.json({ data: [{ id: "200", text: "official discovery", created_at: new Date(time - 1000).toISOString() }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const repository = new D1ScheduledJobRepository(db), executor = new ScheduledJobExecutor(runtime(), repository);
  const run = await repository.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "fallback", scheduledFor: time });
  const items = await new ScheduledJobPlanner(runtime(), repository).plan(run);
  expect(items).toHaveLength(1);
  const item = (await repository.claimItem(items[0]))!;
  expect(JSON.parse(item.continuation_json!)).toMatchObject({ provider: "x_api", scope: "fallback", handles: ["member_a"] });
  const outcome = await executor.execute(item);
  expect(outcome.status).toBe("succeeded");
  await repository.completeItem(item, outcome);
  await executor.finalizeLegacyState(run.id);
  expect(await db.prepare("SELECT last_completed_at,regular_completed_at FROM x_post_sources WHERE handle='member_a'").first()).toEqual({ last_completed_at: time, regular_completed_at: null });
  expect(await db.prepare("SELECT id FROM x_posts WHERE handle='member_a'").first("id")).toBe("200");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(before);
  expect((await plans()).filter(item => item.continuation?.scope === "fallback")).toHaveLength(0);
});
it("completes a regular cohort only after pending work and an independent regular check", async () => {
  const baseline = String(time - 25 * hour);
  await db.prepare("UPDATE settings SET value=? WHERE key='x_collection_last_run'").bind(baseline).run();
  await db.prepare("UPDATE x_fx_sources SET cadence_anchor_at=?").bind(time).run();
  await db.prepare("UPDATE x_post_sources SET sync_pagination_token='tail',sync_base_post_id='100',next_check_at=0 WHERE handle='member_b'").run();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "api.fxtwitter.com") return Response.json({ code: 200, results: [], cursor: {} });
    const tail = url.searchParams.get("pagination_token");
    return Response.json(tail === "tail" ? { data: [{ id: "201", text: "partial", created_at: new Date(time - 1000).toISOString() }], meta: { next_token: "tail2" } } : tail === "tail2" || url.searchParams.get("since_id") === "201" ? { data: [] } : { data: [{ id: "200", text: "regular", created_at: new Date(time - 1000).toISOString() }] });
  }));
  const repository = new D1ScheduledJobRepository(db), executor = new ScheduledJobExecutor(runtime(), repository);
  const execute = async (key: string) => {
    const run = await repository.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: key, scheduledFor: time });
    const items = await new ScheduledJobPlanner(runtime(), repository).plan(run);
    for (const id of items) { const item = (await repository.claimItem(id))!; await repository.completeItem(item, await executor.execute(item)); }
    await executor.finalizeLegacyState(run.id);
  };
  await execute("regular-first");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(baseline);
  time += 30 * 60000;
  expect((await plans()).filter(item => item.continuation?.provider === "x_api").map(item => item.continuation?.scope)).toEqual(["pending"]);
  await execute("pending-complete");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(baseline);
  time += 30 * 60000;
  expect((await plans()).filter(item => item.continuation?.provider === "x_api").map(item => item.continuation?.handles)).toEqual([["member_b"]]);
  await execute("regular-complete");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(String(time));
});
it("preserves pending cursors and regular cadence when the common budget is exhausted", async () => {
  await db.prepare("UPDATE x_post_sources SET sync_pagination_token='pending',next_check_at=0 WHERE handle='member_a'").run();
  await db.prepare("UPDATE x_shared_budgets SET used=limit_value").run();
  const anchor = await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value");
  const planned = await plans();
  expect(planned.length).toBeGreaterThan(0);
  expect(planned.every(item => item.continuation?.provider === "fxembed")).toBe(true);
  expect(await db.prepare("SELECT sync_pagination_token FROM x_post_sources WHERE handle='member_a'").first("sync_pagination_token")).toBe("pending");
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(anchor);
});
it("keeps the 24h anchor on an Fx-only normal execution", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ code: 200, results: [], cursor: {} })));
  const repository = new D1ScheduledJobRepository(db), executor = new ScheduledJobExecutor(runtime(), repository);
  const anchor = await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value");
  const run = await repository.createRun({ jobType: "x_collection", source: "scheduled", idempotencyKey: "fx-only", scheduledFor: time });
  const items = await new ScheduledJobPlanner(runtime(), repository).plan(run);
  expect(items).toHaveLength(1);
  const item = (await repository.claimItem(items[0]))!;
  const outcome = await executor.execute(item);
  expect(outcome.status).toBe("succeeded");
  await repository.completeItem(item, outcome);
  await executor.finalizeLegacyState(run.id);
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(anchor);
});
