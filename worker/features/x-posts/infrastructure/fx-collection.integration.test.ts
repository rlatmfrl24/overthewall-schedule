import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runFxCollectionForHandles } from "./fx-collection";
import { clearXServiceCachesForTests, fetchXPostsForHandles } from "./x-api";

const runtime = { ...env, SITE_ID: "otw" } as Env & { X_REFERENCE_MIGRATIONS: D1Migration[] };
const db = runtime.otw_db;
const raw = (id: string) => ({ type: "status", id, text: id, author: { id: "101", screen_name: "member", protected: false }, created_at: new Date().toUTCString(), media: {} });
const page = (id: string, cursor: string | null) => new Response(JSON.stringify({ code: 200, results: [raw(id)], cursor: { bottom: cursor } }));
beforeEach(async () => {
  await applyD1Migrations(db, runtime.X_REFERENCE_MIGRATIONS);
  await db.batch([db.prepare("DELETE FROM x_posts"), db.prepare("DELETE FROM x_post_sources"), db.prepare("DELETE FROM x_fx_sources"), db.prepare("DELETE FROM members"), db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_collection_enabled','true')")]);
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')").run();
  await db.prepare("INSERT INTO x_post_sources(handle,user_id,last_checked_at,updated_at,collection_started_at,last_seen_post_id,sync_pagination_token) VALUES('member','101',0,0,1,'100','official-next')").run();
});
afterEach(() => vi.unstubAllGlobals());
it.each(["archive", "publication"])("stores a public Fx page and acknowledges its cursor despite a %s-protected quote", async mode => {
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter,content_access) VALUES(2,?,'Private','https://x.com/private_member',?)")
    .bind(mode === "publication" ? "bing_hayu" : "private", mode === "archive" ? "admin_archive" : "normal").run();
  const privateQuote = { ...raw("122"), text: "private quote body", author: { id: "999", screen_name: "private_member", protected: false } };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: 200, results: [{ ...raw("123"), quote: privateQuote }, raw("124")], cursor: {} })));
  const official = await db.prepare("SELECT user_id,last_seen_post_id,sync_pagination_token,last_success_at,last_completed_at FROM x_post_sources").first();
  expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ status: "success", postsStored: 2, pendingSources: 0 });
  const stored = await db.prepare("SELECT id,value,content_hash FROM x_posts ORDER BY id").all<{ id: string; value: string; content_hash: string }>();
  expect(stored.results.map(row => row.id)).toEqual(["123", "124"]);
  expect(JSON.parse(stored.results[0].value).quote).toBeUndefined();
  expect(stored.results.every(row => /^[a-f0-9]{64}$/.test(row.content_hash))).toBe(true);
  expect(await db.prepare("SELECT cursor,last_completed_at,last_error FROM x_fx_sources").first()).toEqual({ cursor: null, last_completed_at: expect.any(Number), last_error: null });
  expect(await db.prepare("SELECT user_id,last_seen_post_id,sync_pagination_token,last_success_at,last_completed_at FROM x_post_sources").first()).toEqual(official);
  clearXServiceCachesForTests();
  const feed = await fetchXPostsForHandles(["member"], { cacheDb: db, refresh: false, siteId: "otw" });
  expect(feed.posts.map(post => post.id).sort()).toEqual(["123", "124"]);
  expect(JSON.stringify(feed.posts)).not.toContain("private quote body");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ status: "success", postsStored: 0, pendingSources: 0 });
  expect((await db.prepare("SELECT id,value,content_hash FROM x_posts ORDER BY id").all()).results).toEqual(stored.results);
});
it("stores four pages through the normal writer without moving the official cursor", async () => {
  let active = 0, peak = 0;
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    const cursor = new URL(url).searchParams.get("cursor");
    return cursor === null ? page("124", "p2") : cursor === "p2" ? page("123", "p3") : cursor === "p3" ? page("122", "p4") : page("121", "p5");
  });
  vi.stubGlobal("fetch", fetchMock);
  const before = await db.prepare("SELECT last_seen_post_id,sync_pagination_token,last_success_at,last_completed_at FROM x_post_sources").first();
  const result = await runFxCollectionForHandles(runtime, ["member"], "scheduled");
  expect(result).toMatchObject({ provider: "fxembed", postsStored: 4, pendingSources: 1 });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(peak).toBe(1);
  expect(await db.prepare("SELECT last_seen_post_id,sync_pagination_token,last_success_at,last_completed_at FROM x_post_sources").first()).toEqual(before);
  expect(await db.prepare("SELECT cursor FROM x_fx_sources").first("cursor")).toBe("p5");
});
it("preserves an acquired reply when the normal JSON collector replays an omitted relation", async () => {
  let reply = true;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: 200, results: [{ ...raw("123"), ...(reply ? { replying_to: { status: "122", screen_name: "member" } } : {}) }], cursor: {} })));
  expect((await runFxCollectionForHandles(runtime, ["member"], "manual")).status).toBe("success");
  const before = await db.prepare("SELECT value,revision,content_hash FROM x_posts WHERE id='123'").first();
  expect(JSON.parse(before!.value as string).reply.postId).toBe("122");
  const official = await db.prepare("SELECT * FROM x_post_sources").first();
  reply = false;
  expect((await runFxCollectionForHandles(runtime, ["member"], "manual")).status).toBe("success");
  expect(await db.prepare("SELECT value,revision,content_hash FROM x_posts WHERE id='123'").first()).toEqual(before);
  const after = await db.prepare("SELECT * FROM x_post_sources").first();
  expect(after).toMatchObject({ last_seen_post_id: official!.last_seen_post_id, sync_pagination_token: official!.sync_pagination_token, collection_started_at: official!.collection_started_at });
});
it("checks the head and resumes the durable continuation, retaining it on storage failure", async () => {
  await db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,cursor,updated_at) VALUES('member',1,'old',0)").run();
  const fetchMock = vi.fn().mockResolvedValueOnce(page("125", "head-next")).mockResolvedValueOnce(page("123", "after-old"));
  vi.stubGlobal("fetch", fetchMock);
  await db.exec("CREATE TRIGGER fail_fx_store BEFORE INSERT ON x_posts WHEN NEW.id='123' BEGIN SELECT RAISE(ABORT,'storage failure'); END;");
  try {
    const result = await runFxCollectionForHandles(runtime, ["member"], "scheduled");
    expect(result.status).toBe("failed");
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("cursor")).toBe("old");
    expect(await db.prepare("SELECT cursor FROM x_fx_sources").first("cursor")).toBe("old");
    expect(await db.prepare("SELECT consecutive_failures FROM x_fx_sources").first("consecutive_failures")).toBe(0);
  } finally { await db.exec("DROP TRIGGER fail_fx_store;"); }
});
it("preserves stored posts and pending cursor on provider failure or a repeated cursor", async () => {
  await db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,cursor,updated_at) VALUES('member',1,'old',0)").run();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(page("124", "head-next")).mockResolvedValueOnce(page("123", "old")));
  const result = await runFxCollectionForHandles(runtime, ["member"], "scheduled");
  expect(result.status).toBe("failed");
  expect(await db.prepare("SELECT cursor FROM x_fx_sources").first("cursor")).toBe("old");
  expect(await db.prepare("SELECT consecutive_failures FROM x_fx_sources").first("consecutive_failures")).toBe(1);
});
it("pins a new member via public Fx profile without advancing official initialization", async () => {
  await db.prepare("DELETE FROM x_post_sources").run();
  const fresh = { ...raw("125"), created_at: new Date(Date.now() + 1000).toUTCString() };
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ code: 200, user: fresh.author })).mockResolvedValueOnce(Response.json({ code: 200, results: [fresh], cursor: {} }));
  vi.stubGlobal("fetch", fetchMock);
  const result = await runFxCollectionForHandles(runtime, ["member"], "manual");
  expect(result).toMatchObject({ postsStored: 1, pendingSources: 0 });
  expect(fetchMock.mock.calls.every(([url]) => new URL(url).hostname === "api.fxtwitter.com")).toBe(true);
  expect(await db.prepare("SELECT user_id,last_seen_post_id,last_success_at,last_completed_at FROM x_post_sources").first()).toEqual({ user_id: null, last_seen_post_id: null, last_success_at: null, last_completed_at: null });
  expect(await db.prepare("SELECT user_id FROM x_fx_sources").first("user_id")).toBe("101");
});
it("does not count a lease collision or user stop as provider failure", async () => {
  vi.stubGlobal("fetch", vi.fn());
  await db.prepare("UPDATE x_post_sources SET lease_token='other',lease_until=?").bind(Date.now() + 600000).run();
  expect((await runFxCollectionForHandles(runtime, ["member"], "scheduled")).status).toBe("skipped");
  await db.prepare("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run();
  expect((await runFxCollectionForHandles(runtime, ["member"], "scheduled")).error).toBe("collection_disabled");
  expect(fetch).not.toHaveBeenCalled();
  expect(await db.prepare("SELECT COUNT(*) AS n FROM x_fx_sources").first("n")).toBe(0);
});
it("does not acknowledge a page until failed reference writes are durably retried", async () => {
  const status = { ...raw("123"), replying_to: { status: "122", screen_name: "member" } };
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ code: 200, results: [status], cursor: {} })));
  await db.exec("CREATE TRIGGER fail_fx_reference BEFORE INSERT ON x_post_references WHEN NEW.source_post_id='123' BEGIN SELECT RAISE(ABORT,'reference failure'); END;");
  try {
    expect((await runFxCollectionForHandles(runtime, ["member"], "manual")).status).toBe("failed");
    expect(await db.prepare("SELECT last_success_at,last_completed_at,consecutive_failures FROM x_fx_sources").first()).toEqual({ last_success_at: null, last_completed_at: null, consecutive_failures: 0 });
  } finally { await db.exec("DROP TRIGGER fail_fx_reference;"); }
  expect((await runFxCollectionForHandles(runtime, ["member"], "manual")).status).toBe("success");
  expect(await db.prepare("SELECT referenced_post_id FROM x_post_references WHERE source_post_id='123'").first("referenced_post_id")).toBe("122");
  expect(await db.prepare("SELECT last_completed_at FROM x_fx_sources").first("last_completed_at")).toBeTypeOf("number");
});
