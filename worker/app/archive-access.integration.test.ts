import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { handleWorkerFetch } from "./fetch";
import { clearAuthCachesForTests } from "../platform/auth";
import { siteEnv } from "../test-support/site-env";
import type { Env } from "../platform/types";
import { D1PublicCatalogReader } from "../features/otw-play/infrastructure/d1-public-catalog-reader";
import { projectionStatements } from "../features/otw-play/infrastructure/d1-catalog-projection";
import { D1PlaylistRepository } from "../features/otw-play/infrastructure/d1-playlist-repository";

const bindings = env as unknown as Env & { CONTENT_TRANSITION_MIGRATIONS: D1Migration[] };
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
  for (const migration of bindings.CONTENT_TRANSITION_MIGRATIONS) {
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
    db.prepare("DELETE FROM content_transitions"), db.prepare("DELETE FROM music_playlists"),
    db.prepare("DELETE FROM x_posts"), db.prepare("DELETE FROM x_post_sources"), db.prepare("DELETE FROM naver_cafe_posts"), db.prepare("DELETE FROM naver_cafe_sources"),
    db.prepare("DELETE FROM youtube_feed_sources"), db.prepare("DELETE FROM chzzk_api_cache"),
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
  expect(await (await request(`/r2-assets/${key}?archive=1`,"archive-admin")).text()).toBe("actual archived absolute bytes");
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
