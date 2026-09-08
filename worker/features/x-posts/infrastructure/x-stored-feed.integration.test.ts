import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { XPostDto } from "@contracts/x-posts";
import { clearXServiceCachesForTests, fetchXPostsForHandles } from "./x-api";

const testEnv = env as Env & { X_REFERENCE_MIGRATIONS: D1Migration[] };
const database = testEnv.otw_db;
const handles = Array.from({ length: 8 }, (_, index) => `member${index}`);
const post = (handle: string, id: string): XPostDto => ({
  id, username: handle, text: id, createdAt: "2026-09-01T00:00:00Z",
  url: `https://x.com/${handle}/status/${id}`, media: [],
  metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 },
});
const measuredDatabase = () => {
  const statements: string[] = [];
  const db = new Proxy(database, {
    get(target, property) {
      if (property === "prepare") return (sql: string) => {
        statements.push(sql);
        return target.prepare(sql);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db, statements };
};

beforeEach(async () => {
  await applyD1Migrations(database, testEnv.X_REFERENCE_MIGRATIONS);
  await database.batch([
    database.prepare("DELETE FROM x_post_references"),
    database.prepare("DELETE FROM x_posts"),
    database.prepare("DELETE FROM x_post_sources"),
  ]);
  clearXServiceCachesForTests();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Public feed must not call X"); }));
});

afterEach(() => vi.unstubAllGlobals());

describe("X stored public feed batching", () => {
  it("reads eight handles in two queries with independent limits, tie order, and source freshness", async () => {
    const timestamp = Date.now();
    for (const [memberIndex, handle] of handles.entries()) {
      await database.prepare(
        `INSERT INTO x_post_sources(handle, user_id, username, last_seen_post_id,
          last_checked_at, updated_at, collection_started_at, initialization_completed_at)
         VALUES (?, ?, ?, 'last', ?, ?, 1, 1)`,
      ).bind(handle, `user-${memberIndex}`, handle, memberIndex === 0 ? 1 : timestamp, timestamp).run();
      await database.batch(Array.from({ length: 12 }, (_, index) => {
        const id = `${memberIndex}${String(index).padStart(2, "0")}`;
        const body = post(handle, id);
        return database.prepare(
          `INSERT INTO x_posts(id, handle, username, value, created_at, first_seen_at, fetched_at, hidden_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(id, handle, handle, JSON.stringify(body), body.createdAt, timestamp, timestamp, index === 11 ? timestamp : null);
      }));
    }
    const observed = measuredDatabase();
    const response = await fetchXPostsForHandles([...handles, "MEMBER0"], {
      cacheDb: observed.db, refresh: false, maxResults: 5,
    });
    expect(response.posts).toHaveLength(40);
    expect(response.byHandle.map((item) => item.handle)).toEqual(handles);
    for (const [memberIndex, result] of response.byHandle.entries()) {
      expect(result.posts.map((item) => item.id)).toEqual([10, 9, 8, 7, 6].map((index) => `${memberIndex}${String(index).padStart(2, "0")}`));
      expect(result.userId).toBe(`user-${memberIndex}`);
      expect(result.stale).toBe(memberIndex === 0);
    }
    expect(observed.statements).toHaveLength(2);
    expect(observed.statements.every((sql) => /^\s*(SELECT|WITH)\b/.test(sql))).toBe(true);
    const postsSql = observed.statements.find((sql) => sql.includes("WITH requested(handle)"))!;
    const plan = await database.prepare(`EXPLAIN QUERY PLAN ${postsSql}`).bind(JSON.stringify(handles), 5)
      .all<{ detail: string }>();
    expect(plan.results.some(({ detail }) => /SEARCH candidate USING INDEX/.test(detail)), JSON.stringify(plan.results)).toBe(true);
    expect(plan.results.some(({ detail }) => /SEARCH post USING INDEX/.test(detail)), JSON.stringify(plan.results)).toBe(true);
    expect(plan.results.some(({ detail }) => /SCAN (post|candidate)\b/.test(detail)), JSON.stringify(plan.results)).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("re-reads hidden and changed rows while preserving a source with no posts and posts with no source", async () => {
    const body = post("orphan", "101");
    await database.prepare(
      "INSERT INTO x_posts(id, handle, user_id, username, value, created_at, first_seen_at, fetched_at) VALUES (?, ?, 'from-post', ?, ?, ?, 1, ?)",
    ).bind(body.id, "orphan", "orphan", JSON.stringify(body), body.createdAt, Date.now()).run();
    await database.prepare(
      "INSERT INTO x_post_sources(handle, user_id, username, last_checked_at, updated_at) VALUES ('empty', 'from-source', 'empty', ?, ?)",
    ).bind(Date.now(), Date.now()).run();
    const read = () => fetchXPostsForHandles(["orphan", "empty", "unknown"], { cacheDb: database, refresh: false, maxResults: 5 });
    const first = await read();
    expect(first.byHandle.map(({ handle, userId, posts }) => ({ handle, userId, count: posts.length }))).toEqual([
      { handle: "orphan", userId: "from-post", count: 1 },
      { handle: "empty", userId: "from-source", count: 0 },
      { handle: "unknown", userId: null, count: 0 },
    ]);
    await database.prepare("UPDATE x_posts SET value = ? WHERE id = '101'")
      .bind(JSON.stringify({ ...body, text: "Updated by another isolate" })).run();
    expect((await read()).posts[0].text).toBe("Updated by another isolate");
    await database.prepare("UPDATE x_posts SET hidden_at = 1 WHERE id = '101'").run();
    expect((await read()).posts).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("chunks large handle sets without exceeding 100 bound parameters", async () => {
    const observed = measuredDatabase();
    const requested = Array.from({ length: 51 }, (_, index) => `member${index}`);
    const result = await fetchXPostsForHandles(requested, { cacheDb: observed.db, refresh: false, maxResults: 5 });
    expect(result.byHandle).toHaveLength(51);
    expect(observed.statements).toHaveLength(4);
    expect(observed.statements.every((sql) => (sql.match(/\?/g) ?? []).length <= 100)).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
