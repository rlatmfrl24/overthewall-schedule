import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { meterD1 } from "../../../test-support/d1-meter";
import { siteEnv } from "../../../test-support/site-env";
import type { Env } from "../../../platform/types";
import { ScheduledJobPlanner } from "./scheduled-job-planner";
import { ScheduledJobExecutor } from "./scheduled-job-executor";
import { collectNaverCafePostsForSources, readEnabledNaverCafeSources } from "../../naver-cafe";
import { hasScheduledYouTubeFeedWork, runScheduledYouTubeFeedCollection } from "../../youtube";

const db = env.otw_db;
const hour = 3_600_000;
const scheduledFor = Date.parse("2026-10-22T00:13:00Z");
const runtime = (database = db): Env => ({ ...env, ...siteEnv(), otw_db: database } as Env);

beforeAll(async () => {
  for (const migration of await readSiteSchemaMigrations()) {
    if (migration.name.startsWith("0030_")) {
      await db.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) =>
        db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000 - index, code, "migration bootstrap")));
    }
    await applyD1Migrations(db, [migration]);
  }
}, 120_000);

afterEach(() => vi.restoreAllMocks());

it.each([1, 3, 6])("plans cafe at the %sh scheduled boundary without rounding actual attempts", async interval => {
  const id = 900500 + interval;
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  await seedCafeSource(id, interval).run();
  await db.prepare("UPDATE naver_cafe_sources SET last_attempt_at=?,cadence_anchor_at=? WHERE id=?")
    .bind(scheduledFor - interval * hour + 45_000, scheduledFor - interval * hour, id).run();
  await seedCafePost(id, id, interval === 1 ? 0 : interval === 3 ? 2 : 8).run();
  const planner = new ScheduledJobPlanner(runtime(), {} as never);
  expect(await planner.planScheduled("naver_cafe_collection", scheduledFor - 1)).toEqual([]);
  expect((await planner.planScheduled("naver_cafe_collection", scheduledFor))[0].continuation).toMatchObject({ sourceIds: [id] });
});

it.each(["scheduled", "manual"] as const)("persists cafe actual timestamps and %s cadence in the same progress update", async trigger => {
  const actual = scheduledFor + 45_000, id = trigger === "scheduled" ? 900611 : 900612;
  vi.spyOn(Date, "now").mockReturnValue(actual);
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  await seedCafeSource(id, 6).run();
  await db.prepare("UPDATE naver_cafe_sources SET collection_started_at=1,initialization_completed_at=1,last_seen_article_id=1 WHERE id=?").bind(id).run();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ result: { articleList: [] } }));
  const sources = await readEnabledNaverCafeSources(runtime());
  expect(await collectNaverCafePostsForSources(sources, { cacheDb: db, siteId: "otw", trigger, scheduledFor })).toMatchObject({ success: true });
  expect(await db.prepare("SELECT last_attempt_at,last_success_at,cadence_anchor_at FROM naver_cafe_sources WHERE id=?").bind(id).first()).toEqual({
    last_attempt_at: actual, last_success_at: actual, cadence_anchor_at: trigger === "scheduled" ? scheduledFor : actual,
  });
});

const finalizeX = (source: "manual" | "scheduled", status: string, completedAt: number, slot: number, database = db) =>
  new ScheduledJobExecutor(runtime(database), { readRunDto: async () => ({ jobType: "x_collection", source, status, finishedAt: completedAt, scheduledFor: slot }) } as never)
    .finalizeLegacyState("fixture-x");

it("atomically records X cadence while preserving real completion and rejecting stale finalizers", async () => {
  await db.prepare("DELETE FROM settings WHERE key IN ('x_collection_last_run','x_collection_last_success','x_collection_cadence_state')").run();
  const complete = scheduledFor + 45_000, meter = meterD1(db);
  await finalizeX("scheduled", "succeeded", complete, scheduledFor, meter.db);
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(String(complete));
  expect(JSON.parse(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first<string>("value") ?? "null"))
    .toEqual({ completedAt: complete, anchorAt: scheduledFor });
  const snapshot = (await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'x_collection_%' ORDER BY key").all()).results;
  await finalizeX("scheduled", "failed", complete - 1, scheduledFor - hour);
  expect((await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'x_collection_%' ORDER BY key").all()).results).toEqual(snapshot);
  const repeat = meterD1(db);
  await finalizeX("scheduled", "succeeded", complete, scheduledFor, repeat.db);
  expect(repeat.summary().rowsWritten).toBe(0);
  await db.prepare("CREATE TRIGGER cadence_fail BEFORE UPDATE ON settings WHEN NEW.key='x_collection_cadence_state' BEGIN SELECT RAISE(ABORT,'cadence write failed'); END").run();
  try {
    await expect(finalizeX("scheduled", "succeeded", complete + hour, scheduledFor + hour)).rejects.toThrow();
    expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value")).toBe(String(complete));
  } finally { await db.prepare("DROP TRIGGER cadence_fail").run(); }
  console.info("X_CADENCE_STATE_D1_COST", JSON.stringify({ initial: meter.summary(), replay: repeat.summary() }));
});

it.each([["scheduled", "partial"], ["scheduled", "failed"], ["manual", "succeeded"]] as const)("uses actual time for %s/%s X completion", async (source, status) => {
  const complete = scheduledFor + 2 * hour;
  await db.prepare("DELETE FROM settings WHERE key='x_collection_cadence_state' OR key='x_collection_last_run'").run();
  await finalizeX(source, status, complete, scheduledFor);
  expect(JSON.parse(await db.prepare("SELECT value FROM settings WHERE key='x_collection_cadence_state'").first<string>("value") ?? "null"))
    .toEqual({ completedAt: complete, anchorAt: complete });
});

const seedCafeSource = (id: number, attemptedHoursAgo: number, enabled = 1) => db.prepare(
  `INSERT INTO naver_cafe_sources(id,name,cafe_id,menu_id,cafe_url,enabled,last_attempt_at)
   VALUES(?,?,'123',?,'https://cafe.naver.com/test',?,?)`,
).bind(id, `source-${id}`, String(id), enabled, scheduledFor - attemptedHoursAgo * hour);

const seedCafePost = (id: number, sourceId: number, daysAgo: number, hidden = false) => db.prepare(
  `INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,title,summary,created_at,url,fetched_at,hidden_at)
   VALUES(?,?,?,'test','123','1','post','summary',?,'https://cafe.naver.com/test',?,?)`,
).bind(`cadence-post-${id}`, id, sourceId, new Date(scheduledFor - daysAgo * 24 * hour).toISOString(), scheduledFor, hidden ? scheduledFor : null);

it("seeks only eligible cafe sources and stays bounded as unrelated history grows", async () => {
  vi.spyOn(Date, "now").mockReturnValue(scheduledFor);
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  await db.batch([
    seedCafeSource(900301, 1), seedCafeSource(900302, 2), seedCafeSource(900303, 6),
    seedCafeSource(900304, 4), seedCafeSource(900305, 3), seedCafeSource(900306, 6, 0),
    seedCafePost(1, 900301, 0), seedCafePost(2, 900302, 2),
    seedCafePost(3, 900304, 8), seedCafePost(4, 900304, 0, true), seedCafePost(5, 900305, 2),
  ]);
  const small = meterD1(db);
  const first = await new ScheduledJobPlanner(runtime(small.db), {} as never).planScheduled("naver_cafe_collection", scheduledFor);
  expect(first.map(item => item.continuation)).toEqual([{ sourceIds: [900301, 900303, 900305], size: 15 }]);
  await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000)
    INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,title,summary,created_at,url,fetched_at)
    SELECT 'cadence-noise-'||x,10000+x,900306,'noise','123','2','noise','','2020-01-01','https://cafe.naver.com/noise',1 FROM n`).run();
  const grown = meterD1(db);
  expect(await new ScheduledJobPlanner(runtime(grown.db), {} as never).planScheduled("naver_cafe_collection", scheduledFor)).toEqual(first);
  const legacy = meterD1(db);
  await legacy.db.prepare("SELECT source_id,MAX(created_at) FROM naver_cafe_posts WHERE hidden_at IS NULL GROUP BY source_id").all();
  console.info("CAFE_PLANNER_D1_COST", JSON.stringify({ small: small.summary(), grown: grown.summary(), legacy: legacy.summary() }));
  expect(grown.summary().rowsWritten).toBe(0);
  expect(grown.summary().rowsRead).toBeLessThanOrEqual(small.summary().rowsRead + 16);
  const latestQuery = grown.entries.find(entry => entry.sql.includes("naver_cafe_posts"))!;
  const plan = await db.prepare(`EXPLAIN QUERY PLAN ${latestQuery.sql}`).bind(...latestQuery.args).all<{ detail: string }>();
  expect(plan.results.some(row => row.detail.includes("SEARCH") && row.detail.includes("idx_naver_cafe_posts_source_hidden_created"))).toBe(true);
});

it("does not inspect cafe post history when no source is eligible", async () => {
  await db.prepare("UPDATE naver_cafe_sources SET enabled=0").run();
  const meter = meterD1(db);
  expect(await new ScheduledJobPlanner(runtime(meter.db), {} as never).planScheduled("naver_cafe_collection", scheduledFor)).toEqual([]);
  expect(meter.entries.some(entry => entry.sql.includes("naver_cafe_posts"))).toBe(false);
  expect(meter.summary().rowsWritten).toBe(0);
});

it("seeks YouTube policy membership without changing fenced metadata candidates", async () => {
  vi.spyOn(Date, "now").mockReturnValue(scheduledFor);
  const index = await db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_content_transition_membership_lookup'").first<{ sql: string }>();
  expect(index, "migration must install the row-first membership index").not.toBeNull();
  await db.batch([
    db.prepare("DELETE FROM youtube_feed_videos"), db.prepare("DELETE FROM youtube_feed_sources"),
    db.prepare("DELETE FROM kirinuki_channels"), db.prepare("UPDATE members SET youtube_channel_id=NULL"),
    db.prepare("UPDATE member_links SET youtube_channel_id=NULL"),
    db.prepare(`INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json,phase)
      VALUES('cadence-fence','otw','luvdia','otw-db','luvdia-db','otw','otw-db',2,1,'cadence','{}','complete')`),
  ]);
  for (let n = 1; n <= 20; n++) {
    const id = 900400 + n, channel = `UC${String(n).padStart(22, "0")}`;
    await db.batch([
      db.prepare("INSERT INTO kirinuki_channels(id,channel_name,channel_url,youtube_channel_id) VALUES(?,'cost','https://youtube.com',?)").bind(id, channel),
      db.prepare(`INSERT INTO youtube_feed_sources(id,source_kind,kirinuki_channel_id,youtube_channel_id,uploads_playlist_id,enabled,collection_started_at,initialization_completed_at,backfill_exhausted_at,next_check_at,created_at,updated_at)
        VALUES(?,'kirinuki',?,?,'uploads',1,1,1,1,?,?,?)`).bind(id, id, channel, scheduledFor + 24 * hour, scheduledFor, scheduledFor),
      db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at) VALUES(?,?,'cost',1,?)").bind(`cadence-video-${n}`, id, scheduledFor - 48 * hour),
    ]);
  }
  await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000)
    INSERT INTO content_transition_membership(transition_id,root_table,root_key,row_table,row_key)
    SELECT 'cadence-fence','youtube_feed_sources',json_array(10000+x),'youtube_feed_sources',json_array(10000+x) FROM n`).run();
  await db.prepare("INSERT INTO content_transition_membership(transition_id,root_table,root_key,row_table,row_key) VALUES('cadence-fence','youtube_feed_sources','[900420]','youtube_feed_sources','[900420]')").run();
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/videos")) throw new Error(`Unexpected provider ${url.pathname}`);
    return Response.json({ items: (url.searchParams.get("id") ?? "").split(",").map(id => ({
      id, snippet: { title: id, publishedAt: "2026-10-21T00:00:00Z" }, contentDetails: { duration: "PT30S" }, statistics: { viewCount: "1" },
    })) });
  });
  const capture = meterD1(db), collectorEnv = { ...runtime(capture.db), YOUTUBE_API_KEY: "local-fixture" };
  expect(await hasScheduledYouTubeFeedWork(collectorEnv, scheduledFor)).toBe(true);
  expect(await runScheduledYouTubeFeedCollection(collectorEnv)).toMatchObject({ metadataRefreshed: 19, failed: 0 });
  const work = capture.entries.find(entry => entry.sql.includes("AS has_work"))!;
  const metadata = capture.entries.find(entry => entry.sql.includes("json_group_array(row_key)"))!;
  await db.prepare("UPDATE youtube_feed_videos SET fetched_at=?").bind(scheduledFor - 48 * hour).run();
  const read = async () => {
    const meter = meterD1(db);
    const workRows = await meter.db.prepare(work.sql).bind(...work.args).all();
    const metadataRows = await meter.db.prepare(metadata.sql).bind(...metadata.args).all();
    return { entries: meter.entries, summary: meter.summary(), workRows: workRows.results, metadataRows: metadataRows.results };
  };
  const indexed = await read();
  expect(indexed.metadataRows).toHaveLength(19);
  expect(indexed.metadataRows.some(row => row.video_id === "cadence-video-20")).toBe(false);
  const plan = await db.prepare(`EXPLAIN QUERY PLAN ${metadata.sql}`).bind(...metadata.args).all<{ detail: string }>();
  expect(plan.results.some(row => row.detail.includes("SEARCH held USING COVERING INDEX idx_content_transition_membership_lookup"))).toBe(true);
  await db.prepare("DROP INDEX idx_content_transition_membership_lookup").run();
  try {
    const membershipWrite = async () => {
      const insert = await db.prepare("INSERT INTO content_transition_membership(transition_id,root_table,root_key,row_table,row_key) VALUES('cadence-fence','youtube_feed_sources','[999999]','youtube_feed_sources','[999999]')").run();
      const remove = await db.prepare("DELETE FROM content_transition_membership WHERE transition_id='cadence-fence' AND row_key='[999999]'").run();
      return { insertRowsWritten: insert.meta.rows_written, deleteRowsWritten: remove.meta.rows_written };
    };
    const writesBefore = await membershipWrite();
    const unindexed = await read();
    expect(indexed.workRows).toEqual(unindexed.workRows);
    expect(indexed.metadataRows).toEqual(unindexed.metadataRows);
    expect(indexed.summary.rowsRead).toBeLessThan(unindexed.summary.rowsRead / 10);
    const recreate = await db.prepare(index!.sql).run();
    const writesAfter = await membershipWrite();
    expect(writesAfter.insertRowsWritten).toBe(writesBefore.insertRowsWritten + 1);
    expect(writesAfter.deleteRowsWritten).toBe(writesBefore.deleteRowsWritten);
    console.info("YOUTUBE_MEMBERSHIP_D1_COST", JSON.stringify({ before: unindexed.summary, after: indexed.summary, indexBuild: recreate.meta, writesBefore, writesAfter }));
  } finally {
    await db.prepare(index!.sql.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS")).run();
  }
});
