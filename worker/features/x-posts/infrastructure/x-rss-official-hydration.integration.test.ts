import { applyD1Migrations, createExecutionContext, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FxRssCandidate, FxRssContinuation } from "@contracts/x-collection";
import { D1ScheduledJobRepository } from "../../../platform/scheduled-jobs/d1-scheduled-job-repository";
import { runFxRssCollectionItem } from "../../../app/x-rss-collection";
import { readDueFxRssCollectionTargets } from "./d1-fx-rss-collection";
import { D1SharedXApiGateway, D1SharedXBudget, readSiteXBudget } from "./x-shared-budget";
import { clearXServiceCachesForTests, requestXApi, writeStoredPosts } from "./x-api";
import { runXCollectionForHandles } from "./x-collection";
import { meterD1 } from "../../../test-support/d1-meter";
import { XActivityCoordinatorRpc } from "../../../app/x-rpc";
import { withXGateway } from "../../../app/x-gateway";
import { siteEnv } from "../../../test-support/site-env";
import { ScheduledJobExecutor } from "../../scheduled-operations/infrastructure/scheduled-job-executor";
import { handleScheduledJobQueue } from "../../../app/scheduled-queue";

const bindings = env as Env & { X_REFERENCE_MIGRATIONS: D1Migration[]; SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[] };
const db = bindings.otw_db;
let now: number, sequence: number;
const gateway = new D1SharedXApiGateway({ db, site: "otw", token: "fixture", admitD1: async () => true });
const runtime = { ...bindings, SITE_ID: "otw", X_BEARER_TOKEN: "fixture", X_API_GATEWAY: gateway } as Env;
const candidates = (ids = ["201", "202"]): FxRssCandidate[] => ids.map(id => ({ id, firstSeenAt: now - 60_000, createdAtHint: now - 90_000, attempts: 2, nextAttemptAt: 0, error: "fx_http_404", stage: "official" }));
const state = (items = candidates()): FxRssContinuation => ({ provider: "fxembed", mode: "rss_candidates", scope: "regular", handles: ["member"], phase: "hydrate", candidates: items, nextAttemptAt: null });
const create = async (input = state()) => {
  const repo = new D1ScheduledJobRepository(db, () => now, () => `official-${++sequence}`);
  const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", scheduledFor: now, idempotencyKey: `official-${++sequence}` });
  const [id] = await repo.addItems(run.id, [{ targetKey: "rss:member", lane: "x", phase: "collect", continuation: input }]);
  const item = (await repo.claimItem(id))!;
  // A pending predecessor normally installs this pointer during discovery.
  await db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=?").bind(id).run();
  return { repo, item, input };
};
const clocks = () => db.prepare("SELECT last_seen_post_id,last_completed_at,regular_completed_at,sync_pagination_token,sync_origin_scope FROM x_post_sources WHERE handle='member'").first();
const stored = () => db.prepare("SELECT id,value,source_authority,first_seen_at FROM x_posts ORDER BY id").all<{ id: string; value: string; source_authority: string; first_seen_at: number }>();
const freeProvider = (ids: string[], relations = false) => vi.mocked(fetch).mockImplementation(async input => {
  const url = new URL(String(input));
  if (url.pathname.endsWith("feed.xml")) return new Response(`<rss version="2.0"><channel>${ids.map(id => `<item><guid>https://x.com/member/status/${id}</guid><pubDate>${new Date(now).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`);
  if (url.hostname === "api.fxtwitter.com") return Response.json({ code: 200, status: { type: "status", id: url.pathname.split("/").pop(), text: "free discovery", created_at: new Date(now).toUTCString(), author: { id: "101", screen_name: "member", protected: false }, media: {}, ...(relations ? { replying_to: { status: "900", screen_name: "parent" }, quote: { type: "status", id: "902", text: "quoted", created_at: new Date(now).toUTCString(), author: { id: "903", screen_name: "quoted", protected: false }, media: {} } } : {}) } });
  throw new Error(`unexpected upstream ${url}`);
});

beforeEach(async () => {
  now = Date.now(); sequence = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  clearXServiceCachesForTests();
  await applyD1Migrations(db, bindings.X_REFERENCE_MIGRATIONS);
  await applyD1Migrations(db, bindings.SCHEDULED_OPERATIONS_MIGRATIONS);
  await db.batch([
    ...["scheduled_outbox", "scheduled_job_items", "scheduled_job_runs", "x_post_references", "x_post_facts", "x_posts", "x_fx_sources", "x_post_sources", "members", "x_shared_requests", "x_shared_budgets", "x_api_usage_events", "x_api_usage_daily", "x_api_resource_daily", "x_api_cache", "scheduled_usage_daily", "x_activity_cache_redactions"].map(table => db.prepare(`DELETE FROM ${table}`)),
    ...[["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"], ["x_collection_hybrid_policy", "rss_v1"], ["x_collection_hybrid_activated_at", "1"], ["x_collection_daily_budget_cents", "100"], ["x_api_backoff_until", "0"], ["x_cost_optimizer_enabled", "false"], ["x_reference_preview_mode", "link_only"]].map(([key,value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key,value)),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')"),
    db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,collection_started_at,initialization_completed_at,last_checked_at,updated_at,last_completed_at,regular_completed_at) VALUES('member','101','member','100',1,1,0,0,?,?)").bind(now, now),
    db.prepare("INSERT INTO x_fx_sources(handle,user_id,collection_started_at,updated_at) VALUES('member','101',1,0)"),
  ]);
  await new D1SharedXBudget(db).initialize([await readSiteXBudget(db), { day: new Date(now).toISOString().slice(0,10), used: 0, reserved: 0 }]);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/2/tweets") return Response.json({ data: url.searchParams.get("ids")!.split(",").map(id => ({ id, author_id: "101", text: `official ${id}`, created_at: new Date(now - 90_000).toISOString() })), includes: { users: [{ id: "101", username: "member", protected: false }] } });
    if (url.pathname === "/2/users/101/tweets") return Response.json({ data: [{ id: "299", author_id: "101", text: "unknown to free", created_at: new Date(now - 30_000).toISOString() }] });
    if (url.pathname === "/2/users/by") return Response.json({ data: [{ id: "101", username: "member", protected: false }] });
    throw new Error(`unexpected upstream ${url}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("known_lookup_is_not_timeline_completion", async () => {
  const entry = await create(), before = await clocks();
  const result = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(result).toMatchObject({ status: "complete", stats: { paidApiCalls: 1, postsStored: 2, pending: 0 } });
  expect((await stored()).results.map(row => JSON.parse(row.value).text)).toEqual(["official 201", "official 202"]);
  expect(await clocks()).toEqual(before);
});

it("official_timeline_discovers_unknown_free_id", async () => {
  const provider = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("feed.xml")) return new Response(`<rss version="2.0"><channel>${["201", "202"].map(id => `<item><guid>https://x.com/member/status/${id}</guid><pubDate>${new Date(now).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`);
    if (url.hostname === "api.fxtwitter.com") return Response.json({ code: 200, status: { type: "status", id: url.pathname.split("/").pop(), text: "free discovery", created_at: new Date(now).toUTCString(), author: { id: "101", screen_name: "member", protected: false }, media: {} } });
    return provider(input, init);
  });
  const scan = await create({ ...state([]), phase: "fetch" });
  expect((await runFxRssCollectionItem(runtime, scan.item, scan.input, scan.repo)).stats).toMatchObject({ freeApiCalls: 2, paidApiCalls: 0, postsStored: 2 });
  const freeDiscoveredIds = (await stored()).results.map(row => row.id);
  await db.prepare("UPDATE x_post_sources SET regular_completed_at=1,last_completed_at=1").run();
  const result = await runXCollectionForHandles(runtime, ["member"], "manual", undefined, false, undefined, "regular");
  expect(result.status).toBe("success");
  expect(new Set(freeDiscoveredIds).has("299")).toBe(false);
  expect((await stored()).results.map(row => row.id)).toContain("299");
  expect(result).toMatchObject({ newlyStoredPosts: [{ id: "299", createdAt: new Date(now - 30_000).toISOString(), storedAt: now }] });
});

it("free_replay_preserves_official_fields and only actual inserts count as discoveries", async () => {
  const entry = await create();
  expect((await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo)).status).toBe("complete");
  const post = JSON.parse((await stored()).results[0]!.value);
  const replay = await writeStoredPosts(db, "member", { id: "101", username: "member" }, [{ ...post, text: "free replay" }], now, "otw", { origin: "fxembed", completeness: { text: true, media: true, relations: true } });
  expect(replay).toMatchObject({ insertedIds: [] });
  expect(JSON.parse((await stored()).results[0]!.value).text).toBe("official 201");
});

it.each(["new", "repair", "durable"])("free RSS %s preserves actual INSERT evidence through executor and D1 result", async mode => {
  const ids = ["301", "302", "303", "304", "305"];
  freeProvider(ids);
  if (mode !== "new") {
    await writeStoredPosts(db, "member", { id: "101", username: "member" }, ids.map(id => ({ id, username: "member", text: "free discovery", createdAt: new Date(Math.floor(now / 1000) * 1000).toISOString(), url: `https://x.com/member/status/${id}`, media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 } })), now, "otw", { origin: "fxembed", completeness: { text: true, media: true, relations: true } });
    if (mode === "repair") await db.prepare("UPDATE x_posts SET content_hash=NULL").run();
  }
  const scan = await create({ ...state([]), phase: "fetch" });
  const meter = meterD1(db), measuredRuntime = { ...runtime, otw_db: meter.db };
  const repository = new D1ScheduledJobRepository(meter.db, () => now);
  const outcome = await new ScheduledJobExecutor(measuredRuntime, repository).execute(scan.item);
  await repository.completeItem(scan.item, outcome);
  const evidence = JSON.parse((await repository.readItem(scan.item.id))!.result_json!);
  expect((await repository.readRunDto(scan.item.run_id))?.xCollection?.items[0]?.collection?.newlyStoredPosts).toEqual(evidence.newlyStoredPosts);
  expect(evidence).toMatchObject({ freeApiCalls: mode === "durable" ? 0 : 5, paidApiCalls: 0 });
  expect(evidence.newlyStoredPosts).toEqual(mode === "new" ? ids.map(id => ({ id, createdAt: new Date(Math.floor(now / 1000) * 1000).toISOString(), storedAt: now })) : []);
  if (mode === "durable") expect(meter.entries.filter(entry => /^\s*(INSERT|UPDATE|DELETE)/i.test(entry.sql) && /(?:INTO|UPDATE|FROM)\s+x_post(?:s|_facts|_references)\b/i.test(entry.sql))).toEqual([]);
  console.log(`RSS_PROFILE_${mode}`, JSON.stringify({ ...meter.summary(), bindingCalls: meter.bindingCalls }));
  const selectors = meter.entries.filter(entry => /SELECT id FROM x_posts WHERE id IN/.test(entry.sql));
  expect(selectors.length).toBeGreaterThan(0);
  const before = [];
  for (const entry of selectors) before.push((await db.prepare(entry.sql).bind(...entry.args).all()).meta.rows_read);
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2000) INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) SELECT 'history-'||x,'unrelated','unrelated','{}',0,0 FROM n").run();
  for (const [index, entry] of selectors.entries()) {
    expect((await db.prepare(entry.sql).bind(...entry.args).all()).meta.rows_read).toBe(before[index]);
    const plan = await db.prepare(`EXPLAIN QUERY PLAN ${entry.sql}`).bind(...entry.args).all<{ detail: string }>();
    expect(plan.results.map(row => row.detail).join(" ")).toMatch(/SEARCH x_posts USING INDEX sqlite_autoindex_x_posts_1/);
  }
});

it.each([false,true])("profiles one ordinary Queue invocation storing five free candidates, relations=%s", async relations => {
  const ids=["301","302","303","304","305"];
  freeProvider(ids,relations);
  const scan=await create({...state([]),phase:"fetch"});
  await db.batch([
    db.prepare("UPDATE scheduled_job_items SET status='queued',attempts=0,lease_token=NULL,lease_until=NULL WHERE id=?").bind(scan.item.id),
    db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=NULL"),
  ]);
  const meter=meterD1(db),send=vi.fn(),ack=vi.fn(),retry=vi.fn();
  await handleScheduledJobQueue({queue:"otw-ops-background",messages:[{body:{schemaVersion:1,messageType:"scheduled_job_item",runId:scan.item.run_id,itemId:scan.item.id,phase:"collect"},ack,retry}]} as unknown as MessageBatch<unknown>,
    {...runtime,...siteEnv(),otw_db:meter.db,OTW_OPS_BACKGROUND_QUEUE:{send} as unknown as Queue<unknown>});
  expect(ack).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
  const item=await scan.repo.readItem(scan.item.id);
  expect(item?.status).toBe("succeeded");
  expect(JSON.parse(item!.result_json!).newlyStoredPosts.map((post:{id:string})=>post.id)).toEqual(ids);
  if(relations)expect(await db.prepare("SELECT count(*) n FROM x_post_references WHERE source_post_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).first("n")).toBe(10);
  console.log(`RSS_QUEUE_PROFILE_${relations?"relations":"plain"}`,JSON.stringify({...meter.summary(),bindingCalls:meter.bindingCalls}));
});

it.each(["site", "shared", "backoff"])("utc_budget_block_keeps_pending: %s", async boundary => {
  const entry = await create(), before = await clocks();
  if (boundary === "site") await db.prepare("INSERT OR REPLACE INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES(?,'all','x_api_cost_micros',1000000,0,1000000,0)").bind(new Date(now).toISOString().slice(0,10)).run();
  if (boundary === "shared") await db.prepare("UPDATE x_shared_budgets SET used=1000000").run();
  if (boundary === "backoff") await db.prepare("UPDATE settings SET value=? WHERE key='x_api_backoff_until'").bind(String(now + 60_000)).run();
  const result = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(result.state.candidates.map(item => item.id)).toEqual(["201", "202"]);
  expect(result.stats).toMatchObject({ paidApiCalls: 0, postsStored: 0 });
  expect(result.error).toMatch(/budget|rate_limited/);
  expect(fetch).not.toHaveBeenCalled();
  expect(await clocks()).toEqual(before);
});

it("reuses_success_after_checkpoint_crash with a partially stored paid batch", async () => {
  const entry = await create(), checkpoint = entry.repo.checkpointItemContinuation.bind(entry.repo);
  // The response and first INSERT commit, but the second post cannot be stored.
  await db.exec("CREATE TRIGGER fail_paid_post BEFORE INSERT ON x_posts WHEN NEW.id='202' BEGIN SELECT RAISE(ABORT,'storage interrupted'); END;");
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const first = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(first.stats.paidApiCalls).toBe(1);
  expect((await stored()).results.map(row => row.id)).toEqual(["201"]);
  await db.exec("DROP TRIGGER fail_paid_post;");
  vi.spyOn(entry.repo, "checkpointItemContinuation").mockImplementation(checkpoint);
  await entry.repo.releaseItemForRetry(entry.item, "interrupted", "interrupted");
  now = first.nextAttemptAt!;
  const item = (await entry.repo.claimItem(entry.item.id))!;
  const callsBefore = vi.mocked(fetch).mock.calls.length;
  const resumed = await runFxRssCollectionItem(runtime, item, JSON.parse(item.continuation_json!), entry.repo);
  expect(resumed).toMatchObject({ status: "complete", stats: { paidApiCalls: 0 } });
  expect(vi.mocked(fetch).mock.calls.length - callsBefore).toBe(0);
  expect(await db.prepare("SELECT count(*) n FROM x_shared_requests WHERE status='complete'").first("n")).toBe(1);
  expect((await stored()).results.map(row => row.id)).toEqual(["201", "202"]);
  warning.mockRestore();
});

it("waits for independent official completion after first sight and pending timeline wins", async () => {
  const entry = await create();
  await db.prepare("UPDATE x_post_sources SET last_completed_at=?,sync_pagination_token='pending'").bind(now - 100_000).run();
  const result = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(result.state.candidates).toEqual(entry.input.candidates);
  expect(fetch).not.toHaveBeenCalled();
});

it("budget_blocked_candidate_plan_creates_no_item while mixed free work remains eligible", async () => {
  const entry = await create();
  await entry.repo.completeItem(entry.item, { status: "partial" });
  await db.prepare("UPDATE x_shared_budgets SET used=1000000").run();
  expect(await readDueFxRssCollectionTargets(runtime, now)).toEqual([]);
  const mixed = state([...candidates(), { ...candidates(["203"])[0]!, stage: "free", attempts: 1 }]);
  await db.prepare("UPDATE scheduled_job_items SET continuation_json=? WHERE id=?").bind(JSON.stringify(mixed), entry.item.id).run();
  expect(await readDueFxRssCollectionTargets(runtime, now)).toHaveLength(1);
});

it("carries oldest RSS deadline through continuation copy and final checkpoint", async () => {
  const original = await create(state(candidates().map((candidate, index) => ({ ...candidate, firstSeenAt: now - (index ? 23 : 2) * 3_600_000 }))));
  await original.repo.completeItem(original.item, { status: "partial" });
  const [continuation] = await readDueFxRssCollectionTargets(runtime, now);
  expect(continuation.executionPriority).toEqual({ deadlineAt: now + 3_600_000, lastAttemptAt: 0, key: "member:1-rss" });
  const resumed = await create(continuation);
  await db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=?").bind(original.item.id).run();
  expect((await runFxRssCollectionItem(runtime, resumed.item, resumed.input, resumed.repo)).status).toBe("complete");
  expect(JSON.parse((await resumed.repo.readItem(resumed.item.id))!.continuation_json!).executionPriority).toEqual(continuation.executionPriority);
});

it("retries only absent IDs at the next tick after a processed HTTP partial response, before 24h", async () => {
  const firstSeen = (Math.floor(now / 86_400_000) + 1) * 86_400_000 + 60_000;
  now = firstSeen + 3_600_000;
  await new D1SharedXBudget(db).ensureDay();
  await db.prepare("UPDATE x_post_sources SET last_completed_at=?,regular_completed_at=?").bind(now,now).run();
  const provider = vi.mocked(fetch).getMockImplementation()!;
  let missingAvailable = false;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const response = await provider(input, init);
    if (new URL(String(input)).pathname !== "/2/tweets") return response;
    const body = await response.json() as { data: Array<{ id: string; created_at: string }>; includes: unknown };
    return Response.json({ ...body, data: body.data.filter(post => missingAvailable || post.id === "201").map(post => ({ ...post, created_at: new Date(firstSeen).toISOString() })), ...(!missingAvailable ? { errors: [{ resource_id: "202", type: "https://api.x.com/2/problems/resource-not-found" }] } : {}) });
  });
  const entry = await create(state(candidates().map(candidate => ({ ...candidate, firstSeenAt: firstSeen }))));
  const first = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(first.state.candidates.map(candidate => candidate.id)).toEqual(["202"]);
  expect(first.stats.paidApiCalls).toBe(1);
  await entry.repo.completeItem(entry.item, { status: "partial" });
  now = first.nextAttemptAt!;
  const [resume] = await readDueFxRssCollectionTargets(runtime, now);
  const next = await create(resume);
  const calls = vi.mocked(fetch).mock.calls.length;
  missingAvailable = true;
  const second = await runFxRssCollectionItem(runtime, next.item, next.input, next.repo);
  expect(second).toMatchObject({ status: "complete", stats: { paidApiCalls: 1, newlyStoredPosts: [{ id: "202", createdAt: new Date(firstSeen).toISOString() }] } });
  expect(vi.mocked(fetch).mock.calls.length).toBe(calls + 1);
  expect(vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input)).searchParams.get("ids"))).toEqual(["201,202", "202"]);
  expect(now - firstSeen).toBe(82 * 60_000);
  expect(now - Date.parse(second.stats.newlyStoredPosts![0]!.createdAt)).toBeLessThan(24 * 3_600_000);
  expect((await stored()).results.map(row => row.id)).toEqual(["201", "202"]);
});

it("stale paidBatch-only predecessor copies cannot replace a newer batch checkpoint", async () => {
  const original = state(), entry = await create(original);
  await entry.repo.completeItem(entry.item, { status: "partial" });
  const stale = { ...original, scope: "pending" as const, resumeFromItemId: entry.item.id };
  const day = new Date(now).toISOString().slice(0,10);
  const changed = { ...original, paidBatch: { day, ids: ["201"], requestId: `otw:rss:member:${day}:00000000-0000-0000-0000-000000000000` } };
  await db.prepare("UPDATE scheduled_job_items SET continuation_json=? WHERE id=?").bind(JSON.stringify(changed), entry.item.id).run();
  const next = await create(stale);
  // Restore the predecessor pointer, as ordinary planning does not overwrite it.
  await db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=?").bind(entry.item.id).run();
  expect((await runFxRssCollectionItem(runtime, next.item, stale, next.repo)).status).toBe("blocked");
  expect(fetch).not.toHaveBeenCalled();
});

it("never reports authority upgrades or concurrent existing rows as new INSERTs", async () => {
  const free = { id: "401", username: "member", text: "free", createdAt: new Date(now).toISOString(), url: "https://x.com/member/status/401", media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 } };
  expect(await writeStoredPosts(db, "member", { id: "101", username: "member" }, [free], now, "otw", { origin: "fxembed", completeness: { text: true, media: true, relations: true } })).toMatchObject({ insertedIds: ["401"] });
  expect(await writeStoredPosts(db, "member", { id: "101", username: "member" }, [{ ...free, text: "official" }], now, "otw")).toMatchObject({ count: 1, insertedIds: [] });
  const competing = { ...free, id: "402", url: "https://x.com/member/status/402" };
  const acknowledgements = await Promise.all([writeStoredPosts(db, "member", { id: "101", username: "member" }, [competing], now, "otw"), writeStoredPosts(db, "member", { id: "101", username: "member" }, [competing], now, "otw")]);
  expect(acknowledgements.flatMap(result => result.insertedIds)).toEqual(["402"]);
});

it.each(["foreign", "private", "before-start", "invalid-date", "retweet", "unknown-author", "malformed-author", "unrelated-id"])("validates paid candidate %s before persistence", async boundary => {
  const entry = await create(state(candidates(["201"])));
  await db.prepare("UPDATE x_fx_sources SET collection_started_at=?").bind(now - 100_000).run();
  vi.mocked(fetch).mockImplementation(async () => Response.json({ data: [{ id: boundary === "unrelated-id" ? "999" : "201", author_id: boundary === "foreign" || boundary === "unrelated-id" ? "999" : boundary === "unknown-author" ? undefined : boundary === "malformed-author" ? "not-an-id" : "101", text: "must not be stored", created_at: boundary === "invalid-date" ? "garbage" : new Date(now - (boundary === "before-start" ? 200_000 : 90_000)).toISOString(), ...(boundary === "retweet" ? { referenced_tweets: [{ type: "retweeted", id: "99" }] } : {}) }], includes: { users: [{ id: "101", username: "member", protected: boundary === "private" }] } }));
  const result = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect((await stored()).results).toEqual([]);
  expect(result.stats.paidApiCalls).toBe(1);
  expect(result.stats.postsStored).toBe(0);
  if (["private", "invalid-date", "unknown-author", "malformed-author", "unrelated-id"].includes(boundary)) {
    expect(result.state.candidates.map(candidate => candidate.id)).toEqual(["201"]);
    expect(result.stats.excludedCandidates ?? []).toEqual([]);
    if (boundary !== "unrelated-id") expect(result.state.paidBatch?.ids).toEqual(["201"]);
  }
  else {
    expect(result).toMatchObject({ status: "complete", state: { candidates: [], paidBatch: null }, stats: { excludedCandidates: [{ id: "201", reason: boundary === "foreign" ? "wrong_author" : boundary === "retweet" ? "repost" : "before_start" }] } });
    await entry.repo.completeItem(entry.item, { status: "succeeded", result: result.stats });
    now += 86_400_000;
    await new D1SharedXBudget(db).ensureDay();
    const next = await readDueFxRssCollectionTargets(runtime, now);
    expect(next.every(item => item.phase === "fetch" && !item.paidBatch && !item.candidates.length)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  }
});

it("never dispatches before the paid batch checkpoint succeeds", async () => {
  const entry = await create(), checkpoint = entry.repo.checkpointItemContinuation.bind(entry.repo);
  vi.spyOn(entry.repo, "checkpointItemContinuation").mockImplementation(async (item, continuation, stats) => continuation.paidBatch ? false : checkpoint(item, continuation, stats));
  expect((await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo)).status).toBe("blocked");
  expect(fetch).not.toHaveBeenCalled();
  expect(await db.prepare("SELECT count(*) n FROM x_shared_requests").first("n")).toBe(0);
});

it("retires a cached foreign-author batch after a lost completion checkpoint and never repurchases next day", async () => {
  const entry = await create(state(candidates(["201"])));
  vi.mocked(fetch).mockResolvedValue(Response.json({ data: [{ id: "201", author_id: "999", text: "other author", created_at: new Date(now).toISOString() }] }));
  const checkpoint = entry.repo.checkpointItemContinuation.bind(entry.repo);
  const interrupted = vi.spyOn(entry.repo, "checkpointItemContinuation").mockImplementation((item, continuation, stats) => Array.isArray(continuation.candidates) && continuation.candidates.length === 0 ? Promise.resolve(false) : checkpoint(item, continuation, stats));
  const first = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(first.status).toBe("blocked");
  expect(first.state.paidBatch?.ids).toEqual(["201"]);
  expect(fetch).toHaveBeenCalledTimes(1);
  interrupted.mockRestore();
  await entry.repo.releaseItemForRetry(entry.item, "checkpoint_lost", "checkpoint_lost");
  now += 60_000;
  const replay = (await entry.repo.claimItem(entry.item.id))!;
  const outcome = await new ScheduledJobExecutor(runtime, entry.repo).execute(replay);
  await entry.repo.completeItem(replay, outcome);
  expect(outcome.status).toBe("succeeded");
  const evidence = JSON.parse((await entry.repo.readItem(replay.id))!.result_json!);
  expect(evidence).toMatchObject({ paidApiCalls: 0, pending: 0, excludedCandidates: [{ id: "201", reason: "wrong_author" }] });
  expect(await db.prepare("SELECT rss_pending_item_id FROM x_fx_sources WHERE handle='member'").first("rss_pending_item_id")).toBeNull();
  now += 86_400_000;
  await new D1SharedXBudget(db).ensureDay();
  const next = await readDueFxRssCollectionTargets(runtime, now);
  expect(next).toHaveLength(1);
  expect(next[0]).toMatchObject({ phase: "fetch", candidates: [] });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("retains an already incurred cost when rollback denies paid persistence", async () => {
  const entry = await create(), provider = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const response = await provider(input, init);
    await db.prepare("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run();
    return response;
  });
  const result = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(result.stats.paidApiCalls).toBe(1);
  expect(result.stats.estimatedCostMicros).toBeGreaterThan(0);
  expect((await stored()).results).toEqual([]);
  expect(result.state.candidates.map(candidate => candidate.id)).toEqual(["201", "202"]);
  expect(await db.prepare("SELECT cost,status FROM x_shared_requests").first()).toMatchObject({ cost: result.stats.estimatedCostMicros, status: "complete" });
  expect((await new D1SharedXBudget(db).read()).reserved).toBe(0);
});

it("reduces new batches to both remaining budgets while retaining full reservation on cache replay", async () => {
  const entry = await create(state(candidates(["201", "202", "203"])));
  await db.prepare("UPDATE x_shared_budgets SET used=950000").run();
  const result = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(result.stats).toMatchObject({ paidApiCalls: 1, postsStored: 1, pending: 2 });
  expect(vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input)).searchParams.get("ids"))).toEqual(["201"]);
});

it.each(["site", "shared"])("preserves pending and earlier cost when %s blocks after UTC rollover", async boundary => {
  const provider = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const response = await provider(input, init);
    if (new URL(String(input)).pathname !== "/2/tweets") return response;
    const body = await response.json() as { data: Array<{ id: string }>; includes: unknown };
    return Response.json({ ...body, data: body.data.filter(post => post.id === "201"), errors: [{ resource_id: "202", type: "https://api.x.com/2/problems/resource-not-found" }] });
  });
  const entry = await create();
  const first = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(first.stats.estimatedCostMicros).toBeGreaterThan(0);
  await entry.repo.completeItem(entry.item, { status: "partial" });
  const oldDay = new Date(now).toISOString().slice(0,10), oldLedger = await db.prepare("SELECT used,reserved FROM x_shared_budgets WHERE day=?").bind(oldDay).first();
  now = (Math.floor(now / 86_400_000) + 1) * 86_400_000 + 1000;
  await new D1SharedXBudget(db).ensureDay();
  const day = new Date(now).toISOString().slice(0,10);
  if (boundary === "shared") await db.prepare("UPDATE x_shared_budgets SET used=1000000 WHERE day=?").bind(day).run();
  else await db.prepare("INSERT INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES(?,'all','x_api_cost_micros',1000000,0,1000000,0)").bind(day).run();
  const next = await create({ ...first.state, scope: "pending", resumeFromItemId: entry.item.id });
  const calls = vi.mocked(fetch).mock.calls.length;
  const blocked = await runFxRssCollectionItem(runtime, next.item, next.input, next.repo);
  expect(blocked.state.candidates.map(candidate => candidate.id)).toEqual(["202"]);
  expect(blocked.stats.paidApiCalls).toBe(0);
  expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  expect(await db.prepare("SELECT used,reserved FROM x_shared_budgets WHERE day=?").bind(oldDay).first()).toEqual(oldLedger);
  if (boundary === "shared") await db.prepare("UPDATE x_shared_budgets SET used=0 WHERE day=?").bind(day).run();
  else await db.prepare("UPDATE scheduled_usage_daily SET used=0 WHERE day=? AND resource='x_api_cost_micros'").bind(day).run();
  now = blocked.nextAttemptAt!;
  await next.repo.releaseItemForRetry(next.item, "budget", "budget");
  const item = (await next.repo.claimItem(next.item.id))!;
  const restored = await runFxRssCollectionItem(runtime, item, JSON.parse(item.continuation_json!), next.repo);
  expect(restored.stats.paidApiCalls).toBe(1);
  expect(restored.state.paidBatch).toBeNull();
  expect(await db.prepare("SELECT day FROM x_shared_requests ORDER BY updated_at DESC LIMIT 1").first("day")).toBe(day);
  const lastPath = new URL(String(vi.mocked(fetch).mock.calls.at(-1)![0]));
  expect(lastPath.searchParams.get("ids")).toBe("202");
});

it("cache replay requires the full original reservation after a partial write", async () => {
  const entry = await create();
  await db.exec("CREATE TRIGGER fail_paid_budget BEFORE INSERT ON x_posts WHEN NEW.id='202' BEGIN SELECT RAISE(ABORT,'storage interrupted'); END;");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let first;
  try { first = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo); }
  finally { await db.exec("DROP TRIGGER fail_paid_budget;"); }
  await entry.repo.completeItem(entry.item, { status: "partial" });
  now = first.nextAttemptAt!;
  await db.prepare("UPDATE x_shared_budgets SET used=970000").run();
  expect(await readDueFxRssCollectionTargets(runtime, now)).toEqual([]);
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  expect((await stored()).results.map(row => row.id)).toEqual(["201"]);
  await db.prepare("UPDATE x_shared_budgets SET used=900000").run();
  const [resume] = await readDueFxRssCollectionTargets(runtime, now), next = await create(resume);
  const replay = await runFxRssCollectionItem(runtime, next.item, next.input, next.repo);
  expect(replay).toMatchObject({ status: "complete", stats: { paidApiCalls: 0, newlyStoredPosts: [{ id: "202" }] } });
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
  expect(await db.prepare("SELECT count(*) n FROM x_shared_requests WHERE status='complete'").first("n")).toBe(1);
});

it("finishes the last absent candidate when JSON fulfills it after terminal exclusions", async () => {
  const entry = await create();
  vi.mocked(fetch).mockImplementation(async () => Response.json({ data: [{ id: "201", author_id: "101", text: "before activation", created_at: "1970-01-01T00:00:00Z" }], includes: { users: [{ id: "101", username: "member", protected: false }] }, errors: [{ resource_id: "202", type: "https://api.x.com/2/problems/resource-not-found" }] }));
  const first = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(first.state.candidates.map(candidate => candidate.id)).toEqual(["202"]);
  await entry.repo.completeItem(entry.item, { status: "partial" });
  await writeStoredPosts(db, "member", { id: "101", username: "member" }, [{ id: "202", text: "JSON", username: "member", createdAt: new Date(now).toISOString(), url: "https://x.com/member/status/202", media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 } }], now, "otw", { origin: "fxembed", completeness: { text: true, media: true, relations: true } });
  now = first.nextAttemptAt!;
  const [resume] = await readDueFxRssCollectionTargets(runtime, now), next = await create(resume);
  expect((await runFxRssCollectionItem(runtime, next.item, next.input, next.repo)).status).toBe("complete");
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
});

it("reuses a response settled after midnight when its paid batch was checkpointed before midnight", async () => {
  const oldDay = new Date(now).toISOString().slice(0,10);
  now = (Math.floor(now / 86_400_000) + 1) * 86_400_000 - 1000;
  await db.prepare("UPDATE x_post_sources SET last_completed_at=?,regular_completed_at=?").bind(now, now).run();
  const entry = await create(), provider = vi.mocked(fetch).getMockImplementation()!;
  let crossed = false;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (!crossed) { crossed = true; now += 2000; }
    return provider(input, init);
  });
  await db.exec("CREATE TRIGGER fail_midnight_post BEFORE INSERT ON x_posts WHEN NEW.id='202' BEGIN SELECT RAISE(ABORT,'storage interrupted'); END;");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let first;
  try { first = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo); }
  finally { await db.exec("DROP TRIGGER fail_midnight_post;"); }
  expect(first.stats.paidApiCalls).toBe(1);
  expect(first.state.paidBatch!.day).toBe(oldDay);
  const responseDay = new Date(now).toISOString().slice(0,10);
  expect(await db.prepare("SELECT day FROM x_shared_requests").first("day")).toBe(responseDay);
  await entry.repo.completeItem(entry.item, { status: "partial" });
  now = first.nextAttemptAt!;
  const [resume] = await readDueFxRssCollectionTargets(runtime, now), next = await create(resume);
  const calls = vi.mocked(fetch).mock.calls.length;
  expect((await runFxRssCollectionItem(runtime, next.item, next.input, next.repo)).stats.paidApiCalls).toBe(0);
  expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
});

it("keeps mixed free work while the same run's independent timeline owns all paid work", async () => {
  const input = state([...candidates(["201"]), { ...candidates(["203"])[0]!, stage: "free", attempts: 1 }]), entry = await create(input);
  await entry.repo.addItems(entry.item.run_id, [{ targetKey: "x_api:member", lane: "x", phase: "collect", continuation: { provider: "x_api", handles: ["member"], scope: "regular" } }]);
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/status/203")) return Response.json({ code: 200, status: { type: "status", id: "203", text: "free", created_at: new Date(now).toUTCString(), author: { id: "101", screen_name: "member", protected: false }, media: {} } });
    throw new Error(`paid lookup must not happen beside timeline: ${url}`);
  });
  const result = await runFxRssCollectionItem(runtime, entry.item, input, entry.repo);
  expect(result.stats).toMatchObject({ freeApiCalls: 1, paidApiCalls: 0, postsStored: 1, pending: 1 });
  expect((await stored()).results.map(row => row.id)).toEqual(["203"]);
  expect(result.error).toBe("rss_official_timeline_pending");
});

it("receipt reads are site isolated and SELECT-only without provider dispatch or ledger writes", async () => {
  const input = { id: "receipt-otw", operation: "tweet_lookup" as const, path: "/tweets?ids=201" };
  await gateway.execute(input);
  const meter = meterD1(db), observed = new D1SharedXApiGateway({ db: meter.db, site: "otw", token: "fixture", admitD1: async () => { throw new Error("receipt cannot admit external work"); } });
  const calls = vi.mocked(fetch).mock.calls.length;
  expect(await observed.readReceipt(input)).toMatchObject({ found: true, status: "complete", ok: true, day: new Date(now).toISOString().slice(0,10) });
  expect(await observed.readReceipt({ ...input, id: "absent" })).toEqual({ found: false });
  expect(await observed.readReceipt({ ...input, operation: "timeline" })).toEqual({ found: false });
  expect(await observed.readReceipt({ ...input, path: "/tweets?ids=202" })).toEqual({ found: false });
  const other = new D1SharedXApiGateway({ db: meter.db, site: "luvdia", token: "fixture", admitD1: async () => true });
  expect(await other.readReceipt(input)).toEqual({ found: false });
  expect(meter.entries.every(entry => /^SELECT\b/.test(entry.sql))).toBe(true);
  expect(meter.summary().rowsWritten).toBe(0);
  expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
});

it.each(["running", "redacting", "redacted"])("never replaces an uncertain or redacted %s receipt with a new paid identity", async status => {
  const entry = await create();
  const first = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  // Recreate a lost candidate checkpoint while preserving the actual receipt identity.
  const request = await db.prepare("SELECT id,day FROM x_shared_requests LIMIT 1").first<{ id: string; day: string }>();
  const input = state();
  input.paidBatch = { day: request!.day, ids: ["201", "202"], requestId: request!.id };
  await db.prepare("UPDATE x_shared_requests SET status=?,result=NULL WHERE id=?").bind(status, request!.id).run();
  const oldPath = await db.prepare("SELECT path FROM x_shared_requests WHERE id=?").bind(request!.id).first<string>("path");
  await db.prepare("DELETE FROM x_posts").run();
  await entry.repo.completeItem(entry.item, { status: "partial" });
  now = (Math.floor(now / 86_400_000) + 1) * 86_400_000 + 1000;
  await new D1SharedXBudget(db).ensureDay();
  const next = await create(input), calls = vi.mocked(fetch).mock.calls.length;
  const blocked = await runFxRssCollectionItem(runtime, next.item, input, next.repo);
  expect(blocked.stats.paidApiCalls).toBe(0);
  expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  expect(await db.prepare("SELECT path FROM x_shared_requests WHERE id=?").bind(request!.id).first("path")).toBe(oldPath);
  expect(await db.prepare("SELECT count(*) n FROM x_shared_requests").first("n")).toBe(1);
  expect(first.stats.paidApiCalls).toBe(1);
});

it("reaches the site-scoped receipt through the actual coordinator RPC and LuvDia composition", async () => {
  const input = { id: "receipt-peer", operation: "tweet_lookup" as const, path: "/tweets?ids=201" };
  const peer = new D1SharedXApiGateway({ db, site: "luvdia", token: "fixture", admitD1: async () => true });
  await peer.execute(input);
  const meter = meterD1(db), rpc = new XActivityCoordinatorRpc(createExecutionContext(), { ...runtime, otw_db: meter.db });
  const dispatch = vi.fn();
  const application = withXGateway({ ...runtime, ...siteEnv("luvdia"), X_API_GATEWAY: undefined, X_ACTIVITY_COORDINATOR: { receiptForLuvdia: (request: Parameters<typeof rpc.receiptForLuvdia>[0]) => rpc.receiptForLuvdia(request), gatewayForLuvdia: dispatch } } as unknown as Env);
  const calls = vi.mocked(fetch).mock.calls.length;
  expect(await application.X_API_GATEWAY!.readReceipt!(input)).toMatchObject({ found: true, ok: true, status: "complete" });
  expect(await gateway.readReceipt(input)).toEqual({ found: false });
  expect(meter.summary().rowsWritten).toBe(0);
  expect(dispatch).not.toHaveBeenCalled();
  expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  const wrongSite = new XActivityCoordinatorRpc(createExecutionContext(), { ...runtime, SITE_ID: "luvdia" });
  await expect(wrongSite.receiptForLuvdia(input)).rejects.toThrow("wrong_coordinator");
});

it("an unsupported receipt peer leaves the old batch pending without dispatch", async () => {
  const entry = await create();
  const day = new Date(now).toISOString().slice(0,10);
  const input = { ...entry.input, paidBatch: { day, ids: ["201", "202"], requestId: `otw:rss:member:${day}:00000000-0000-0000-0000-000000000000` } };
  await db.prepare("UPDATE scheduled_job_items SET continuation_json=? WHERE id=?").bind(JSON.stringify(input),entry.item.id).run();
  entry.item = (await entry.repo.readItem(entry.item.id))!;
  const execute = vi.fn(gateway.execute.bind(gateway));
  const unavailable = { ...runtime, X_API_GATEWAY: { execute, readBudget: gateway.readBudget.bind(gateway), redactPost: gateway.redactPost.bind(gateway) } };
  const result = await runFxRssCollectionItem(unavailable, entry.item, input, entry.repo);
  expect(result.error).toBe("shared_receipt_unavailable");
  expect(result.state.candidates.map(candidate => candidate.id)).toEqual(["201", "202"]);
  expect(execute).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(await db.prepare("SELECT count(*) n FROM x_shared_requests").first("n")).toBe(0);
});

it("retries a definitively failed receipt using a new checkpointed identity", async () => {
  const entry = await create(), provider = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null,{ status: 500 })).mockImplementation(provider);
  const first = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(first.stats.paidApiCalls).toBe(1);
  expect(first.state.candidates.map(candidate => candidate.id)).toEqual(["201", "202"]);
  await entry.repo.completeItem(entry.item, { status: "partial" });
  now = first.nextAttemptAt!;
  const [resume] = await readDueFxRssCollectionTargets(runtime, now), next = await create(resume);
  expect((await runFxRssCollectionItem(runtime, next.item, next.input, next.repo))).toMatchObject({ status: "complete", stats: { paidApiCalls: 1, postsStored: 2 } });
  expect(await db.prepare("SELECT count(*) n FROM x_shared_requests WHERE status='complete'").first("n")).toBe(2);
});

const admissionCases = (["absent", "existing"] as const).flatMap(ledger =>
  (["disabled", "rollback", "activation overflow", "member", "item-lease", "source-lease"] as const).map(boundary => ({ ledger, boundary })));
it.each(admissionCases)("atomically rejects RSS admission after $boundary before the $ledger site reservation", async ({ ledger, boundary }) => {
    const day = new Date(now).toISOString().slice(0,10);
    if (ledger === "existing") await db.prepare("INSERT INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES(?,'all','x_api_cost_micros',17,23,1000000,0)").bind(day).run();
    const before = await db.prepare("SELECT used,reserved FROM scheduled_usage_daily WHERE day=? AND lane='all' AND resource='x_api_cost_micros'").bind(day).first();
    const entry = await create(), beforeClocks = await clocks(), original = db.prepare.bind(db);
    let interleaved = false;
    const spy = vi.spyOn(db, "prepare").mockImplementation(sql => {
      const statement = original(sql);
      if (sql.includes("INSERT INTO scheduled_usage_daily") && sql.includes("x_api_cost_micros") && sql.includes("RETURNING reserved")) {
        const bind = statement.bind.bind(statement);
        statement.bind = (...values) => {
          const bound = bind(...values), first = bound.first.bind(bound);
          bound.first = (async (...args: Parameters<typeof first>) => {
            interleaved = true;
            if (boundary === "disabled") await original("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run();
            if (boundary === "rollback") await original("UPDATE settings SET value='x_api' WHERE key='x_collection_primary_source'").run();
            if (boundary === "activation overflow") await original("UPDATE settings SET value='1e999' WHERE key='x_collection_hybrid_activated_at'").run();
            if (boundary === "member") await original("UPDATE members SET url_twitter=NULL WHERE uid=1").run();
            if (boundary === "item-lease") await original("UPDATE scheduled_job_items SET lease_token='next-item-owner' WHERE id=?").bind(entry.item.id).run();
            if (boundary === "source-lease") await original("UPDATE x_post_sources SET lease_token='next-source-owner' WHERE handle='member'").run();
            return first(...args);
          }) as typeof bound.first;
          return bound;
        };
      }
      return statement;
    });
    const result = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
    spy.mockRestore();
    expect(interleaved, boundary).toBe(true);
    expect(result.stats.paidApiCalls, boundary).toBe(0);
    expect(fetch, boundary).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT count(*) n FROM x_shared_requests").first("n"), boundary).toBe(0);
    expect(await db.prepare("SELECT used,reserved FROM x_shared_budgets WHERE day=?").bind(day).first(), boundary).toEqual({ used: 0, reserved: 0 });
    expect(await db.prepare("SELECT used,reserved FROM scheduled_usage_daily WHERE day=? AND lane='all' AND resource='x_api_cost_micros'").bind(day).first(), boundary).toEqual(before);
    expect(result.state.candidates.map(candidate => candidate.id), boundary).toEqual(["201", "202"]);
    expect(JSON.parse((await db.prepare("SELECT continuation_json FROM scheduled_job_items WHERE id=?").bind(entry.item.id).first<string>("continuation_json"))!).candidates.map((candidate: FxRssCandidate) => candidate.id), boundary).toEqual(["201", "202"]);
    expect((await stored()).results, boundary).toEqual([]);
    expect(await clocks(), boundary).toEqual(beforeClocks);
    expect(await db.prepare("SELECT rss_last_check_completed_at FROM x_fx_sources WHERE handle='member'").first("rss_last_check_completed_at"), boundary).toBeNull();
});

it("preserves one admitted request and settlement when stop follows the atomic site claim", async () => {
  const entry = await create(), beforeClocks = await clocks(), original = db.prepare.bind(db);
  let admitted = false;
  vi.spyOn(db, "prepare").mockImplementation(sql => {
    const statement = original(sql);
    if (sql.includes("INSERT INTO scheduled_usage_daily") && sql.includes("x_api_cost_micros") && sql.includes("RETURNING reserved")) {
      const bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values), first = bound.first.bind(bound);
        bound.first = (async (...args: Parameters<typeof first>) => {
          const claim = await first(...args);
          expect(claim).not.toBeNull();
          admitted = true;
          await original("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run();
          return claim;
        }) as typeof bound.first;
        return bound;
      };
    }
    return statement;
  });
  const result = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(admitted).toBe(true);
  expect(result.stats.paidApiCalls).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(result.stats.estimatedCostMicros).toBeGreaterThan(0);
  expect(await db.prepare("SELECT used,reserved FROM scheduled_usage_daily WHERE lane='all' AND resource='x_api_cost_micros'").first()).toEqual({ used: result.stats.estimatedCostMicros, reserved: 0 });
  expect(await db.prepare("SELECT count(*) n FROM x_shared_requests WHERE status='complete'").first("n")).toBe(1);
  expect((await stored()).results).toEqual([]);
  expect(result.state.candidates.map(candidate => candidate.id)).toEqual(["201", "202"]);
  expect(await clocks()).toEqual(beforeClocks);
  expect(await db.prepare("SELECT rss_last_check_completed_at FROM x_fx_sources WHERE handle='member'").first("rss_last_check_completed_at")).toBeNull();
});

it.each(["missing-db", "missing-operation", "missing-fence", "zero-reservation", "reference-preview"] as const)("fails closed for a guarded %s request without atomic site admission", async boundary => {
  const fence = { handle: "member", itemId: "unclaimed-item", itemLeaseToken: "unclaimed-item-lease", sourceLeaseToken: "unclaimed-source-lease", members: [{ uid: 1, urlTwitter: "https://x.com/member" }] };
  await expect(requestXApi("/tweets?ids=201", "fixture", {
    cacheDb: boundary === "missing-db" ? undefined : db,
    operation: boundary === "missing-operation" ? undefined : "tweet_lookup",
    estimatedCostMicros: boundary === "zero-reservation" ? 0 : undefined,
    usageTracker: { apiCalls: 0, estimatedCostMicros: 0, reservedCostMicros: 0, uniqueResources: 0, previewDeferred: 0, authorCacheHits: 0, authorCacheMisses: 0, purpose: boundary === "reference-preview" ? "reference_preview" : "collection" },
    gateway,
    admissionFence: { fence: boundary === "missing-fence" ? undefined as unknown as typeof fence : fence, siteId: "otw" },
  })).rejects.toMatchObject({ code: "budget_unavailable" });
  expect(fetch).not.toHaveBeenCalled();
  expect(await db.prepare("SELECT count(*) n FROM x_shared_requests").first("n")).toBe(0);
  expect(await db.prepare("SELECT count(*) n FROM scheduled_usage_daily WHERE resource='x_api_cost_micros'").first("n")).toBe(0);
});

it("replays a processed partial response after lost candidate checkpoint without paid redispatch", async () => {
  const entry = await create(), checkpoint = entry.repo.checkpointItemContinuation.bind(entry.repo), provider = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const response = await provider(input, init);
    if (new URL(String(input)).pathname !== "/2/tweets") return response;
    const body = await response.json() as { data: Array<{ id: string }>; includes: unknown };
    return Response.json({ ...body, data: body.data.filter(post => post.id === "201"), errors: [{ resource_id: "202", type: "https://api.x.com/2/problems/resource-not-found" }] });
  });
  vi.spyOn(entry.repo,"checkpointItemContinuation").mockImplementation(async (item, continuation, stats) => (continuation.candidates as FxRssCandidate[]).length === 1 ? false : checkpoint(item,continuation,stats));
  const interrupted = await runFxRssCollectionItem(runtime, entry.item, entry.input, entry.repo);
  expect(interrupted.status).toBe("blocked");
  expect(interrupted.state.candidates.map(candidate => candidate.id)).toEqual(["201", "202"]);
  expect(interrupted.state.paidBatch!.ids).toEqual(["201", "202"]);
  expect((await stored()).results.map(row => row.id)).toEqual(["201"]);
  vi.mocked(entry.repo.checkpointItemContinuation).mockImplementation(checkpoint);
  await entry.repo.releaseItemForRetry(entry.item,"checkpoint","checkpoint");
  const item = (await entry.repo.claimItem(entry.item.id))!, calls = vi.mocked(fetch).mock.calls.length;
  const replay = await runFxRssCollectionItem(runtime,item,JSON.parse(item.continuation_json!),entry.repo);
  expect(replay.stats.paidApiCalls).toBe(0);
  expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  expect(replay.state.candidates.map(candidate => candidate.id)).toEqual(["202"]);
  expect(replay.state.paidBatch).toBeNull();
  expect(await db.prepare("SELECT count(*) n FROM x_shared_requests WHERE status='complete'").first("n")).toBe(1);
});

it("resumes an aborted bounded-batch replay through valid checkpoints and the due planner", async () => {
  const entry = await create(), checkpoint = entry.repo.checkpointItemContinuation.bind(entry.repo);
  const { parseFxRssContinuation } = await import("../application/fx-rss-collection");
  await db.prepare("UPDATE settings SET value='2' WHERE key='x_collection_daily_budget_cents'").run();
  vi.spyOn(entry.repo,"checkpointItemContinuation").mockImplementation(async (item, continuation, stats) => (continuation.candidates as FxRssCandidate[]).length === 1 ? false : checkpoint(item,continuation,stats));
  const interrupted = await runFxRssCollectionItem(runtime,entry.item,entry.input,entry.repo);
  expect(interrupted.status).toBe("blocked");
  expect(interrupted.state.paidBatch!.ids).toEqual(["201"]);
  expect((await stored()).results.map(post => post.id)).toEqual(["201"]);
  vi.mocked(entry.repo.checkpointItemContinuation).mockImplementation(checkpoint);
  await db.prepare("UPDATE settings SET value='100' WHERE key='x_collection_daily_budget_cents'").run();
  await entry.repo.releaseItemForRetry(entry.item,"checkpoint","checkpoint");
  const item = (await entry.repo.claimItem(entry.item.id))!, receipt = gateway.readReceipt.bind(gateway);
  const temporaryBackoff = vi.spyOn(gateway,"readReceipt").mockImplementation(async input => {
    const result = await receipt(input);
    await db.prepare("UPDATE settings SET value=? WHERE key='x_api_backoff_until'").bind(String(now + 60_000)).run();
    return result;
  });
  const replay = await runFxRssCollectionItem(runtime,item,JSON.parse(item.continuation_json!),entry.repo);
  temporaryBackoff.mockRestore();
  expect(replay.error).toBe("rate_limited");
  expect(replay.stats.paidApiCalls).toBe(0);
  expect(vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input)).searchParams.get("ids"))).toEqual(["201"]);
  await entry.repo.completeItem(item,{ status: "partial" });
  await db.prepare("UPDATE settings SET value='0' WHERE key='x_api_backoff_until'").run();
  now = replay.nextAttemptAt!;
  const planned = await readDueFxRssCollectionTargets(runtime,now);
  expect(planned).toHaveLength(1);
  const persisted = JSON.parse((await entry.repo.readItem(item.id))!.continuation_json!);
  expect(() => parseFxRssContinuation(persisted)).not.toThrow();
  expect(persisted.candidates.map((candidate: FxRssCandidate) => candidate.id)).toEqual(["202"]);
  expect(persisted.paidBatch).toBeNull();
  const next = await create(planned[0]), recovered = await runFxRssCollectionItem(runtime,next.item,next.input,next.repo);
  expect(recovered).toMatchObject({ status: "complete", stats: { paidApiCalls: 1, postsStored: 1 } });
  const completed = JSON.parse((await next.repo.readItem(next.item.id))!.continuation_json!);
  expect(() => parseFxRssContinuation(completed)).not.toThrow();
  expect((await stored()).results.map(post => post.id)).toEqual(["201", "202"]);
  expect(vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input)).searchParams.get("ids"))).toEqual(["201", "202"]);
});
