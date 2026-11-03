import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { handleWorkerFetch } from "./fetch";
import { handleWorkerQueue } from "./worker-queue";
import {buildXActivityCoordinator,buildXActivitySite} from "./x-activity";
import {buildXGateway} from "./x-gateway";
import { clearAuthCachesForTests } from "../platform/auth";
import { siteEnv } from "../test-support/site-env";
import { signXActivity } from "../features/x-posts/domain/x-activity";
import type { Env } from "../platform/types";
import { meterD1 } from "../test-support/d1-meter";

const bindings = env as unknown as Env & { X_REFERENCE_MIGRATIONS: D1Migration[];transition_target_db:D1Database };
const db = bindings.otw_db;
const origin = "https://otw-schedule.info";
const issuer = "https://activity.clerk.invalid";
const userId = "1607408138545950721";
let keys: CryptoKeyPair;
let jwk: JsonWebKey;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const part = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
const queued: Array<{site:"otw"|"luvdia";body:unknown}> = [];
const runtime = { ...bindings, ...siteEnv(), SITE_PUBLIC_ORIGIN: origin,
  X_BEARER_TOKEN: "test", X_CLIENT_SECRET: "test-secret", CLERK_ISSUER: issuer,
  CLERK_JWKS_URL: `${issuer}/.well-known/jwks.json`, CLERK_AUTHORIZED_PARTIES: origin, CLERK_ADMIN_IDS: "activity-admin",
  CLOUDFLARE_ACCOUNT_ID: "activity-flow-test", CLOUDFLARE_D1_TOKEN: "test",
  OTW_OPS_BACKGROUND_QUEUE: { send: async (message: unknown) => { queued.push({site:"otw",body:message}); } },
} as unknown as Env;
const peerRuntime={...runtime,...siteEnv("luvdia"),SITE_PUBLIC_ORIGIN:"https://luvdia-schedule.info",CLERK_AUTHORIZED_PARTIES:"https://luvdia-schedule.info",otw_db:bindings.transition_target_db,
  OTW_OPS_BACKGROUND_QUEUE:{send:async(body:unknown)=>{queued.push({site:"luvdia",body});}}} as unknown as Env;
runtime.X_ACTIVITY_LUVDIA={protocol:async()=>({version:1,site:"luvdia"}),snapshot:()=>buildXActivitySite(peerRuntime).snapshot(),
  rememberUser:(handle,user)=>buildXActivitySite(peerRuntime).rememberUser(handle,user),accept:body=>buildXActivitySite(peerRuntime).accept(body),
  events:()=>buildXActivitySite(peerRuntime).events(),setRecoveryInterval:()=>buildXActivitySite(peerRuntime).setRecoveryInterval(),setPrimarySource:source=>buildXActivitySite(peerRuntime).setPrimarySource(source),setWebhookDisabled:disabled=>buildXActivitySite(peerRuntime).setWebhookDisabled(disabled)};
peerRuntime.X_ACTIVITY_COORDINATOR={protocol:async()=>({version:1,site:"otw"}),gatewayForLuvdia:input=>buildXGateway(runtime,"luvdia").execute(input),
  budgetForLuvdia:()=>buildXGateway(runtime,"luvdia").readBudget(),redactForLuvdia:id=>buildXGateway(runtime,"luvdia").redactPost(id),
  statusForLuvdia:()=>buildXActivityCoordinator(runtime).status("luvdia"),controlForLuvdia:async action=>({ok:true,value:await(action==="start"?buildXActivityCoordinator(runtime).start("luvdia"):buildXActivityCoordinator(runtime).stop("luvdia"))}),setCollectionForLuvdia:async source=>({ok:true,value:await buildXActivityCoordinator(runtime).setPrimarySource("luvdia",source)})};
async function request(path: string, user?: string, init: RequestInit = {}, requestRuntime=runtime) {
  const requestOrigin=requestRuntime.SITE_PUBLIC_ORIGIN??origin;
  const headers = new Headers(init.headers);
  if (user) {
    const input = `${part({ alg: "RS256", kid: "activity-key" })}.${part({ iss: issuer, azp: requestOrigin, sub: user, exp: Math.floor(Date.now()/1000)+3600 })}`;
    headers.set("Authorization", `Bearer ${input}.${encode(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(input))))}`);
  }
  return handleWorkerFetch(new Request(`${requestOrigin}${path}`, { ...init, headers }), requestRuntime);
}
beforeAll(async () => {
  keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey("jwk", keys.publicKey) as JsonWebKey;
});
beforeEach(async () => {
  await applyD1Migrations(db, bindings.X_REFERENCE_MIGRATIONS);
  await applyD1Migrations(bindings.transition_target_db,bindings.X_REFERENCE_MIGRATIONS);
  clearAuthCachesForTests(); queued.length = 0;
  for(const database of [db,bindings.transition_target_db]){
    await database.batch(["x_activity_inbox","x_activity_dispatch","x_activity_targets","x_activity_subscriptions","x_shared_requests","x_shared_budgets","x_activity_cache_redactions","x_post_references","x_post_facts","x_posts","x_fx_sources","x_post_sources","x_api_usage_events","x_api_usage_daily","x_api_resource_daily","x_api_cache","scheduled_usage_daily","admin_audit_logs","members"].map(table=>database.prepare("DELETE FROM "+table)));
    await database.prepare("DELETE FROM settings WHERE key IN ('x_collection_primary_source','x_webhook_disabled')").run();
    await database.prepare("UPDATE x_activity_sites SET enabled=0,pause_reason='user',last_error=NULL").run();
    await database.prepare("UPDATE x_activity_coordinator SET ready=0,lease_until=0,webhook_id=NULL,webhook_url=NULL,bootstrap_extra_micros=0,last_error=NULL").run();
  }
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','Member','https://x.com/member')").run();
  await db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at) VALUES('member',?,'member','rest-watermark',1,1)").bind(userId).run();
  await db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('x_collection_enabled','true',0),('x_posts_visibility','public',0) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
  await bindings.transition_target_db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'peer','Peer member','https://x.com/member')").run();
  await bindings.transition_target_db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at) VALUES('member',?,'member','rest-watermark',1,1)").bind(userId).run();
  await bindings.transition_target_db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('x_collection_enabled','true',0),('x_posts_visibility','public',0) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
});
afterEach(() => vi.unstubAllGlobals());

it("controls hybrid collection through authenticated site routes and reports official failures with zero observation writes", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `${issuer}/.well-known/jwks.json`) return Response.json({ keys: [{ ...jwk, kid: "activity-key", alg: "RS256", use: "sig" }] });
    if (url === "https://api.cloudflare.com/client/v4/graphql") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 100 } }] }] } } });
    if (new URL(url).pathname === "/2/activity/subscriptions") return Response.json({ data: [] });
    throw new Error(`Unexpected external request ${url}`);
  }));
  expect((await request("/api/x/collection")).status).toBe(401);
  expect((await request("/api/x/collection", "ordinary-member")).status).toBe(403);
  expect((await request("/api/x/collection", "activity-admin")).status).toBe(200);
  const patch = (source: string, target = runtime) => request("/api/x/collection", "activity-admin", { method: "PATCH", body: JSON.stringify({ primarySource: source }) }, target);
  expect((await patch("unknown")).status).toBe(400);
  expect((await patch("fxembed")).status).toBe(200);
  expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_primary_source'").first("value")).toBe("fxembed");
  expect(await bindings.transition_target_db.prepare("SELECT value FROM settings WHERE key='x_collection_primary_source'").first("value")).not.toBe("fxembed");
  expect((await request("/api/x/activity", "activity-admin", { method: "POST", body: JSON.stringify({ action: "resume", acknowledgeUncappedDelivery: true }) })).status).toBe(409);
  expect((await patch("fxembed", peerRuntime)).status).toBe(200);
  expect(await bindings.transition_target_db.prepare("SELECT value FROM settings WHERE key='x_collection_primary_source'").first("value")).toBe("fxembed");
  await db.prepare("UPDATE x_post_sources SET last_error='budget_exceeded',sync_pagination_token='pending' WHERE handle='member'").run();
  await db.prepare("INSERT INTO x_fx_sources(handle,collection_started_at,last_success_at,updated_at) VALUES('member',1,?,?)").bind(Date.now(), Date.now()).run();
  const meter = meterD1(db);
  const status = await request("/api/x/collection", "activity-admin", {}, { ...runtime, otw_db: meter.db });
  expect(await status.json()).toMatchObject({ primarySource: "fxembed", fxembed: { failedSources: 0 }, xApi: { failedSources: 1, pendingSources: 1 }, webhook: { state: "disabled", siteActiveCount: 0 } });
  expect(meter.summary().rowsWritten).toBe(0);
  expect((await patch("x_api")).status).toBe(200);
  expect(await db.prepare("SELECT enabled FROM x_activity_sites WHERE site='otw'").first("enabled")).toBe(0);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM admin_audit_logs WHERE event_type='x.collection.update'").first("n")).toBe(2);
});

it("uses real admin JWT authorization, callback CRC/HMAC, queue routing and public stored-feed readback", async () => {
  let subscriptions: Record<string, unknown>[] = [];
  let hooks: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url === `${issuer}/.well-known/jwks.json`) return Response.json({ keys: [{ ...jwk, kid: "activity-key", alg: "RS256", use: "sig" }] });
    if (url === "https://api.cloudflare.com/client/v4/graphql") return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 100 } }] }] } } });
    if (path === "/2/webhooks" && init?.method === "POST") {
      const challenge = await request("/api/x/activity/webhook?crc_token=provider_challenge");
      expect(await challenge.json()).toEqual({ response_token: await signXActivity("test-secret", "provider_challenge") });
      hooks = [{ id: "hook", url: body.url, valid: true }]; return Response.json({ data: hooks[0] });
    }
    if (path === "/2/webhooks" && init?.method === "GET") return Response.json({ data: hooks });
    if (path === "/2/activity/subscriptions" && init?.method === "POST") { subscriptions = [{ ...body, subscription_id: "sub" }]; return Response.json({ data: { subscription: subscriptions[0] } }); }
    if (path === "/2/activity/subscriptions" && init?.method === "GET") return Response.json({ data: subscriptions });
    throw new Error(`Unexpected external request ${init?.method} ${url}`);
  }));
  expect((await request("/api/x/activity")).status).toBe(401);
  expect((await request("/api/x/activity", "ordinary-member")).status).toBe(403);
  const started = await request("/api/x/activity", "activity-admin", { method: "POST", body: JSON.stringify({ action: "start", acknowledgeUncappedDelivery: true }) });
  expect(started.status).toBe(200);
  expect(await started.json()).toMatchObject({ mode:"normal",sites:expect.arrayContaining([{site:"otw",enabled:true,targetCount:1,activeCount:1,failedCount:0,pauseReason:null,resumeAt:null,lastError:null}]) });
  expect((await request("/api/x/activity","activity-admin",{method:"POST",body:JSON.stringify({action:"start",acknowledgeUncappedDelivery:true})},peerRuntime)).status).toBe(200);
  expect(subscriptions).toHaveLength(1);
  const postId = "2114516278392348991";
  const raw = JSON.stringify({ data: { event_uuid: postId, event_type: "post.create", tag: subscriptions[0]!.tag,
    filter: { user_id: userId }, payload: { id: postId, author_id: userId, text: "signed runtime post", created_at: new Date().toISOString(), attachments: { media_keys: ["photo"] } },
    includes: { media: [{ media_key: "photo", type: "photo", url: "https://pbs.twimg.com/media/photo.jpg" }] },
  } });
  const response = await request("/api/x/activity/webhook", undefined, { method: "POST", body: raw, headers: { "X-Twitter-Webhooks-Signature-OAuth2": await signXActivity("test-secret", raw) } });
  expect(response.status).toBe(200); expect(queued).toHaveLength(1);
  expect(await db.prepare("SELECT otw_status FROM x_activity_dispatch").first("otw_status")).toBe("pending");
  const ack = vi.fn(); const retry = vi.fn();
  while(queued.length){
    const next=queued.shift()!;
    await handleWorkerQueue({queue:next.site+"-ops-background",messages:[{body:next.body,ack,retry}]} as unknown as MessageBatch<unknown>,next.site==="otw"?runtime:peerRuntime);
  }
  expect(ack).toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
  const feed = await request("/api/x/posts?handles=member");
  expect(feed.status).toBe(200);
  expect(await feed.json()).toMatchObject({ posts: [{ id: postId, text: "signed runtime post", media: [{ mediaKey: "photo" }] }] });
  expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member'").first("last_seen_post_id")).toBe("rest-watermark");
  expect((await request("/api/x/activity", "activity-admin")).status).toBe(200);
  expect(await db.prepare("SELECT status FROM x_activity_inbox").first("status")).toBe("complete");
  expect(await bindings.transition_target_db.prepare("SELECT status FROM x_activity_inbox").first("status")).toBe("complete");
});
