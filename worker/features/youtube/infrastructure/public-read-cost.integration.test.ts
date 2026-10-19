import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { readStoredYouTubeFeed } from "./youtube-feed";
import { readSiteContentYouTube } from "./site-content-videos";
import { readSiteContentFeed } from "../../member-posts/infrastructure/site-content-feed";
import { meterD1 } from "../../../test-support/d1-meter";
import type { Env } from "../../../platform/types";
import { siteEnv } from "../../../test-support/site-env";

const runtime = { ...env, ...siteEnv() } as unknown as Env & { YOUTUBE_FEED_MIGRATIONS: D1Migration[]; X_REFERENCE_MIGRATIONS: D1Migration[] };
const db = runtime.otw_db;
beforeAll(async () => {
  const merged = new Map<string, D1Migration>();
  for (const migration of [...runtime.YOUTUBE_FEED_MIGRATIONS, ...runtime.X_REFERENCE_MIGRATIONS]) {
    merged.set(migration.name, { ...migration, queries: [...new Set([...(merged.get(migration.name)?.queries ?? []), ...migration.queries])] });
  }
  await applyD1Migrations(db, [...merged.values()].sort((a,b) => a.name.localeCompare(b.name)));
  await db.prepare("INSERT INTO members(uid,code,name,youtube_channel_id,url_twitter) VALUES(1,'visible','Visible','visible-channel','https://x.com/visible'),(2,'bing_hayu','Hidden','hidden-channel','https://x.com/hidden')").run();
  await db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,collection_started_at,created_at,updated_at) VALUES(1,'official',1,'visible-channel',1,1,1),(2,'official',2,'hidden-channel',1,1,1)").run();
});

it("keeps API and summary reads bounded by the public page, including an empty Shorts kind", async () => {
  const costs: unknown[] = [];
  for (const size of [50, 500, 5000]) {
    await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT OR IGNORE INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at) SELECT printf('old-%05d',x),1,'Old',x,1 FROM n").bind(size).run();
    await db.prepare("INSERT OR IGNORE INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at) VALUES('a',1,'Visible a',999999,1),('b',1,'Visible b',999999,1),('hidden',2,'Hidden',1000000,1),('archived',1,'Archive',1000001,1)").run();
    await db.prepare("UPDATE youtube_feed_videos SET content_access='admin_archive' WHERE video_id='archived'").run();
    for (const analyzed of [false, true]) {
      if (analyzed) await db.prepare("ANALYZE").run();
      const meter = meterD1(db);
      const feed = await readStoredYouTubeFeed({ ...runtime, otw_db: meter.db }, ['visible-channel','hidden-channel'], 2, 'official');
      expect(feed.videos.map(row => row.videoId)).toEqual(['a','b']);
      expect(feed.shorts).toEqual([]);
      const summary = await readSiteContentYouTube(meter.db);
      expect(summary[0].items.slice(0,2).map(row => row.title)).toEqual(['Visible a','Visible b']);
      expect(JSON.stringify(summary)).not.toContain('Hidden');
      const cost = meter.summary(); costs.push({ size, analyzed, ...cost });
      expect.soft(cost.rowsRead, JSON.stringify({ size, analyzed, ...cost })).toBeLessThan(500);
      expect(cost.rowsWritten).toBe(0);
    }
  }
  console.info('PUBLIC_YOUTUBE_D1_COST', JSON.stringify(costs));
});

it("seeks mixed-case X handles without reading the old timeline", async () => {
  const costs: unknown[] = [];
  for (const size of [50,500,5000]) {
    await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT OR IGNORE INTO x_posts(id,handle,username,value,created_at,fetched_at) SELECT printf('old-%05d',x),'ViSiBlE','visible',json_object('text','Old','username','visible','url','https://x.com/visible/status/old','createdAt','2026-01-01T00:00:00Z'),'2026-01-01T00:00:00Z',1 FROM n").bind(size).run();
    await db.prepare("INSERT OR IGNORE INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES('latest','VISIBLE','visible',?,'2026-10-19T00:00:00Z',1)").bind(JSON.stringify({ text:'Latest',username:'visible',url:'https://x.com/visible/status/latest',createdAt:'2026-10-19T00:00:00Z' })).run();
    await db.prepare("ANALYZE").run();
    const meter = meterD1(db);
    const result = await readSiteContentFeed(meter.db, { xVisibility:'public',cafeEnabled:false,cafeVisibility:'private' });
    expect(result[0].items).toHaveLength(10);
    expect(result[0].items[0].title).toBe('Latest');
    const cost = meter.summary(); costs.push({size,...cost});
    expect.soft(cost.rowsRead,JSON.stringify({size,...cost})).toBeLessThan(250);
    expect(cost.rowsWritten).toBe(0);
  }
  console.info('PUBLIC_X_D1_COST',JSON.stringify(costs));
});
