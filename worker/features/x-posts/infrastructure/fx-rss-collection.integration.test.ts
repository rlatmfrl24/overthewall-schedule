import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FxRssContinuation } from "@contracts/x-collection";
import { D1ScheduledJobRepository } from "../../../platform/scheduled-jobs/d1-scheduled-job-repository";
import { runDataRetentionPolicyPrune } from "../../operations/infrastructure/data-retention";
import { writeStoredPosts } from "./x-api";
import { ScheduledJobExecutor } from "../../scheduled-operations/infrastructure/scheduled-job-executor";
import { runFxCollectionForHandles } from "./fx-collection";

const runtime = { ...env, SITE_ID: "otw" } as Env & { X_REFERENCE_MIGRATIONS: D1Migration[]; SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[] };
const db = runtime.otw_db;
let now: number, sequence: number;
const state = (): FxRssContinuation => ({ provider: "fxembed", mode: "rss_candidates", scope: "regular", handles: ["member"], phase: "fetch", candidates: [], nextAttemptAt: null });
const repository = () => new D1ScheduledJobRepository(db, () => now, () => `rss-${++sequence}`);
const createItem = async (continuation = state()) => {
  const repo = repository();
  const run = await repo.createRun({ jobType: "x_collection", source: "scheduled", scheduledFor: now, idempotencyKey: `rss-run-${++sequence}` });
  const [id] = await repo.addItems(run.id, [{ targetKey: "rss:member", phase: "collect", lane: "x", continuation }]);
  return { repo, item: (await repo.claimItem(id))! };
};
const runItem = async (entry: Awaited<ReturnType<typeof createItem>>, continuation: FxRssContinuation) => {
  const module = await import("../../../app/x-rss-collection").catch(() => null);
  expect(module?.runFxRssCollectionItem, "RSS composition exists").toBeTypeOf("function");
  return module!.runFxRssCollectionItem(runtime, entry.item, continuation, entry.repo);
};
const due = async () => {
  const module = await import("./d1-fx-rss-collection").catch(() => null);
  expect(module?.readDueFxRssCollectionTargets, "RSS public due reader exists").toBeTypeOf("function");
  return module!.readDueFxRssCollectionTargets(runtime, now);
};
beforeEach(async () => {
  now = Date.now(); sequence = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  await applyD1Migrations(db, runtime.X_REFERENCE_MIGRATIONS);
  await applyD1Migrations(db, runtime.SCHEDULED_OPERATIONS_MIGRATIONS);
  await db.batch([...["scheduled_outbox", "scheduled_job_items", "scheduled_job_runs", "x_post_references", "x_post_facts", "x_posts", "x_fx_sources", "x_post_sources", "members"].map(table => db.prepare(`DELETE FROM ${table}`)),
    ...[["x_collection_enabled", "true"], ["x_collection_primary_source", "fxembed"], ["x_collection_hybrid_policy", "rss_v1"], ["x_collection_hybrid_activated_at", "1"]].map(([key, value]) => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").bind(key, value)),
    db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')"),
    db.prepare("INSERT INTO x_post_sources(handle,user_id,collection_started_at,last_checked_at,updated_at,last_seen_post_id,sync_pagination_token) VALUES('member','101',1,0,0,'100','official-cursor')"),
    db.prepare("INSERT INTO x_fx_sources(handle,user_id,collection_started_at,consecutive_failures,consecutive_successes,fallback_active,updated_at) VALUES('member','101',1,2,0,1,0)"),
  ]);
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("feed.xml")) return new Response(`<rss version="2.0"><channel>${[1,2,3,4,5,6].map(id => `<item><guid>https://x.com/member/status/${id}</guid><pubDate>${new Date().toUTCString()}</pubDate></item>`).join("")}</channel></rss>`);
    const id = url.pathname.split("/").pop();
    const checkpoint = await db.prepare("SELECT i.continuation_json FROM x_fx_sources f JOIN scheduled_job_items i ON i.id=f.rss_pending_item_id WHERE f.handle='member'").first<string>("continuation_json");
    expect(JSON.parse(checkpoint!).candidates.map((candidate: { id: string }) => candidate.id)).toContain(id);
    return Response.json({ code: 200, status: { type: "status", id, text: id, created_at: new Date().toUTCString(), author: { id: "101", screen_name: "member", protected: false }, media: {} } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("stores RSS after normal Fx-only bootstrap without initializing official identity or cursor", async () => {
  await db.batch([db.prepare("DELETE FROM x_post_sources"), db.prepare("DELETE FROM x_fx_sources")]);
  now = Math.floor(now / 1000) * 1000;
  const author = { id: "101", screen_name: "member", protected: false };
  const fresh = (id: string) => ({ type: "status", id, text: id, created_at: new Date(now + 1000).toUTCString(), author, media: {} });
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ code: 200, user: author }))
    .mockResolvedValueOnce(Response.json({ code: 200, results: [fresh("125")], cursor: {} }));
  expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ status: "success", postsStored: 1 });
  const official = () => db.prepare("SELECT user_id,last_seen_post_id,sync_pagination_token,last_success_at,last_completed_at FROM x_post_sources").first();
  const before = await official();
  expect(before).toEqual({ user_id: null, last_seen_post_id: null, sync_pagination_token: null, last_success_at: null, last_completed_at: null });
  expect(await db.prepare("SELECT user_id FROM x_fx_sources").first("user_id")).toBe("101");
  vi.mocked(fetch).mockImplementation(async input => new URL(String(input)).pathname.endsWith("feed.xml")
    ? new Response(`<rss version="2.0"><channel><item><guid>https://x.com/member/status/126</guid><pubDate>${new Date(now + 1000).toUTCString()}</pubDate></item></channel></rss>`)
    : Response.json({ code: 200, status: fresh("126") }));
  const entry = await createItem();
  expect(await runItem(entry, state())).toMatchObject({ status: "complete", stats: { freeApiCalls: 1, paidApiCalls: 0, postsStored: 1 } });
  expect(await db.prepare("SELECT user_id,content_hash FROM x_posts WHERE id='126'").first()).toMatchObject({ user_id: "101", content_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(await official()).toEqual(before);
});

it("rss_success_does_not_repair_json_or_official_clock and resumes a terminal partial without scanning", async () => {
  let active = 0, peak = 0;
  const provider = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (...args) => {
    active++; peak = Math.max(peak, active);
    try { await new Promise(resolve => setTimeout(resolve, 5)); return await provider(...args); }
    finally { active--; }
  });
  const first = await createItem();
  const clocks = async () => ({ official: await db.prepare("SELECT last_seen_post_id,sync_pagination_token,last_completed_at,regular_completed_at FROM x_post_sources").first(), json: await db.prepare("SELECT cursor,consecutive_failures,consecutive_successes,fallback_active,last_completed_at FROM x_fx_sources").first() });
  const before = await clocks();
  const result = await runItem(first, state());
  expect(result.stats).toMatchObject({ freeApiCalls: 5, postsStored: 5, pending: 1 });
  expect(await clocks()).toEqual(before);
  await first.repo.completeItem(first.item, { status: "partial", result });
  now = result.nextAttemptAt!;
  const [resume] = await due();
  expect(resume.resumeFromItemId).toBe(first.item.id);
  const second = await createItem(resume);
  const callsBefore = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("feed.xml")).length;
  expect((await runItem(second, resume)).status).toBe("complete");
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("feed.xml"))).toHaveLength(callsBefore);
  expect(await db.prepare("SELECT count(*) n FROM x_posts").first("n")).toBe(6);
  expect(await db.prepare("SELECT rss_pending_item_id FROM x_fx_sources").first("rss_pending_item_id")).toBeNull();
  expect(await clocks()).toEqual(before);
  expect(peak).toBe(1);
});

it("rejects stale queued snapshots and a stale fresh scan after a completed scan", async () => {
  const stale = await createItem(), first = await createItem();
  const result = await runItem(first, state());
  await first.repo.completeItem(first.item, { status: "partial", result });
  now = result.nextAttemptAt!;
  const [resume] = await due(), old = await createItem(resume), next = await createItem(resume);
  expect((await runItem(next, resume)).status).toBe("complete");
  const before = await db.prepare("SELECT rss_last_check_completed_at,rss_pending_item_id FROM x_fx_sources").first();
  const calls = vi.mocked(fetch).mock.calls.length;
  expect((await runItem(old, resume)).status).toBe("blocked");
  expect((await runItem(stale, state())).status).toBe("blocked");
  expect(await db.prepare("SELECT rss_last_check_completed_at,rss_pending_item_id FROM x_fx_sources").first()).toEqual(before);
  expect(fetch).toHaveBeenCalledTimes(calls);
});

it("does_not_prune_referenced_pending_rss_item or its parent run until pointer release", async () => {
  const entry = await createItem();
  await entry.repo.completeItem(entry.item, { status: "partial" });
  await db.batch([
    db.prepare("UPDATE scheduled_outbox SET reconciled_at=1"),
    db.prepare("UPDATE scheduled_job_items SET finished_at=1"), db.prepare("UPDATE scheduled_job_runs SET finished_at=1"),
    db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=?").bind(entry.item.id),
  ]);
  await runDataRetentionPolicyPrune(runtime, "scheduled-job-items", 250);
  await runDataRetentionPolicyPrune(runtime, "scheduled-job-runs", 250);
  expect(await entry.repo.readItem(entry.item.id)).not.toBeNull();
  expect(await entry.repo.readRun(entry.item.run_id)).not.toBeNull();
  await db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=NULL").run();
  await runDataRetentionPolicyPrune(runtime, "scheduled-job-items", 250);
  await runDataRetentionPolicyPrune(runtime, "scheduled-job-runs", 250);
  expect(await entry.repo.readItem(entry.item.id)).toBeNull();
  expect(await entry.repo.readRun(entry.item.run_id)).toBeNull();
});

it("checkpoints snapshot and result atomically under a live item lease and revision", async () => {
  const { repo, item } = await createItem();
  expect(repo.checkpointItemContinuation, "repository checkpoint exists").toBeTypeOf("function");
  const snapshot = { ...state(), phase: "hydrate", candidates: [{ id: "1" }] };
  const obsolete = { ...item };
  expect(await repo.checkpointItemContinuation(item, snapshot, { pending: 1 })).toBe(true);
  expect(await repo.checkpointItemContinuation(obsolete, state(), { pending: 0 })).toBe(false);
  const before = await repo.readItem(item.id);
  expect(await repo.checkpointItemContinuation({ ...item, lease_token: "wrong-lease" }, state(), {})).toBe(false);
  expect(await repo.readItem(item.id)).toEqual(before);
  now += 6 * 60_000;
  expect(await repo.checkpointItemContinuation(item, state(), {})).toBe(false);
  expect(await repo.readItem(item.id)).toEqual(before);
});

it("rejects a stale result revision even when the continuation snapshot is identical", async () => {
  const { repo, item } = await createItem(), stale = { ...item };
  const snapshot = JSON.parse(item.continuation_json!);
  expect(await repo.checkpointItemContinuation(item, snapshot, { pending: 1 })).toBe(true);
  expect(await repo.checkpointItemContinuation(stale, snapshot, { pending: 0 })).toBe(false);
  expect(JSON.parse((await repo.readItem(item.id))!.result_json!)).toEqual({ pending: 1 });
});

it.each(["Infinity", "1e999", "0", "not-a-date"])("does not activate RSS for invalid marker %s", async marker => {
  await db.prepare("UPDATE settings SET value=? WHERE key='x_collection_hybrid_activated_at'").bind(marker).run();
  expect(await due()).toEqual([]);
  expect((await runItem(await createItem(), state())).status).toBe("blocked");
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["0.5", String(Number.MAX_VALUE)])("admits RSS writes for finite positive activation %s", async marker => {
  await db.prepare("UPDATE settings SET value=? WHERE key='x_collection_hybrid_activated_at'").bind(marker).run();
  expect(await due()).toHaveLength(1);
  expect((await runItem(await createItem(), state())).stats.postsStored).toBe(5);
  expect(await db.prepare("SELECT count(*) n FROM x_posts").first("n")).toBe(5);
});

it.each([
  { kind: "hidden", hidden: 99, removed: null, access: "normal", authority: "fxembed", hash: null },
  { kind: "removed", hidden: null, removed: 99, access: "normal", authority: "fxembed", hash: null },
  { kind: "archived", hidden: null, removed: null, access: "admin_archive", authority: "fxembed", hash: null },
  { kind: "legacy complete", hidden: null, removed: null, access: "normal", authority: null, hash: null },
  { kind: "hashed complete", hidden: null, removed: null, access: "normal", authority: "fxembed", hash: "complete" },
])("preserves $kind rows and removes their candidates without lookup", async protection => {
  const entry = await createItem();
  const checkpoint = entry.repo.checkpointItemContinuation.bind(entry.repo);
  let discovered = false;
  vi.spyOn(entry.repo, "checkpointItemContinuation").mockImplementation(async (item, continuation, stats) => {
    const saved = await checkpoint(item, continuation, stats);
    if (saved && !discovered && continuation.phase === "hydrate") {
      discovered = true;
      await db.prepare("INSERT INTO x_posts(id,handle,user_id,username,value,created_at,first_seen_at,fetched_at,hidden_at,content_removed_at,content_access,source_authority,content_hash) VALUES('1','member','101','member','{}','2026-11-03',1,1,?,?,?,?,?)")
        .bind(protection.hidden, protection.removed, protection.access, protection.authority, protection.hash).run();
    }
    return saved;
  });
  const result = await runItem(entry, state());
  expect(result.stats).toMatchObject({ freeApiCalls: 5, postsStored: 5, resolved: 6 });
  expect(result.status).toBe("complete");
  expect(await db.prepare("SELECT hidden_at,content_removed_at,content_access,value,revision FROM x_posts WHERE id='1'").first()).toMatchObject({ hidden_at: protection.hidden, content_removed_at: protection.removed, content_access: protection.access, value: "{}", revision: 0 });
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/status/1"))).toBe(false);
});

it("removes a candidate fulfilled by the normal JSON post writer after discovery", async () => {
  const entry = await createItem(), checkpoint = entry.repo.checkpointItemContinuation.bind(entry.repo);
  let discovered = false;
  vi.spyOn(entry.repo, "checkpointItemContinuation").mockImplementation(async (item, continuation, stats) => {
    const saved = await checkpoint(item, continuation, stats);
    if (saved && !discovered && continuation.phase === "hydrate") {
      discovered = true;
      expect(await writeStoredPosts(db, "member", { id: "101", username: "member" }, [{ id: "1", text: "JSON stored concurrently", username: "member", createdAt: new Date(now).toISOString(), url: "https://x.com/member/status/1", media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 } }], now, "otw", { origin: "fxembed", completeness: { text: true, media: true, relations: true } })).toMatchObject({ ok: true, count: 1 });
    }
    return saved;
  });
  const result = await runItem(entry, state());
  expect(result).toMatchObject({ status: "complete", stats: { postsStored: 5, freeApiCalls: 5, resolved: 6 } });
  const row = await db.prepare("SELECT value,revision FROM x_posts WHERE id='1'").first<{ value: string; revision: number }>();
  expect(JSON.parse(row!.value).text).toBe("JSON stored concurrently");
  expect(row!.revision).toBe(1);
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/status/1"))).toBe(false);
});

it("replays an actual post commit after lost checkpoint without duplicate write", async () => {
  const entry = await createItem();
  const checkpoint = entry.repo.checkpointItemContinuation.bind(entry.repo);
  vi.spyOn(entry.repo, "checkpointItemContinuation").mockImplementation(async (item, continuation, stats) =>
    continuation.phase === "hydrate" && (continuation.candidates as unknown[]).length === 5 ? false : checkpoint(item, continuation, stats));
  const interrupted = await runItem(entry, state());
  expect(interrupted.status).toBe("blocked");
  expect(interrupted.state.candidates).toHaveLength(6);
  expect(await db.prepare("SELECT count(*) n FROM x_posts").first("n")).toBe(1);
  const revision = await db.prepare("SELECT revision FROM x_posts WHERE id='1'").first("revision");
  vi.mocked(entry.repo.checkpointItemContinuation).mockImplementation(checkpoint);
  await entry.repo.releaseItemForRetry(entry.item, "interrupted", "interrupted");
  entry.item = (await entry.repo.claimItem(entry.item.id))!;
  const resumed = await runItem(entry, JSON.parse(entry.item.continuation_json!));
  expect(resumed.status).toBe("complete");
  expect(await db.prepare("SELECT revision FROM x_posts WHERE id='1'").first("revision")).toBe(revision);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/status/1"))).toHaveLength(1);
});

it("retains the snapshot when rollback or lease loss occurs during a lookup", async () => {
  const entry = await createItem();
  const provider = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const response = await provider(input, init);
    if (String(input).includes("/status/")) {
      await db.prepare("UPDATE settings SET value='x_api' WHERE key='x_collection_primary_source'").run();
      await db.prepare("UPDATE x_post_sources SET lease_token='new-owner'").run();
    }
    return response;
  });
  const result = await runItem(entry, state());
  expect(result.status).toBe("blocked");
  expect(JSON.parse((await entry.repo.readItem(entry.item.id))!.continuation_json!).candidates).toHaveLength(6);
  expect(await db.prepare("SELECT count(*) n FROM x_posts").first("n")).toBe(0);
  expect(await due()).toEqual([]);
});

it("keeps twice-failed free candidates durable for Task4 official recovery", async () => {
  const first = await createItem();
  const provider = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => String(input).includes("/status/") ? new Response(null, { status: 404 }) : provider(input, init));
  let result = await runItem(first, state());
  await first.repo.completeItem(first.item, { status: "partial", result });
  now = result.nextAttemptAt!;
  const [resume] = await due(), second = await createItem(resume);
  result = await runItem(second, resume);
  expect(result.state.candidates.filter(candidate => candidate.stage === "official")).toHaveLength(5);
  expect(result.stats.paidApiCalls).toBe(0);
  expect(await db.prepare("SELECT rss_pending_item_id FROM x_fx_sources").first("rss_pending_item_id")).toBe(second.item.id);
  expect(await db.prepare("SELECT rss_last_check_completed_at FROM x_fx_sources").first("rss_last_check_completed_at")).toBeNull();
});

it("gates persisted pending eligibility immediately before and exactly at the nominal tick", async () => {
  const first = await createItem(), result = await runItem(first, state());
  await first.repo.completeItem(first.item, { status: "partial", result });
  now = result.nextAttemptAt! - 1;
  expect(await due()).toEqual([]);
  now++;
  expect(await due()).toEqual([expect.objectContaining({ resumeFromItemId: first.item.id, nextAttemptAt: now })]);
  expect(fetch).toHaveBeenCalledTimes(6);
});

it("finishes source acknowledgement after the final item checkpoint committed but pointer release was interrupted", async () => {
  const entry = await createItem(), complete = { ...state(), phase: "hydrate" as const };
  await entry.repo.checkpointItemContinuation(entry.item, complete, { pending: 0 });
  await db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=?").bind(entry.item.id).run();
  await entry.repo.completeItem(entry.item, { status: "skipped", errorCode: "rss_checkpoint_lost" });
  const [resume] = await due();
  expect(resume, "unfinished source acknowledgement remains resumable").toBeDefined();
  const next = await createItem(resume);
  expect((await runItem(next, resume)).status).toBe("complete");
  expect(await db.prepare("SELECT rss_pending_item_id FROM x_fx_sources").first("rss_pending_item_id")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects a queued copy when the same predecessor item has a newer checkpoint", async () => {
  const first = await createItem(), result = await runItem(first, state());
  await first.repo.completeItem(first.item, { status: "partial", result });
  now = result.nextAttemptAt!;
  const [oldSnapshot] = await due(), stale = await createItem(oldSnapshot);
  expect(await first.repo.retryRun(first.item.run_id)).toMatchObject({ kind: "accepted" });
  first.item = (await first.repo.claimItem(first.item.id))!;
  const current = JSON.parse(first.item.continuation_json!) as FxRssContinuation;
  current.candidates[0].attempts = 1;
  current.candidates[0].error = "fx_http_404";
  await first.repo.checkpointItemContinuation(first.item, current, { pending: 1 });
  await first.repo.completeItem(first.item, { status: "partial" });
  const calls = vi.mocked(fetch).mock.calls.length;
  expect((await runItem(stale, oldSnapshot)).status).toBe("blocked");
  expect(await db.prepare("SELECT rss_pending_item_id FROM x_fx_sources").first("rss_pending_item_id")).toBe(first.item.id);
  expect(fetch).toHaveBeenCalledTimes(calls);
  expect((await due())[0].candidates[0]).toMatchObject({ attempts: 1, error: "fx_http_404" });
});

it("retains raw shrink evidence and waits six hours before a fresh scan", async () => {
  const startedAt = now, first = await createItem(), result = await runItem(first, state());
  await first.repo.completeItem(first.item, { status: "partial", result });
  now = result.nextAttemptAt!;
  const [resume] = await due(), second = await createItem(resume);
  expect((await runItem(second, resume)).status).toBe("complete");
  now = startedAt + 6 * 3_600_000 - 1;
  expect(await due()).toEqual([]);
  now++;
  const [fresh] = await due();
  expect(fresh).toMatchObject({ phase: "fetch", scope: "regular", candidates: [] });
  vi.mocked(fetch).mockResolvedValue(new Response('<rss version="2.0"><channel/></rss>'));
  const next = await createItem(fresh);
  expect(await runItem(next, fresh)).toMatchObject({status:"complete",stats:{rawCount:0,windowReduced:true}});
  expect(await db.prepare("SELECT rss_last_raw_count,rss_previous_raw_count,rss_last_candidate_count,rss_pending_item_id FROM x_fx_sources").first()).toEqual({ rss_last_raw_count: 0, rss_previous_raw_count: 6, rss_last_candidate_count: 0, rss_pending_item_id: null });
  expect(await db.prepare("SELECT consecutive_failures,fallback_active FROM x_fx_sources").first()).toEqual({ consecutive_failures: 2, fallback_active: 1 });
});

const writeInterleavings = [
  ["disabled", "UPDATE settings SET value='false' WHERE key='x_collection_enabled'"],
  ["rollback", "UPDATE settings SET value='x_api' WHERE key='x_collection_primary_source'"],
  ["policy", "UPDATE settings SET value='legacy' WHERE key='x_collection_hybrid_policy'"],
  ["activation overflow", "UPDATE settings SET value='1e999' WHERE key='x_collection_hybrid_activated_at'"],
  ["member removed", "UPDATE members SET url_twitter=NULL WHERE uid=1"],
  ["member archived", "UPDATE members SET content_access='admin_archive' WHERE uid=1"],
  ["item turnover", "UPDATE scheduled_job_items SET lease_token='next-item-owner' WHERE status='running'"],
  ["item expired", "UPDATE scheduled_job_items SET lease_until=0 WHERE status='running'"],
  ["account turnover", "UPDATE x_post_sources SET lease_token='next-account-owner'"],
  ["account expired", "UPDATE x_post_sources SET lease_until=0"],
  ["pointer turnover", "UPDATE x_fx_sources SET rss_pending_item_id='newer-item'"],
] as const;

it.each(writeInterleavings)("rejects RSS post mutation when %s occurs after the writer row read", async (_reason, mutation) => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const entry = await createItem();
  let interleaved = false;
  const original = db.batch.bind(db);
  const prepare = vi.spyOn(db, "batch").mockImplementation(async statements => {
    const results = await original(statements);
    if (!interleaved && results.some(result => typeof (result.results[0] as { data?: unknown } | undefined)?.data === "string")) {
      interleaved = true;
      await db.prepare(mutation).run();
    }
    return results;
  });
  const result = await runItem(entry, state());
  prepare.mockRestore();
  expect(interleaved).toBe(true);
  expect(result.status).toBe("blocked");
  expect(await db.prepare("SELECT count(*) n FROM x_posts").first("n")).toBe(0);
  expect(await db.prepare("SELECT count(*) n FROM x_post_facts").first("n")).toBe(0);
  expect(await db.prepare("SELECT count(*) n FROM x_post_references").first("n")).toBe(0);
  expect(warning).toHaveBeenCalledWith("Failed to write stored X posts", expect.any(Error));
});

it.each(writeInterleavings)("rejects source acknowledgement when %s occurs after the item checkpoint", async (_reason, mutation) => {
  const input: FxRssContinuation = { ...state(), phase: "hydrate", candidates: [] };
  const entry = await createItem(input);
  await db.prepare("UPDATE x_fx_sources SET rss_pending_item_id=?").bind(entry.item.id).run();
  const checkpoint = entry.repo.checkpointItemContinuation.bind(entry.repo);
  vi.spyOn(entry.repo, "checkpointItemContinuation").mockImplementation(async (...args) => {
    const saved = await checkpoint(...args);
    if (saved) await db.prepare(mutation).run();
    return saved;
  });
  expect((await runItem(entry, input)).status).toBe("blocked");
  expect(await db.prepare("SELECT rss_last_check_completed_at,rss_pending_item_id FROM x_fx_sources").first()).toEqual({ rss_last_check_completed_at: null, rss_pending_item_id: mutation.includes("newer-item") ? "newer-item" : entry.item.id });
  expect(fetch).not.toHaveBeenCalled();
});

it("does not claim an RSS source when collection stops after member snapshot selection", async () => {
  const entry = await createItem(), original = db.prepare.bind(db);
  let stopped = false;
  vi.spyOn(db, "prepare").mockImplementation(sql => {
    const statement = original(sql);
    if (/^UPDATE x_fx_sources SET\s+rss_cadence_anchor_at=/.test(sql)) {
      const bind = statement.bind.bind(statement);
      statement.bind = (...values) => {
        const bound = bind(...values), first = bound.first.bind(bound);
        bound.first = (async (...args: Parameters<typeof first>) => {
          stopped = true;
          await original("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run();
          return first(...args);
        }) as typeof bound.first;
        return bound;
      };
    }
    return statement;
  });
  expect((await runItem(entry, state())).status).toBe("blocked");
  expect(stopped).toBe(true);
  expect(await db.prepare("SELECT rss_pending_item_id,rss_last_attempt_at FROM x_fx_sources").first()).toEqual({ rss_pending_item_id: null, rss_last_attempt_at: null });
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["application retry", "admin readback"])("keeps the RSS candidate when a facts write is blocked even if eligibility is immediately restored: %s", async surface => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_history_analytics_enabled','true')").run();
  const entry = await createItem();
  await db.exec("CREATE TRIGGER transient_facts_failure BEFORE INSERT ON x_post_facts BEGIN SELECT RAISE(ABORT,'transient facts failure'); END;");
  const removeFailure = () => db.exec("DROP TRIGGER transient_facts_failure;");
  if (surface === "admin readback") {
    const outcome = await new ScheduledJobExecutor(runtime, entry.repo).execute(entry.item);
    expect(outcome).toMatchObject({ status: "skipped", errorCode: "rss_storage_failed" });
    expect(await entry.repo.completeItem(entry.item, outcome)).toBe(true);
    const raw = JSON.parse((await entry.repo.readItem(entry.item.id))!.result_json!);
    const newlyStoredPosts: unknown[] = [];
    expect(raw).toMatchObject({ status: "skipped", postsStored: 0, newlyStoredPosts, error: "rss_storage_failed" });
    expect(await db.prepare("SELECT id,content_hash FROM x_posts WHERE id='1'").first()).toBeNull();
    expect(await db.prepare("SELECT post_id FROM x_post_facts WHERE post_id='1'").first()).toBeNull();
    expect(JSON.parse((await entry.repo.readItem(entry.item.id))!.continuation_json!).candidates.map((candidate: { id: string }) => candidate.id)).toContain("1");
    const item = (await entry.repo.readRunDto(entry.item.run_id))?.xCollection?.items[0];
    expect(item).toMatchObject({ status: "skipped", errorCode: "rss_storage_failed", collection: { status: "skipped", postsStored: 0, newlyStoredPosts: raw.newlyStoredPosts, error: "rss_storage_failed" } });
    await removeFailure();
    return;
  }
  const interrupted = await runItem(entry, state());
  expect(interrupted.status).toBe("blocked");
  expect(interrupted.state.candidates.map(candidate => candidate.id)).toContain("1");
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='1'").first("content_hash")).toBeNull();
  expect(await db.prepare("SELECT rss_last_check_completed_at,rss_pending_item_id FROM x_fx_sources").first()).toEqual({ rss_last_check_completed_at: null, rss_pending_item_id: entry.item.id });
  await removeFailure();
  await entry.repo.releaseItemForRetry(entry.item, "interrupted", "interrupted");
  entry.item = (await entry.repo.claimItem(entry.item.id))!;
  expect((await runItem(entry, JSON.parse(entry.item.continuation_json!))).status).toBe("pending");
  expect(await db.prepare("SELECT post_id FROM x_post_facts WHERE post_id='1'").first("post_id")).toBe("1");
  expect(await db.prepare("SELECT content_hash FROM x_posts WHERE id='1'").first("content_hash")).toMatch(/^[a-f0-9]{64}$/);
});
