import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { clearXServiceCachesForTests } from "./x-api";
import { runXCollectionForHandles } from "./x-collection";
import { readHybridXCollectionTargets } from "./x-hybrid-policy";
import { D1SharedXApiGateway } from "./x-shared-budget";

const HOUR = 3_600_000;
const timestamp = Date.parse("2026-11-03T00:00:00Z");
const runtime = { ...env, SITE_ID: "otw", X_BEARER_TOKEN: "fixture" } as unknown as Env & { X_REFERENCE_MIGRATIONS: D1Migration[] };
const db = runtime.otw_db;
runtime.X_API_GATEWAY = new D1SharedXApiGateway({ db, site: "otw", token: "fixture", admitD1: async () => true });
let clock: ReturnType<typeof vi.spyOn>;
const source = () => db.prepare("SELECT * FROM x_post_sources WHERE handle='member'").first<Record<string, unknown>>();
const collect = (scope: "regular" | "pending" | "fallback") => runXCollectionForHandles(runtime, ["member"], "scheduled", Date.now(), scope === "pending", undefined, scope);
const page = (next: string | null = null, quote = false) => Response.json({ data: [{ id: "200", text: "new", created_at: new Date(timestamp).toISOString(), ...(quote ? { referenced_tweets: [{ type: "quoted", id: "150" }] } : {}) }], meta: next ? { next_token: next } : {} });
const provider = (timeline: (url: URL) => Response | Promise<Response>) => {
  const calls: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/2/users/by") return Response.json({ data: [{ id: "1", username: "member" }] });
    if (url.pathname === "/2/users/1/tweets") { calls.push(url); return timeline(url); }
    throw new Error(`Unexpected fake provider request ${url.pathname}`);
  }));
  return calls;
};
beforeEach(async () => {
  await applyD1Migrations(db, runtime.X_REFERENCE_MIGRATIONS);
  for (const table of ["x_post_references", "x_post_facts", "x_posts", "x_post_sources", "x_fx_sources", "x_api_cache", "x_api_usage_events", "x_api_usage_daily", "x_api_resource_daily", "x_shared_requests", "x_shared_budgets", "x_collection_runs", "members", "settings"]) await db.prepare(`DELETE FROM ${table}`).run();
  clock = vi.spyOn(Date, "now").mockReturnValue(timestamp);
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')").run();
  await db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at) VALUES('member','1','member','100',0,0,1)").run();
  await db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_enabled','true'),('x_collection_primary_source','fxembed'),('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at',?),('x_cost_optimizer_enabled','true'),('x_reference_preview_mode','link_only')").bind(String(timestamp - 24 * HOUR)).run();
  await db.prepare("INSERT INTO x_shared_budgets(day,used,reserved,limit_value,seed_detail,updated_at) VALUES(?,0,0,1000000,'{}',0)").bind(new Date(timestamp).toISOString().slice(0,10)).run();
  clearXServiceCachesForTests();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); clearXServiceCachesForTests(); });

it("regular_resume_finishes_original_scope", async () => {
  const calls = provider(url => page(url.searchParams.has("pagination_token") ? null : "page2"));
  await collect("regular");
  expect((await source())?.regular_completed_at).toBeNull();
  clearXServiceCachesForTests();
  clock.mockReturnValue(timestamp + HOUR);
  await collect("pending");
  const after = await source();
  expect(after?.regular_completed_at).toBe(after?.last_completed_at);
  expect(after?.regular_completed_at).toBe(timestamp + HOUR);
  expect(calls).toHaveLength(2);
  expect(calls[1].searchParams.get("pagination_token")).toBe("page2");
});
it("plans healthy accounts independently of an unfinished peer and recent site anchor", async () => {
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(2,'failed','Failed','https://x.com/failed')").run();
  await db.prepare("UPDATE x_post_sources SET regular_completed_at=? WHERE handle='member'").bind(timestamp - 12 * HOUR).run();
  await db.prepare("INSERT INTO x_post_sources(handle,last_checked_at,updated_at,sync_pagination_token,last_error_code,next_check_at) VALUES('failed',0,0,'pending','provider_error',?)").bind(timestamp + HOUR).run();
  await db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_last_run',?)").bind(String(timestamp - HOUR)).run();
  const plan = await readHybridXCollectionTargets(runtime, timestamp);
  expect(plan.filter(item => item.provider === "x_api").flatMap(item => item.handles)).toEqual(["member"]);
});
it("creates one official item per account ordered by overdue time, last attempt, then handle", async () => {
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(2,'alpha','Alpha','https://x.com/alpha'),(3,'zeta','Zeta','https://x.com/zeta')").run();
  await db.prepare("UPDATE x_post_sources SET regular_completed_at=?,last_attempt_at=10").bind(timestamp - 12 * HOUR).run();
  await db.prepare("INSERT INTO x_post_sources(handle,last_checked_at,updated_at,regular_completed_at,last_attempt_at) VALUES('alpha',0,0,?,100),('zeta',0,0,?,0)")
    .bind(timestamp - 24 * HOUR, timestamp - 12 * HOUR).run();
  const plan = (await readHybridXCollectionTargets(runtime, timestamp)).filter(item => item.provider === "x_api");
  expect(plan.map(item => item.handles)).toEqual([["alpha"], ["zeta"], ["member"]]);
  expect(plan.every(item => item.scope === "regular")).toBe(true);
});
it("keeps fallback and unknown legacy pending out of regular completion", async () => {
  const previous = timestamp - HOUR;
  await db.prepare("UPDATE x_post_sources SET regular_completed_at=?").bind(previous).run();
  await db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,fallback_active,updated_at) VALUES('member',1,1,0)").run();
  provider(() => page());
  await collect("fallback");
  expect((await source())?.regular_completed_at).toBe(previous);
  await db.prepare("UPDATE x_post_sources SET sync_pagination_token='old',next_check_at=0").run();
  clearXServiceCachesForTests();
  await collect("pending");
  expect((await source())?.regular_completed_at).toBe(previous);
});
it("keeps absent policy on the legacy 24-hour plan without RSS", async () => {
  await db.prepare("DELETE FROM settings WHERE key IN ('x_collection_hybrid_policy','x_collection_hybrid_activated_at')").run();
  await db.prepare("UPDATE x_post_sources SET regular_completed_at=?").bind(timestamp - 12 * HOUR).run();
  await db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_last_run',?)").bind(String(timestamp - 12 * HOUR)).run();
  const plan = await readHybridXCollectionTargets(runtime, timestamp);
  expect(plan.some(item => item.provider === "x_api")).toBe(false);
  expect(plan.some(item => "mode" in item && item.mode === "rss_candidates")).toBe(false);
});
it("acknowledges an empty final page as regular only after finalization", async () => {
  provider(() => Response.json({ data: [], meta: {} }));
  await collect("regular");
  expect(await source()).toMatchObject({ last_seen_post_id: "100", last_completed_at: timestamp, regular_completed_at: timestamp,
    sync_origin_scope: null, sync_origin_started_at: null, sync_timeline_completed_at: null });
});
it("replays derived writes after restart without purchasing an acknowledged final page again", async () => {
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('150','member','member',?, ?,0,0)")
    .bind(JSON.stringify({ id: "150", text: "parent", username: "member", createdAt: new Date(timestamp).toISOString(), url: "https://x.com/member/status/150", media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 } }), new Date(timestamp).toISOString()).run();
  const calls = provider(() => page(null, true));
  await db.exec("CREATE TRIGGER fail_derived BEFORE UPDATE OF resolution_state ON x_post_references BEGIN SELECT RAISE(ABORT,'derived failure'); END;");
  try {
    await expect(collect("regular")).rejects.toThrow();
    expect(await source()).toMatchObject({ last_completed_at: null, regular_completed_at: null, sync_origin_scope: "regular", sync_timeline_completed_at: timestamp });
  } finally { await db.exec("DROP TRIGGER fail_derived;"); }
  clearXServiceCachesForTests();
  clock.mockReturnValue(timestamp + HOUR);
  await db.prepare("UPDATE x_shared_budgets SET used=limit_value").run();
  expect((await readHybridXCollectionTargets(runtime, Date.now())).filter(item => item.provider === "x_api")).toMatchObject([{ scope: "pending", handles: ["member"] }]);
  const dispatchedBeforeRepair = vi.mocked(fetch).mock.calls.length;
  expect(await collect("pending")).toMatchObject({ apiCalls: 0 });
  expect(vi.mocked(fetch).mock.calls).toHaveLength(dispatchedBeforeRepair);
  expect(calls).toHaveLength(1);
  expect(await source()).toMatchObject({ last_completed_at: timestamp + HOUR, regular_completed_at: timestamp + HOUR, sync_origin_scope: null });
});
it("does not acknowledge mandatory reference-store failure or advance the official cursor", async () => {
  provider(() => page(null, true));
  await db.exec("CREATE TRIGGER fail_reference BEFORE INSERT ON x_post_references BEGIN SELECT RAISE(ABORT,'reference failure'); END;");
  try {
    await expect(collect("regular")).rejects.toThrow();
    expect(await source()).toMatchObject({ last_seen_post_id: "100", last_completed_at: null, regular_completed_at: null, sync_timeline_completed_at: null, sync_origin_scope: "regular" });
  } finally { await db.exec("DROP TRIGGER fail_reference;"); }
  clearXServiceCachesForTests();
  clock.mockReturnValue(timestamp + HOUR);
  await collect("pending");
  expect(await source()).toMatchObject({ last_seen_post_id: "200", regular_completed_at: timestamp + HOUR });
});
it("never acknowledges a page after losing its source lease", async () => {
  provider(async () => {
    await db.prepare("UPDATE x_post_sources SET lease_token='other',lease_until=?").bind(timestamp + HOUR).run();
    return page();
  });
  await expect(collect("regular")).rejects.toThrow();
  expect(await source()).toMatchObject({ last_seen_post_id: "100", last_completed_at: null, regular_completed_at: null, sync_timeline_completed_at: null, lease_token: "other" });
});
it("keeps budget interruption unfinished without a paid provider call", async () => {
  const calls = provider(() => page());
  await db.prepare("UPDATE x_shared_budgets SET used=limit_value").run();
  await collect("regular");
  expect(calls).toHaveLength(0);
  expect(await source()).toMatchObject({ last_completed_at: null, regular_completed_at: null, sync_timeline_completed_at: null, sync_origin_scope: "regular" });
});
it("finishes a terminal hidden quote without losing the next regular timeline", async () => {
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at,hidden_at,content_removed_at) VALUES('150','parent','parent','{}',?,0,0,1,1)")
    .bind(new Date(timestamp).toISOString()).run();
  const calls = provider(() => page(null, true));
  await collect("regular");
  const terminal = { resolution_state: "terminal", author_state: "terminal", last_error_code: "not_found_or_unavailable", author_last_error_code: null };
  const reference = () => db.prepare("SELECT resolution_state,author_state,last_error_code,author_last_error_code FROM x_post_references WHERE source_post_id='200'").first();
  expect(await reference()).toEqual(terminal);
  expect(await source()).toMatchObject({ last_completed_at: timestamp, regular_completed_at: timestamp,
    sync_origin_scope: null, sync_origin_started_at: null, sync_timeline_completed_at: null });
  clearXServiceCachesForTests();
  clock.mockReturnValue(timestamp + 12 * HOUR);
  expect((await readHybridXCollectionTargets(runtime, Date.now())).filter(item => item.provider === "x_api")).toMatchObject([{ scope: "regular", handles: ["member"] }]);
  await collect("regular");
  expect(calls).toHaveLength(2);
  expect(await source()).toMatchObject({ last_completed_at: timestamp + 12 * HOUR, regular_completed_at: timestamp + 12 * HOUR,
    sync_origin_scope: null, sync_timeline_completed_at: null });
  expect(await reference()).toEqual(terminal);
  expect(await db.prepare("SELECT value,hidden_at,content_removed_at FROM x_posts WHERE id='150'").first()).toEqual({ value: "{}", hidden_at: 1, content_removed_at: 1 });
  expect(vi.mocked(fetch).mock.calls.every(([input]) => !new URL(String(input)).pathname.startsWith("/2/tweets"))).toBe(true);
});
it("keeps genuine retryable reference errors pending even when their retry is not due", async () => {
  await db.prepare("UPDATE settings SET value='post_only' WHERE key='x_reference_preview_mode'").run();
  provider(() => page(null, true));
  await collect("regular");
  const reference = await db.prepare("SELECT resolution_state,last_error_code,next_attempt_at FROM x_post_references WHERE source_post_id='200'").first<{ resolution_state: string; last_error_code: string | null; next_attempt_at: number }>();
  expect(reference?.resolution_state).not.toBe("terminal");
  expect(reference?.last_error_code).toBeTruthy();
  expect(await source()).toMatchObject({ last_completed_at: null, regular_completed_at: null, sync_origin_scope: "regular", sync_timeline_completed_at: timestamp });
  clearXServiceCachesForTests();
  clock.mockReturnValue(timestamp + 15 * 60_000);
  expect(reference!.next_attempt_at).toBeGreaterThan(Date.now());
  await collect("pending");
  expect(await source()).toMatchObject({ last_completed_at: null, regular_completed_at: null, sync_origin_scope: "regular", sync_timeline_completed_at: timestamp });
});

it("retires old hybrid final-page proof under the legacy account lease before returning to Fx",async()=>{
  const calls=provider(()=>page());
  await db.prepare("UPDATE x_post_sources SET sync_origin_scope='regular',sync_origin_started_at=?,sync_timeline_completed_at=?,last_error='derived_pending'").bind(timestamp-HOUR,timestamp-HOUR).run();
  await db.prepare("UPDATE settings SET value='x_api' WHERE key='x_collection_primary_source'").run();
  await runXCollectionForHandles(runtime,["member"],"manual");
  expect(await source()).toMatchObject({sync_origin_scope:null,sync_origin_started_at:null,sync_timeline_completed_at:null,last_seen_post_id:"200"});
  const before=calls.length;
  clearXServiceCachesForTests();clock.mockReturnValue(timestamp+13*HOUR);
  await db.prepare("UPDATE settings SET value='fxembed' WHERE key='x_collection_primary_source'").run();
  await collect("regular");
  expect(calls.length).toBe(before+1);
  expect((await source())?.regular_completed_at).toBe(timestamp+13*HOUR);
});

it("an expired old hybrid collector cannot restore completion proof after a legacy claim",async()=>{
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;}),paused=new Promise<void>(resolve=>{release=resolve;});
  let first=true;
  const calls=provider(async()=>{if(first){first=false;entered();await paused;}return page();});
  const pending=collect("regular");
  const rejected=expect(pending).rejects.toThrow();
  await started;
  await db.prepare("UPDATE settings SET value='x_api' WHERE key='x_collection_primary_source'").run();
  clock.mockReturnValue(timestamp+11*60_000);clearXServiceCachesForTests();
  await runXCollectionForHandles(runtime,["member"],"manual");
  release();await rejected;
  expect(await source()).toMatchObject({sync_origin_scope:null,sync_origin_started_at:null,sync_timeline_completed_at:null});
  await db.prepare("UPDATE settings SET value='fxembed' WHERE key='x_collection_primary_source'").run();
  clock.mockReturnValue(timestamp+13*HOUR);clearXServiceCachesForTests();
  const before=calls.length;await collect("regular");expect(calls.length).toBe(before+1);
});

it("rollback retires hybrid proof without dropping a real unfinished pagination cursor",async()=>{
  const calls=provider(url=>page(url.searchParams.has("pagination_token")?null:"page2"));
  await collect("regular");
  expect(await source()).toMatchObject({sync_origin_scope:"regular",sync_pagination_token:"page2"});
  await db.prepare("UPDATE settings SET value='x_api' WHERE key='x_collection_primary_source'").run();
  clock.mockReturnValue(timestamp+HOUR);clearXServiceCachesForTests();
  await runXCollectionForHandles(runtime,["member"],"manual");
  expect(calls).toHaveLength(2);expect(calls[1].searchParams.get("pagination_token")).toBe("page2");
  expect(await source()).toMatchObject({sync_origin_scope:null,sync_pagination_token:null,last_seen_post_id:"200"});
});
