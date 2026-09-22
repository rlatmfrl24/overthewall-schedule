import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, afterEach, it, expect, vi } from "vitest";
import chzzkMigration from "../../../../drizzle/0040_fixed_black_crow.sql?raw";
import { readSiteContentFeed } from "../../member-posts";
import { readSiteContentYouTube } from "../../youtube";
import { readSiteContentChzzk } from "../../chzzk";
import type { Env } from "../../../platform/types";

const testEnv = env as unknown as Env & { X_REFERENCE_MIGRATIONS: D1Migration[]; MEMBER_POSTS_CAFE_MIGRATIONS: D1Migration[]; YOUTUBE_FEED_MIGRATIONS: D1Migration[] };
const db = testEnv.otw_db;
const now = Date.now();
beforeAll(async () => {
  const merged = new Map<string, D1Migration>();
  for (const migration of [...testEnv.X_REFERENCE_MIGRATIONS, ...testEnv.MEMBER_POSTS_CAFE_MIGRATIONS, ...testEnv.YOUTUBE_FEED_MIGRATIONS]) {
    const previous = merged.get(migration.name);
    merged.set(migration.name, { ...migration, queries: [...new Set([...(previous?.queries ?? []), ...migration.queries])] });
  }
  merged.set("0040_fixed_black_crow.sql", { name: "0040_fixed_black_crow.sql", queries: chzzkMigration.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean) });
  await applyD1Migrations(db, [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)));
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter,url_chzzk,youtube_channel_id) VALUES(901,'summary','Summary','https://x.com/summary','https://chzzk.naver.com/channel1','channel1')").run();
});
afterEach(() => vi.restoreAllMocks());

it("rejects total feed failure but preserves a successful source on partial failure", async () => {
  const failingDb = (failAll: boolean) => new Proxy(db, { get(target, key) {
    if (key === "prepare") return (sql: string) => {
      if (failAll || sql.includes("naver_cafe_posts")) throw new Error("Source unavailable");
      return target.prepare(sql);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const policy = { xVisibility: "public", cafeEnabled: true, cafeVisibility: "public" };
  await expect(readSiteContentFeed(failingDb(true), policy)).rejects.toThrow("All public feed sources are unavailable");
  const partial = await readSiteContentFeed(failingDb(false), policy);
  expect(partial[0].id).toBe("feed");
  expect(partial[0].status).not.toBe("unavailable");
  expect(partial[1]).toMatchObject({ id: "cafe", status: "unavailable" });
  expect(await readSiteContentFeed(failingDb(true), { ...policy, xVisibility: "members", cafeVisibility: "private" })).toEqual([]);
});

it("reads public stored sources using SELECT only, without external requests", async () => {
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES('public','summary','summary',?,'2026-09-22T00:00:00Z',?)")
    .bind(JSON.stringify({ id: "public", text: "Public X", username: "summary", url: "https://x.com/summary/status/1", createdAt: "2026-09-22T00:00:00Z" }), now).run();
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at,hidden_at) VALUES('hidden','summary','summary',?,'2026-09-23T00:00:00Z',?,?)")
    .bind(JSON.stringify({ text: "Hidden secret" }), now, now).run();
  await db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,collection_started_at,created_at,updated_at) VALUES(901,'official',901,'channel1',?,?,?)").bind(now, now, now).run();
  await db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at) VALUES('video1',901,'Stored video',?,?)").bind(now, now).run();
  await db.prepare("INSERT INTO chzzk_api_cache(key,type,value,fetched_at,expires_at,stale_until) VALUES('vods:v1:channel1:0:10','vods',?,?,?,?)")
    .bind(JSON.stringify({ data: [{ videoNo: 123, videoTitle: "Stored VOD", publishDate: "2026-09-22 12:00:00", channel: { channelName: "Summary" } }] }), now, now + 300_000, now + 600_000).run();
  const statements: string[] = [];
  const measured = new Proxy(db, { get(target, key) {
    if (key === "prepare") return (sql: string) => { statements.push(sql); return target.prepare(sql); };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No origin requests allowed"));
  const feed = await readSiteContentFeed(measured, { xVisibility: "public", cafeEnabled: true, cafeVisibility: "members" });
  expect(JSON.stringify(feed)).toContain("Public X");
  expect(JSON.stringify(feed)).not.toContain("Hidden secret");
  expect(statements.some(sql => sql.includes("naver_cafe_posts"))).toBe(false);
  const videos = await readSiteContentYouTube(measured);
  expect(videos[0].items[0].title).toBe("Stored video");
  expect(videos).toHaveLength(3);
  expect(videos[2].status).not.toBe("available");
  const chzzk = await readSiteContentChzzk(measured);
  expect(chzzk[0].items[0].title).toBe("Stored VOD");
  expect(chzzk[1].status).toBe("unavailable");
  expect(network).not.toHaveBeenCalled();
  expect(statements.length).toBeGreaterThan(0);
  expect(statements.every(sql => /^\s*SELECT\b/i.test(sql))).toBe(true);
  statements.length = 0;
  expect(await readSiteContentFeed(measured, { xVisibility: "members", cafeEnabled: true, cafeVisibility: "private" })).toEqual([]);
  expect(statements).toEqual([]);
});
