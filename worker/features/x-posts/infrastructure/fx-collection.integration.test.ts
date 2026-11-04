import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runFxCollectionForHandles } from "./fx-collection";
import { clearXServiceCachesForTests, fetchXPostsForHandles } from "./x-api";

const runtime = { ...env, SITE_ID: "otw" } as Env & { X_REFERENCE_MIGRATIONS: D1Migration[] };
const db = runtime.otw_db;
const raw = (id: string) => ({ type: "status", id, text: id, author: { id: "101", screen_name: "member", protected: false }, created_at: new Date(Date.now()).toUTCString(), media: {} });
const page = (id: string, cursor: string | null, createdAt = Date.now()) => new Response(JSON.stringify({ code: 200, results: [{ ...raw(id), created_at: new Date(createdAt).toUTCString() }], cursor: { bottom: cursor } }));
beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(1800000000000);
  await applyD1Migrations(db, runtime.X_REFERENCE_MIGRATIONS);
  await db.batch([db.prepare("DELETE FROM x_posts"), db.prepare("DELETE FROM x_post_sources"), db.prepare("DELETE FROM x_fx_sources"), db.prepare("DELETE FROM members"), db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_collection_enabled','true')")]);
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')").run();
  await db.prepare("INSERT INTO x_post_sources(handle,user_id,last_checked_at,updated_at,collection_started_at,last_seen_post_id,sync_pagination_token) VALUES('member','101',0,0,1,'100','official-next')").run();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("recovers an interrupted handle lookup through the pinned ID and durable cursor", async () => {
  await db.prepare("INSERT INTO x_fx_sources(handle,user_id,collection_started_at,cursor,consecutive_failures,last_error,updated_at) VALUES('member','101',1,'old',1,'fx_http_404',0)").run();
  const official = await db.prepare("SELECT user_id,last_seen_post_id,sync_pagination_token,last_success_at,last_completed_at FROM x_post_sources").first();
  const fetchMock = vi.fn(async (url: string) => {
    const target = new URL(url);
    if (target.pathname !== "/2/profile/id:101/statuses") return Response.json({ code: 404, results: [], cursor: {} }, { status: 404 });
    return target.searchParams.get("cursor") === "head-next" ? page("123", null) : page("124", "head-next");
  });
  vi.stubGlobal("fetch", fetchMock);
  expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ status: "success", postsStored: 2, apiCalls: 2, pendingSources: 0 });
  expect(await db.prepare("SELECT cursor,consecutive_failures,last_error,last_success_at,last_completed_at FROM x_fx_sources").first()).toEqual({ cursor: null, consecutive_failures: 0, last_error: null, last_success_at: expect.any(Number), last_completed_at: expect.any(Number) });
  expect(await db.prepare("SELECT user_id,last_seen_post_id,sync_pagination_token,last_success_at,last_completed_at FROM x_post_sources").first()).toEqual(official);
  clearXServiceCachesForTests();
  expect((await fetchXPostsForHandles(["member"], { cacheDb: db, refresh: false, siteId: "otw" })).posts.map(post => post.id).sort()).toEqual(["123", "124"]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("retains the acknowledged head and pending cursor when the pinned provider still returns 404", async () => {
  await db.prepare("INSERT INTO x_fx_sources(handle,user_id,collection_started_at,cursor,updated_at) VALUES('member','101',1,'old',0)").run();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(page("125", "head-next")).mockResolvedValueOnce(Response.json({ code: 404, results: [], cursor: {} }, { status: 404 })));
  expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ status: "failed", postsStored: 1, apiCalls: 2, pendingSources: 1, error: "fx_http_404" });
  expect(await db.prepare("SELECT cursor,consecutive_failures,last_error,last_completed_at FROM x_fx_sources").first()).toEqual({ cursor: "head-next", consecutive_failures: 1, last_error: "fx_http_404", last_completed_at: null });
  expect(await db.prepare("SELECT id FROM x_posts").all()).toMatchObject({ results: [{ id: "125" }] });
});
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
it("retires a historic traversal and follows the current head continuation within 48 hours", async () => {
  await db.prepare("INSERT INTO x_fx_sources(handle,user_id,collection_started_at,cursor,updated_at) VALUES('member','101',1,'historic-tail',0)").run();
  const cursors: Array<string | null> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const cursor = new URL(url).searchParams.get("cursor"); cursors.push(cursor);
    return cursor === null ? page("150", "recent-page-2") : cursor === "recent-page-2" ? page("130", null)
      : Response.json({ code: 200, results: [{ ...raw("90"), created_at: new Date(Date.now() - 7 * 86400000).toUTCString() }], cursor: {} });
  }));
  expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ status: "success", pendingSources: 0 });
  expect(cursors).toEqual([null, "recent-page-2"]);
  expect((await db.prepare("SELECT id FROM x_posts ORDER BY id").all()).results).toEqual([{ id: "130" }, { id: "150" }]);
  const progress = await db.prepare("SELECT retired_progress,pages_completed,last_window_until_at,last_window_limited FROM x_fx_sources").first();
  expect(JSON.parse(progress!.retired_progress as string)).toEqual({ cursor: "historic-tail", lastCompletedAt: null, retiredAt: Date.now(), reason: "recent_48h_check" });
  expect(progress).toMatchObject({ pages_completed: 2, last_window_until_at: Date.now(), last_window_limited: 0 });
});
it("finishes a bounded four-page check through the normal writer without moving the official cursor", async () => {
  const postedAt = Date.now();
  let active = 0, peak = 0;
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    const cursor = new URL(url).searchParams.get("cursor");
    return cursor === null ? page("124", "p2", postedAt) : cursor === "p2" ? page("123", "p3", postedAt) : cursor === "p3" ? page("122", "p4", postedAt) : page("121", "p5", postedAt);
  });
  vi.stubGlobal("fetch", fetchMock);
  const before = await db.prepare("SELECT last_seen_post_id,sync_pagination_token,last_success_at,last_completed_at FROM x_post_sources").first();
  const result = await runFxCollectionForHandles(runtime, ["member"], "scheduled");
  expect(result).toMatchObject({ provider: "fxembed", postsStored: 4, pendingSources: 0, success: true, recentCheck: { lookbackHours: 48, maxPages: 4, limitedSources: 1 } });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(peak).toBe(1);
  expect(await db.prepare("SELECT last_seen_post_id,sync_pagination_token,last_success_at,last_completed_at FROM x_post_sources").first()).toEqual(before);
  expect(await db.prepare("SELECT cursor FROM x_fx_sources").first("cursor")).toBeNull();
  expect(await db.prepare("SELECT pages_completed,last_window_until_at,last_window_limited FROM x_fx_sources").first()).toEqual({ pages_completed: 4, last_window_until_at: Date.now(), last_window_limited: 1 });
  const stored = await db.prepare("SELECT id,value,revision FROM x_posts ORDER BY id").all();
  for (let check = 0; check < 2; check++) {
    vi.mocked(Date.now).mockReturnValue(Date.now() + 30 * 60000);
    expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ success: true, postsStored: 0, apiCalls: 4, pendingSources: 0 });
    expect(await db.prepare("SELECT last_window_until_at FROM x_fx_sources").first("last_window_until_at")).toBe(Date.now());
  }
  expect((await db.prepare("SELECT id,value,revision FROM x_posts ORDER BY id").all()).results).toEqual(stored.results);
});
it("continues past old pinned and empty pages while enforcing both time boundaries", async () => {
  const now = Date.now();
  const fetchMock = vi.fn().mockResolvedValueOnce(page("90", "empty", now - 49 * 3600000))
    .mockResolvedValueOnce(Response.json({ code: 200, results: [], cursor: { bottom: "recent" } }))
    .mockResolvedValueOnce(Response.json({ code: 200, results: [
      { ...raw("100"), created_at: new Date(now - 48 * 3600000).toUTCString() },
      { ...raw("101"), created_at: new Date(now + 1000).toUTCString() },
      { ...raw("102"), created_at: new Date(now - 48 * 3600000 - 1000).toUTCString() },
      raw("103"),
    ], cursor: {} }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ success: true, apiCalls: 3, postsStored: 2, pendingSources: 0 });
  expect((await db.prepare("SELECT id FROM x_posts ORDER BY id").all()).results).toEqual([{ id: "100" }, { id: "103" }]);
});
it("resumes its frozen window separately from the fresh head within four requests", async () => {
  const until = Date.now() - 86400000;
  await db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,cursor,window_until_at,pages_completed,last_error,updated_at) VALUES('member',1,'old',?,1,'fx_http_404',0)").bind(until).run();
  const cursors: Array<string | null> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const cursor = new URL(url).searchParams.get("cursor"); cursors.push(cursor);
    return cursor === null ? page("150", "head-new") : cursor === "old" ? page("130", "p3", until) : cursor === "p3" ? page("140", "p4") : page("120", "p5", until - 1000);
  }));
  expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ success: true, apiCalls: 4, postsStored: 3, pendingSources: 0, recentCheck: { limitedSources: 1 } });
  expect(cursors).toEqual([null, "old", "p3", "p4"]);
  expect((await db.prepare("SELECT id FROM x_posts ORDER BY id").all()).results).toEqual([{ id: "120" }, { id: "130" }, { id: "150" }]);
  expect(await db.prepare("SELECT cursor,window_until_at,pages_completed,last_window_until_at,retired_progress,last_error FROM x_fx_sources").first()).toEqual({ cursor: null, window_until_at: until, pages_completed: 4, last_window_until_at: until, retired_progress: null, last_error: null });
});
it("keeps a failed first page pending without retiring the legacy cursor", async () => {
  await db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,cursor,updated_at) VALUES('member',1,'historic',0)").run();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  expect(await runFxCollectionForHandles(runtime, ["member"], "manual")).toMatchObject({ status: "failed", pendingSources: 1, apiCalls: 1 });
  expect(await db.prepare("SELECT cursor,window_until_at,pages_completed,retired_progress FROM x_fx_sources").first()).toEqual({ cursor: "historic", window_until_at: null, pages_completed: 0, retired_progress: null });
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
  await db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,cursor,window_until_at,pages_completed,updated_at) VALUES('member',1,'old',?,1,0)").bind(Date.now() - 1000).run();
  const fetchMock = vi.fn().mockResolvedValueOnce(page("125", "head-next")).mockResolvedValueOnce(page("123", "after-old", Date.now() - 1000));
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
  await db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,cursor,window_until_at,pages_completed,updated_at) VALUES('member',1,'old',?,1,0)").bind(Date.now() - 1000).run();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(page("124", "head-next")).mockResolvedValueOnce(page("123", "old")));
  const result = await runFxCollectionForHandles(runtime, ["member"], "scheduled");
  expect(result.status).toBe("failed");
  expect(await db.prepare("SELECT cursor FROM x_fx_sources").first("cursor")).toBe("old");
  expect(await db.prepare("SELECT consecutive_failures FROM x_fx_sources").first("consecutive_failures")).toBe(1);
});
it("pins a new member via public Fx profile without advancing official initialization", async () => {
  await db.prepare("DELETE FROM x_post_sources").run();
  const fresh = raw("125");
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
