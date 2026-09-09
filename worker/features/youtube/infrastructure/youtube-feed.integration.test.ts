import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { createYouTubeHandler } from "../http/youtube";
import { buildYouTubeApplication } from "./youtube-adapters";
import { clearActiveYouTubeChannelsCacheForTests } from "./d1-active-channels";
import {
  hasScheduledYouTubeFeedWork,
  importLegacyOfficialShorts,
} from "./youtube-feed";

const testEnv = env as unknown as Env & { YOUTUBE_FEED_MIGRATIONS: D1Migration[] };
const database = testEnv.otw_db;
const channelId = `UC${"A".repeat(22)}`;
const otherChannelId = `UC${"B".repeat(22)}`;
const checkpointKey = "youtube_shorts_legacy_import_completed_at";
const handle = createYouTubeHandler(buildYouTubeApplication);
const now = () => Date.now();

const observe = () => {
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

const requestShorts = (db: D1Database = database) => handle(
  new Request(`https://otw.test/api/youtube/shorts?channelIds=${channelId}&limit=20`),
  { ...testEnv, otw_db: db, YOUTUBE_API_KEY: "test" },
);

const seedSource = async (complete = true) => {
  await database.prepare(
    `INSERT INTO youtube_feed_sources
     (id, source_kind, member_uid, youtube_channel_id, uploads_playlist_id,
      collection_started_at, initialization_completed_at, backfill_exhausted_at,
      next_check_at, created_at, updated_at)
     VALUES (1, 'official', 1, ?, 'uploads', ?, ?, ?, ?, ?, ?)`,
  ).bind(channelId, now(), complete ? now() : null, complete ? now() : null,
    now() + 86_400_000, now(), now()).run();
};

const seedLegacyCache = async () => {
  await database.prepare(
    `INSERT INTO youtube_api_cache (key, type, value, fetched_at, expires_at, stale_until)
     VALUES ('legacy', 'channel_videos', ?, ?, ?, ?)`,
  ).bind(JSON.stringify({ shorts: [{
    videoId: "legacy-1", channelId, title: "legacy", publishedAt: "2026-09-01T00:00:00Z",
    duration: 30, viewCount: 1,
  }] }), now(), now() + 86_400_000, now() + 86_400_000).run();
};

const fakeYouTube = (count: number) => vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith("/channels")) return Response.json({
    items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads" } } }],
  });
  if (url.pathname.endsWith("/playlistItems")) return Response.json({
    items: Array.from({ length: count }, (_, index) => ({ snippet: {
      resourceId: { videoId: `video-${index}` }, publishedAt: "2026-09-01T00:00:00Z",
    } })),
  });
  if (url.pathname.endsWith("/videos")) return Response.json({
    items: (url.searchParams.get("id") ?? "").split(",").filter(Boolean).map((id) => ({
      id, snippet: { title: `Short ${id}`, publishedAt: "2026-09-01T00:00:00Z" },
      contentDetails: { duration: "PT30S" }, statistics: { viewCount: "123" },
    })),
  });
  throw new Error(`Unexpected external request: ${url.pathname}`);
});

beforeEach(async () => {
  await applyD1Migrations(database, testEnv.YOUTUBE_FEED_MIGRATIONS);
  await database.batch([
    database.prepare("DELETE FROM youtube_feed_videos"),
    database.prepare("DELETE FROM youtube_feed_sources"),
    database.prepare("DELETE FROM youtube_api_cache"),
    database.prepare("DELETE FROM youtube_api_usage_events"),
    database.prepare("DELETE FROM scheduled_usage_daily"),
    database.prepare("DELETE FROM kirinuki_channels"),
    database.prepare("DELETE FROM members"),
    database.prepare("DELETE FROM settings WHERE key <> 'youtube_api_daily_quota_units'"),
    database.prepare("INSERT INTO settings (key, value) VALUES ('youtube_feed_enabled', 'true')"),
    database.prepare("INSERT INTO members (uid, code, name, youtube_channel_id) VALUES (1, 'one', 'One', ?)").bind(channelId),
  ]);
  clearActiveYouTubeChannelsCacheForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await database.prepare("DROP TRIGGER IF EXISTS fail_feed_video").run();
});

describe("YouTube public Shorts storage cost", () => {
  it("serves an initialized complete page repeatedly without registry writes or legacy cache scans", async () => {
    await seedSource();
    await seedLegacyCache();
    const fetch = fakeYouTube(50);
    const observed = observe();
    for (let read = 0; read < 2; read += 1) {
      const response = await requestShorts(observed.db);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ items: [], collection: { state: "exhausted" } });
    }
    expect(observed.statements.every((sql) => /^\s*SELECT\b/i.test(sql))).toBe(true);
    expect(observed.statements.some((sql) => sql.includes("youtube_api_cache"))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([0, 1, 9, 10, 50])("prepares only a requested missing source and persists %i videos within D1 bind limits", async (count) => {
    await database.prepare(
      "INSERT INTO members (uid, code, name, youtube_channel_id) VALUES (2, 'two', 'Two', ?)",
    ).bind(otherChannelId).run();
    fakeYouTube(count);
    const observed = observe();
    const response = await requestShorts(observed.db);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ collection: { state: count > 20 ? "ready" : "exhausted" } });
    expect((await database.prepare("SELECT COUNT(*) AS total FROM youtube_feed_videos").first())?.total).toBe(count);
    expect((await database.prepare("SELECT youtube_channel_id FROM youtube_feed_sources").all()).results)
      .toEqual([{ youtube_channel_id: channelId }]);
    const writes = observed.statements.filter((sql) => /^\s*INSERT INTO youtube_feed_videos/.test(sql));
    expect(writes).toHaveLength(Math.ceil(count / 9));
    expect(writes.every((sql) => (sql.match(/\?/g) ?? []).length <= 100)).toBe(true);
    expect((await database.prepare(
      "SELECT initialization_completed_at, backfill_exhausted_at FROM youtube_feed_sources WHERE source_kind = 'official'",
    ).first())?.initialization_completed_at).toBeGreaterThan(0);
  });

  it("does not advance the source frontier after a failed chunk and repairs the partial write on retry", async () => {
    fakeYouTube(50);
    await database.prepare(
      `CREATE TRIGGER fail_feed_video BEFORE INSERT ON youtube_feed_videos
       WHEN NEW.video_id = 'video-9' BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END`,
    ).run();
    const failed = await requestShorts();
    expect(failed.status).toBe(200);
    expect(await failed.json()).toMatchObject({ hasMore: true, collection: { state: "partial" } });
    expect((await database.prepare("SELECT COUNT(*) AS total FROM youtube_feed_videos").first())?.total).toBe(9);
    expect(await database.prepare(
      "SELECT initialization_completed_at, last_seen_video_id FROM youtube_feed_sources WHERE source_kind = 'official'",
    ).first()).toEqual({ initialization_completed_at: null, last_seen_video_id: null });
    await database.prepare("DROP TRIGGER fail_feed_video").run();
    await database.prepare("UPDATE youtube_feed_sources SET backfill_retry_after = NULL").run();
    const response = await requestShorts();
    expect(response.status).toBe(200);
    expect((await database.prepare("SELECT COUNT(*) AS total FROM youtube_feed_videos").first())?.total).toBe(50);
    expect((await database.prepare("SELECT last_seen_video_id FROM youtube_feed_sources WHERE source_kind = 'official'").first())?.last_seen_video_id)
      .toBe("video-0");
  });

  it("checkpoints legacy migration only after success and skips the next full scan", async () => {
    await seedSource();
    await seedLegacyCache();
    await database.prepare(
      `CREATE TRIGGER fail_feed_video BEFORE INSERT ON youtube_feed_videos
       BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END`,
    ).run();
    await expect(importLegacyOfficialShorts(testEnv, now())).rejects.toThrow();
    expect(await database.prepare("SELECT value FROM settings WHERE key = ?").bind(checkpointKey).first()).toBeNull();
    await database.prepare("DROP TRIGGER fail_feed_video").run();
    expect(await importLegacyOfficialShorts(testEnv, now())).toBe(1);
    const observed = observe();
    expect(await importLegacyOfficialShorts({ ...testEnv, otw_db: observed.db }, now())).toBe(0);
    expect(observed.statements).toHaveLength(1);
    expect(observed.statements[0]).not.toContain("youtube_api_cache");
  });
});

describe("YouTube scheduled work admission", () => {
  it("keeps an idle fully initialized feed read-only while detecting each remaining work category", async () => {
    await seedSource();
    const readyEnv = { ...testEnv, YOUTUBE_API_KEY: "test" };
    expect(await hasScheduledYouTubeFeedWork(readyEnv, now())).toBe(true);
    await importLegacyOfficialShorts(testEnv, now());
    const observed = observe();
    expect(await hasScheduledYouTubeFeedWork({ ...readyEnv, otw_db: observed.db }, now())).toBe(false);
    expect(observed.statements).toHaveLength(1);
    expect(observed.statements[0]).toMatch(/^\s*SELECT\b/);

    await database.prepare("UPDATE youtube_feed_sources SET next_check_at = 0").run();
    expect(await hasScheduledYouTubeFeedWork(readyEnv, now())).toBe(true);
    await database.prepare("UPDATE youtube_feed_sources SET next_check_at = ?, backfill_page_token = 'next', backfill_exhausted_at = NULL")
      .bind(now() + 86_400_000).run();
    expect(await hasScheduledYouTubeFeedWork(readyEnv, now())).toBe(true);
    await database.prepare("UPDATE youtube_feed_sources SET backfill_exhausted_at = ?").bind(now()).run();
    await database.prepare(
      `INSERT INTO youtube_feed_videos (video_id, source_id, title, channel_title, published_at, fetched_at)
       VALUES ('old', 1, 'Old', 'Member', 1, 1)`,
    ).run();
    expect(await hasScheduledYouTubeFeedWork(readyEnv, now())).toBe(true);
    await database.prepare("DELETE FROM youtube_feed_videos").run();
    await database.prepare("INSERT INTO members (uid, code, name, youtube_channel_id) VALUES (2, 'two', 'Two', ?)")
      .bind(otherChannelId).run();
    expect(await hasScheduledYouTubeFeedWork(readyEnv, now())).toBe(true);
    await database.prepare("DELETE FROM members WHERE uid = 2").run();
    await database.prepare("UPDATE members SET is_deprecated = 1 WHERE uid = 1").run();
    expect(await hasScheduledYouTubeFeedWork(readyEnv, now())).toBe(true);
    await database.prepare("UPDATE settings SET value = 'false' WHERE key = 'youtube_feed_enabled'").run();
    expect(await hasScheduledYouTubeFeedWork(readyEnv, now())).toBe(false);
  });
});
