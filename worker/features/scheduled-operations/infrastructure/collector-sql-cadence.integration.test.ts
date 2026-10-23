import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { meterD1 } from "../../../test-support/d1-meter";
import { siteEnv } from "../../../test-support/site-env";
import type { Env } from "../../../platform/types";
import { ScheduledJobPlanner } from "./scheduled-job-planner";

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
