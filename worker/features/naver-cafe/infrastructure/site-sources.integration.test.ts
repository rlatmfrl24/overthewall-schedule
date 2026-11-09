import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { SiteId } from "@contracts/site-definition";
import type { Env } from "../../../platform/types";
import { readSiteSchemaMigrations } from "../../../test-support/site-schema";
import { D1NaverCafeApplication } from "./d1-naver-cafe-application";
import { collectNaverCafePostsForSources, readEnabledNaverCafeSources, type NaverCafeSourceInput } from "./naver-cafe-collector";
import { readOperationsStatusRows } from "../../operations/infrastructure/operations-read-model";
import { D1MemberPostsPort } from "../../member-posts/infrastructure/d1-member-posts-port";
import { ScheduledJobPlanner } from "../../scheduled-operations/infrastructure/scheduled-job-planner";
import { meterD1 } from "../../../test-support/d1-meter";

const db = (env as unknown as Env).otw_db;
const runtime = (site: SiteId) => ({ ...env, SITE_ID: site } as unknown as Env);
const targets = { otw: [1, 2, 6, 7, 8], luvdia: [3, 4, 5] };
const codes = ["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"];
beforeAll(async () => {
  for (const migration of await readSiteSchemaMigrations()) {
    if (migration.name.startsWith("0030_")) await db.batch(codes.map((code, i) =>
      db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-i, code, "migration bootstrap")));
    await applyD1Migrations(db, [migration]);
  }
}, 120_000);
beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM naver_cafe_source_checks"),
    db.prepare("DELETE FROM naver_cafe_posts"),
    db.prepare("DELETE FROM naver_cafe_sources"),
    ...codes.map((code, i) => db.prepare("INSERT INTO members(uid,code,name,content_access,is_deprecated) VALUES(?,?,?,'normal',0) ON CONFLICT(uid) DO UPDATE SET code=excluded.code,name=excluded.name,content_access='normal',is_deprecated=0").bind(i+1, code, code)),
    ...Array.from({ length: 8 }, (_, i) => db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_id,menu_id,cafe_url,member_uid,enabled,sort_order,collection_started_at,initialization_completed_at,last_seen_article_id) VALUES(?,?, '123',?, 'https://cafe.naver.com/test',?,1,?,1,1,10)").bind(i+1, `Board ${i+1}`, String(i+1), i+1, i+1)),
    ...Array.from({ length: 8 }, (_, i) => db.prepare("INSERT INTO naver_cafe_source_checks(source_id,source_name,cafe_id,menu_id,trigger,status,checked_at,duration_ms,post_count) VALUES(?,?,'123',?,'scheduled','ok',1,1,0)").bind(i+1, `Board ${i+1}`, String(i+1))),
  ]);
});
afterEach(() => vi.restoreAllMocks());
async function selectSite(site: SiteId) {
  if (site === "luvdia") await db.prepare("UPDATE members SET is_deprecated=1 WHERE uid IN (1,2,6,7,8)").run();
}

it.each(["otw", "luvdia"] as const)("keeps only %s member boards in admin, collection and status without deleting history", async site => {
  await selectSite(site);
  const before = await db.prepare("SELECT count(*) n FROM naver_cafe_source_checks").first("n");
  expect((await new D1NaverCafeApplication(runtime(site)).listSources()).map(s => s.id)).toEqual(targets[site]);
  expect((await readEnabledNaverCafeSources(runtime(site))).map(s => s.id)).toEqual(targets[site]);
  expect((await new D1MemberPostsPort(runtime(site), {} as never, {} as never).listNaverCafeSources()).map(s => s.id)).toEqual(targets[site]);
  const plan = await new ScheduledJobPlanner(runtime(site), {} as never).planScheduled("naver_cafe_collection", Date.now());
  expect(plan.flatMap(item => item.continuation?.sourceIds)).toEqual(targets[site]);
  const meter = meterD1(db);
  const rows = await readOperationsStatusRows(meter.db, 0, site);
  expect(rows.naverSources.map(s => s.id)).toEqual(targets[site]);
  expect([...new Set(rows.naverChecks.map(c => c.source_id))].sort()).toEqual(targets[site]);
  expect(meter.summary().rowsWritten).toBe(0);
  expect(meter.bindingCalls).toBe(6);
  expect(await db.prepare("SELECT count(*) n FROM naver_cafe_sources").first("n")).toBe(8);
  expect(await db.prepare("SELECT count(*) n FROM naver_cafe_source_checks").first("n")).toBe(before);
});

it.each(["otw", "luvdia"] as const)("rejects a stale out-of-scope %s source before any provider request", async site => {
  await selectSite(site);
  const id = site === "otw" ? 3 : 1;
  const stale = await db.prepare("SELECT * FROM naver_cafe_sources WHERE id=?").bind(id).first<NaverCafeSourceInput>();
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected provider call"));
  const result = await collectNaverCafePostsForSources([stale!], { cacheDb: db, siteId: site, trigger: "manual" });
  expect(fetch).not.toHaveBeenCalled();
  expect(result.sources[0].status).toBe("disabled");
  expect(await db.prepare("SELECT last_seen_article_id,last_attempt_at FROM naver_cafe_sources WHERE id=?").bind(id).first()).toEqual({last_seen_article_id:10,last_attempt_at:null});
});

it("preserves shared boards while excluding archived and unknown member mappings", async () => {
  await db.batch([
    db.prepare("INSERT INTO members(uid,code,name,content_access) VALUES(90,'archived','Archived','admin_archive')"),
    ...[[9,null],[10,90],[11,999999]].map(([id,uid]) => db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_id,menu_id,cafe_url,member_uid,enabled) VALUES(?,'Extra','123',?,'https://cafe.naver.com/test',?,1)").bind(id, String(id), uid)),
  ]);
  expect((await new D1NaverCafeApplication(runtime("otw")).listSources()).map(s => s.id)).toEqual([9,...targets.otw]);
});

it("does not store posts or advance a cursor if membership changes during a provider request", async () => {
  const source = (await readEnabledNaverCafeSources(runtime("luvdia")))[0];
  const fetch = vi.spyOn(globalThis,"fetch").mockImplementationOnce(async () => {
    await db.prepare("UPDATE members SET is_deprecated=1 WHERE uid=?").bind(source.member_uid).run();
    return Response.json({result:{articleList:[{type:"ARTICLE",item:{articleId:11,cafeId:123,menuId:1,subject:"New",writeDateTimestamp:Date.now()}},{type:"ARTICLE",item:{articleId:10,cafeId:123,menuId:1,subject:"Boundary",writeDateTimestamp:Date.now()-1}}]}});
  });
  const result = await collectNaverCafePostsForSources([source], {cacheDb:db,siteId:"luvdia",trigger:"manual"});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(result.sources[0].status).toBe("error");
  expect(result.posts).toEqual([]);
  expect(await db.prepare("SELECT count(*) n FROM naver_cafe_posts").first("n")).toBe(0);
  expect(await db.prepare("SELECT last_seen_article_id,last_success_at FROM naver_cafe_sources WHERE id=?").bind(source.id).first()).toEqual({last_seen_article_id:10,last_success_at:null});
});
