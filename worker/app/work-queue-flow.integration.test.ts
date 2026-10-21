import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { PlayWorkBatch, PlayWorkQueueOverview } from "@contracts/otw-play-work-queue";
import { handleWorkerFetch } from "./fetch";
import { handleWorkerQueue } from "./worker-queue";
import { clearAuthCachesForTests } from "../platform/auth";
import { siteEnv } from "../test-support/site-env";
import { readSiteSchemaMigrations } from "../test-support/site-schema";
import type { Env } from "../platform/types";

const bindings = env as unknown as Env;
const db = bindings.otw_db;
const origin = "http://localhost:5173", issuer = "https://work-queue.clerk.invalid";
const playlistId = "PL1234567890", videoId = "BBBBBBBBBBB", channelId = `UC${"k".repeat(22)}`;
const ingestion: unknown[] = [], ai: unknown[] = [];
const runtime = {
  ...bindings, ...siteEnv(), SITE_PUBLIC_ORIGIN: origin,
  CLERK_ISSUER: issuer, CLERK_JWKS_URL: `${issuer}/.well-known/jwks.json`,
  CLERK_AUTHORIZED_PARTIES: origin, CLERK_ADMIN_IDS: "work-admin",
  YOUTUBE_API_KEY: "local-youtube-key", GEMINI_API_KEY: "local-ai-key",
  OTW_PLAY_AI_REVIEW_ENABLED: "true", OTW_PLAY_AI_REVIEW_MODEL: "local-test-model",
  CLOUDFLARE_ACCOUNT_ID: "local-account", CLOUDFLARE_D1_TOKEN: "local-analytics-token",
  OTW_PLAY_INGESTION_QUEUE: { send: async (body: unknown) => { ingestion.push(structuredClone(body)); } },
  OTW_PLAY_AI_REVIEW_QUEUE: { send: async (body: unknown) => { ai.push(structuredClone(body)); } },
} as unknown as Env;
let bearer: string, jwk: JsonWebKey;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const part = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));

beforeAll(async () => {
  for (const migration of await readSiteSchemaMigrations()) {
    if (migration.name.startsWith("0030_")) {
      await db.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) =>
        db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index, code, "migration bootstrap")));
    }
    await applyD1Migrations(db, [migration]);
  }
  await db.batch([
    db.prepare("DELETE FROM member_links"), db.prepare("DELETE FROM music_entities"), db.prepare("DELETE FROM members"),
    db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('youtube_api_daily_quota_units','10000')"),
  ]);
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey("jwk", keys.publicKey) as JsonWebKey;
  const input = `${part({ alg: "RS256", kid: "work-queue-key" })}.${part({ iss: issuer, azp: origin, sub: "work-admin", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  bearer = `${input}.${encode(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(input))))}`;
}, 120000);
afterEach(() => { vi.unstubAllGlobals(); clearAuthCachesForTests(); });

const request = (path: string, body?: unknown, authenticated = true) => handleWorkerFetch(new Request(`${origin}${path}`, {
  method: body === undefined ? "GET" : "POST",
  headers: { ...(authenticated ? { Authorization: `Bearer ${bearer}` } : {}), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), runtime);
async function read<T>(path: string): Promise<T> {
  const response = await request(path);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return (await response.json() as { data: T }).data;
}
async function deliver(queue: string, body: unknown) {
  expect(body).toBeDefined();
  const ack = vi.fn(), retry = vi.fn();
  await handleWorkerQueue({ queue, messages: [{ body, ack, retry }] } as unknown as MessageBatch<unknown>, runtime);
  expect(ack).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
}

it("prepares a persisted review through authenticated HTTP, real queue consumers and final HTTP readback without duplicate provider work", async () => {
  clearAuthCachesForTests();
  const providerCalls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.href === `${issuer}/.well-known/jwks.json`) return Response.json({ keys: [{ ...jwk, kid: "work-queue-key", alg: "RS256", use: "sig" }] });
    providerCalls.push(url.pathname);
    if (url.href === "https://api.cloudflare.com/client/v4/graphql" && init?.method === "POST")
      return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    if (url.origin === "https://www.googleapis.com" && url.pathname === "/youtube/v3/playlists" && url.searchParams.get("id") === playlistId)
      return Response.json({ items: [{ id: playlistId, snippet: { title: "Review playlist", channelId, channelTitle: "Clip channel" }, contentDetails: { itemCount: 1 }, status: { privacyStatus: "public" } }] });
    if (url.origin === "https://www.googleapis.com" && url.pathname === "/youtube/v3/playlistItems" && url.searchParams.get("playlistId") === playlistId)
      return Response.json({ items: [{ id: "playlist-entry-1", snippet: { position: 0 }, contentDetails: { videoId } }], pageInfo: { totalResults: 1 } });
    if (url.origin === "https://www.googleapis.com" && url.pathname === "/youtube/v3/videos" && url.searchParams.get("id") === videoId)
      return Response.json({ items: [{ id: videoId, snippet: { channelId, channelTitle: "Clip channel", title: "Song clip", publishedAt: "2026-10-01T00:00:00Z", liveBroadcastContent: "none" }, contentDetails: { duration: "PT3M" }, status: { privacyStatus: "public", uploadStatus: "processed", embeddable: true } }] });
    if (url.href === "https://generativelanguage.googleapis.com/v1beta/interactions" && init?.method === "POST")
      return Response.json({ status: "completed", outputs: [{ type: "text", text: JSON.stringify({ videoAnalyzed: true, songs: [], warnings: ["곡을 직접 선택하세요."] }) }] });
    throw new Error(`Unexpected external request: ${url.origin}${url.pathname}`);
  }));

  expect((await request("/api/play/admin/work-queues", { urls: [playlistId] }, false)).status).toBe(401);
  expect(ingestion).toHaveLength(0);
  expect(await db.prepare("SELECT count(*) n FROM music_playlist_work_queues").first()).toEqual({ n: 0 });

  const added = await request("/api/play/admin/work-queues", { urls: [playlistId] });
  expect(added.status).toBe(202);
  const queueId = (await added.json() as { data: Array<{ queueId: string }> }).data[0].queueId;
  expect(await db.prepare("SELECT status,actor FROM music_playlist_work_queues WHERE id=?").bind(queueId).first()).toEqual({ status: "checking", actor: "work-admin" });
  expect(providerCalls.filter(path => path.startsWith("/youtube/")).length).toBe(0);
  await deliver("otw-play-ingestion", ingestion.shift());
  const ready = (await read<PlayWorkQueueOverview>("/api/play/admin/work-queues")).queues[0];
  expect(ready).toMatchObject({ id: queueId, title: "Review playlist", itemCount: 1, status: "waiting" });

  const started = await request(`/api/play/admin/work-queues/${queueId}/command`, { action: "start", expectedVersion: ready.version, idempotencyKey: "http-start-batch" });
  expect(started.status).toBe(202);
  const initial = (await started.json() as { data: PlayWorkBatch }).data;
  expect(initial.status).toBe("preparing");
  await deliver("otw-play-ingestion", ingestion.shift());
  expect(ingestion).toHaveLength(1);
  expect((await read<PlayWorkBatch>(`/api/play/admin/work-batches/${initial.id}`)).status).toBe("preparing");

  const metadataDelivery = ingestion.shift();
  await deliver("otw-play-ingestion", metadataDelivery);
  const prepared = await read<PlayWorkBatch>(`/api/play/admin/work-batches/${initial.id}`);
  expect(prepared).toMatchObject({ id: initial.id, status: "review", ai: { total: 1 }, items: [{ videoId, candidateKind: "singing_clip", aiStatus: "queued" }] });
  expect(ai).toHaveLength(1);
  const analysisDelivery = ai.shift();
  await deliver("otw-play-ai-review", analysisDelivery);
  const finished = await read<PlayWorkBatch>(`/api/play/admin/work-batches/${initial.id}`);
  expect(finished).toMatchObject({ status: "review", canComplete: false, ai: { counts: { needs_selection: 1 } }, items: [{ videoId, aiStatus: "needs_selection", outcome: "pending" }] });
  expect(await db.prepare("SELECT status FROM music_ingestion_jobs WHERE id=?").bind(initial.jobId).first()).toEqual({ status: "completed" });
  expect(await db.prepare("SELECT count(*) n FROM music_ingestion_candidates WHERE external_video_id=?").bind(videoId).first()).toEqual({ n: 1 });
  expect(await db.prepare("SELECT status,attempts FROM music_ai_reviews").first()).toEqual({ status: "succeeded", attempts: 1 });
  expect(await db.prepare("SELECT count(*) n FROM music_performances").first()).toEqual({ n: 0 });

  const callsBeforeReplay = providerCalls.filter(path => path !== "/client/v4/graphql");
  await deliver("otw-play-ingestion", metadataDelivery);
  await deliver("otw-play-ai-review", analysisDelivery);
  expect(ai).toHaveLength(1);
  await deliver("otw-play-ai-review", ai.shift());
  expect(await read<PlayWorkBatch>(`/api/play/admin/work-batches/${initial.id}`)).toEqual(finished);
  expect(providerCalls.filter(path => path !== "/client/v4/graphql")).toEqual(callsBeforeReplay);
  expect(await db.prepare("SELECT count(*) n FROM music_ai_reviews").first()).toEqual({ n: 1 });
}, 30000);
