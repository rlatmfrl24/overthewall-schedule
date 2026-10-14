import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { D1TransitionRepository } from "./d1-transition-repository";
import { classifiedTables } from "./manifest-statements";
import { keySql } from "./capture-graph";
import type { TransitionPlan } from "../../../../contracts/content-transition";
import type { Env } from "../../../platform/types";
import { getDataRetentionStatus, readDueDataRetentionPolicyIds, runDataRetentionPolicyPrune } from "../../operations/infrastructure/data-retention";
import { runScheduledYouTubeFeedCollection,hasScheduledYouTubeFeedWork } from "../../youtube/infrastructure/youtube-feed";
import { buildOwnedXPostsApplication } from "../../../app/x-posts";
import { D1IngestionRepository } from "../../otw-play/infrastructure/d1-ingestion-repository";

const runtime = env as unknown as Env & { CONTENT_TRANSITION_MIGRATIONS: D1Migration[];transition_target_db:D1Database };
const db = runtime.otw_db;
const source = new D1TransitionRepository(db, "otw", "otw-db");
const classifications: TransitionPlan["classifications"][number][] = [];
const plan: TransitionPlan = { id: "retention", sourceSite: "otw", targetSite: "luvdia", sourceResource: "otw-db", targetResource: "luvdia-db", generation: 2, protocol: 1, manifestDigest: "held-content", members: [
  { code: "bing_hayu", uid: 1, targetUid: 1 }, { code: "u_lili", uid: 2, targetUid: 2 }, { code: "yang_mei", uid: 3, targetUid: 3 },
], classifications };
beforeAll(async () => {
  for(const db of [runtime.otw_db,runtime.transition_target_db]) {
  for (const migration of runtime.CONTENT_TRANSITION_MIGRATIONS) {
    if (migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) => db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index, code, "migration bootstrap")));
    await applyD1Migrations(db, [migration]);
  }
  }
  await db.batch([db.prepare("DELETE FROM member_links"), db.prepare("DELETE FROM music_entities"), db.prepare("DELETE FROM members")]);
  for (const table of classifiedTables) {
    const rows = (await db.prepare(`SELECT ${keySql(table, "a")} identity FROM "${table}" a`).all<{identity:string}>()).results;
    classifications.push(...rows.map(row => ({ table, key: row.identity, disposition: "exclude" as const, reason: "Unrelated fixture configuration" })));
  }
}, 120000);
beforeEach(async ({task}) => {
  await db.batch([db.prepare("DELETE FROM content_transitions"), db.prepare("DELETE FROM youtube_feed_sources"), db.prepare("DELETE FROM x_api_cache"), db.prepare("DELETE FROM x_posts"), db.prepare("DELETE FROM members"),
    ...plan.members.map(member => db.prepare("INSERT INTO members(uid,code,name) VALUES(?,?,?)").bind(member.uid, member.code, member.code)),
    db.prepare("INSERT INTO members(uid,code,name) VALUES(90,'other','Other member')"),
    db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,enabled,collection_started_at,created_at,updated_at) VALUES(1,'official',1,'UCaaaaaaaaaaaaaaaaaaaaaa',0,1,1,1),(2,'official',90,'UCbbbbbbbbbbbbbbbbbbbbbb',0,1,1,1)"),
    db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at) VALUES('held',1,'Held history',1,1),('expired',2,'Unrelated expired',1,1)"),
    db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:linked-post:v1:12345','linked_post','{\"post\":{\"id\":\"12345\",\"text\":\"Held cache only\"}}',1,1),('expired','linked_post','{\"post\":null}',1,1)"),
  ]);
  if(task.name.includes("moved source")) await db.batch([db.prepare("UPDATE members SET youtube_channel_id='UCaaaaaaaaaaaaaaaaaaaaaa' WHERE uid=1"),db.prepare("UPDATE youtube_feed_sources SET enabled=1 WHERE id=1"),db.prepare("DELETE FROM youtube_feed_sources WHERE id=2")]);
  await source.prepare({ ...plan, classifications: [...classifications,
    { table: "x_api_cache", key: '["x:linked-post:v1:12345"]', disposition: "include", reason: "Approved currently held cache-only content" },
    { table: "x_api_cache", key: '["expired"]', disposition: "exclude", reason: "Unrelated cache" },
  ] });
  await source.protect(plan.id, { receiptId: "protection", protocol: 1, manifestDigest: plan.manifestDigest });
});

it("does not reschedule moved source work through stale metadata, registry status, or old enabled flags",async()=>{
  await runtime.transition_target_db.batch([runtime.transition_target_db.prepare("DELETE FROM member_links"),runtime.transition_target_db.prepare("DELETE FROM music_entities"),runtime.transition_target_db.prepare("DELETE FROM members")]);
  const target=new D1TransitionRepository(runtime.transition_target_db,"luvdia","luvdia-db");
  const stored=JSON.parse((await db.prepare("SELECT plan_json FROM content_transitions WHERE id=?").bind(plan.id).first<string>("plan_json"))!);
  await target.prepare(stored);
  await source.beginCopy(plan.id);await source.beginReplay(plan.id);
  await source.acknowledgeIngress(await target.openIngress(plan.id,"ready",Date.now()+60000),Date.now());
  await source.freeze(plan.id,Date.now());
  expect(await hasScheduledYouTubeFeedWork({...runtime,YOUTUBE_API_KEY:"fixture-not-used"},Date.now())).toBe(false);
});

it("uses the same hold predicate for eligibility, count, actual prune and readback", async () => {
  const status = await getDataRetentionStatus(runtime);
  expect(status.policies.find(policy => policy.id === "youtube-feed-videos")?.prunableRows).toBe(1);
  expect(status.policies.find(policy => policy.id === "x-api-cache")?.prunableRows).toBe(1);
  for (const id of ["youtube-feed-videos", "x-api-cache"]) expect(await runDataRetentionPolicyPrune(runtime, id, 1)).toMatchObject({ deletedRows: 1, hasMore: false });
  expect(await readDueDataRetentionPolicyIds(runtime)).not.toContain("youtube-feed-videos");
  expect(await readDueDataRetentionPolicyIds(runtime)).not.toContain("x-api-cache");
  expect((await db.prepare("SELECT video_id FROM youtube_feed_videos").all()).results).toEqual([{ video_id: "held" }]);
  expect((await db.prepare("SELECT key FROM x_api_cache").all()).results).toEqual([{ key: "x:linked-post:v1:12345" }]);
});

it("keeps held missing sources during the actual registry pass without enabling their old jobs", async () => {
  await runScheduledYouTubeFeedCollection({ ...runtime, YOUTUBE_API_KEY: "fixture-key-no-provider-call" });
  expect((await db.prepare("SELECT id,enabled FROM youtube_feed_sources").all()).results).toEqual([{ id: 1, enabled: 0 }]);
  expect((await db.prepare("SELECT title FROM youtube_feed_videos").all()).results).toEqual([{ title: "Held history" }]);
});

it("still removes intentionally redacted cache-only material under the hold", async () => {
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES('12345','other','other','{}','2026-10-14',1)").run();
  const application=buildOwnedXPostsApplication({...runtime,SITE_ID:"otw",SITE_D1_DATABASE_NAME:"otw-db",SITE_ASSET_BUCKET_NAME:"otw-schedule"});
  expect(await application.redactPost("12345",{actorId:"fixture-admin",actorName:"Fixture admin",actorIp:null})).toBe(true);
  expect(await db.prepare("SELECT value FROM x_api_cache WHERE key='x:linked-post:v1:12345'").first()).toBeNull();
});

it("excludes archived ingestion API data from both due reads and actual expiry",async()=>{
  await db.batch([db.prepare("DELETE FROM music_ingestion_candidates"),
    db.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,title,metadata_checked_at,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at,content_access) VALUES('youtube:AAAAAAAAAAA','AAAAAAAAAAA','Held metadata',1,1,1,1,1,1,'admin_archive'),('youtube:BBBBBBBBBBB','BBBBBBBBBBB','Expired metadata',1,1,1,1,1,1,'normal')")]);
  const repository=new D1IngestionRepository(db);
  expect(await repository.hasExpiredApiData(Date.now())).toBe(true);
  expect(await repository.clearExpiredApiData(Date.now(),100)).toBe(1);
  expect(await repository.hasExpiredApiData(Date.now())).toBe(false);
  expect(await db.prepare("SELECT title,metadata_checked_at FROM music_ingestion_candidates WHERE id='youtube:AAAAAAAAAAA'").first()).toEqual({title:"Held metadata",metadata_checked_at:1});
});
