import { readSiteSchemaMigrations } from "../test-support/site-schema";
import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { handleWorkerFetch } from "./fetch";
import { clearAuthCachesForTests } from "../platform/auth";
import { siteEnv } from "../test-support/site-env";
import type { Env } from "../platform/types";
import { D1PublicCatalogReader } from "../features/otw-play/infrastructure/d1-public-catalog-reader";
import { projectionStatements } from "../features/otw-play/infrastructure/d1-catalog-projection";
import { D1PlaylistRepository } from "../features/otw-play/infrastructure/d1-playlist-repository";
import { SITE_OPENS_AT } from "@contracts/site-publication";
import { commitPublicationBatch } from "../features/content-access";
import { publicationHiddenSql } from "../features/content-access";
import { readActiveChzzkChannels } from "../features/chzzk/infrastructure/d1-active-channels";
import { readActiveYouTubeChannels } from "../features/youtube/infrastructure/d1-active-channels";
import { runScheduledYouTubeFeedCollection } from "../features/youtube/infrastructure/youtube-feed";
import { collectNaverCafePostsForSources } from "../features/naver-cafe/infrastructure/naver-cafe-collector";
import { readStoredXPreview } from "../features/x-posts/infrastructure/x-reference-store";
import { D1MemberSubmissionRepository } from "../features/otw-play/infrastructure/d1-member-submission-repository";
import { D1SourceHealthRepository } from "../features/otw-play/infrastructure/d1-source-health-repository";
import { D1ChannelMonitorRepository } from "../features/otw-play/infrastructure/d1-channel-monitor-repository";
import { clearXServiceCachesForTests, collectXPostsForHandles } from "../features/x-posts/infrastructure/x-api";
import { runXCollectionForHandles } from "../features/x-posts";
import { backfillXPostReferencesFromStoredPosts } from "../features/x-posts/infrastructure/x-history";
import { hydrateXReferences } from "../features/x-posts/infrastructure/x-reference-hydration";
import { clearChzzkServiceCachesForTests } from "../features/chzzk/infrastructure/chzzk-api";
import { WORKER_CACHE_POLICY as CACHE_POLICY } from "../platform/cache-policy";
import { D1AiReviewRepository } from "../features/otw-play/infrastructure/d1-ai-review-repository";
import type { AiReviewRecord } from "../features/otw-play/application/ports/ai-review";
import { D1IngestionRepository } from "../features/otw-play/infrastructure/d1-ingestion-repository";
import { handleQueue } from "./queue";
import { D1AdminCatalogRepository } from "../features/otw-play/infrastructure/d1-admin-catalog-repository";
import { AiReviewService } from "../features/otw-play/application/ai-review-service";
import { D1AiReviewContext } from "../features/otw-play/infrastructure/d1-ai-review-context";

const bindings = env as unknown as Env & { };
const db = bindings.otw_db;
const issuer = "https://archive.clerk.invalid";
const origin = "http://localhost:5173";
const runtime = { ...bindings, ...siteEnv(), SITE_PUBLIC_ORIGIN: origin, CLERK_ISSUER: issuer,
  CLERK_JWKS_URL: `${issuer}/.well-known/jwks.json`, CLERK_AUTHORIZED_PARTIES: origin,
  CLERK_ADMIN_IDS: "archive-admin", OTW_PLAY_SUBMISSION_RATE_LIMITER: { limit: async () => ({ success: true }) }, YOUTUBE_API_KEY: "", ASSETS: { fetch: async () => new Response("<html><head></head><body><div id=\"root\"></div></body></html>", { headers: { "Content-Type": "text/html" } }) },
} as unknown as Env;
let keys: CryptoKeyPair;
let jwk: JsonWebKey;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const part = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
async function request(path: string, user?: string, init: RequestInit = {}, requestRuntime = runtime) {
  const headers = new Headers(init.headers);
  if (user) {
    const input = `${part({ alg: "RS256", kid: "archive-key" })}.${part({ iss: issuer, azp: origin, sub: user, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    headers.set("Authorization", `Bearer ${input}.${encode(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(input))))}`);
  }
  return handleWorkerFetch(new Request(`${origin}${path}`, { ...init, headers }), requestRuntime);
}
beforeAll(async () => {
  for (const migration of (await readSiteSchemaMigrations())) {
    if (migration.name.startsWith("0030_")) await db.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) => db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index, code, "migration bootstrap")));
    await applyD1Migrations(db, [migration]);
  }
  await db.batch([db.prepare("DELETE FROM member_links"), db.prepare("DELETE FROM music_entities"), db.prepare("DELETE FROM members")]);
  keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey("jwk", keys.publicKey) as JsonWebKey;
}, 120000);
beforeEach(async () => {
  clearAuthCachesForTests();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === `${issuer}/.well-known/jwks.json`) return Response.json({ keys: [{ ...jwk, kid: "archive-key", alg: "RS256", use: "sig" }] });
    throw new Error(`Unexpected provider access: ${String(input)}`);
  }));
  await db.batch([
    db.prepare("DELETE FROM music_ai_review_attempts WHERE review_id LIKE 'publication-ai-%'"),
    db.prepare("DELETE FROM music_ai_review_requests WHERE review_id LIKE 'publication-ai-%'"),
    db.prepare("DELETE FROM music_ai_reviews WHERE id LIKE 'publication-ai-%'"),
    db.prepare("DELETE FROM music_ingestion_events WHERE job_id LIKE 'publication-ingestion-%' OR candidate_id IN ('youtube:PPPPPPPPPP1','youtube:PPPPPPPPPP2')"),
    db.prepare("DELETE FROM music_ingestion_candidate_origins WHERE job_id LIKE 'publication-ingestion-%'"),
    db.prepare("DELETE FROM music_ingestion_messages WHERE job_id LIKE 'publication-ingestion-%'"),
    db.prepare("DELETE FROM music_ingestion_jobs WHERE id LIKE 'publication-ingestion-%'"),
    db.prepare("DELETE FROM music_ingestion_candidates WHERE external_video_id IN ('PPPPPPPPPP1','PPPPPPPPPP2')"),
    db.prepare("DELETE FROM member_links"),
    db.prepare("DELETE FROM content_transitions"), db.prepare("DELETE FROM content_historical_records"), db.prepare("DELETE FROM music_playlists"),
    db.prepare("DELETE FROM x_posts"), db.prepare("DELETE FROM x_post_sources"), db.prepare("DELETE FROM naver_cafe_posts"), db.prepare("DELETE FROM naver_cafe_sources"),
    db.prepare("DELETE FROM youtube_feed_sources"), db.prepare("DELETE FROM chzzk_api_cache"),
    db.prepare("DELETE FROM music_channel_upload_candidate_origins"), db.prepare("DELETE FROM music_channel_upload_monitors"), db.prepare("DELETE FROM music_channel_automation_approvals"),
    db.prepare("DELETE FROM music_cover_proposals"), db.prepare("DELETE FROM music_performances"),
    db.prepare("DELETE FROM music_media_sources"), db.prepare("DELETE FROM music_channels"),
    db.prepare("DELETE FROM music_songs"), db.prepare("DELETE FROM music_search_gram_stats"), db.prepare("DELETE FROM music_entities"),
    db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_posts_visibility','public')"), db.prepare("DELETE FROM schedules"), db.prepare("DELETE FROM notices"), db.prepare("DELETE FROM ddays"), db.prepare("DELETE FROM members"),
    db.prepare("INSERT INTO members(uid,code,name,content_access,youtube_channel_id,url_chzzk,url_twitter) VALUES(1,'bing_hayu','Archived Person','admin_archive','UCaaaaaaaaaaaaaaaaaaaaaa','https://chzzk.naver.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','https://x.com/archived'),(2,'other','Public Person','normal','UCbbbbbbbbbbbbbbbbbbbbbb','https://chzzk.naver.com/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','https://x.com/public')"),
    db.prepare("INSERT INTO schedules(id,member_uid,date,title,status,content_access) VALUES(1,1,'2026-10-14','Archived schedule','방송','admin_archive'),(2,2,'2026-10-14','Public schedule','방송','normal')"),
    db.prepare("INSERT INTO notices(id,content,is_active,content_access) VALUES(1,'Archived notice',1,'admin_archive'),(2,'Public notice',1,'normal')"),
    db.prepare("INSERT INTO ddays(id,title,date,content_access) VALUES(1,'Archived day','2026-10-14','admin_archive'),(2,'Public day','2026-10-14','normal')"),
  ]);
});

it("applies the timed OTW cutoff through normal member, schedule, notice and asset routes without changing rows", async () => {
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("UPDATE schedules SET content_access='normal' WHERE id=1"),
    db.prepare("UPDATE notices SET content_access='normal',related_member_uids='[1]' WHERE id=1"),
  ]);
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT) - 1);
  expect((await (await request("/api/members")).json() as Array<{code:string}>).map(m => m.code)).toContain("bing_hayu");
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect((await (await request("/api/members")).json() as Array<{code:string}>).map(m => m.code)).toEqual(["other"]);
  expect((await request("/api/members/bing_hayu")).status).toBe(404);
  expect(await (await request("/api/schedules?date=2026-10-14")).json()).not.toContainEqual(expect.objectContaining({member_uid:1}));
  expect(await (await request("/api/notices")).json()).not.toContainEqual(expect.objectContaining({id:1}));
  expect((await request("/profile/bing_hayu.webp")).status).toBe(401);
  expect((await request("/api/members?archive=1", "archive-admin")).status).toBe(200);
  expect(await db.prepare("SELECT content_access FROM members WHERE uid=1").first("content_access")).toBe("normal");
});

it("keeps LuvDia content closed until the boundary while real admin authentication can prepare it", async () => {
  const luvdia = { ...runtime, ...siteEnv("luvdia"), SITE_PUBLIC_ORIGIN: origin } as Env;
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT) - 1);
  for (const user of [undefined, "ordinary-member"]) {
    expect((await request("/api/members", user, {}, luvdia)).status).toBe(403);
    expect((await request("/r2-assets/private.webp", user, { method: "HEAD" }, luvdia)).status).toBe(403);
  }
  expect((await request("/api/members", "archive-admin", {}, luvdia)).status).toBe(200);
  expect((await request("/admin/operations", undefined, {}, luvdia)).status).toBe(200);
  expect(await (await request("/api/publication-status", "archive-admin", {}, luvdia)).json()).toMatchObject({phase:"countdown",canPreview:true});
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect((await request("/api/members", undefined, {}, luvdia)).status).toBe(200);
  expect((await request("/api/members", undefined, {}, { ...luvdia, SITE_PUBLICATION_HOLD:"true" })).status).toBe(403);
});

it("retains timed YouTube source/video originals without polling them after midnight", async () => {
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("UPDATE members SET youtube_channel_id=NULL WHERE uid=2"),
    db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,collection_started_at,created_at,updated_at) VALUES(1,'official',1,'UCaaaaaaaaaaaaaaaaaaaaaa',100,100,100)"),
    db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at) VALUES('retained123',1,'Retained original',100,100)"),
  ]);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect(await runScheduledYouTubeFeedCollection({ ...runtime, YOUTUBE_API_KEY: "test" })).toMatchObject({status:"skipped",attempted:0});
  expect(await db.prepare("SELECT title FROM youtube_feed_videos WHERE source_id=1").first("title")).toBe("Retained original");
  expect(await db.prepare("SELECT last_success_at FROM youtube_feed_sources WHERE id=1").first("last_success_at")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not acknowledge or store an in-flight YouTube result that crosses midnight", async () => {
  const before = Date.parse(SITE_OPENS_AT) - 1000;
  const clock = vi.spyOn(Date, "now").mockReturnValue(before);
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("UPDATE members SET youtube_channel_id=NULL WHERE uid=2"),
    db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,uploads_playlist_id,last_seen_video_id,collection_started_at,created_at,updated_at) VALUES(1,'official',1,'UCaaaaaaaaaaaaaaaaaaaaaa','uploads','old',100,100,100)"),
  ]);
  vi.mocked(fetch).mockImplementation(async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/playlistItems")) return Response.json({items:[{snippet:{resourceId:{videoId:"latevideo01"},publishedAt:"2026-10-18T14:59:59Z"}}]});
    if (url.pathname.endsWith("/videos")) {
      clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
      return Response.json({items:[{id:"latevideo01",snippet:{title:"Late result",publishedAt:"2026-10-18T14:59:59Z"},contentDetails:{duration:"PT30S"}}]});
    }
    throw new Error(`Unexpected provider: ${url}`);
  });
  const result = await runScheduledYouTubeFeedCollection({ ...runtime, YOUTUBE_API_KEY:"test" });
  expect(result.succeeded).toBe(0);
  expect(result.shortsStored).toBe(0);
  expect(await db.prepare("SELECT last_seen_video_id,last_success_at FROM youtube_feed_sources WHERE id=1").first()).toEqual({last_seen_video_id:"old",last_success_at:null});
  expect(await db.prepare("SELECT count(*) FROM youtube_feed_videos WHERE source_id=1").first("count(*)")).toBe(0);
});

it("keeps Cafe posts and watermark unchanged when the provider response crosses midnight", async () => {
  const before = Date.parse(SITE_OPENS_AT) - 1000;
  const clock = vi.spyOn(Date, "now").mockReturnValue(before);
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_url,cafe_id,menu_id,member_uid,enabled,initialization_completed_at,collection_started_at,last_seen_article_id) VALUES(1,'Selected','https://cafe.naver.com/selected','123','1',1,1,1,1,42)"),
  ]);
  const source = await db.prepare("SELECT * FROM naver_cafe_sources WHERE id=1").first<Parameters<typeof collectNaverCafePostsForSources>[0][number]>();
  vi.mocked(fetch).mockImplementation(async () => {
    clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
    return Response.json({result:{articleList:[{type:"ARTICLE",item:{articleId:43,subject:"Late Cafe",writeDateTimestamp:before}}]}});
  });
  const result = await collectNaverCafePostsForSources([source!], {cacheDb:db,siteId:"otw",size:20,trigger:"scheduled"});
  expect(result.success).toBe(false);
  expect(result.posts).toEqual([]);
  expect(await db.prepare("SELECT last_seen_article_id,last_success_at FROM naver_cafe_sources WHERE id=1").first()).toEqual({last_seen_article_id:42,last_success_at:null});
  expect(await db.prepare("SELECT count(*) FROM naver_cafe_posts").first("count(*)")).toBe(0);
});

it("blocks timed X reply context including cached author content while keeping ordinary references", async () => {
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const parent = {id:"101000000000000001",text:"Selected secret",username:"archived",createdAt:"2026-10-14T00:00:00Z",url:"https://x.com/archived/status/101000000000000001",media:[],metrics:{likeCount:0,retweetCount:0,replyCount:0,quoteCount:0}};
  const reply = {...parent,id:"101000000000000002",username:"public",text:"Ordinary reply",reply:{postId:parent.id,targetUsername:"archived",post:null}};
  await db.batch([
    db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES(?,'public','public',?,'2026-10-14T00:00:00Z',100)").bind(reply.id,JSON.stringify(reply)),
    db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'linked_post',?,100,?)").bind(`x:linked-post:v1:${parent.id}`,JSON.stringify({post:parent}),Date.parse(SITE_OPENS_AT)+86400000),
  ]);
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  expect((await request(`/api/x/posts/${reply.id}/context`)).status).toBe(200);
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect((await request(`/api/x/posts/${reply.id}/context`)).status).toBe(404);
  expect(await readStoredXPreview(db,parent.id,Date.now(),"otw")).toBeNull();
});

it("rejects a late X post instead of recording facts or acknowledging its watermark", async () => {
  clearXServiceCachesForTests();
  const before = Date.parse(SITE_OPENS_AT) - 1000;
  const clock = vi.spyOn(Date,"now").mockReturnValue(before);
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at,initialization_completed_at) VALUES('archived','u1','archived','101000000000000001',1,1,1,1)"),
  ]);
  vi.mocked(fetch).mockImplementation(async input => {
    const url = new URL(String(input));
    if (url.pathname.includes("/users/by")) return Response.json({data:[{id:"u1",username:"archived"}]});
    if (url.pathname.endsWith("/tweets")) {
      clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
      return Response.json({data:[{id:"101000000000000003",text:"Late X",created_at:new Date(before).toISOString(),public_metrics:{}}]});
    }
    throw new Error(`Unexpected X provider: ${url}`);
  });
  const result = await collectXPostsForHandles(["archived"],{cacheDb:db,siteId:"otw",bearerToken:"test"});
  expect(result).toMatchObject({status:"failed",postsStored:0,error:"x_post_storage_failed"});
  expect(await db.prepare("SELECT last_seen_post_id,last_success_at FROM x_post_sources WHERE handle='archived'").first()).toEqual({last_seen_post_id:"101000000000000001",last_success_at:null});
  expect(await db.prepare("SELECT count(*) FROM x_posts").first("count(*)")).toBe(0);
  expect(await db.prepare("SELECT count(*) FROM x_post_facts").first("count(*)")).toBe(0);
  expect(await db.prepare("SELECT count(*) FROM x_api_cache WHERE type='posts'").first("count(*)")).toBe(0);
});

it("excludes timed artists and song candidates from ordinary submission lookup", async () => {
  await catalog();
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const repository = new D1MemberSubmissionRepository(db,"otw");
  const clock = vi.spyOn(Date,"now").mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  expect(await repository.searchArtists("Archived")).toHaveLength(1);
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect(await repository.searchArtists("Archived")).toEqual([]);
  expect(await repository.searchArtists("Public")).toHaveLength(1);
});

it("keeps global D-days unless reviewed membership associates them with the selected members", async () => {
  await db.batch(["bing_hayu","other"].map((code,index) => db.prepare("INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json,phase) VALUES(?,'otw','luvdia','otw-db','luvdia-db','otw','otw-db',2,1,'classified',?,'complete')").bind(`classified-${index}`,JSON.stringify({members:[{code}]}))));
  await db.batch([
    db.prepare("INSERT INTO ddays(id,title,date) VALUES(3,'Selected day','2026-10-19'),(5,'Unrelated day','2026-10-19')"),
    ...[3,5].map((id,index) => db.prepare("INSERT INTO content_transition_membership(transition_id,root_table,root_key,row_table,row_key) VALUES(?,'ddays',?,'ddays',?)").bind(`classified-${index}`,JSON.stringify([id]),JSON.stringify([id]))),
  ]);
  vi.spyOn(Date,"now").mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect((await db.prepare(`SELECT id FROM ddays d WHERE id IN (3,5) AND NOT ${publicationHiddenSql("ddays","d","otw")} ORDER BY id`).all()).results).toEqual([{id:5}]);
});

it("stops selected-only Play source health work while retaining a shared source for another performance", async () => {
  await catalog();
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("UPDATE music_media_sources SET next_check_at=0"),
    db.prepare("INSERT INTO music_performance_sources(performance_id,source_id,source_role,priority,is_primary,start_seconds) VALUES('public-performance','source-0','alternate',1,0,1)"),
  ]);
  const repository = new D1SourceHealthRepository(db,"otw");
  const clock = vi.spyOn(Date,"now").mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  const target = await repository.readTarget("source-2");
  expect(target).not.toBeNull();
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect(await repository.readTarget("source-2")).toBeNull();
  expect((await repository.claimDueSources(Date.now(),Date.now()+60000,10)).map(source=>source.id)).toEqual(["source-0","source-1"]);
  expect(await repository.applyObservation({target:target!,actor:{kind:"system"},eventId:"late-health",checkedAt:Date.now(),nextCheckAt:Date.now()+3600000,observation:{videoId:target!.externalId,availabilityStatus:"playable",video:null}})).toEqual({kind:"stale"});
  expect(await db.prepare("SELECT version,next_check_at FROM music_media_sources WHERE id='source-2'").first()).toEqual({version:0,next_check_at:0});
});

it("excludes selected Play monitors and rejects their in-flight watermark update", async () => {
  await catalog();
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("UPDATE music_channels SET channel_role='approved_kirinuki' WHERE id='channel'"),
    db.prepare("INSERT INTO music_channel_entities(channel_id,entity_id) VALUES('channel','archived-singer')"),
  ]);
  const repository = new D1ChannelMonitorRepository(db,"otw");
  const clock = vi.spyOn(Date,"now").mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  const externalId = await db.prepare("SELECT external_channel_id FROM music_channels WHERE id='channel'").first<string>("external_channel_id");
  const channel = await repository.findApprovableChannel(externalId!);
  const created = await repository.create({id:"target-monitor",channel:channel!,uploadsPlaylistId:"UUaaaaaaaaaaaaaaaaaaaaaa",lastSeenVideoId:null,actorUserId:"admin",eventId:"create-monitor",approvalEventId:"approve-monitor",now:Date.now()-86400000,approval:{scope:"candidate_collection",operatorReference:"operator",approvalReference:"approved",revocationProcedure:"revoke",confirmed:true}});
  expect(created.status).toBe("active");
  expect(await repository.listDueIds(Date.now(),10)).toEqual(["target-monitor"]);
  const claimed = await repository.claim("target-monitor",Date.now());
  expect(claimed).not.toBeNull();
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect(await repository.listDueIds(Date.now(),10)).toEqual([]);
  expect(await repository.claim("target-monitor",Date.now())).toBeNull();
  await expect(repository.complete({id:"target-monitor",expectedVersion:claimed!.version,monitorGeneration:claimed!.generation,now:Date.now(),lastSeenVideoId:"latevideo01",lastSeenPublishedAt:Date.now()})).rejects.toThrow();
  expect(await db.prepare("SELECT last_seen_video_id,last_success_at FROM music_channel_upload_monitors WHERE id='target-monitor'").first()).toEqual({last_seen_video_id:null,last_success_at:null});
});

it("hides timed Play performances in search, song details and saved playlists but keeps the shared song", async () => {
  await catalog();
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT) - 1);
  const playlist = await new D1PlaylistRepository(db).create("member", "cutover-playlist", {title:"Saved",description:"",originDefaultId:null,representativePerformanceId:"archived-performance",performanceIds:["archived-performance","public-performance"]});
  expect((await request("/api/play/performances/archived-performance", "member")).status).toBe(200);
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect((await request("/api/play/performances/archived-performance", "member")).status).toBe(404);
  const song = await new D1PublicCatalogReader(db).readSongBySlug("shared-song");
  expect(song?.performances.map(p => p.id)).toEqual(["public-performance"]);
  const result = await (await request(`/api/play/me/playlists/${playlist.id}`, "member")).text();
  expect(result).not.toContain("archived.jpg");
  expect(await db.prepare("SELECT count(*) n FROM music_playlist_items WHERE playlist_id=?").bind(playlist.id).first("n")).toBe(2);
});

it("stops transferred collection targets and rolls back an already prepared native write at cutover", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT) - 1);
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  expect(await readActiveYouTubeChannels(db,"otw")).toContain("UCaaaaaaaaaaaaaaaaaaaaaa");
  const lateWrite = db.prepare("UPDATE schedules SET title='late collector result' WHERE id=1");
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect(await readActiveYouTubeChannels(db,"otw")).not.toContain("UCaaaaaaaaaaaaaaaaaaaaaa");
  expect(await readActiveChzzkChannels(db,"otw")).not.toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  await expect(commitPublicationBatch(db,"otw",[1],[lateWrite])).rejects.toThrow();
  expect(await db.prepare("SELECT title FROM schedules WHERE id=1").first("title")).toBe("Archived schedule");
  await commitPublicationBatch(db,"otw",[2],[db.prepare("UPDATE schedules SET title='remaining member' WHERE id=2")]);
  expect(await db.prepare("SELECT title FROM schedules WHERE id=2").first("title")).toBe("remaining member");
  expect(await readActiveYouTubeChannels(db,"luvdia")).toContain("UCaaaaaaaaaaaaaaaaaaaaaa");
});

it("keeps global X repair off transferred OTW history while other collection and LuvDia repair continue",async()=>{
  await db.prepare("UPDATE members SET content_access='normal'").run();
  await db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_history_analytics_enabled','true')").run();
  for(const [id,handle] of [['201','archived'],['202','public']]) {
    const post={id,username:handle,text:'Stored quote',createdAt:'2026-10-15T00:00:00Z',url:`https://x.com/${handle}/status/${id}`,media:[],quote:{postId:'200',post:{id:'200'}}};
    await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES(?,?,?,?,?,1,1)").bind(id,handle,handle,JSON.stringify(post),post.createdAt).run();
  }
  vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT));
  await runXCollectionForHandles({...runtime,X_BEARER_TOKEN:''},['public'],'scheduled');
  expect((await db.prepare('SELECT post_id FROM x_post_facts ORDER BY post_id').all()).results).toEqual([{post_id:'202'}]);
  expect((await db.prepare('SELECT source_post_id FROM x_post_references ORDER BY source_post_id').all()).results).toEqual([{source_post_id:'202'}]);
  expect(await db.prepare("SELECT facts_pending,references_pending FROM x_post_repair_work WHERE post_id='201'").first()).toEqual({facts_pending:1,references_pending:1});
  await runXCollectionForHandles({...runtime,...siteEnv('luvdia'),otw_db:db,X_BEARER_TOKEN:''},['archived'],'scheduled');
  expect(await db.prepare("SELECT count(*) n FROM x_post_facts WHERE post_id='201'").first('n')).toBe(1);
  expect(await db.prepare("SELECT count(*) n FROM x_post_references WHERE source_post_id='201'").first('n')).toBe(1);
});

it("does not commit or acknowledge an X reference repair selected before midnight when its write crosses cutoff",async()=>{
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const post={id:'203',username:'archived',text:'Stored quote',createdAt:'2026-10-15T00:00:00Z',url:'https://x.com/archived/status/203',media:[],quote:{postId:'200',post:{id:'200'}}};
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('203','archived','archived',?,'2026-10-15T00:00:00Z',1,1)").bind(JSON.stringify(post)).run();
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  const raced=new Proxy(db,{get(database,key){
    if(key==='prepare')return(sql:string)=>{
      const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(target,method){
        if(method==='bind')return(...values:unknown[])=>wrap(target.bind(...values));
        if(method==='all'&&sql.includes('work.references_pending=1'))return async()=>{const result=await target.all();clock.mockReturnValue(Date.parse(SITE_OPENS_AT));return result;};
        const value=Reflect.get(target,method,target);return typeof value==='function'?value.bind(target):value;
      }});return wrap(database.prepare(sql));
    };
    const value=Reflect.get(database,key,database);return typeof value==='function'?value.bind(database):value;
  }});
  await backfillXPostReferencesFromStoredPosts(raced,'otw');
  expect(await db.prepare("SELECT count(*) n FROM x_post_references WHERE source_post_id='203'").first('n')).toBe(0);
  expect(await db.prepare("SELECT references_pending FROM x_post_repair_work WHERE post_id='203'").first('references_pending')).toBe(1);
});

it("keeps transferred X posts visible through the normal LuvDia feed after OTW cutoff",async()=>{
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const post={id:'205',username:'archived',text:'LuvDia visible X',createdAt:'2026-10-15T00:00:00Z',url:'https://x.com/archived/status/205',media:[],metrics:{likeCount:0,replyCount:0,repostCount:0,quoteCount:0}};
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('205','archived','archived',?,'2026-10-15T00:00:00Z',1,1)").bind(JSON.stringify(post)).run();
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  expect(await (await request('/api/member-posts?sources=x')).text()).toContain(post.text);
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  const luvdia=await request('/api/member-posts?sources=x',undefined,{}, {...runtime,...siteEnv('luvdia'),otw_db:db});
  expect(luvdia.status).toBe(200);expect(await luvdia.text()).toContain(post.text);
  expect(await (await request('/api/member-posts?sources=x')).text()).not.toContain(post.text);
});

it("preserves selected OTW quote history when an in-flight hydration response crosses midnight",async()=>{
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const post={id:'204',username:'archived',text:'Stored unresolved quote',createdAt:'2026-10-15T00:00:00Z',media:[],quote:{postId:'200'}};
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('204','archived','archived',?,'2026-10-15T00:00:00Z',1,1)").bind(JSON.stringify(post)).run();
  await db.prepare("INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,next_attempt_at,created_at,updated_at) VALUES('204','quote','200','pending',0,1,1)").run();
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  const provider=vi.fn(async()=>{clock.mockReturnValue(Date.parse(SITE_OPENS_AT));return Response.json({data:[{id:'200',text:'Late paid quote',created_at:'2026-10-15T00:00:00Z',public_metrics:{}}]});});
  vi.stubGlobal('fetch',provider);
  const tracker={apiCalls:0,estimatedCostMicros:0,reservedCostMicros:0,uniqueResources:0,previewDeferred:0,authorCacheHits:0,authorCacheMisses:0,source:'scheduled'};
  await hydrateXReferences({db,siteId:'otw',handles:['archived'],bearerToken:'local-fixture',mode:'post_only',tracker});
  expect(provider).toHaveBeenCalledOnce();
  expect(await db.prepare("SELECT value FROM x_posts WHERE id='204'").first('value')).toBe(JSON.stringify(post));
  expect(await db.prepare("SELECT resolution_state,attempt_count,lease_token FROM x_post_references WHERE source_post_id='204'").first()).toEqual({resolution_state:'pending',attempt_count:0,lease_token:null});
  expect(await db.prepare("SELECT count(*) n FROM x_api_cache WHERE key='x:linked-post:v1:200'").first('n')).toBe(0);
});

it("does not report terminal X resolution when the final attachment loses the cutoff race",async()=>{
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const post={id:'206',username:'archived',text:'Stored unresolved quote',createdAt:'2026-10-15T00:00:00Z',media:[],quote:{postId:'200'}};
  await db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,first_seen_at,fetched_at) VALUES('206','archived','archived',?,'2026-10-15T00:00:00Z',1,1)").bind(JSON.stringify(post)).run();
  await db.prepare("INSERT INTO x_post_references(source_post_id,relation_type,referenced_post_id,resolution_state,next_attempt_at,created_at,updated_at) VALUES('206','quote','200','pending',0,1,1)").run();
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({errors:[{resource_id:'200',type:'https://api.x.com/2/problems/resource-not-found'}]})));
  const raced=new Proxy(db,{get(database,key){
    if(key==='prepare')return(sql:string)=>{
      const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(target,method){
        if(method==='bind')return(...values:unknown[])=>wrap(target.bind(...values));
        if(method==='all'&&sql.includes('SELECT r.source_post_id,r.relation_type,p.handle'))return async()=>{const result=await target.all();clock.mockReturnValue(Date.parse(SITE_OPENS_AT));return result;};
        const value=Reflect.get(target,method,target);return typeof value==='function'?value.bind(target):value;
      }});return wrap(database.prepare(sql));
    };
    const value=Reflect.get(database,key,database);return typeof value==='function'?value.bind(database):value;
  }});
  const tracker={apiCalls:0,estimatedCostMicros:0,reservedCostMicros:0,uniqueResources:0,previewDeferred:0,authorCacheHits:0,authorCacheMisses:0,source:'scheduled'};
  const result=await hydrateXReferences({db:raced,siteId:'otw',handles:['archived'],bearerToken:'local-fixture',mode:'post_only',tracker});
  expect(result.terminal).toBe(0);
  expect(await db.prepare("SELECT resolution_state,lease_token FROM x_post_references WHERE source_post_id='206'").first()).toEqual({resolution_state:'pending',lease_token:null});
});

it("fix2 preserves normal notice and draft external images without transition authority and rejects protected-context substitution",async()=>{
  const external="https://ordinary-media.example/image.webp",protectedRaw="https://unresolved-protected.example/image.webp";
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  await db.prepare("UPDATE notices SET image_urls=?,related_member_uids='[2]' WHERE id=2").bind(JSON.stringify([external])).run();
  const resolve=(raw:string,context:unknown)=>request(`/api/assets/protected-reference?url=${encodeURIComponent(raw)}&context=${encodeURIComponent(JSON.stringify(context))}`,"archive-admin");
  const normal=await resolve(external,{kind:"notice",id:2});
  expect(normal.status).toBe(200);
  expect(await normal.json()).toEqual({path:null});
  expect(await (await resolve(external,{kind:"notice-draft",relatedMemberUids:[]})).json()).toEqual({path:null});
  expect(await (await resolve(external,{kind:"notice-draft",relatedMemberUids:[1]})).json()).toEqual({path:null});
  const ordinaryVariant="HTTPS://ORDINARY-MEDIA.EXAMPLE:443/image.webp";
  expect((await resolve(ordinaryVariant,{kind:"notice-draft",relatedMemberUids:[]})).status).toBe(200);
  for(const context of [{kind:"notice",id:999},{kind:"notice",id:1},{kind:"notice-draft",id:1,relatedMemberUids:[]},{kind:"notice-draft",id:999,relatedMemberUids:[]},{kind:"notice-draft",relatedMemberUids:[999]},{kind:"notice-draft",relatedMemberUids:[2,2]},{kind:"notice",id:2,normal:true}]) expect((await resolve(external,context)).status).toBe(400);
  expect((await resolve("https://not-stored.example/image.webp",{kind:"notice",id:2})).status).toBe(400);
  const archivedRaw="https://archived-unknown.example/image.webp";
  await db.prepare("UPDATE notices SET image_urls=? WHERE id=1").bind(JSON.stringify([archivedRaw])).run();
  expect((await resolve(archivedRaw,{kind:"notice-draft",relatedMemberUids:[]})).status).toBe(400);
  expect((await resolve(archivedRaw,{kind:"notice-draft",id:2,relatedMemberUids:[2]})).status).toBe(400);
  const historicalRaw="https://historical-unknown.example/image.webp";
  await db.prepare("INSERT INTO content_historical_records(source_site,source_table,source_key,record_json,protocol) VALUES('otw','notices','[99]',?,1)").bind(JSON.stringify({id:99,content:"Historical notice",image_urls:JSON.stringify([historicalRaw]),thumbnail_url:null})).run();
  expect((await resolve(historicalRaw,{kind:"notice-draft",relatedMemberUids:[]})).status).toBe(400);
  await db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(9,'retired','Retired',1)").run();
  expect((await resolve(external,{kind:"notice-draft",relatedMemberUids:[9]})).status).toBe(400);
  const plan={id:"normal-resolver",sourceSite:"otw",targetSite:"luvdia",sourceResource:"otw-db",targetResource:"luvdia-db",generation:2,protocol:1,manifestDigest:"normal-resolver",members:[{uid:1,targetUid:11,code:"bing_hayu"}],classifications:[],assetBuckets:{source:"otw-schedule",target:"luvdia-schedule"},fileOrigins:[{kind:"site",site:"luvdia",origin:"https://other-site.example"}]};
  await db.prepare("INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json) VALUES('normal-resolver','otw','luvdia','otw-db','luvdia-db','otw','otw-db',2,1,'normal-resolver',?)").bind(JSON.stringify(plan)).run();
  await db.prepare("INSERT INTO notices(id,content,image_urls,related_member_uids) VALUES(3,'Selected normal',?,'[1]')").bind(JSON.stringify([protectedRaw,"https://other-site.example/profile/bing_hayu.webp"])).run();
  expect(await (await resolve(external,{kind:"notice",id:2})).json()).toEqual({path:null});
  expect(await (await resolve(external,{kind:"notice-draft",id:2,relatedMemberUids:[2]})).json()).toEqual({path:null});
  for(const context of [{kind:"notice",id:3},{kind:"notice-draft",relatedMemberUids:[]},{kind:"notice-draft",id:2,relatedMemberUids:[2]},{kind:"notice-draft",id:3,relatedMemberUids:[]}]) expect((await resolve(protectedRaw,context)).status).toBe(400);
  expect((await resolve(external,{kind:"notice-draft",relatedMemberUids:[1]})).status).toBe(400);
  expect((await resolve("https://other-site.example/profile/bing_hayu.webp",{kind:"notice",id:3})).status).toBe(400);
  await expect(db.prepare("DELETE FROM asset_file_reference_paths WHERE row_table='notices' AND row_key='[3]'").run()).rejects.toThrow(/index_current_reference/);
  expect((await resolve(protectedRaw,{kind:"notice-draft",relatedMemberUids:[]})).status).toBe(400);
  expect(vi.mocked(fetch).mock.calls.every(([input])=>String(input)===`${issuer}/.well-known/jwks.json`)).toBe(true);
});

it("fix1 resolves archived stored own absolute URLs through the authenticated same-site route with exact row-bound origins",async()=>{
  const key="notices/thumbnails/absolute-archive.webp",own=`https://otw-schedule.info/r2-assets/${key}`;
  await bindings.ASSET_BUCKET!.put(key,"actual archived absolute bytes");
  await db.prepare("UPDATE notices SET image_urls=? WHERE id=1").bind(JSON.stringify([own])).run();
  const resolve=(raw:string,user?:string,env=runtime)=>request(`/api/assets/protected-reference?url=${encodeURIComponent(raw)}`,user,{},env);
  const untouched={...runtime,otw_db:{prepare:()=>{throw new Error("Unauthorized metadata access");}}} as unknown as Env;
  expect((await resolve(own,undefined,untouched)).status).toBe(401);
  expect((await resolve(own,"member",untouched)).status).toBe(403);
  const response=await resolve(own,"archive-admin");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({path:`/r2-assets/${key}`});
  expect((await request(`/r2-assets/${key}`)).status).toBe(401);
  expect(new Uint8Array(await (await request(`/r2-assets/${key}?archive=1`,"archive-admin")).arrayBuffer())).toEqual(new TextEncoder().encode("actual archived absolute bytes"));
  expect(await db.prepare("SELECT image_urls FROM notices WHERE id=1").first("image_urls")).toBe(JSON.stringify([own]));
  const approved="https://approved-source.example",external="https://external.example",cross="https://other-site.example";
  const plan={id:"resolver",sourceSite:"otw",targetSite:"luvdia",sourceResource:"otw-db",targetResource:"luvdia-db",generation:2,protocol:1,manifestDigest:"approved-resolver",members:[{uid:1,targetUid:11,code:"bing_hayu"}],classifications:[],assetBuckets:{source:"otw-schedule",target:"luvdia-schedule"},fileOrigins:[{kind:"r2",site:"otw",resource:"otw-schedule",origin:approved},{kind:"external",origin:external,reason:"Approved external image"},{kind:"site",site:"luvdia",origin:cross}]};
  await db.prepare("INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json) VALUES('resolver','otw','luvdia','otw-db','luvdia-db','otw','otw-db',2,1,'approved-resolver',?)").bind(JSON.stringify(plan)).run();
  const urls=[`${approved}/${key}`,`${external}/profile/bing_hayu.webp`,`${cross}/profile/bing_hayu.webp`];
  await db.prepare("UPDATE notices SET related_member_uids='[1]',image_urls=? WHERE id=1").bind(JSON.stringify(urls)).run();
  expect(await (await resolve(urls[0],"archive-admin")).json()).toEqual({path:`/r2-assets/${key}`});
  expect(await (await resolve(urls[1],"archive-admin")).json()).toEqual({path:null});
  for(const raw of [urls[2],"https://unknown.example/profile/bing_hayu.webp",`${approved}/notices/thumbnails/never-stored.webp`]) expect((await resolve(raw,"archive-admin")).status).toBe(400);
  await db.prepare("UPDATE notices SET related_member_uids='[]' WHERE id=1").run();
  expect((await resolve(urls[0],"archive-admin")).status).toBe(400);
  expect(vi.mocked(fetch).mock.calls.every(([input])=>String(input)===`${issuer}/.well-known/jwks.json`)).toBe(true);
});

it("authorizes archive-only asset bytes before GET HEAD and conditional metadata, preserving shared public bytes", async () => {
  const key = "notices/thumbnails/archive-only.webp";
  const shared = "notices/thumbnails/shared.webp";
  await bindings.ASSET_BUCKET!.put(key, "private-image-bytes");
  await bindings.ASSET_BUCKET!.put(shared, "shared-image-bytes");
  await db.batch([
    db.prepare("UPDATE notices SET image_urls=? WHERE id=1").bind(JSON.stringify([`/r2-assets/${key}`, `/r2-assets/${shared}`])),
    db.prepare("UPDATE notices SET image_urls=? WHERE id=2").bind(JSON.stringify([`/r2-assets/${shared}`])),
  ]);
  for (const path of [`/r2-assets/${key}`, "/profile/bing_hayu.webp", "/profile/signatures/bing_hayu.png", "/profile/%62ing_hayu.webp", "/%70rofile/signatures/bing_hayu.png", "/profile%2Fbing_hayu.webp"]) {
    for (const user of [undefined, "member"]) for (const method of ["GET", "HEAD"]) {
      const response = await request(path, user, { method, headers: { "If-None-Match": "*" } });
      expect(response.status, `${method} ${path} ${user}`).toBe(user ? 403 : 401);
      expect(response.headers.get("ETag")).toBeNull();
      expect(response.headers.get("Last-Modified")).toBeNull();
      expect(await response.text()).not.toContain("image-bytes");
    }
  }
  const admin = await request(`/r2-assets/${key}`, "archive-admin");
  expect(admin.status).toBe(200);
  expect(admin.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await (await admin.blob()).text()).toBe("private-image-bytes");
  const publicImage = await request(`/r2-assets/${shared}`);
  expect(publicImage.status).toBe(200);
  expect(await publicImage.text()).toBe("shared-image-bytes");
  expect((await request("/profile/other.webp")).status).toBe(200);
  for(const path of ["/profile/__artifact.json","/profile/%5F%5Fartifact.json","/%70rofile%2F__artifact.json"]) for(const user of [undefined,"member","archive-admin"]) {
    const response=await request(path,user);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
});

async function catalog() {
  await db.batch([
    db.prepare("UPDATE music_catalog_meta SET revision=7,public_read_enabled=1,updated_at=100 WHERE id=1"),
    db.prepare("UPDATE music_public_read_model_meta SET revision=7 WHERE id=1"),
    db.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,version,created_at,updated_at) VALUES('archived-singer',1,'person','Archived Singer','archived singer','archived-singer',0,100,100),('public-singer',2,'person','Public Singer','public singer','public-singer',0,100,100)"),
    db.prepare("INSERT INTO music_songs(id,title,normalized_title,slug,dedupe_key,is_otw_original,original_release_precision,version,created_at,updated_at) VALUES('shared','Shared Song','shared song','shared-song','shared',0,'unknown',0,100,100),('secret','Archived Song','archived song','archived-song','secret',0,'unknown',0,100,100)"),
    db.prepare("INSERT INTO music_channels(id,provider,external_channel_id,display_name,channel_role,verification_status,active,version,created_at,updated_at) VALUES('channel','youtube','UCcccccccccccccccccccccc','Shared Channel','member_music','approved',1,0,100,100)"),
    ...["archived-performance", "public-performance", "secret-performance"].flatMap((id, index) => [
      db.prepare("INSERT INTO music_performances(id,song_id,dedupe_key,relation_type,release_type,participation_type,publication_status,released_at,version,created_at,updated_at) VALUES(?,?,?,'cover','official_video','solo','published',?,0,100,100)").bind(id, index === 2 ? "secret" : "shared", id, 300-index),
      db.prepare("INSERT INTO music_performance_participants(performance_id,entity_id,participant_role,credit_order,credit_name_snapshot) VALUES(?,?,'vocal',0,?)").bind(id, index === 1 ? "public-singer" : "archived-singer", index === 1 ? "Public Singer" : "Archived Singer"),
      db.prepare("INSERT INTO music_media_sources(id,provider,external_id,channel_id,title,thumbnail_url,availability_status,version,created_at,updated_at) VALUES(?,'youtube',?,'channel',?,?,'playable',0,100,100)").bind(`source-${index}`, `aaaaaaaaaa${index}`, index === 1 ? "Public video" : "Archived video", `https://img.example/${index === 1 ? "public" : "archived"}.jpg`),
      db.prepare("INSERT INTO music_performance_sources(performance_id,source_id,source_role,priority,is_primary,start_seconds) VALUES(?,?,'official',0,1,0)").bind(id, `source-${index}`),
    ]),
    db.prepare("INSERT INTO music_cover_proposals(id,submitted_by_user_id,idempotency_key,submitted_url,youtube_video_id,submitted_title,status,version,created_at,updated_at) VALUES('own-archived','original-submitter','original-key','https://www.youtube.com/watch?v=aaaaaaaaaa0','aaaaaaaaaa0','Archived proposal','pending_review',0,100,100)"),
    db.prepare("INSERT INTO music_cover_proposal_participants(proposal_id,credit_order,resolved_entity_id,submitted_member_uid,submitted_name_snapshot,participant_role) VALUES('own-archived',0,'archived-singer',1,'Archived Singer','vocal')"),
  ]);
  await db.batch([...projectionStatements(db, "shared"), ...projectionStatements(db, "secret")]);
}
async function archiveCatalog() {
  // The persisted policy and source receipt change atomically, as archiveSource does.
  await db.batch([
    db.prepare("UPDATE music_performances SET content_access='admin_archive' WHERE id <> 'public-performance'"),
    db.prepare("UPDATE music_cover_proposals SET content_access='admin_archive'"),
    db.prepare("INSERT INTO content_transitions(id,source_site,target_site,source_resource,target_resource,local_site,local_resource,generation,protocol,manifest_digest,plan_json,phase,archive_receipt_json) VALUES('archived','otw','luvdia','source','target','otw','source',2,1,'digest','{}','complete','{\"boundary\":1,\"archivedRoots\":3}')"),
  ]);
}

it("opens anonymous OTW official music through Worker HTTP while keeping clips and personal lists private", async () => {
  await catalog();
  await db.batch([
    db.prepare("INSERT INTO music_channels(id,provider,external_channel_id,display_name,channel_role,verification_status,active,version,created_at,updated_at) VALUES('clip-channel','youtube','UCkkkkkkkkkkkkkkkkkkkkkk','Clip Channel','approved_kirinuki','approved',1,0,100,100)"),
    db.prepare("UPDATE music_media_sources SET channel_id='clip-channel',duration_seconds=60 WHERE id='source-2'"),
    db.prepare("UPDATE music_performance_sources SET source_role='kirinuki',end_seconds=60 WHERE performance_id='secret-performance'"),
    db.prepare("UPDATE music_performances SET relation_type='singing_clip',release_type='broadcast',broadcast_metadata='{\"performedOn\":null,\"dateEvidence\":null,\"originalUrl\":null,\"extent\":\"full\"}' WHERE id='secret-performance'"),
    ...projectionStatements(db, "secret"),
  ]);
  for (const path of ["/api/play/catalog", "/api/play/songs/shared-song?scope=all", "/api/play/playlists/defaults", "/api/play/performances"]) {
    const response = await request(path);
    expect(response.status, path).toBe(200);
    expect(await response.text(), path).not.toContain("secret-performance");
  }
  expect((await request("/api/play/performances/secret-performance")).status).toBe(404);
  expect((await request("/api/play/performances?scope=broadcast")).status).toBe(403);
  const resolved = await request("/api/play/performances/resolve", undefined, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ performanceIds: ["public-performance", "secret-performance"] }) });
  expect(resolved.status).toBe(200);
  expect(await resolved.json()).toMatchObject({ data: { items: [{ performance: { id: "public-performance" } }], unavailableIds: ["secret-performance"] } });
  expect((await request("/api/play/me/playlists")).status).toBe(401);
  expect((await request("/api/play/performances?scope=broadcast", undefined, { headers: { "X-OTW-Play-Admin-Preview": "1" } })).status).toBe(401);
  const admin = await request("/api/play/performances?scope=broadcast", "archive-admin", { headers: { "X-OTW-Play-Admin-Preview": "1" } });
  expect(admin.status).toBe(200);
  expect(await admin.text()).toContain("secret-performance");
});

it("uses current root access for catalog/detail/search/facets and shared-song ranking", async () => {
  await catalog();
  await archiveCatalog();
  const telemetry = vi.spyOn(console, "warn").mockImplementation(() => {});
  for (const path of ["/api/play/catalog", "/api/play/songs/shared-song", "/api/play/facets", "/api/play/members"]) {
    const response = await request(path, "member");
    expect(response.status, path).toBe(200);
    expect(await response.text(), path).not.toContain("Archived");
  }
  const search = await request("/api/play/catalog?q=archived%20singer", "member");
  expect(await search.text()).not.toContain("shared-song");
  expect((await request("/api/play/performances/archived-performance", "member")).status).toBe(404);
  expect((await request("/api/play/songs/archived-song", "member")).status).toBe(404);
  expect((await new D1PublicCatalogReader(db).readSongBySlug("shared-song"))?.performances.map(p => p.id)).toEqual(["public-performance"]);
  expect(telemetry).toHaveBeenCalledTimes(2);
  for (const [event] of telemetry.mock.calls) expect(event).toMatchObject({ event: "play.catalog.read", status: 404, errorCode: "PLAY_NOT_FOUND" });
});

it("keeps personal playlist references but resolves archived representatives/fallbacks as unavailable", async () => {
  await catalog();
  const saved = await new D1PlaylistRepository(db).create("member", "saved-request", { title: "Personal list", description: "", originDefaultId: null, representativePerformanceId: "archived-performance", performanceIds: ["archived-performance", "public-performance"] });
  await archiveCatalog();
  const response = await request(`/api/play/me/playlists/${saved.id}`, "member");
  expect(response.status).toBe(200);
  const payload = await response.text();
  expect(payload).toContain("public.jpg");
  expect(payload).not.toContain("archived.jpg");
  expect((await db.prepare("SELECT COUNT(*) n FROM music_playlist_items WHERE playlist_id=?").bind(saved.id).first<{n:number}>())?.n).toBe(2);
  const resolve = await request("/api/play/performances/resolve", "member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ performanceIds: ["archived-performance", "public-performance"] }) });
  expect(resolve.status).toBe(200);
  const body = await resolve.json<{ data: { unavailableIds: string[] } }>();
  expect(body.data.unavailableIds).toEqual(["archived-performance"]);
});

it("blocks the original submitter list/detail/withdraw and successful old idempotency replay", async () => {
  const telemetry = vi.spyOn(console, "warn").mockImplementation(() => {});
  await catalog();
  await archiveCatalog();
  const mine = await request("/api/play/submissions/mine", "original-submitter");
  expect(mine.status).toBe(200);
  expect(await mine.text()).not.toContain("Archived");
  expect((await request("/api/play/submissions/own-archived", "original-submitter")).status).toBe(404);
  const withdraw = await request("/api/play/submissions/own-archived/withdraw", "original-submitter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: 0 }) });
  expect(withdraw.status).toBe(404);
  expect((await db.prepare("SELECT status FROM music_cover_proposals WHERE id='own-archived'").first<{status:string}>())?.status).toBe("pending_review");
  await db.prepare("UPDATE music_cover_proposals SET idempotency_key='d3782b7a-aa91-440d-a7a1-57de41a5dafb' WHERE id='own-archived'").run();
  const replay = await request("/api/play/submissions", "original-submitter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: "d3782b7a-aa91-440d-a7a1-57de41a5dafb", youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaa0", title: "Archived proposal", participants: [{ kind: "member", memberUid: 1, participantRole: "vocal" }], originalArtists: [{ kind: "external", displayName: "Original artist" }] }) });
  expect(replay.status).toBe(404);
  const preflight = await request("/api/play/submissions/preflight", "original-submitter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaa0", title: "Archived proposal" }) });
  expect(preflight.status).toBe(404);
  expect(telemetry).toHaveBeenCalledTimes(4);
  for (const [event] of telemetry.mock.calls) expect(event).toMatchObject({ event: "play.request.failed", status: 404, errorCode: "PLAY_SUBMISSION_NOT_FOUND" });
});

it("changes read/cache revision only from local source archive receipts", async () => {
  await catalog();
  const reader = new D1PublicCatalogReader(db);
  const before = await reader.readMeta();
  await archiveCatalog();
  const archived = await reader.readMeta();
  expect(archived.revision).toBeGreaterThan(before.revision);
  expect(archived.readModelRevision).toBe(archived.revision);
  await db.prepare("UPDATE content_transitions SET local_site='luvdia',local_resource='target' WHERE id='archived'").run();
  expect((await reader.readMeta()).revision).toBe(before.revision);
});

it("filters per-post archive roots on a shared feed and removes embedded archived X references", async () => {
  const post = (id: string, text: string) => ({ id, text, username: "public", createdAt: "2026-10-14T00:00:00Z", url: `https://x.com/public/status/${id}`, media: [], links: [], metrics: { likeCount: 0, retweetCount: 0, replyCount: 0, quoteCount: 0 } });
  const hidden = post("101000000000000001", "Archived X secret");
  const visible = { ...post("101000000000000002", "Public X post"), quote: { postId: "101000000000000001", post: hidden }, reply: { postId: "101000000000000001", post: hidden, targetUsername: "archived" }, links: [{ url: hidden.url, title: hidden.text, linkedPost: hidden }] };
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('x_rich_link_preview_enabled','true') ON CONFLICT(key) DO UPDATE SET value='true'"),
    ...[[hidden, "admin_archive"], [visible, "normal"]].map(([value, access]) => db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at,content_access) VALUES(?,'public','public',?,'2026-10-14T00:00:00Z',100,?)").bind((value as typeof hidden).id, JSON.stringify(value), access)),
  ]);
  const response = await request("/api/x/posts?handles=public");
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toContain("Public X post");
  expect(body).not.toContain("Archived X secret");
  expect((await request("/api/x/posts/101000000000000001/context")).status).toBe(404);
});

it("applies Cafe and YouTube root policy even when the provider source is shared", async () => {
  await db.batch([
    db.prepare("INSERT INTO settings(key,value) VALUES('naver_cafe_posts_visibility','public') ON CONFLICT(key) DO UPDATE SET value='public'"),
    db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_url,cafe_id,menu_id,member_uid,enabled) VALUES(1,'Shared Cafe','https://cafe.naver.com/shared','123','1',NULL,1)"),
    db.prepare("INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,title,summary,created_at,url,fetched_at,content_access) VALUES('a',1,1,'Shared Cafe','123','1','Archived Cafe','secret','2026-10-14T00:00:00Z','https://cafe.naver.com/shared/1',100,'admin_archive'),('b',2,1,'Shared Cafe','123','1','Public Cafe','public','2026-10-14T00:00:00Z','https://cafe.naver.com/shared/2',100,'normal')"),
    db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,collection_started_at,created_at,updated_at) VALUES(1,'official',2,'UCbbbbbbbbbbbbbbbbbbbbbb',100,100,100)"),
    db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at,content_access) VALUES('cccccccccc1',1,'Archived YouTube',100,100,'admin_archive'),('cccccccccc2',1,'Public YouTube',100,100,'normal')"),
  ]);
  for (const [path, expected] of [["/api/naver-cafe/posts", "Public Cafe"], ["/api/youtube/videos?channelIds=UCbbbbbbbbbbbbbbbbbbbbbb", "Public YouTube"]]) {
    const response = await request(path);
    expect(response.status, path).toBe(200);
    const body = await response.text();
    expect(body, path).toContain(expected);
    expect(body, path).not.toContain("Archived");
  }
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); clearAuthCachesForTests(); });

it.each(["otw", "luvdia"] as const)("keeps original post ownership on the normal %s feed after source reassignment", async site => {
  await db.prepare("DELETE FROM x_post_facts WHERE post_id='101000000000000077'").run();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT));
  const post = { id: "101000000000000077", text: "Retained selected X", username: "public", createdAt: "2026-10-14T00:00:00Z", url: "https://x.com/public/status/101000000000000077", media: [], links: [], metrics: { likeCount: 0, retweetCount: 0, replyCount: 0, quoteCount: 0 } };
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('naver_cafe_posts_enabled','true'),('naver_cafe_posts_visibility','public')"),
    db.prepare("INSERT INTO naver_cafe_sources(id,name,cafe_url,cafe_id,menu_id,member_uid,enabled) VALUES(1,'Shared Cafe','https://cafe.naver.com/shared','123','1',2,1)"),
    db.prepare("INSERT INTO naver_cafe_posts(id,article_id,source_id,source_name,cafe_id,menu_id,member_uid,title,summary,created_at,url,fetched_at) VALUES('retained-selected',1,1,'Shared Cafe','123','1',1,'Retained selected Cafe','Original selected summary','2026-10-14T00:00:00Z','https://cafe.naver.com/shared/1',100),('remaining',2,1,'Shared Cafe','123','1',2,'Remaining Cafe','Remaining summary','2026-10-14T00:00:00Z','https://cafe.naver.com/shared/2',100)"),
    db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at) VALUES(?,'public','public',?,'2026-10-14T00:00:00Z',100)").bind(post.id, JSON.stringify(post)),
    db.prepare("INSERT INTO x_post_facts(post_id,member_uid,member_name_snapshot,post_type,created_at,first_seen_at,updated_at) VALUES(?,1,'Original selected owner','post',100,100,100)").bind(post.id),
  ]);
  for (const path of ["/api/site-content?path=/feed", "/feed"]) {
    const response = await request(path, undefined, {}, { ...runtime, ...siteEnv(site), SITE_PUBLIC_ORIGIN: origin } as Env);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Remaining Cafe");
    if (site === "otw") { expect(body).not.toContain("Retained selected Cafe"); expect(body).not.toContain("Retained selected X"); }
    else { expect(body).toContain("Retained selected Cafe"); expect(body).toContain("Retained selected X"); }
  }
  expect(await db.prepare("SELECT member_uid FROM naver_cafe_posts WHERE id='retained-selected'").first("member_uid")).toBe(1);
});

it.each(["otw", "luvdia"] as const)("preserves the old selected CHZZK cache on %s when the origin response crosses midnight", async site => {
  clearChzzkServiceCachesForTests();
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT) - 1);
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const key = `vods:${CACHE_POLICY.chzzk.vods.version}:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0:10`;
  const original = JSON.stringify({ data: [], marker: "original body" });
  await db.prepare("INSERT INTO chzzk_api_cache(key,type,value,fetched_at,expires_at,stale_until) VALUES(?,'vods',?,1,2,3)").bind(key, original).run();
  const authFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("https://api.chzzk.naver.com/")) {
      clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
      return Response.json({ content: { data: [], marker: "late new body" } });
    }
    return authFetch(input, init);
  }));
  await request("/api/vods/chzzk?channelIds=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&page=0&size=10", site === "luvdia" ? "archive-admin" : undefined, {}, { ...runtime, ...siteEnv(site), SITE_PUBLIC_ORIGIN: origin } as Env);
  const saved = await db.prepare("SELECT value FROM chzzk_api_cache WHERE key=?").bind(key).first("value");
  if (site === "otw") expect(saved).toBe(original);
  else expect(saved).toContain("late new body");
});

it.each([["otw",false],["luvdia",false],["otw",true],["luvdia",true]] as const)("rechecks member submission POST preflight after %s metadata crosses midnight with unknown video=%s", async (site,unknown) => {
  await catalog();
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT) - (site === "otw" ? 1 : 0));
  const authFetch = globalThis.fetch;
  const videoId=unknown?'BBBBBBBBBBB':'aaaaaaaaaa0';
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("googleapis.com/youtube/v3/videos")) {
      clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
      return Response.json({ items: [{ id: videoId, snippet: { title: "Late selected metadata", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", channelTitle: "Selected channel", thumbnails: { high: { url: "https://example.test/selected.jpg" } } }, contentDetails: { duration: "PT3M" }, status: { privacyStatus: "public", uploadStatus: "processed", embeddable: true } }] });
    }
    return authFetch(input, init);
  }));
  const response = await request("/api/play/submissions/preflight", "ordinary-member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeUrl: `https://youtu.be/${videoId}` }) }, { ...runtime, ...siteEnv(site), SITE_PUBLIC_ORIGIN: origin, YOUTUBE_API_KEY: "test-key" } as Env);
  expect(response.status).toBe(site === "otw" ? 404 : 200);
  if (site === "otw") expect(await response.text()).not.toContain("Late selected metadata");
});

it("hides the four explicitly reviewed OTW D-days only after midnight and keeps administrator originals", async () => {
  await db.batch([4,9,10,11].map(id=>db.prepare("INSERT INTO ddays(id,title,date) VALUES(?,?,'9999-10-19')").bind(id,`Reviewed ${id}`)));
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  expect(await (await request('/api/ddays')).text()).toContain('Reviewed 4');
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  const body=await (await request('/api/ddays')).text();
  for(const id of [4,9,10,11]) expect(body).not.toContain(`Reviewed ${id}`);
  expect(body).toContain('Public day');
  expect(await (await request('/api/ddays?archive=1','archive-admin')).text()).toContain('Reviewed 4');
  expect(await (await request('/api/ddays',undefined,{}, {...runtime,...siteEnv('luvdia'),SITE_PUBLIC_ORIGIN:origin} as Env)).text()).toContain('Reviewed 4');
  expect((await db.prepare('SELECT id FROM ddays WHERE id IN (4,9,10,11)').all()).results).toHaveLength(4);
});

const createPublicationImport=async(repo:D1IngestionRepository,id:string)=>repo.createJob({jobId:id,actorUserId:'archive-admin',input:{playlistUrl:'https://www.youtube.com/playlist?list=PL1234567890',mode:'all_new',idempotencyKey:id},preflight:{playlistId:'PL1234567890',canonicalUrl:'https://www.youtube.com/playlist?list=PL1234567890',title:'Mixed list',ownerChannelId:'UCowner',ownerChannelTitle:'Owner',itemCount:2,privacyStatus:'public',rangeStartPosition:0,rangeEndExclusive:2,nextRangeStart:null,requestedItemCount:2,estimatedPageCount:1,estimatedVideoBatchCount:1,hardCap:5000,requiresSplit:false,previousImport:null},now:Date.now()});

it.each([['otw',false,false],['luvdia',false,false],['otw',true,false],['luvdia',true,false],['otw',true,true],['luvdia',true,true]] as const)('settles mixed %s ingestion with discovery after midnight=%s and existing unclassified=%s',async(site,lateDiscovery,unclassified)=>{
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const repo=new D1IngestionRepository(db,site);
  if(unclassified) {
    const seed=await createPublicationImport(repo,'publication-ingestion-unclassified');
    await repo.recordPlaylistPage(await repo.readMessage(seed.message.idempotencyKey),{items:[{videoId:'PPPPPPPPPP1',position:0,playlistItemId:'unclassified-original'}],nextPageToken:null},Date.now());
  }
  const prior=await db.prepare("SELECT * FROM music_ingestion_candidates WHERE external_video_id='PPPPPPPPPP1'").first();
  const created=await createPublicationImport(repo,'publication-ingestion-late');
  if(lateDiscovery) clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  const [child]=await repo.recordPlaylistPage(await repo.readMessage(created.message.idempotencyKey),{items:['PPPPPPPPPP1','PPPPPPPPPP2'].map((videoId,position)=>({videoId,position,playlistItemId:`mixed-${position}`})),nextPageToken:null},Date.now());
  const original=await db.prepare("SELECT * FROM music_ingestion_candidates WHERE external_video_id='PPPPPPPPPP1'").first();
  if(site==='otw'&&unclassified) expect(original).toEqual(prior);
  const provider=vi.fn(async(input:RequestInfo|URL)=>{
    if(!String(input).includes('googleapis.com/youtube/v3/videos')) throw new Error(`Unexpected ${String(input)}`);
    clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
    return Response.json({items:['PPPPPPPPPP1','PPPPPPPPPP2'].map((id,index)=>({id,snippet:{title:`Late ${index}`,channelId:index?'UCbbbbbbbbbbbbbbbbbbbbbb':'UCaaaaaaaaaaaaaaaaaaaaaa',channelTitle:'Mixed',publishedAt:'2026-10-16T00:00:00Z'},contentDetails:{duration:'PT3M'},status:{privacyStatus:'public',uploadStatus:'processed',embeddable:true}}))});
  });
  vi.stubGlobal('fetch',provider);
  const ack=vi.fn(),retry=vi.fn(),batch={queue:'ordinary-ingestion',messages:[{body:child,ack,retry}]} as unknown as MessageBatch<unknown>;
  const runtimeSite={...runtime,...siteEnv(site),SITE_PUBLIC_ORIGIN:origin,YOUTUBE_API_KEY:'test-key',CLOUDFLARE_D1_TOKEN:undefined} as Env;
  await handleQueue(batch,runtimeSite);
  expect(ack).toHaveBeenCalledOnce(); expect(retry).not.toHaveBeenCalled();
  expect(await db.prepare("SELECT title FROM music_ingestion_candidates WHERE external_video_id='PPPPPPPPPP2'").first('title')).toBe('Late 1');
  if(site==='otw') {
    expect(await db.prepare("SELECT * FROM music_ingestion_candidates WHERE external_video_id='PPPPPPPPPP1'").first()).toEqual(original);
    if(lateDiscovery) expect(await db.prepare("SELECT count(*) AS n FROM music_ingestion_candidate_origins WHERE candidate_id='youtube:PPPPPPPPPP1' AND job_id=?").bind(created.job.id).first('n')).toBe(0);
    expect(await db.prepare('SELECT status,last_error_code FROM music_ingestion_messages WHERE idempotency_key=?').bind(child.idempotencyKey).first()).toEqual({status:'failed',last_error_code:'publication_cutoff'});
    expect((await repo.getJob(created.job.id)).status).toBe('partial');
    const receipt=await db.prepare("SELECT detail_json FROM music_ingestion_events WHERE job_id=? AND event_type='ingestion.response'").bind(created.job.id).all<{detail_json:string}>();
    expect(JSON.stringify(receipt.results)).toContain('Late 0');
  } else expect((await repo.getJob(created.job.id)).status).toBe('completed');
  await handleQueue(batch,runtimeSite); expect(provider).toHaveBeenCalledOnce();
});

it('retains an unidentified unavailable video as an actionable candidate after midnight',async()=>{
  vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT));
  const repo=new D1IngestionRepository(db),created=await createPublicationImport(repo,'publication-ingestion-unavailable');
  const [child]=await repo.recordPlaylistPage(await repo.readMessage(created.message.idempotencyKey),{items:[{videoId:'PPPPPPPPPP2',position:0,playlistItemId:'unavailable-original'}],nextPageToken:null},Date.now());
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({items:[]})));
  const ack=vi.fn(),retry=vi.fn();await handleQueue({queue:'ordinary-ingestion',messages:[{body:child,ack,retry}]} as unknown as MessageBatch<unknown>,{...runtime,YOUTUBE_API_KEY:'test-key',CLOUDFLARE_D1_TOKEN:undefined} as Env);
  expect(ack).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled();
  expect(await db.prepare("SELECT title,status,classification,availability_status FROM music_ingestion_candidates WHERE external_video_id='PPPPPPPPPP2'").first()).toMatchObject({title:null,status:'blocked',classification:'unavailable'});
  expect(await db.prepare("SELECT count(*) n FROM music_ingestion_candidate_origins WHERE job_id=?").bind(created.job.id).first('n')).toBe(1);
  expect((await repo.listItems(created.job.id,50,null,{})).page.items).toHaveLength(1);
});

it('omits already-known selected IDs from a new Queue provider request after midnight',async()=>{
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const repo=new D1IngestionRepository(db),seed=await createPublicationImport(repo,'publication-ingestion-seed');
  const page={items:['PPPPPPPPPP1','PPPPPPPPPP2'].map((videoId,position)=>({videoId,position,playlistItemId:`known-${position}`})),nextPageToken:null};
  const [seedChild]=await repo.recordPlaylistPage(await repo.readMessage(seed.message.idempotencyKey),page,Date.now());
  await repo.recordVideoBatch(await repo.readMessage(seedChild.idempotencyKey),page.items.map((item,index)=>({videoId:item.videoId,availabilityStatus:'playable',video:{videoId:item.videoId,title:'Original',channelId:index?'UCbbbbbbbbbbbbbbbbbbbbbb':'UCaaaaaaaaaaaaaaaaaaaaaa',channelTitle:'Known',durationSeconds:180,thumbnailUrl:null,publishedAt:1,availabilityStatus:'playable'}})),Date.now());
  const next=await createPublicationImport(repo,'publication-ingestion-queued'),[child]=await repo.recordPlaylistPage(await repo.readMessage(next.message.idempotencyKey),page,Date.now());
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  const provider=vi.fn(async(input:RequestInfo|URL)=>{const ids=new URL(String(input)).searchParams.get('id');expect(ids).toBe('PPPPPPPPPP2');return Response.json({items:[]});});vi.stubGlobal('fetch',provider);
  const ack=vi.fn(),retry=vi.fn();await handleQueue({queue:'ordinary-ingestion',messages:[{body:child,ack,retry}]} as unknown as MessageBatch<unknown>,{...runtime,YOUTUBE_API_KEY:'test-key',CLOUDFLARE_D1_TOKEN:undefined} as Env);
  expect(ack).toHaveBeenCalledOnce();expect(retry).not.toHaveBeenCalled();expect(provider).toHaveBeenCalledOnce();
  expect(await db.prepare('SELECT last_error_code FROM music_ingestion_messages WHERE idempotency_key=?').bind(child.idempotencyKey).first('last_error_code')).toBe('publication_cutoff');
  expect(await repo.retryJob({jobId:next.job.id,actorUserId:'archive-admin',eventId:'publication-retry',now:Date.now()})).toEqual([]);
});

it('keeps ordinary administrator refresh working while refusing selected collection and retaining a late response',async()=>{
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const repo=new D1IngestionRepository(db),seed=await createPublicationImport(repo,'publication-ingestion-refresh');
  await repo.recordPlaylistPage(await repo.readMessage(seed.message.idempotencyKey),{items:['PPPPPPPPPP1','PPPPPPPPPP2'].map((videoId,position)=>({videoId,position,playlistItemId:`refresh-${position}`})),nextPageToken:null},Date.now());
  const authFetch=globalThis.fetch;let gets=0;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(!String(input).includes('googleapis.com/youtube/v3/videos'))return authFetch(input,init);
    gets++;clock.mockReturnValue(Date.parse(SITE_OPENS_AT));const id=new URL(String(input)).searchParams.get('id')!;
    return Response.json({items:[{id,snippet:{title:'Refreshed',channelId:id.endsWith('1')?'UCaaaaaaaaaaaaaaaaaaaaaa':'UCbbbbbbbbbbbbbbbbbbbbbb',channelTitle:'Fresh'},contentDetails:{duration:'PT3M'},status:{privacyStatus:'public',uploadStatus:'processed',embeddable:true}}]});
  }));
  const refresh=(id:string)=>request(`/api/play/admin/import-candidates/${encodeURIComponent(`youtube:${id}`)}`,'archive-admin',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refresh_metadata',expectedVersion:0})},{...runtime,YOUTUBE_API_KEY:'test-key'} as Env);
  const late=await refresh('PPPPPPPPPP1');expect(late.status,await late.clone().text()).toBe(422);
  expect(await db.prepare("SELECT title FROM music_ingestion_candidates WHERE external_video_id='PPPPPPPPPP1'").first('title')).toBeNull();
  expect(await db.prepare("SELECT detail_json FROM music_ingestion_events WHERE candidate_id='youtube:PPPPPPPPPP1' AND event_type='candidate.metadata_response'").first('detail_json')).toContain('Refreshed');
  const normal=await refresh('PPPPPPPPPP2');expect(normal.status,await normal.clone().text()).toBe(200);expect(gets).toBe(2);
  await db.prepare("UPDATE music_ingestion_candidates SET channel_id='UCaaaaaaaaaaaaaaaaaaaaaa' WHERE external_video_id='PPPPPPPPPP1'").run();
  expect((await refresh('PPPPPPPPPP1')).status).toBe(422);expect(gets).toBe(2);
});

it('refuses new administrator AI collection before known metadata and after a first-seen selected channel',async()=>{
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const repo=new D1IngestionRepository(db),seed=await createPublicationImport(repo,'publication-ingestion-ai');
  await repo.recordPlaylistPage(await repo.readMessage(seed.message.idempotencyKey),{items:[{videoId:'PPPPPPPPPP1',position:0,playlistItemId:'ai-input'}],nextPageToken:null},Date.now());
  await db.prepare("UPDATE music_ingestion_candidates SET channel_id='UCaaaaaaaaaaaaaaaaaaaaaa' WHERE external_video_id='PPPPPPPPPP1'").run();
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  const authFetch=globalThis.fetch;let gets=0;const send=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(!String(input).includes('googleapis.com/youtube/v3/videos')) return authFetch(input,init);
    gets++;return Response.json({items:[{id:'PPPPPPPPPP2',snippet:{title:'Selected first-seen',channelId:'UCaaaaaaaaaaaaaaaaaaaaaa',channelTitle:'Selected'},contentDetails:{duration:'PT3M'},status:{privacyStatus:'public',uploadStatus:'processed',embeddable:true}}]});
  }));
  const aiRuntime={...runtime,YOUTUBE_API_KEY:'test-key',GEMINI_API_KEY:'test-key',OTW_PLAY_AI_REVIEW_ENABLED:'true',OTW_PLAY_AI_REVIEW_QUEUE:{send}} as unknown as Env;
  const start=(target:unknown,id:string)=>request('/api/play/admin/ai-reviews','archive-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,range:null,idempotencyKey:id})},aiRuntime);
  const known=await start({candidateId:'youtube:PPPPPPPPPP1'},'publication-ai-known');expect(known.status,await known.clone().text()).toBe(403);expect(gets).toBe(0);
  const unknown=await start({youtubeUrl:'https://youtu.be/PPPPPPPPPP2',candidateKind:'official_video'},'publication-ai-url');expect(unknown.status,await unknown.clone().text()).toBe(403);expect(gets).toBe(1);
  expect(send).not.toHaveBeenCalled();expect(await db.prepare("SELECT count(*) n FROM music_ai_review_requests WHERE request_key LIKE 'archive-admin:publication-ai-%'").first('n')).toBe(0);
});

const cutoffReview = (id: string): AiReviewRecord => ({
  id, candidateId: null, videoId: "BBBBBBBBBBB", candidateKind: "official_video", range: null,
  targetKey: id, inputHash: id, model: "test-model", status: "queued", result: null, usage: null,
  attempts: 0, leaseToken: null, errorCode: null, errorMessage: null, retryable: false, nextRetryAt: null,
  createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + 86400000,
  input: { promptVersion: "4", video: { videoId: "BBBBBBBBBBB", title: "Original selected input", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", channelTitle: "Selected", thumbnailUrl: null, durationSeconds: 180, publishedAt: 1, availabilityStatus: "playable" }, range: null, candidateKind: "official_video", members: [] },
});

it.each(['otw','luvdia'] as const)('guards %s administrator channel lookup and final catalog writes without blocking another member',async site=>{
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  const repo=new D1AdminCatalogRepository(db,site);
  const actor={userId:'archive-admin',displayName:'Admin',ipAddress:null};
  const selected={externalChannelId:'UCaaaaaaaaaaaaaaaaaaaaaa',displayName:'Selected',channelRole:'member_music' as const,entityIds:[]};
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  const create=()=>repo.createChannel(selected,actor,{channelId:'publication-selected-channel',eventId:'publication-selected-channel-event'},Date.now());
  if(site==='otw') {
    await expect(create()).rejects.toMatchObject({code:'validation_failed',fields:{policy:'publication_cutoff'}});
    expect(await db.prepare("SELECT id FROM music_channels WHERE id='publication-selected-channel'").first()).toBeNull();
    expect(await db.prepare("SELECT id FROM music_catalog_events WHERE id='publication-selected-channel-event'").first()).toBeNull();
  } else expect((await create()).data.externalChannelId).toBe(selected.externalChannelId);
  const authFetch=globalThis.fetch;let gets=0;
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(!String(input).includes('googleapis.com/youtube/v3/channels')) return authFetch(input,init);
    gets++;const channelId=new URL(String(input)).searchParams.get('id');return Response.json({items:[{id:channelId,snippet:{title:'Visible channel'}}]});
  }));
  const current={...runtime,...siteEnv(site),SITE_PUBLIC_ORIGIN:origin,YOUTUBE_API_KEY:'test-key'} as Env;
  const selectedResponse=await request(`/api/play/admin/channels/lookup?externalChannelId=${selected.externalChannelId}`,'archive-admin',{},current);
  expect(selectedResponse.status).toBe(site==='otw'?422:200);expect(gets).toBe(site==='otw'?0:1);
  expect((await request('/api/play/admin/channels/lookup?externalChannelId=UCbbbbbbbbbbbbbbbbbbbbbb','archive-admin',{},current)).status).toBe(200);
  expect(gets).toBe(site==='otw'?1:2);
});

it('retains an issued AI result across midnight without collecting new broadcast evidence for the selected parent',async()=>{
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1);
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const repo=new D1AiReviewRepository(db),record=cutoffReview('publication-ai-late-source');
  await repo.create(record,record.id,record.id,false,Date.now());
  const read=vi.fn(),analyze=vi.fn(async()=>{
    clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
    return {result:{videoAnalyzed:true,warnings:[],songs:[{values:{title:'Retained analysis',originalUrl:'https://youtu.be/CCCCCCCCCCC'},evidence:{},warnings:[]}]},usage:null};
  });
  const service=new AiReviewService(repo,{readVideo:vi.fn(),readChannel:vi.fn()}, {analyze},new D1AiReviewContext(db),{send:async()=>{}},{enabled:true,model:'test-model',dailyLimit:500},async value=>value,()=>crypto.randomUUID(),()=>Date.now(),{read});
  await service.process(record.id);
  expect(analyze).toHaveBeenCalledTimes(1);expect(read).not.toHaveBeenCalled();
  const stored=await repo.get(record.id);expect(stored).toMatchObject({status:'succeeded',input:record.input,result:{videoAnalyzed:true,songs:[{values:{title:'Retained analysis'}}]}});
  expect(stored!.result!.songs[0].values.originalUrl).toBeUndefined();
  expect(stored!.result!.songs[0].warnings).toHaveLength(1);
});

it('cannot erase selected channel ownership or create its own shared-source exception inside a catalog batch',async()=>{
  await catalog();await db.batch([
    db.prepare("UPDATE members SET content_access='normal',youtube_channel_id=NULL WHERE uid=1"),
    db.prepare("INSERT INTO music_channel_entities(channel_id,entity_id) VALUES('channel','archived-singer')"),
  ]);
  vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT));
  const repo=new D1AdminCatalogRepository(db),actor={userId:'archive-admin',displayName:'Admin',ipAddress:null};
  await expect(repo.updateChannel({id:'channel',externalChannelId:'UCcccccccccccccccccccccc',displayName:'Changed',channelRole:'member_music',verificationStatus:'approved',active:true,entityIds:['public-singer'],expectedVersion:0},actor,'publication-channel-change',Date.now())).rejects.toMatchObject({code:'validation_failed',fields:{policy:'publication_cutoff'}});
  expect((await db.prepare("SELECT entity_id FROM music_channel_entities WHERE channel_id='channel'").all()).results).toEqual([{entity_id:'archived-singer'}]);
  await db.prepare("DELETE FROM music_channel_entities WHERE channel_id='channel'").run();
  const source={youtubeUrl:'https://youtu.be/aaaaaaaaaa0',channelId:'channel',startSeconds:0,sourceRole:'official' as const,priority:0,isPrimary:true};
  await expect(repo.createPerformance({input:{songId:'shared',relationType:'cover',releaseType:'official_video',participationType:'solo',qualityStatus:'ok',releasedAt:Date.now(),participants:[{entityId:'public-singer',participantRole:'vocal',creditOrder:0,creditNameSnapshot:'Public Singer'}],sources:[source]},sources:[{input:source,video:{videoId:'aaaaaaaaaa0',channelId:'UCcccccccccccccccccccccc',channelTitle:'Channel',title:'Late metadata',thumbnailUrl:null,durationSeconds:180,publishedAt:1,availabilityStatus:'playable'},sourceId:'publication-source'}],actor,now:Date.now(),ids:{performanceId:'publication-performance',eventId:'publication-performance-event'}})).rejects.toMatchObject({code:'validation_failed',fields:{policy:'publication_cutoff'}});
  expect(await db.prepare("SELECT id FROM music_performances WHERE id='publication-performance'").first()).toBeNull();
});

it('rejects a stale selected channel-monitor creation atomically after midnight',async()=>{
  await catalog();await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("UPDATE music_channels SET channel_role='approved_kirinuki' WHERE id='channel'"),
    db.prepare("INSERT INTO music_channel_entities(channel_id,entity_id) VALUES('channel','archived-singer')"),
  ]);
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT)-1),repo=new D1ChannelMonitorRepository(db,'otw');
  const channel=(await repo.findApprovableChannel('UCcccccccccccccccccccccc'))!;
  expect(channel).not.toBeNull();clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect(await repo.findApprovableChannel(channel.externalChannelId)).toBeNull();
  await expect(repo.create({id:'publication-monitor',channel,uploadsPlaylistId:'UUcccccccccccccccccccccc',lastSeenVideoId:null,actorUserId:'archive-admin',eventId:'publication-monitor-event',approvalEventId:'publication-monitor-approval',now:Date.now(),approval:{scope:'candidate_collection',operatorReference:'operator',approvalReference:'approved',revocationProcedure:'revoke',confirmed:true}})).rejects.toMatchObject({code:'validation_failed',fields:{policy:'publication_cutoff'}});
  expect(await db.prepare("SELECT id FROM music_channel_upload_monitors WHERE id='publication-monitor'").first()).toBeNull();
  expect(await db.prepare("SELECT channel_id FROM music_channel_automation_approvals WHERE channel_id='channel'").first()).toBeNull();
});

it("refuses selected queued AI without spending an attempt while retaining the original input", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT) - 1);
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const repo = new D1AiReviewRepository(db), record = cutoffReview("publication-ai-queued");
  await repo.create(record, record.id, record.id, false, Date.now());
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  expect(await repo.claim(record.id, "publication-claim", Date.now(), 500)).toBeNull();
  expect(await repo.get(record.id)).toMatchObject({ status: "failed", errorCode: "publication_cutoff", attempts: 0, input: record.input });
});

it('allows independent LuvDia and shared-owner AI collection after midnight',async()=>{
  vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT));
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const luv=new D1AiReviewRepository(db,'luvdia'),record=cutoffReview('publication-ai-luv');
  await luv.create(record,record.id,record.id,false,Date.now());expect(await luv.claim(record.id,'luv-lease',Date.now(),500)).not.toBeNull();await luv.finish(record.id,'luv-lease',{videoAnalyzed:true,warnings:[],songs:[]},null,null,Date.now());
  const otw=new D1AiReviewRepository(db);
  await db.prepare("INSERT INTO member_links(member_uid,type,label,url,youtube_channel_id,enabled) VALUES(2,'youtube_sub','Disabled shared','https://youtube.com/shared','UCaaaaaaaaaaaaaaaaaaaaaa',0)").run();
  await expect(otw.assertCollectionAllowed(null,record.videoId,record.input!.video.channelId)).rejects.toMatchObject({code:'publication_cutoff'});
  await db.prepare("UPDATE member_links SET enabled=1 WHERE member_uid=2").run();
  await expect(otw.assertCollectionAllowed(null,record.videoId,record.input!.video.channelId)).resolves.toBeUndefined();
  await db.prepare("UPDATE members SET youtube_channel_id='UCaaaaaaaaaaaaaaaaaaaaaa' WHERE uid=2").run();
  const shared=cutoffReview('publication-ai-shared');await otw.create(shared,shared.id,shared.id,false,Date.now());expect(await otw.claim(shared.id,'shared-lease',Date.now(),500)).not.toBeNull();
});

it.each([
  ['selected only', null, null, true],
  ['shared main channel', 'main', null, false],
  ['shared enabled link', 'link', null, false],
  ['shared supplemental link', 'sub', null, false],
  ['shared catalog owner', 'catalog', null, false],
  ['disabled shared link', 'link', "UPDATE member_links SET enabled=0 WHERE member_uid=2", true],
  ['archived shared owner', 'main', "UPDATE members SET content_access='admin_archive' WHERE uid=2", true],
  ['deprecated shared owner', 'main', 'UPDATE members SET is_deprecated=1 WHERE uid=2', true],
  ['archived shared entity', 'catalog', "UPDATE music_entities SET archived_at=100 WHERE member_uid=2", true],
  ['unapproved shared channel', 'catalog', "UPDATE music_channels SET verification_status='pending',active=0 WHERE id='publication-shared-channel'", true],
  ['inactive shared channel', 'catalog', "UPDATE music_channels SET active=0 WHERE id='publication-shared-channel'", true],
] as const)('uses the same publication ownership for %s candidates, monitors and feed rows', async (_name, sharedOwner, invalidate, hidden) => {
  const now=Date.parse(SITE_OPENS_AT);
  vi.spyOn(Date,'now').mockReturnValue(now);
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("INSERT INTO music_entities(id,member_uid,entity_kind,display_name,normalized_name,slug,version,created_at,updated_at) VALUES('publication-selected-owner',1,'person','Selected','selected','publication-selected-owner',0,100,100),('publication-shared-owner',2,'person','Remaining','remaining','publication-shared-owner',0,100,100)"),
    db.prepare("INSERT INTO music_channels(id,provider,external_channel_id,display_name,channel_role,verification_status,active,version,created_at,updated_at) VALUES('publication-shared-channel','youtube','UCaaaaaaaaaaaaaaaaaaaaaa','Shared','approved_kirinuki','approved',1,0,100,100),('publication-unrelated-channel','youtube','UCbbbbbbbbbbbbbbbbbbbbbb','Unrelated','approved_kirinuki','approved',1,0,100,100)"),
    db.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,channel_id,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at) VALUES('youtube:PPPPPPPPPP1','PPPPPPPPPP1','UCaaaaaaaaaaaaaaaaaaaaaa',100,100,9999999999999,100,100),('youtube:PPPPPPPPPP2','PPPPPPPPPP2','UCbbbbbbbbbbbbbbbbbbbbbb',100,100,9999999999999,100,100)"),
    db.prepare("INSERT INTO music_channel_automation_approvals(channel_id,scope,status,operator_reference,approval_reference,revocation_procedure,approved_by_user_id,approved_at,created_at,updated_at) VALUES('publication-shared-channel','candidate_collection','approved','operator','approval','pause','archive-admin',100,100,100)"),
    db.prepare("INSERT INTO music_channel_upload_monitors(id,channel_id,uploads_playlist_id,next_check_at,created_by_user_id,created_at,updated_at) VALUES('publication-shared-monitor','publication-shared-channel','UUaaaaaaaaaaaaaaaaaaaaaa',100,'archive-admin',100,100)"),
    db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,collection_started_at,initialization_completed_at,next_check_at,backfill_exhausted_at,created_at,updated_at) VALUES(1,'official',1,'UCaaaaaaaaaaaaaaaaaaaaaa',100,100,?,100,100,100),(2,'official',2,'UCbbbbbbbbbbbbbbbbbbbbbb',100,100,?,100,100,100)").bind(now+86400000,now+86400000),
    db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at) VALUES('PPPPPPPPPP1',1,'Shared feed',100,?)").bind(now),
  ]);
  if(sharedOwner==='main') await db.prepare("UPDATE members SET youtube_channel_id='UCaaaaaaaaaaaaaaaaaaaaaa' WHERE uid=2").run();
  else if(sharedOwner==='link'||sharedOwner==='sub') await db.prepare("INSERT INTO member_links(member_uid,type,label,url,youtube_channel_id,enabled) VALUES(2,?,'Shared','https://youtube.com/shared','UCaaaaaaaaaaaaaaaaaaaaaa',1)").bind(sharedOwner==='link'?'youtube_vod':'youtube_sub').run();
  else if(sharedOwner==='catalog') await db.prepare("INSERT INTO music_channel_entities(channel_id,entity_id) VALUES('publication-shared-channel','publication-selected-owner'),('publication-shared-channel','publication-shared-owner')").run();
  if(invalidate) await db.prepare(invalidate).run();

  const channels=(await db.prepare(`SELECT ch.id FROM music_channels ch WHERE ${publicationHiddenSql('music_channels','ch','otw')} ORDER BY ch.id`).all<{id:string}>()).results.map(row=>row.id);
  expect(channels).toEqual(hidden?['publication-shared-channel']:[]);
  const candidates=(await db.prepare(`SELECT candidate.id FROM music_ingestion_candidates candidate WHERE ${publicationHiddenSql('music_ingestion_candidates','candidate','otw')} ORDER BY candidate.id`).all<{id:string}>()).results.map(row=>row.id);
  expect(candidates).toEqual(hidden?['youtube:PPPPPPPPPP1']:[]);
  for(const [table,alias] of [['youtube_feed_sources','source'],['youtube_feed_videos','video']] as const) {
    expect(Boolean(await db.prepare(`SELECT 1 FROM ${table} ${alias} WHERE ${publicationHiddenSql(table,alias,'otw')}`).first())).toBe(hidden);
    expect(await db.prepare(`SELECT 1 FROM ${table} ${alias} WHERE ${publicationHiddenSql(table,alias,'luvdia')}`).first()).toBeNull();
  }
  expect(await db.prepare('SELECT member_uid FROM youtube_feed_sources WHERE id=1').first('member_uid')).toBe(1);
  const ai=new D1AiReviewRepository(db,'otw');
  const collection=ai.assertCollectionAllowed('youtube:PPPPPPPPPP1','PPPPPPPPPP1','UCaaaaaaaaaaaaaaaaaaaaaa');
  if(hidden) await expect(collection).rejects.toMatchObject({code:'publication_cutoff'});
  else await expect(collection).resolves.toBeUndefined();
  const monitor=new D1ChannelMonitorRepository(db,'otw');
  expect(await monitor.listDueIds(now,10)).toEqual(hidden?[]:['publication-shared-monitor']);
  if(!hidden) expect(await monitor.claim('publication-shared-monitor',now)).not.toBeNull();

  if(sharedOwner&&!invalidate) {
    // Fix only the SQL clock input; the normal registry still performs its real D1 upsert.
    const timed=new Proxy(db,{get(target,property){
      if(property==='prepare') return (sql:string)=>target.prepare(sql.replaceAll('unixepoch()',String(now/1000)));
      const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
    }});
    const result=await runScheduledYouTubeFeedCollection({...runtime,otw_db:timed,YOUTUBE_API_KEY:'test-key'});
    expect(result.failed).toBe(0);
    expect(await db.prepare('SELECT member_uid FROM youtube_feed_sources WHERE id=1').first('member_uid')).toBe(sharedOwner==='main'||sharedOwner==='link'?2:1);
    expect(await db.prepare("SELECT source_id FROM youtube_feed_videos WHERE video_id='PPPPPPPPPP1'").first('source_id')).toBe(1);
  }
});

it.each(['linked performance','review member'] as const)('retains direct candidate hiding through its %s on a legitimate shared channel', async direct => {
  await catalog();
  vi.spyOn(Date,'now').mockReturnValue(Date.parse(SITE_OPENS_AT));
  await db.batch([
    db.prepare("UPDATE members SET content_access='normal' WHERE uid=1"),
    db.prepare("UPDATE members SET youtube_channel_id='UCaaaaaaaaaaaaaaaaaaaaaa' WHERE uid=2"),
    db.prepare("INSERT INTO music_ingestion_candidates(id,external_video_id,channel_id,linked_performance_id,review_input_json,first_discovered_at,last_discovered_at,retention_expires_at,created_at,updated_at) VALUES('youtube:PPPPPPPPPP1','PPPPPPPPPP1','UCaaaaaaaaaaaaaaaaaaaaaa',?,?,100,100,9999999999999,100,100)").bind(direct==='linked performance'?'archived-performance':null,direct==='review member'?JSON.stringify({participants:[{subject:{kind:'member',memberUid:1}}]}):null),
  ]);
  expect(await db.prepare(`SELECT 1 FROM music_ingestion_candidates candidate WHERE ${publicationHiddenSql('music_ingestion_candidates','candidate','otw')}`).first()).not.toBeNull();
  await expect(new D1AiReviewRepository(db,'otw').assertCollectionAllowed('youtube:PPPPPPPPPP1','PPPPPPPPPP1','UCaaaaaaaaaaaaaaaaaaaaaa')).rejects.toMatchObject({code:'publication_cutoff'});
});

it("refuses an unissued AI lease crossing midnight but preserves an already issued original response", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse(SITE_OPENS_AT) - 1);
  await db.prepare("UPDATE members SET content_access='normal' WHERE uid=1").run();
  const repo = new D1AiReviewRepository(db), record = cutoffReview("publication-ai-unissued");
  await repo.create(record, record.id, record.id, false, Date.now());
  expect(await repo.claim(record.id, "publication-unissued", Date.now(), 500)).not.toBeNull();
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  await expect(repo.beginRequest(record.id, "publication-unissued", Date.now())).rejects.toMatchObject({ code: "publication_cutoff" });
  expect(await repo.get(record.id)).toMatchObject({ status: "failed", errorCode: "publication_cutoff", input: record.input });
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT) - 1);
  const issued = cutoffReview("publication-ai-issued");
  await repo.create(issued, issued.id, issued.id, false, Date.now());
  expect(await repo.claim(issued.id, "publication-issued", Date.now(), 500)).not.toBeNull();
  await repo.beginRequest(issued.id, "publication-issued", Date.now());
  clock.mockReturnValue(Date.parse(SITE_OPENS_AT));
  const result = { videoAnalyzed: true, warnings: [], songs: [] };
  await repo.finish(issued.id, "publication-issued", result, null, null, Date.now());
  expect(await repo.get(issued.id)).toMatchObject({ status: "succeeded", result, errorCode: null, input: issued.input });
});

it.each([undefined, "member", "original-submitter"])("hides every independent board root and direct profile for %s", async user => {
  for (const path of ["/api/members", "/api/schedule-board?startDate=2026-10-14&endDate=2026-10-14", "/api/schedules?date=2026-10-14", "/api/notices", "/api/ddays"]) {
    const response = await request(path, user);
    expect(response.status, path).toBe(200);
    const body = await response.text();
    expect(body, path).not.toContain("Archived");
    expect(body, path).toContain("Public");
  }
  expect((await request("/api/members/bing_hayu", user)).status).toBe(404);
  expect((await db.prepare("SELECT title FROM schedules WHERE id=1").first<{title:string}>())?.title).toBe("Archived schedule");
});

it("requires real admin authentication for archive navigation and preserves root access in admin DTOs", async () => {
  expect((await request("/api/members?archive=1")).status).toBe(401);
  expect((await request("/api/members?archive=1", "member")).status).toBe(403);
  for (const path of ["/api/members?archive=1", "/api/schedule-board?startDate=2026-10-14&endDate=2026-10-14&archive=1", "/api/notices?includeInactive=1", "/api/ddays?archive=1"]) {
    const response = await request(path, "archive-admin");
    expect(response.status, path).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("Archived");
    expect(body).toContain("admin_archive");
  }
});

it("rejects direct archived channel IDs before provider/cache access", async () => {
  for (const path of ["/api/live-status?channelIds=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "/api/youtube/videos?channelIds=UCaaaaaaaaaaaaaaaaaaaaaa", "/api/x/posts?handles=archived"]) {
    const response = await request(path);
    expect([400, 403], `${path}: ${await response.clone().text()}`).toContain(response.status);
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("checks current archive policy before a pre-archive live snapshot cache hit", async () => {
  const key = new Request(`${origin}/api/live-status?channelIds=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&responseVersion=2`);
  await caches.default.put(key, Response.json({ items: [{ channelId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", content: { liveTitle: "Archived cached live" } }] }, { headers: { "Cache-Control": "public,max-age=45" } }));
  const response = await request("/api/live-status?channelIds=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("Archived cached live");
  expect(fetch).not.toHaveBeenCalled();
});

it("exposes explicit source-local archive access in the authenticated admin catalog and proposal inbox", async () => {
  await catalog(); await archiveCatalog();
  for (const path of ["/api/play/admin/catalog", "/api/play/admin/submissions"]) {
    const response = await request(path, "archive-admin");
    expect(response.status, path).toBe(200);
    expect(await response.text()).toContain('"contentAccess":"admin_archive"');
  }
});

it("revalidates cached same-site schedule HTML, bootstrap, JSON-LD, profiles and sitemap after the source receipt", async () => {
  await catalog();
  await db.batch(["members", "schedules", "notices", "ddays"].map(table => db.prepare(`UPDATE ${table} SET content_access='normal'`)));
  const path = "/api/site-content?path=/&date=2026-10-14";
  expect(await (await request(path)).text()).toContain("Archived Person");
  expect(await (await request("/?date=2026-10-14")).text()).toContain("Archived Person");
  await db.batch(["members", "schedules", "notices", "ddays"].map(table => db.prepare(`UPDATE ${table} SET content_access='admin_archive' WHERE ${table === "members" ? "uid" : "id"}=1`)));
  await archiveCatalog();
  for (const route of [path, "/?date=2026-10-14", "/weekly?date=2026-10-14", "/sitemap.xml"]) {
    const response = await request(route);
    expect(response.status, route).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = await response.text();
    expect(text, route).not.toContain("Archived");
    expect(text, route).not.toContain("bing_hayu");
  }
  for (const method of ["GET", "HEAD"]) {
    const response = await request("/profile/bing_hayu", undefined, { method });
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("Archived Person");
  }
});

it("keeps legitimate shared curated artwork but hides it and preflight metadata for a known archived feed video", async () => {
  const telemetry = vi.spyOn(console, "warn").mockImplementation(() => {});
  await catalog();
  const reader = new D1PublicCatalogReader(db);
  expect((await request("/api/play/submissions/preflight", "member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeUrl: "https://www.youtube.com/watch?v=PFcPopYxft4", title: "Public title" }) })).status).toBe(200);
  expect((await reader.readPlaylistDefaults()).find(row => row.id === "original")?.imageUrl).toContain("PFcPopYxft4");
  await db.batch([
    db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,collection_started_at,created_at,updated_at) VALUES(1,'official',1,'UCaaaaaaaaaaaaaaaaaaaaaa',100,100,100)"),
    db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at,content_access) VALUES('PFcPopYxft4',1,'Archived curated artwork',100,100,'admin_archive')"),
  ]);
  expect((await reader.readPlaylistDefaults()).find(row => row.id === "original")?.imageUrl ?? "").not.toContain("PFcPopYxft4");
  const response = await request("/api/play/submissions/preflight", "member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeUrl: "https://www.youtube.com/watch?v=PFcPopYxft4" }) });
  expect(response.status).toBe(404);
  expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).endsWith("/.well-known/jwks.json"))).toBe(true);
  await db.prepare("UPDATE music_media_sources SET external_id='PFcPopYxft4' WHERE id='source-1'").run();
  expect((await reader.readPlaylistDefaults()).find(row => row.id === "original")?.imageUrl).toContain("PFcPopYxft4");
  expect(telemetry).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ event: "play.request.failed", status: 404, errorCode: "PLAY_SUBMISSION_NOT_FOUND" }));
});

it.each([false, true])("validates short Korean contains origins with dense=%s", async dense => {
  await catalog();
  await db.prepare("UPDATE music_entities SET normalized_name='빙하유',display_name='빙하유' WHERE id='archived-singer'").run();
  await db.prepare("UPDATE music_entities SET normalized_name='정상가수',display_name='정상가수' WHERE id='public-singer'").run();
  await db.batch([...projectionStatements(db, "shared"), ...projectionStatements(db, "secret")]);
  if (dense) {
    // Real indexed matching songs cross the dense planner threshold.
    for (let i = 0; i < 257; i++) {
      await db.batch([
        db.prepare("INSERT INTO music_songs(id,title,normalized_title,slug,dedupe_key,is_otw_original,original_release_precision,version,created_at,updated_at) VALUES(?, '앞빙하유뒤', '앞빙하유뒤', ?, ?,0,'unknown',0,100,100)").bind(`dense-${i}`,`dense-${i}`,`dense-${i}`),
        ...projectionStatements(db, `dense-${i}`),
      ]);
    }
  }
  await archiveCatalog();
  for (const sort of ["recent", "title", "participant"]) for (const term of ["하유", "빙하유"]) {
    const response = await request(`/api/play/catalog?q=${encodeURIComponent(term)}&sort=${sort}`, "member");
    expect(response.status).toBe(200);
    const payload = await response.text();
    expect(payload, term).not.toContain("shared-song");
  }
  const visible = await request(`/api/play/catalog?q=${encodeURIComponent("상가수")}`, "member");
  expect(visible.status).toBe(200);
  expect(await visible.text()).toContain("shared-song");
});

it("discards unverified stored X snapshots when archive policy lookup fails", async () => {
  const hidden = { id: "101000000000000011", text: "ARCHIVED QUOTE REPLY LINK", username: "archived", createdAt: "2026-10-14T00:00:00Z", url: "https://x.com/archived/status/101000000000000011", media: [], links: [], metrics: { likeCount: 0, retweetCount: 0, replyCount: 0, quoteCount: 0 } };
  const visible = { ...hidden, id: "101000000000000012", username: "public", text: "Normal root", quote: { postId: hidden.id, post: hidden }, reply: { postId: hidden.id, post: hidden, targetUsername: "archived" }, links: [{ url: hidden.url, title: hidden.text, linkedPost: hidden }] };
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_rich_link_preview_enabled','true')"),
    db.prepare("INSERT INTO x_posts(id,handle,username,value,created_at,fetched_at,content_access) VALUES(?,'public','public',?,'2026-10-14T00:00:00Z',100,'normal')").bind(visible.id, JSON.stringify(visible)),
  ]);
  const failure = new Error("archive policy read unavailable");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const failingDb = new Proxy(db, { get(target, name) {
    if (name === "prepare") return (sql: string) => {
      if (sql.includes("SELECT id, NULL AS handle FROM x_posts")) throw failure;
      return target.prepare(sql);
    };
    const value = Reflect.get(target, name);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const response = await request("/api/x/posts?handles=public", undefined, {}, { ...runtime, otw_db: failingDb });
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain("ARCHIVED QUOTE REPLY LINK");
  expect(warn).toHaveBeenCalledWith("Failed to read stored X posts", failure);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

it("makes retained non-Play YouTube official, Shorts and VOD history reachable only to admins", async () => {
  await db.batch([
    db.prepare("INSERT INTO member_links(member_uid,type,label,url,youtube_channel_id,enabled,sort_order) VALUES(1,'youtube_vod','Archived VOD','https://youtube.com/channel/UCcccccccccccccccccccccc','UCcccccccccccccccccccccc',1,0)"),
    ...[[1,1,"UCaaaaaaaaaaaaaaaaaaaaaa"],[2,1,"UCcccccccccccccccccccccc"],[3,2,"UCbbbbbbbbbbbbbbbbbbbbbb"]].map(([id,uid,channel]) => db.prepare("INSERT INTO youtube_feed_sources(id,source_kind,member_uid,youtube_channel_id,collection_started_at,created_at,updated_at) VALUES(?,'official',?,?,100,100,100)").bind(id,uid,channel)),
    ...[["heldfeed001",1,0,"Archived official","admin_archive"],["heldshort01",1,1,"Archived Shorts","admin_archive"],["heldvod0001",2,0,"Archived VOD","admin_archive"],["normalvid01",3,0,"Normal retained video","normal"]].map(([id,source,short,title,access]) => db.prepare("INSERT INTO youtube_feed_videos(video_id,source_id,title,published_at,fetched_at,is_short,content_access) VALUES(?,?,?,100,100,?,?)").bind(id,source,title,short,access)),
  ]);
  const path = "/api/youtube/feed/history";
  expect((await request(path)).status).toBe(401);
  expect((await request(path,"member")).status).toBe(403);
  const result = await request(path,"archive-admin");
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  const text = await result.text();
  for (const title of ["Archived official","Archived Shorts","Archived VOD","Normal retained video"]) expect(text).toContain(title);
  expect(text).toContain('"contentAccess":"admin_archive"');
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page: {items:{videoId:string}[];nextCursor:string|null} = await (await request(`${path}?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,"archive-admin")).json<{items:{videoId:string}[];nextCursor:string|null}>();
    ids.push(...page.items.map(item => item.videoId)); cursor = page.nextCursor;
  } while (cursor);
  expect(ids).toEqual(["heldfeed001", "heldshort01", "heldvod0001", "normalvid01"]);
  const filtered = await request(`${path}?channelId=UCcccccccccccccccccccccc&limit=1`, "archive-admin");
  expect(await filtered.text()).toContain("Archived VOD");
  expect((await request(`${path}?limit=21`,"archive-admin")).status).toBe(400);
  expect((await request("/api/youtube/videos?channelIds=UCaaaaaaaaaaaaaaaaaaaaaa")).status).toBe(400);
  expect((await request("/api/youtube/shorts?channelIds=UCaaaaaaaaaaaaaaaaaaaaaa")).status).toBe(400);
  expect(await (await request("/api/youtube/vods?memberUids=1")).text()).not.toContain("Archived VOD");
  expect(await (await request("/api/youtube/videos?channelIds=UCbbbbbbbbbbbbbbbbbbbbbb")).text()).toContain("Normal retained video");
  expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).endsWith("/.well-known/jwks.json"))).toBe(true);
});

it("reads held CHZZK VOD and clip cache metadata for admins without a provider refresh", async () => {
  const channel = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO chzzk_api_cache(key,type,value,fetched_at,expires_at,stale_until) VALUES(?,'vods',?,100,200,300)").bind(`vods:v1:${channel}:0:5`,JSON.stringify({data:[{videoNo:123,videoTitle:"Held archived CHZZK VOD",publishDate:"2026-10-14",channel:{channelId:channel,channelName:"Archived Person"}}]})),
    db.prepare("INSERT OR REPLACE INTO chzzk_api_cache(key,type,value,fetched_at,expires_at,stale_until) VALUES(?,'clips',?,100,200,300)").bind(`clips:v1:${channel}:10`,JSON.stringify({data:[{clipUID:"abc",clipTitle:"Held archived CHZZK clip",ownerChannelId:channel}]})),
  ]);
  const path = `/api/chzzk/history?channelId=${channel}`;
  expect((await request(path)).status).toBe(401);
  expect((await request(path,"member")).status).toBe(403);
  const response = await request(path,"archive-admin");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const text = await response.text();
  expect(text).toContain("Held archived CHZZK VOD");
  expect(text).toContain("Held archived CHZZK clip");
  expect(text).toContain('"contentAccess":"admin_archive"');
  expect((await request(`/api/vods/chzzk?channelId=${channel}`)).status).toBe(400);
  expect((await request(`/api/clips/chzzk?channelId=${channel}`)).status).toBe(400);
  expect((await request(`${path}&cursor=invalid`,"archive-admin")).status).toBe(400);
  const normalChannel = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const orphanChannel = "cccccccccccccccccccccccccccccccc";
  await db.batch([normalChannel, orphanChannel].map(id => db.prepare("INSERT INTO chzzk_api_cache(key,type,value,fetched_at,expires_at,stale_until) VALUES(?,'vods',?,100,200,300)").bind(`vods:v1:${id}:0:5`,JSON.stringify({data:[{videoNo:456,videoTitle:"Normal retained CHZZK",channel:{channelId:id}}]}))));
  for (const id of [normalChannel, orphanChannel]) expect(await (await request(`/api/chzzk/history?channelId=${id}`,"archive-admin")).text()).toContain("Normal retained CHZZK");
  for (let i=1;i<=21;i++) await db.prepare("INSERT INTO chzzk_api_cache(key,type,value,fetched_at,expires_at,stale_until) VALUES(?,'vods','{\"data\":[]}',100,200,300)").bind(`vods:v1:${channel}:${i}:5`).run();
  const first = await (await request(path,"archive-admin")).json<{snapshots:{key:string}[];nextCursor:string}>();
  const second = await (await request(`${path}&cursor=${encodeURIComponent(first.nextCursor)}`,"archive-admin")).json<{snapshots:{key:string}[];nextCursor:string|null}>();
  expect(first.snapshots).toHaveLength(20);
  expect(second.snapshots).toHaveLength(3);
  expect(new Set([...first.snapshots,...second.snapshots].map(row => row.key)).size).toBe(23);
  expect(second.nextCursor).toBeNull();
  expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).endsWith("/.well-known/jwks.json"))).toBe(true);
});
