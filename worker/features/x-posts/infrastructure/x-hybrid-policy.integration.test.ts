import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { clearXServiceCachesForTests, writeStoredPosts } from "./x-api";
import { runXCollectionForHandles } from "./x-collection";
import { readHybridXCollectionTargets } from "./x-hybrid-policy";
import { D1SharedXApiGateway } from "./x-shared-budget";
import { readXTimelineGapBoundary, xTimelineGapRequestId, type XTimelineGapCheckpoint } from "./x-timeline-gaps";
import { meterD1 } from "../../../test-support/d1-meter";

const HOUR = 3_600_000;
const timestamp = Date.parse("2026-11-03T00:00:00Z");
const runtime = { ...env, SITE_ID: "otw", X_BEARER_TOKEN: "fixture" } as unknown as Env & { X_REFERENCE_MIGRATIONS: D1Migration[] };
const db = runtime.otw_db;
runtime.X_API_GATEWAY = new D1SharedXApiGateway({ db, site: "otw", token: "fixture", admitD1: async () => true });
let clock: ReturnType<typeof vi.spyOn>;
const source = () => db.prepare("SELECT * FROM x_post_sources WHERE handle='member'").first<Record<string, unknown>>();
const collect = (scope: "regular" | "pending" | "fallback") => runXCollectionForHandles(runtime, ["member"], "scheduled", Date.now(), scope === "pending", undefined, scope);
const page = (next: string | null = null, quote = false) => Response.json({ data: [{ id: "200", text: "new", created_at: new Date(timestamp).toISOString(), ...(quote ? { referenced_tweets: [{ type: "quoted", id: "150" }] } : {}) }], meta: next ? { next_token: next } : {} });
const provider = (timeline: (url: URL) => Response | Promise<Response>, userId = "1") => {
  const calls: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/2/users/by") return Response.json({ data: [{ id: userId, username: "member" }] });
    if (url.pathname === `/2/users/${userId}/tweets`) { calls.push(url); return timeline(url); }
    throw new Error(`Unexpected fake provider request ${url.pathname}`);
  }));
  return calls;
};
beforeEach(async () => {
  await applyD1Migrations(db, runtime.X_REFERENCE_MIGRATIONS);
  for (const table of ["x_post_references", "x_post_facts", "x_posts", "x_post_sources", "x_fx_sources", "x_api_cache", "x_api_usage_events", "x_api_usage_daily", "x_api_resource_daily", "x_shared_requests", "x_shared_budgets", "x_collection_runs", "scheduled_usage_daily", "members", "settings"]) await db.prepare(`DELETE FROM ${table}`).run();
  clock = vi.spyOn(Date, "now").mockReturnValue(timestamp);
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')").run();
  await db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at) VALUES('member','1','member','100',0,0,1)").run();
  await db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_enabled','true'),('x_collection_primary_source','fxembed'),('x_collection_hybrid_policy','rss_v1'),('x_collection_hybrid_activated_at',?),('x_cost_optimizer_enabled','true'),('x_reference_preview_mode','link_only')").bind(String(timestamp - 24 * HOUR)).run();
  await db.prepare("INSERT INTO x_shared_budgets(day,used,reserved,limit_value,seed_detail,updated_at) VALUES(?,0,0,1000000,'{}',0)").bind(new Date(timestamp).toISOString().slice(0,10)).run();
  clearXServiceCachesForTests();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); clearXServiceCachesForTests(); });

const seedGapBounds = async (ids: string[]) => {
  expect((await writeStoredPosts(db, "member", { id: "1", username: "member" }, ids.map(id => ({
    id, text: "already stored", username: "member", url: `https://x.com/member/status/${id}`,
    createdAt: new Date(timestamp - HOUR).toISOString(), media: [],
    metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 },
  })), timestamp - HOUR, "otw", { origin: "fxembed", completeness: { text: true, media: true, relations: true } })).ok).toBe(true);
};
const gapBounds = (url: URL) => [url.searchParams.get("since_id"), url.searchParams.get("until_id")];

it.each([false, true])("compares the stored revision atomically when confirming a new request (token=%s)", async tokenPage => {
  await seedGapBounds(["120"]);
  let injected=false, first=true;
  const duplicates:string[]=[];
  const originals=new WeakMap<object,D1PreparedStatement>();
  const wrapped=new Proxy(db,{get(target,key){
    if(key==="prepare")return(sql:string)=>{
      const wrap=(statement:D1PreparedStatement,bindings:unknown[]=[]):D1PreparedStatement=>{
        const proxy=new Proxy(statement,{get(current,method){
          if(method==="bind")return(...values:unknown[])=>wrap(current.bind(...values),values);
          const value=Reflect.get(current,method,current);
          if(["all","run","first"].includes(String(method)))return async(...args:unknown[])=>{
            const request=bindings.map(value=>{try{return typeof value==="string"?JSON.parse(value):null;}catch{return null;}}).find(value=>value?.request);
            if(!injected && sql.startsWith("UPDATE x_post_sources SET sync_gap_state=") && request && Boolean(request.page)===tokenPage){
              injected=true;
              await seedGapBounds(["110"]);
            }
            return value.apply(current,args);
          };
          return typeof value==="function"?value.bind(current):value;
        }});
        originals.set(proxy,statement);return proxy;
      };return wrap(target.prepare(sql));
    };
    if(key==="batch")return(statements:D1PreparedStatement[])=>target.batch(statements.map(statement=>originals.get(statement)??statement));
    const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
  }});
  provider(async url=>{
    const [lower,upper]=gapBounds(url);
    const ids=first && tokenPage?["115"]:["105","110"];
    const eligible=ids.filter(id=>BigInt(id)>BigInt(lower!) && (upper===null || BigInt(id)<BigInt(upper)));
    for(const id of eligible)if(await db.prepare("SELECT 1 FROM x_posts WHERE id=?").bind(id).first())duplicates.push(id);
    const next=first && tokenPage;first=false;
    return Response.json({data:eligible.map(id=>({id,text:"official",created_at:new Date(timestamp).toISOString()})),...(next?{meta:{next_token:"page-two"}}:{})});
  });
  let result=await runXCollectionForHandles({...runtime,otw_db:wrapped},["member"],"scheduled",Date.now(),false,undefined,"regular");
  expect(injected).toBe(true);
  expect(duplicates).toEqual([]);
  expect(result).toMatchObject({pendingSources:1,resumeRegularOrigin:timestamp});
  expect(await source()).toMatchObject({last_seen_post_id:"100",regular_completed_at:null});
  for(let slice=0;slice<6 && result.pendingSources;slice++){
    clearXServiceCachesForTests();
    result=await runXCollectionForHandles(runtime,["member"],"scheduled",Date.now(),true,undefined,"pending",{resumeRegularOrigin:result.resumeRegularOrigin});
  }
  expect(result.pendingSources).toBe(0);
  expect(duplicates).toEqual([]);
  expect(await db.prepare("SELECT id FROM x_posts WHERE id='105'").first("id")).toBe("105");
  expect(await source()).toMatchObject({last_seen_post_id:"120",regular_completed_at:Date.now()});
});

it("uses newly stored Fx posts as boundaries when opening the next queued ranges", async () => {
  await seedGapBounds(["110", "120", "130", "140"]);
  const calls = provider(url => {
    const [lower, upper] = gapBounds(url);
    return Response.json({ data: BigInt(lower!) < 125n && (upper === null || BigInt(upper) > 125n)
      ? [{ id: "125", text: "already collected by Fx", created_at: new Date(timestamp).toISOString() }] : [] });
  });
  expect(await collect("regular")).toMatchObject({ pendingSources: 1 });
  clock.mockReturnValue(timestamp + HOUR);
  await seedGapBounds(["125"]);
  await db.prepare("UPDATE x_posts SET first_seen_at=? WHERE id='125'").bind(Date.now() - 1).run();
  clearXServiceCachesForTests();
  await collect("pending");
  expect(calls.slice(2).map(gapBounds)).toEqual([["120", "125"], ["125", "130"]]);
});

it.each([
  ["2117991588710564292", "2118189992795332954", null, "2118205153132356042"],
  ["2118325212941041951", "2118512411917647956", "2118513136521380260", "2118512585213624831"],
  ["2118144047772795206", "2118416760215130138", "2118551328272380041", "2118550753694581123"],
  ["2119849871511584872", "2119956568762622086", "2119968660240703586", "2119967383674916891"],
] as const)("recovers historical missing post between stored bounds (%s, %s, %s, %s)", async (base, lower, upper, missing) => {
  await db.prepare("UPDATE x_post_sources SET last_seen_post_id=?").bind(base).run();
  await seedGapBounds(upper ? [lower, upper] : [lower]);
  const calls = provider(url => {
    const [since, until] = gapBounds(url);
    const eligible = BigInt(missing) > BigInt(since!) && (until === null || BigInt(missing) < BigInt(until));
    return Response.json({ data: eligible ? [{ id: missing, text: "recovered", created_at: new Date(timestamp).toISOString() }] : [] });
  });
  expect(await collect("regular")).toMatchObject({ pendingSources: upper ? 1 : 0, newlyStoredPosts: [{ id: missing }] });
  if (upper) {
    clock.mockReturnValue(timestamp + HOUR);
    clearXServiceCachesForTests();
    expect(await collect("pending")).toMatchObject({ pendingSources: 0 });
  }
  expect(calls.map(gapBounds)).toEqual(upper ? [[base, lower], [lower, upper], [upper, null]] : [[base, lower], [lower, null]]);
  expect(await db.prepare("SELECT id FROM x_posts WHERE id=?").bind(missing).first("id")).toBe(missing);
  expect(await source()).toMatchObject({ last_seen_post_id: upper ?? missing, regular_completed_at: Date.now() });
});

it("batches gaps and resumes the unfinished range without advancing the official watermark", async () => {
  await seedGapBounds(["110", "120", "130", "140", "150", "160"]);
  let fail = true;
  const calls = provider(url => {
    const [since] = gapBounds(url);
    if (since === "130" && fail) return Response.json({}, { status: 500 });
    return Response.json({ data: since === "100" || since === "150" ? [{ id: since === "100" ? "105" : "155", text: "recovered", created_at: new Date(timestamp).toISOString() }] : [] });
  });
  expect(await collect("regular")).toMatchObject({ pendingSources: 1, newlyStoredPosts: [{ id: "105" }] });
  expect(calls.map(gapBounds)).toEqual([["100", "110"], ["110", "120"]]);
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null, sync_timeline_completed_at: null });
  clock.mockReturnValue(timestamp + HOUR);
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 1, status: "failed" });
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });
  fail = false;
  const retryAt = Number((await source())?.next_check_at);
  clock.mockReturnValue(retryAt);
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 1 });
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });
  clock.mockReturnValue(retryAt + HOUR);
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 0, newlyStoredPosts: [{ id: "155" }] });
  expect(calls.slice(2).map(gapBounds)).toEqual([["120", "130"], ["130", "140"], ["130", "140"], ["140", "150"], ["150", "160"], ["160", null]]);
  expect(await source()).toMatchObject({ last_seen_post_id: "160", regular_completed_at: retryAt + HOUR });
});

it("resumes a paginated gap with its original bounds after a partial provider response", async () => {
  await seedGapBounds(["120"]);
  let partial = true;
  const calls = provider(url => {
    if (!url.searchParams.has("until_id")) return Response.json({ meta: { result_count: 0 } });
    if (url.searchParams.has("pagination_token")) {
      if (partial) return Response.json({ data: [], errors: [{ detail: "partial data" }] });
      return Response.json({ data: [{ id: "105", text: "older", created_at: new Date(timestamp).toISOString() }] });
    }
    return Response.json({ data: [{ id: "115", text: "newer", created_at: new Date(timestamp).toISOString() }], meta: { next_token: "page-two" } });
  });
  expect(await collect("regular")).toMatchObject({ error: "invalid_x_gap_response", pendingSources: 1, newlyStoredPosts: [{ id: "115" }] });
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });
  const retryAt = Number((await source())?.next_check_at);
  clock.mockReturnValue(retryAt);
  clearXServiceCachesForTests();
  partial = false;
  expect(await collect("pending")).toMatchObject({ pendingSources: 0, newlyStoredPosts: [{ id: "105" }] });
  expect(calls.map(url => [...gapBounds(url), url.searchParams.get("pagination_token")])).toEqual([
    ["100", "120", null], ["100", "120", "page-two"], ["100", "120", "page-two"], ["120", null, null],
  ]);
  expect(await source()).toMatchObject({ last_seen_post_id: "120", regular_completed_at: retryAt, sync_gap_state: null });
});

it.each([timestamp - 1, timestamp + 10])("resegments a paginated gap when Fx commits during the response (first seen %s)", async firstSeen => {
  await seedGapBounds(["120"]);
  let firstPage = true;
  const calls = provider(async url => {
    const [lower, upper] = gapBounds(url);
    if (firstPage) {
      firstPage = false;
      expect([lower, upper, url.searchParams.get("pagination_token")]).toEqual(["100", "120", null]);
      clock.mockReturnValue(timestamp + 10);
      await seedGapBounds(["110"]);
      await db.prepare("UPDATE x_posts SET first_seen_at=? WHERE id='110'").bind(firstSeen).run();
      return Response.json({ data: [{ id: "115", text: "official page", created_at: new Date(timestamp).toISOString() }], meta: { next_token: "page-two" } });
    }
    const containsMissing = BigInt(lower!) < 105n && (upper === null || BigInt(upper) > 105n);
    return Response.json({ data: containsMissing ? [{ id: "105", text: "missing older post", created_at: new Date(timestamp).toISOString() }] : [] });
  });
  let result = await collect("regular");
  expect(result).toMatchObject({ pendingSources: 1, resumeRegularOrigin: timestamp, newlyStoredPosts: [{ id: "115" }] });
  expect(calls.map(gapBounds)).toEqual([["100", "120"]]);
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });

  for (let slice = 0; slice < 5 && result.pendingSources; slice++) {
    expect(result.resumeRegularOrigin).toBe(timestamp);
    clock.mockReturnValue(Date.now() + 1);
    clearXServiceCachesForTests();
    result = await runXCollectionForHandles(runtime, ["member"], "scheduled", Date.now(), true, undefined, "pending", { resumeRegularOrigin: result.resumeRegularOrigin });
  }
  expect(result.pendingSources).toBe(0);
  expect(calls.map(url => [...gapBounds(url), url.searchParams.get("pagination_token")])).toEqual([
    ["100", "120", null], ["100", "110", null], ["110", "115", null], ["115", "120", null], ["120", null, null],
  ]);
  expect(await db.prepare("SELECT id FROM x_posts WHERE id IN ('105','110','115') ORDER BY id").all()).toMatchObject({ results: [{ id: "105" }, { id: "110" }, { id: "115" }] });
  expect(await source()).toMatchObject({ last_seen_post_id: "120", regular_completed_at: Date.now(), sync_gap_state: null });
});

it.each([[false, false], [true, false], [false, true]])("reuses a paid page after its local checkpoint write fails (stored boundary=%s, reordered path=%s)", async (bounded, reordered) => {
  if (bounded) await seedGapBounds(["120"]);
  const calls = provider(url => Response.json({ data: url.searchParams.get("since_id") === "100"
    ? [{ id: "110", text: "paid once", created_at: new Date(timestamp).toISOString() }] : [] }));
  await db.exec("CREATE TRIGGER fail_gap_ack BEFORE UPDATE OF sync_gap_state ON x_post_sources WHEN json_extract(NEW.sync_gap_state,'$.request.id') IS NULL BEGIN SELECT RAISE(ABORT,'gap checkpoint unavailable'); END;");
  try {
    await expect(collect("regular")).rejects.toThrow();
    expect(await source()).toMatchObject({ last_seen_post_id: "100", sync_gap_state: expect.any(String), regular_completed_at: null });
    expect(await db.prepare("SELECT id FROM x_posts WHERE id='110'").first("id")).toBe("110");
  } finally { await db.exec("DROP TRIGGER fail_gap_ack;"); }
  if (reordered) {
    const checkpoint = JSON.parse(String((await source())?.sync_gap_state)) as XTimelineGapCheckpoint;
    const previous = checkpoint.request!;
    const url = new URL(previous.path, "https://api.x.com");
    url.searchParams.sort();
    const path = `${url.pathname}${url.search}`;
    expect(path).not.toBe(previous.path);
    const id = await xTimelineGapRequestId("otw", "member", checkpoint.startedAt, path, checkpoint.attempt);
    await db.batch([
      db.prepare("UPDATE x_shared_requests SET id=?,path=? WHERE id=?").bind(id, path, previous.id),
      db.prepare("UPDATE x_post_sources SET sync_gap_state=?").bind(JSON.stringify({ ...checkpoint, request: { ...previous, id, path } })),
    ]);
  }
  clock.mockReturnValue(timestamp + HOUR);
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 0, apiCalls: bounded ? 1 : 0, estimatedCostMicros: 0 });
  expect(calls.map(gapBounds)).toEqual(bounded ? [["100", "120"], ["120", null]] : [["100", null]]);
  expect(await db.prepare("SELECT COUNT(*) AS requests,SUM(cost) AS cost FROM x_shared_requests WHERE operation='timeline'").first()).toEqual({ requests: bounded ? 2 : 1, cost: 5_000 });
  expect(await db.prepare("SELECT reserved FROM x_shared_budgets").first("reserved")).toBe(0);
  expect(await source()).toMatchObject({ last_seen_post_id: bounded ? "120" : "110", regular_completed_at: Date.now() });
});

it("recovers an unconfirmed gateway result without freeing its outstanding budget", async () => {
  await seedGapBounds(["120"]);
  const calls = provider(url => Response.json({ data: url.searchParams.has("until_id")
    ? [{ id: "110", text: "recovered", created_at: new Date(timestamp).toISOString() }] : [] }));
  await db.exec("CREATE TRIGGER fail_gap_result BEFORE UPDATE OF result ON x_shared_requests WHEN OLD.operation='timeline' BEGIN SELECT RAISE(ABORT,'gateway result unavailable'); END;");
  try {
    expect(await collect("regular")).toMatchObject({ pendingSources: 1, error: "shared_budget_unavailable" });
  } finally { await db.exec("DROP TRIGGER fail_gap_result;"); }
  const outstanding = await db.prepare("SELECT estimate FROM x_shared_requests WHERE operation='timeline' AND status='running'").first("estimate");
  expect(outstanding).toBeGreaterThan(0);
  clock.mockReturnValue(Math.max(timestamp + HOUR, Number((await source())?.next_check_at)));
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 1, error: "x_gateway_result_unknown" });
  expect(calls.map(gapBounds)).toEqual([["100", "120"]]);
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });
  clock.mockReturnValue(Number((await source())?.next_check_at));
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 0, newlyStoredPosts: [{ id: "110" }] });
  expect(calls.map(gapBounds)).toEqual([["100", "120"], ["100", "120"], ["120", null]]);
  expect(await db.prepare("SELECT reserved FROM x_shared_budgets").first("reserved")).toBe(outstanding);
  expect(await source()).toMatchObject({ last_seen_post_id: "120", regular_completed_at: Date.now() });
});

it("does not replay a previous account's response and rebuilds the range from the confirmed watermark", async () => {
  const path = "/users/1/tweets?since_id=100&until_id=130";
  const startedAt = timestamp - HOUR * 2;
  const id = await xTimelineGapRequestId("otw", "member", startedAt, path);
  const checkpoint = { startedAt, base: "100", after: "100", page: null, request: { id, path, until: "130" } };
  await seedGapBounds(["125", "130"]);
  await db.batch([
    db.prepare("UPDATE x_posts SET user_id='2' WHERE id='125'"),
    db.prepare("UPDATE x_post_sources SET user_id='2',sync_origin_scope='regular',sync_origin_started_at=?,sync_gap_state=?,next_check_at=0").bind(startedAt, JSON.stringify(checkpoint)),
    db.prepare(`INSERT INTO x_shared_requests(id,site,operation,path,status,claim_token,estimate,cost,result,day,created_at,updated_at)
      VALUES(?,'otw','timeline',?,'complete','fixture',125000,0,'{"ok":true,"body":{"data":[]}}',?,?,?)`)
      .bind(id, path, new Date(timestamp).toISOString().slice(0, 10), timestamp, timestamp),
    db.prepare("INSERT INTO settings(key,value) VALUES('x_api_backoff_until',?)").bind(String(timestamp + 1)),
  ]);
  const calls = provider(url => Response.json({ data: url.searchParams.has("until_id")
    ? [{ id: "115", text: "new account", created_at: new Date(timestamp).toISOString() }] : [] }), "2");
  expect((await readHybridXCollectionTargets(runtime, timestamp)).filter(item => item.replayOnly)).toHaveLength(0);
  await runXCollectionForHandles(runtime, ["member"], "scheduled", timestamp, true, undefined, "pending", { replayOnly: true });
  expect(fetch).not.toHaveBeenCalled();
  clock.mockReturnValue(timestamp + HOUR);
  expect(await collect("pending")).toMatchObject({ pendingSources: 1, error: "x_gateway_identity_conflict" });
  expect(calls).toHaveLength(0);
  expect(await source()).toMatchObject({ user_id: "2", last_seen_post_id: "100", regular_completed_at: null });
  clock.mockReturnValue(Number((await source())?.next_check_at));
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 0, newlyStoredPosts: [{ id: "115" }] });
  expect(calls.map(gapBounds)).toEqual([["100", "125"], ["125", null]]);
  expect(await source()).toMatchObject({ user_id: "2", last_seen_post_id: "125", regular_completed_at: Date.now() });
});

it("restarts only the current gap without returning stored pages after a token expires", async () => {
  await seedGapBounds(["110", "140"]);
  let expired = false;
  const calls = provider(url => {
    const [since, until] = gapBounds(url);
    if (expired && since === "110" && until === "125") return Response.json({ data: [{ id: "120", text: "recovered", created_at: new Date(timestamp).toISOString() }] });
    if (since !== "110" || until !== "140") return Response.json({ data: [] });
    const token = url.searchParams.get("pagination_token");
    if (token === "expired") return Response.json({ errors: [{ parameters: { pagination_token: [token] }, message: "Invalid pagination_token" }] }, { status: 400 });
    const id = token === "renewed" ? "120" : token === "page-two" ? "125" : "130";
    const next = token === "renewed" ? null : token === "page-two" ? (expired ? "renewed" : "expired") : "page-two";
    return Response.json({ data: [{ id, text: "recovered", created_at: new Date(timestamp).toISOString() }], meta: next ? { next_token: next } : {} });
  });
  expect(await collect("regular")).toMatchObject({ pendingSources: 1 });
  clock.mockReturnValue(timestamp + HOUR);
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 1, error: "invalid_x_pagination_token" });
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });
  expired = true;
  clock.mockReturnValue(Number((await source())?.next_check_at));
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 1, newlyStoredPosts: [{ id: "120" }] });
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });
  clock.mockReturnValue(Date.now() + HOUR);
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 1, newlyStoredPosts: [] });
  clock.mockReturnValue(Date.now() + HOUR);
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 0, newlyStoredPosts: [] });
  expect(calls.map(url => [...gapBounds(url), url.searchParams.get("pagination_token")])).toEqual([
    ["100", "110", null], ["110", "140", null], ["110", "140", "page-two"], ["110", "140", "expired"],
    ["110", "125", null], ["125", "130", null], ["130", "140", null], ["140", null, null],
  ]);
  expect(await source()).toMatchObject({ last_seen_post_id: "140", regular_completed_at: Date.now() });
});

it("includes a new Fx boundary when opening the first fresh range after token expiration", async () => {
  await seedGapBounds(["120"]);
  const calls = provider(url => {
    const token = url.searchParams.get("pagination_token");
    if (token) return Response.json({ errors: [{ parameters: { pagination_token: [token] }, message: "Invalid pagination_token" }] }, { status: 400 });
    const [lower, upper] = gapBounds(url);
    if (lower === "100" && upper === "120") return Response.json({ data: [{ id: "115", text: "first page", created_at: new Date(timestamp).toISOString() }], meta: { next_token: "expired" } });
    return Response.json({ data: lower === "100" && upper === "110" ? [{ id: "105", text: "missing older post", created_at: new Date(timestamp).toISOString() }] : [] });
  });
  expect(await collect("regular")).toMatchObject({ pendingSources: 1, error: "invalid_x_pagination_token" });
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });
  clock.mockReturnValue(Number((await source())?.next_check_at));
  await seedGapBounds(["110"]);
  await db.prepare("UPDATE x_posts SET first_seen_at=? WHERE id='110'").bind(Date.now()).run();
  clearXServiceCachesForTests();
  let result = await collect("pending");
  expect(result).toMatchObject({ pendingSources: 1, resumeRegularOrigin: timestamp, newlyStoredPosts: [{ id: "105" }] });
  for (let slice = 0; slice < 5 && result.pendingSources; slice++) {
    expect(result.resumeRegularOrigin).toBe(timestamp);
    clock.mockReturnValue(Date.now() + 1);
    clearXServiceCachesForTests();
    result = await runXCollectionForHandles(runtime, ["member"], "scheduled", Date.now(), true, undefined, "pending", { resumeRegularOrigin: result.resumeRegularOrigin });
  }
  expect(result.pendingSources).toBe(0);
  expect(calls.map(url => [...gapBounds(url), url.searchParams.get("pagination_token")])).toEqual([
    ["100", "120", null], ["100", "120", "expired"], ["100", "110", null], ["110", "115", null], ["115", "120", null], ["120", null, null],
  ]);
  expect(await db.prepare("SELECT id FROM x_posts WHERE id='105'").first("id")).toBe("105");
  expect(await source()).toMatchObject({ last_seen_post_id: "120", regular_completed_at: Date.now(), sync_gap_state: null });
});

it("checks for newly stored boundaries without scanning the 4000 posts in an existing paginated gap", async () => {
  await db.prepare(`WITH RECURSIVE n(id) AS (SELECT 1000 UNION ALL SELECT id+1 FROM n WHERE id<4999)
    INSERT INTO x_posts(id,handle,user_id,username,value,created_at,first_seen_at,fetched_at)
    SELECT CAST(id AS TEXT),'member','1','member','{}','2026-11-03',?,? FROM n`).bind(timestamp, timestamp).run();
  const meter = meterD1(db);
  expect(await readXTimelineGapBoundary(meter.db, "member", "1", "100", "99999", 0)).toEqual({ revision: 0, changed: 0 });
  expect(meter.summary().rowsRead).toBeLessThan(10);
  console.log("X gap boundary check over 4000 stored posts", JSON.stringify(meter.summary()));
});

it("does not pay for a range between consecutive stored IDs", async () => {
  await seedGapBounds(["101"]);
  const calls = provider(() => Response.json({ data: [] }));
  expect(await collect("regular")).toMatchObject({ pendingSources: 0 });
  expect(calls.map(gapBounds)).toEqual([["101", null]]);
  expect(await source()).toMatchObject({ last_seen_post_id: "101", regular_completed_at: timestamp });
});

it.each(["media array", "metric", "image width"])("retries a malformed timeline response after the provider recovers (%s)", async field => {
  await seedGapBounds(["120"]);
  let malformed = true;
  const calls = provider(url => Response.json({
    data: url.searchParams.has("until_id") ? [{ id: "110", text: "recovered", created_at: new Date(timestamp).toISOString(),
      ...(malformed && field === "metric" ? { public_metrics: { like_count: "invalid" } } : {}),
      ...(malformed && field === "image width" ? { attachments: { media_keys: ["m1"] } } : {}),
    }] : [],
    ...(malformed && field === "media array" ? { includes: { media: {} } } : {}),
    ...(malformed && field === "image width" ? { includes: { media: [{ media_key: "m1", type: "photo", url: "https://example.test/image.jpg", width: "invalid" }] } } : {}),
  }));
  expect(await collect("regular")).toMatchObject({ pendingSources: 1, error: "invalid_x_gap_response" });
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });
  expect(await db.prepare("SELECT id FROM x_posts WHERE id='110'").first()).toBeNull();
  malformed = false;
  clock.mockReturnValue(Number((await source())?.next_check_at));
  clearXServiceCachesForTests();
  expect(await collect("pending")).toMatchObject({ pendingSources: 0, newlyStoredPosts: [{ id: "110" }] });
  expect(calls.map(gapBounds)).toEqual([["100", "120"], ["100", "120"], ["120", null]]);
});

it("resegments a legacy cursor using stored IDs without purchasing its old page", async () => {
  await seedGapBounds(["130"]);
  await db.batch([
    db.prepare("UPDATE x_posts SET insert_revision=0"),
    db.prepare("UPDATE x_post_sources SET insert_revision=0"),
  ]);
  await db.prepare("UPDATE x_post_sources SET sync_origin_scope='regular',sync_origin_started_at=?,sync_pagination_token='expired',sync_base_post_id='100',sync_newest_post_id='130',next_check_at=0").bind(timestamp).run();
  const calls = provider(url => {
    expect(url.searchParams.has("pagination_token")).toBe(false);
    return Response.json({ data: url.searchParams.get("until_id") === "130" ? [{ id: "120", text: "missing", created_at: new Date(timestamp).toISOString() }] : [] });
  });
  expect(await collect("pending")).toMatchObject({ pendingSources: 1, resumeRegularOrigin: timestamp });
  expect(calls).toHaveLength(0);
  clock.mockReturnValue(Date.now() + 1);
  clearXServiceCachesForTests();
  expect(await runXCollectionForHandles(runtime, ["member"], "scheduled", Date.now(), true, undefined, "pending", { resumeRegularOrigin: timestamp })).toMatchObject({ pendingSources: 0, newlyStoredPosts: [{ id: "120" }] });
  expect(calls.map(url => [...gapBounds(url), url.searchParams.get("pagination_token")])).toEqual([["100", "130", null], ["130", null, null]]);
  expect(await source()).toMatchObject({ last_seen_post_id: "130", regular_completed_at: Date.now() });
});

it("does not immediately continue an X pagination token cycle", async () => {
  const calls = provider(url => {
    const token = url.searchParams.get("pagination_token");
    const id = token === "two" ? "115" : token === "one" ? "125" : "135";
    return Response.json({ data: [{ id, text: "page", created_at: new Date(timestamp).toISOString() }], meta: { next_token: token === "one" ? "two" : "one" } });
  });
  expect(await collect("regular")).toMatchObject({ pendingSources: 1, resumeRegularOrigin: timestamp });
  clock.mockReturnValue(Number((await source())?.next_check_at));
  clearXServiceCachesForTests();
  const rejected = await collect("pending");
  expect(rejected).toMatchObject({ pendingSources: 1, error: "invalid_x_pagination_token" });
  expect(rejected.resumeRegularOrigin).toBeUndefined();
  expect(calls.map(url => url.searchParams.get("pagination_token"))).toEqual([null, "one", "two"]);
  expect(await source()).toMatchObject({ last_seen_post_id: "100", regular_completed_at: null });
});

it("plans replay after a paid page consumes the remaining new-request headroom", async () => {
  await db.prepare("UPDATE x_shared_budgets SET reserved=860001").run();
  const calls = provider(() => Response.json({ data: [{ id: "110", text: "paid once", created_at: new Date(timestamp).toISOString() }] }));
  await db.exec("CREATE TRIGGER fail_gap_ack BEFORE UPDATE OF sync_gap_state ON x_post_sources WHEN json_extract(NEW.sync_gap_state,'$.request.id') IS NULL BEGIN SELECT RAISE(ABORT,'gap checkpoint unavailable'); END;");
  try { await expect(collect("regular")).rejects.toThrow(); }
  finally { await db.exec("DROP TRIGGER fail_gap_ack;"); }
  clock.mockReturnValue(timestamp + HOUR);
  clearXServiceCachesForTests();
  expect(await runtime.X_API_GATEWAY!.readBudget()).toMatchObject({ remaining: 124999 });
  expect((await readHybridXCollectionTargets(runtime, Date.now())).filter(target => target.provider === "x_api"))
    .toMatchObject([{ scope: "pending", replayOnly: true }]);
  expect(await runXCollectionForHandles(runtime, ["member"], "scheduled", Date.now(), true, undefined, "pending", { replayOnly: true }))
    .toMatchObject({ pendingSources: 0, apiCalls: 0, estimatedCostMicros: 0 });
  expect(calls).toHaveLength(1);
});

it("plans 54 replay-ready accounts under the D1 cap without loading response bodies", async () => {
  await db.prepare("INSERT INTO settings(key,value) VALUES('x_api_backoff_until',?)").bind(String(timestamp + HOUR)).run();
  const day = new Date(timestamp).toISOString().slice(0, 10);
  const body = JSON.stringify({ ok: true, body: { data: [] } });
  for (let index = 2; index < 56; index++) {
    const handle = `member${index}`, userId = String(index);
    const path = `/users/${userId}/tweets?since_id=100`;
    const startedAt = timestamp - HOUR;
    const id = await xTimelineGapRequestId("otw", handle, startedAt, path);
    const checkpoint = { startedAt, base: "100", after: "100", page: null, request: { id, path, until: null } };
    await db.batch([
      db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(?,?,?,?)").bind(index, handle, handle, `https://x.com/${handle}`),
      db.prepare(`INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,
        collection_started_at,sync_origin_scope,sync_origin_started_at,sync_gap_state) VALUES(?,?,?,'100',0,0,1,'regular',?,?)`)
        .bind(handle, userId, handle, startedAt, JSON.stringify(checkpoint)),
      db.prepare(`INSERT INTO x_shared_requests(id,site,operation,path,status,claim_token,estimate,cost,result,day,created_at,updated_at)
        VALUES(?,'otw','timeline',?,'complete','fixture',125000,0,?,?,?,?)`).bind(id, path, body, day, timestamp, timestamp),
    ]);
  }
  const meter = meterD1(db, 50);
  const gateway = new D1SharedXApiGateway({ db: meter.db, site: "otw", admitD1: async () => true });
  const plan = await readHybridXCollectionTargets({ ...runtime, otw_db: meter.db, X_API_GATEWAY: gateway }, timestamp);
  expect(plan.filter(item => item.replayOnly)).toHaveLength(54);
  expect(meter.bindingCalls).toBe(3);
  expect(meter.quotaDenials).toBe(0);
  expect(meter.summary().rowsWritten).toBe(0);
});

it.each([false, true])("plans both providers with bounded D1 calls and no progress writes, site ledger present: %s", async ledgerPresent => {
  if (ledgerPresent) await db.prepare("INSERT INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES(?,'all','x_api_cost_micros',0,0,1000000,0)")
    .bind(new Date(timestamp).toISOString().slice(0, 10)).run();
  const limit = ledgerPresent ? 5 : 6;
  const meter = meterD1(db, limit);
  const before = await source();
  const plan = await readHybridXCollectionTargets({ ...runtime, otw_db: meter.db,
    X_API_GATEWAY: new D1SharedXApiGateway({ db: meter.db, site: "otw", admitD1: async () => true }) }, timestamp);
  expect(plan.map(target => ({ provider: target.provider, scope: target.scope, handles: target.handles })))
    .toEqual([
      { provider: "fxembed", scope: "regular", handles: ["member"] },
      { provider: "x_api", scope: "regular", handles: ["member"] },
    ]);
  expect(await source()).toEqual(before);
  expect(meter.quotaDenials).toBe(0);
  expect(meter.bindingCalls).toBeLessThanOrEqual(limit);
  expect(meter.summary().rowsWritten).toBe(0);
  console.log("X_HYBRID_PLAN_PROFILE", JSON.stringify({ bindingCalls: meter.bindingCalls, ...meter.summary() }));
});

it("resumes the original regular interval without stored anchors or a watermark", async () => {
  await db.prepare("UPDATE x_post_sources SET collection_started_at=NULL,last_seen_post_id=NULL").run();
  const calls = provider(url => {
    const token = url.searchParams.get("pagination_token");
    if (!token) clock.mockReturnValue(timestamp + 1000);
    const id = token === "page3" ? "150" : token === "page2" ? "200" : "250";
    const next = token === "page3" ? null : token === "page2" ? "page3" : "page2";
    return Response.json({ data: [{ id, text: "recovered", created_at: new Date(timestamp).toISOString() }], meta: next ? { next_token: next } : {} });
  });
  await collect("regular");
  expect(await source()).toMatchObject({ regular_completed_at: null, last_seen_post_id: null });
  clearXServiceCachesForTests();
  clock.mockReturnValue(timestamp + HOUR);
  await collect("pending");
  const after = await source();
  expect(after?.regular_completed_at).toBe(after?.last_completed_at);
  expect(after?.regular_completed_at).toBe(timestamp + HOUR);
  expect(after?.last_seen_post_id).toBe("250");
  expect(calls.map(url => url.searchParams.get("pagination_token"))).toEqual([null, "page2", "page3"]);
  expect(calls.map(url => url.searchParams.get("start_time"))).toEqual(Array(3).fill(new Date(timestamp).toISOString()));
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
  const calls = provider(url => url.searchParams.has("until_id") ? Response.json({ data: [] }) : page(null, true));
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
  expect(calls).toHaveLength(2);
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
  const calls = provider(url => url.searchParams.get("since_id") === "200" ? Response.json({ data: [] }) : page(null, true));
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
  const calls=provider(url=>url.searchParams.get("since_id")==="200"?Response.json({data:[]}):page());
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
  await seedGapBounds(["200"]);
  await db.prepare(`UPDATE x_post_sources SET sync_origin_scope='regular',sync_origin_started_at=?,sync_pagination_token='page2',
    sync_base_post_id='100',sync_newest_post_id='200'`).bind(timestamp).run();
  const calls=provider(()=>page());
  await db.prepare("UPDATE settings SET value='x_api' WHERE key='x_collection_primary_source'").run();
  clock.mockReturnValue(timestamp+HOUR);clearXServiceCachesForTests();
  await runXCollectionForHandles(runtime,["member"],"manual");
  expect(calls).toHaveLength(1);expect(calls[0].searchParams.get("pagination_token")).toBe("page2");
  expect(await source()).toMatchObject({sync_origin_scope:null,sync_pagination_token:null,last_seen_post_id:"200"});
});

it.each([[500,false],[429,false],[500,true],[429,true]] as const)("late old %s source errors cannot replace legacy acknowledgement (stored fallback=%s)",async(status,stored)=>{
  if(stored)await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('150','member','member',?, ?,0,0)")
    .bind(JSON.stringify({id:"150",text:"previous",username:"member",createdAt:new Date(timestamp-HOUR).toISOString(),url:"https://x.com/member/status/150",media:[],metrics:{likeCount:0,replyCount:0,repostCount:0,quoteCount:0}}),new Date(timestamp-HOUR).toISOString()).run();
  let entered!:()=>void,release!:()=>void;
  const started=new Promise<void>(r=>{entered=r;}),paused=new Promise<void>(r=>{release=r;});
  let first=true;
  provider(async()=>{if(first){first=false;entered();await paused;return Response.json({errors:[{message:"late old error"}]},{status});}return page();});
  const pending=collect("regular");await started;
  clock.mockReturnValue(timestamp+11*60_000);clearXServiceCachesForTests();
  await db.prepare("UPDATE settings SET value='x_api' WHERE key='x_collection_primary_source'").run();
  expect((await runXCollectionForHandles(runtime,["member"],"manual")).status).toBe("success");
  const completed=await source();
  clock.mockReturnValue(timestamp+12*60_000);release();const result=await pending;
  expect(result.status).toBe("failed");expect(result.postsReturned>0).toBe(stored);
  expect(await source()).toEqual(completed);
  expect(await db.prepare("SELECT COUNT(*) n FROM x_shared_requests WHERE operation='timeline' AND status='complete' AND json_extract(result,'$.ok')=0").first("n")).toBe(1);
  expect(await db.prepare("SELECT reserved FROM x_shared_budgets").first("reserved")).toBe(0);
  if(status===429)expect(Number(await db.prepare("SELECT value FROM settings WHERE key='x_api_backoff_until'").first("value"))).toBeGreaterThan(timestamp+12*60_000);
});
