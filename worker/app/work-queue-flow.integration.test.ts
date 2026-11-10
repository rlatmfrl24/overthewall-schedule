import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { PlayWorkBatch, PlayWorkQueueOverview } from "@contracts/otw-play-work-queue";
import type { OtwPlayAdminCatalogDto, OtwPlayConvertIngestionCandidatesResponse, OtwPlayIngestionJobDto, OtwPlayReviewPageDto, OtwPlayIngestionReviewCandidateDto } from "@contracts/otw-play";
import type { AiBatchPage, AiBatchSummary } from "@contracts/otw-play-ai-batch";
import { handleWorkerFetch } from "./fetch";
import { handleWorkerQueue } from "./worker-queue";
import { clearAuthCachesForTests } from "../platform/auth";
import { siteEnv } from "../test-support/site-env";
import { readSiteSchemaMigrations } from "../test-support/site-schema";
import type { Env } from "../platform/types";
import { D1IngestionRepository } from "../features/otw-play/infrastructure/d1-ingestion-repository";

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
  OTW_PLAY_AI_REVIEW_PAUSED: "false", OTW_PLAY_AI_REVIEW_ENABLED: "true", OTW_PLAY_AI_REVIEW_MODEL: "local-test-model",
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

const request = (path: string, body?: unknown, authenticated = true, method = body === undefined ? "GET" : "POST", environment = runtime) => handleWorkerFetch(new Request(`${origin}${path}`, {
  method,
  headers: { ...(authenticated ? { Authorization: `Bearer ${bearer}` } : {}), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), environment);
async function read<T>(path: string): Promise<T> {
  const response = await request(path);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return (await response.json() as { data: T }).data;
}
async function deliver(queue: string, body: unknown, environment = runtime) {
  expect(body).toBeDefined();
  const ack = vi.fn(), retry = vi.fn();
  await handleWorkerQueue({ queue, messages: [{ body, ack, retry }] } as unknown as MessageBatch<unknown>, environment);
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

it("reviews a full playlist through the authenticated workflow and writes catalog data only at final confirmation", async () => {
  const fullPlaylistId = "PL2345678901";
  const sharedPlaylistId = "PL3456789012";
  const videos = Array.from({ length: 51 }, (_, index) => `WORKFLOW${String(index).padStart(3, "0")}`);
  let analyses = 0;
  let playlistReads = 0, videoReads = 0, playlistCount = 51, videoAuthFails = false;
  await db.prepare(`INSERT INTO music_channels (id,provider,external_channel_id,display_name,channel_role,verification_status,active,version,created_at,updated_at)
    VALUES ('official-workflow-channel','youtube',?,'Workflow channel','otw_official','approved',1,0,1,1)`).bind(channelId).run();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.href === `${issuer}/.well-known/jwks.json`) return Response.json({ keys: [{ ...jwk, kid: "work-queue-key", alg: "RS256", use: "sig" }] });
    if (url.href === "https://api.cloudflare.com/client/v4/graphql")
      return Response.json({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 0 } }] }] } } });
    if (url.pathname === "/youtube/v3/playlists") {
      playlistReads++;
      const id = url.searchParams.get("id");
      return Response.json({ items: [{ id, snippet: { title: "Full playlist", channelId, channelTitle: "Workflow channel" }, contentDetails: { itemCount: id === sharedPlaylistId ? 1 : playlistCount }, status: { privacyStatus: "public" } }] });
    }
    if (url.pathname === "/youtube/v3/playlistItems") {
      if (url.searchParams.get("playlistId") === sharedPlaylistId) {
        return Response.json({ items: [{ id: "shared-0", snippet: { position: 0 }, contentDetails: { videoId: videos[0] } }], pageInfo: { totalResults: 1 } });
      }
      const nextPage = url.searchParams.has("pageToken");
      const positions = nextPage ? [50] : Array.from({ length: 50 }, (_, index) => index);
      return Response.json({ items: positions.map(position => ({ id: `full-${position}`, snippet: { position }, contentDetails: { videoId: videos[position] } })), pageInfo: { totalResults: 51 }, ...(!nextPage ? { nextPageToken: "next-page" } : {}) });
    }
    if (url.pathname === "/youtube/v3/videos") {
      videoReads++;
      if (videoAuthFails) return Response.json({}, { status: 401 });
      return Response.json({ items: (url.searchParams.get("id") ?? "").split(",").map(id => ({
        id, snippet: { channelId, channelTitle: "Workflow channel", title: id, publishedAt: "2026-10-01T00:00:00Z", liveBroadcastContent: "none" },
        contentDetails: { duration: "PT3M" }, status: { privacyStatus: "public", uploadStatus: "processed", embeddable: true },
      })) });
    }
    if (url.href === "https://generativelanguage.googleapis.com/v1beta/interactions" && init?.method === "POST") {
      analyses++;
      return Response.json({ status: "completed", outputs: [{ type: "text", text: JSON.stringify({ videoAnalyzed: true, songs: [], warnings: ["직접 검수 필요"] }) }] });
    }
    throw new Error(`Unexpected external request: ${url.origin}${url.pathname}`);
  }));

  const playlist = { playlistUrl: `https://www.youtube.com/playlist?list=${fullPlaylistId}`, mode: "all_new", candidateKind: "official_video" };
  const preflight = await request("/api/play/admin/imports/playlist/preflight", playlist);
  expect(preflight.status).toBe(200);
  expect(await preflight.json()).toMatchObject({ data: { requestedItemCount: 51, requiresSplit: false } });
  const body = { ...playlist, idempotencyKey: "full-playlist-test" };
  const secondSession = { ...body, idempotencyKey: "second-session-full-playlist" };
  const [response, concurrent] = await Promise.all([
    request("/api/play/admin/imports/playlist", body),
    request("/api/play/admin/imports/playlist", secondSession),
  ]);
  expect(response.status).toBe(202);
  const { data: job } = await response.json() as { data: OtwPlayIngestionJobDto };
  expect(concurrent.status).toBe(202);
  expect(await concurrent.json()).toMatchObject({ data: { id: job.id } });
  expect(ingestion).toHaveLength(1);
  const aiRequest = { selection: { importJobId: job.id }, idempotencyKey: "start-full-playlist" };
  expect((await request("/api/play/admin/ai-review-batches", aiRequest, false)).status).toBe(401);
  expect((await request("/api/play/admin/ai-review-batches", aiRequest)).status).toBe(409);
  const paused = { ...runtime, OTW_PLAY_AI_REVIEW_PAUSED: undefined };
  const convertPath = `/api/play/admin/imports/${job.id}/convert`;
  const uncheckedSelection = { candidates: [{ id: `youtube:${videos[0]}`, expectedVersion: 1 }] };
  expect((await request(convertPath, uncheckedSelection)).status).toBe(409);
  expect((await request(convertPath, uncheckedSelection, true, "POST", paused)).status).toBe(409);
  while (ingestion.length) await deliver("otw-play-ingestion", ingestion.shift());
  const imported = await read<OtwPlayIngestionJobDto>(`/api/play/admin/imports/${job.id}`);
  expect(imported).toMatchObject({ status: "completed", counts: { discovered: 51 } });
  expect(ai).toHaveLength(0);
  playlistCount = 5_001;
  const beforeImportReplay = playlistReads;
  const repeated = await request("/api/play/admin/imports/playlist", body);
  expect(await repeated.json()).toMatchObject({ data: { id: job.id } });
  expect(await (await request("/api/play/admin/imports/playlist", secondSession)).json()).toMatchObject({ data: { id: job.id } });
  expect(playlistReads).toBe(beforeImportReplay);
  expect((await request("/api/play/admin/imports/playlist", { ...body, idempotencyKey: "fresh-over-cap" })).status).toBe(422);
  expect(ingestion).toHaveLength(0);

  expect((await request(convertPath, uncheckedSelection)).status).toBe(409);
  const unchecked = await request(convertPath, uncheckedSelection, true, "POST", paused);
  expect(unchecked.status).toBe(200);
  expect(await unchecked.json()).toMatchObject({ data: { results: [{ performanceId: null }] } });
  expect(await (await request(`/api/play/admin/imports/${job.id}`, undefined, true, "GET", paused)).json()).toMatchObject({
    data: { aiExecutionAvailable: false },
  });
  expect((await request("/api/play/admin/ai-review-batches", aiRequest, true, "POST", paused)).status).toBe(503);
  expect(ai).toHaveLength(0);
  await db.prepare("INSERT INTO music_ai_review_batches(id,actor,request_key,selection_json,created_at) VALUES(?,?,?,?,?)")
    .bind("incomplete-existing-ai-batch", "work-admin", `playlist-import:${job.id}`, JSON.stringify(aiRequest.selection), Date.now()).run();
  expect(await read<OtwPlayIngestionJobDto>(`/api/play/admin/imports/${job.id}`)).toMatchObject({ aiBatchNeedsResume: true });
  expect((await request(convertPath, uncheckedSelection)).status).toBe(409);
  const started = await request("/api/play/admin/ai-review-batches", aiRequest);
  expect(started.status).toBe(202);
  const { data: batch } = await started.json() as { data: AiBatchSummary };
  expect(batch.total).toBe(51);
  await deliver("otw-play-ai-review", ai[0], paused);
  expect(analyses).toBe(0);
  const sharedImport = await request("/api/play/admin/imports/playlist", {
    ...body, playlistUrl: sharedPlaylistId, idempotencyKey: "shared-import",
  });
  expect(sharedImport.status).toBe(202);
  const { data: sharedJob } = await sharedImport.json() as { data: OtwPlayIngestionJobDto };
  await deliver("otw-play-ingestion", ingestion.shift());
  videoAuthFails = true;
  await deliver("otw-play-ingestion", ingestion.shift());
  const sharedJobPath = `/api/play/admin/imports/${sharedJob.id}`;
  expect(await read<OtwPlayIngestionJobDto>(sharedJobPath)).toMatchObject({
    lastErrorCode: "provider_auth", counts: { permanentError: 1 },
  });
  videoAuthFails = false;
  const collectionRetries = await Promise.all([request(`${sharedJobPath}/retry`, {}), request(`${sharedJobPath}/retry`, {})]);
  const queuedCounts = await Promise.all(collectionRetries.map(async response => {
    expect(response.status).toBe(200);
    return (await response.json() as { data: { enqueued: number } }).data.enqueued;
  }));
  expect(queuedCounts.sort()).toEqual([0, 1]);
  expect(ingestion).toHaveLength(1);
  await deliver("otw-play-ingestion", ingestion.shift());
  expect(await read<OtwPlayIngestionJobDto>(sharedJobPath)).toMatchObject({ status: "completed", aiSharedPending: true });
  expect((await request(`${sharedJobPath}/convert`, uncheckedSelection, true, "POST", paused)).status).toBe(409);
  const queuedBeforeShared = new Set(ai.map(message => (message as { itemId: string }).itemId));
  const sharedStart = await request("/api/play/admin/ai-review-batches", { selection: { importJobId: sharedJob.id }, idempotencyKey: "start-shared-import" });
  expect(sharedStart.status).toBe(202);
  const { data: sharedBatch } = await sharedStart.json() as { data: AiBatchSummary };
  expect(sharedBatch).toMatchObject({ total: 1, counts: { queued: 1 } });
  const sharedBatchPath = `/api/play/admin/ai-review-batches/${sharedBatch.id}`;
  const [sharedItem] = (await read<AiBatchPage>(sharedBatchPath)).items;
  expect(sharedItem.batchId).toBe(batch.id);
  const sharedItemId = sharedItem.id;
  expect(ai).toHaveLength(queuedBeforeShared.size + Number(!queuedBeforeShared.has(sharedItemId)));
  const failedDelivery = ai.findIndex(message => (message as { itemId: string }).itemId === sharedItemId);
  expect(failedDelivery).toBeGreaterThanOrEqual(0);
  await deliver("otw-dead-letter", ai.splice(failedDelivery, 1)[0]);
  expect(await read<AiBatchPage>(sharedBatchPath)).toMatchObject({ batch: { counts: { failed: 1 } }, items: [{ id: sharedItemId, status: "failed" }] });
  const sharedRetry = await request(`${sharedBatchPath}/retry`, {});
  expect(sharedRetry.status).toBe(202);
  expect(await sharedRetry.json()).toMatchObject({ data: { items: [{ id: sharedItemId, status: "queued" }] } });
  while (ai.length) await deliver("otw-play-ai-review", ai.shift());
  expect(await read<AiBatchPage>(`/api/play/admin/ai-review-batches/${batch.id}`)).toMatchObject({ batch: { total: 51, counts: { needs_selection: 51 } } });
  expect(analyses).toBe(51);
  expect(await read<AiBatchPage>(sharedBatchPath)).toMatchObject({ batch: { total: 1, counts: { needs_selection: 1 } } });
  expect(await read<OtwPlayIngestionJobDto>(`/api/play/admin/imports/${job.id}`)).toMatchObject({ aiBatchId: batch.id });
  const replay = await request("/api/play/admin/ai-review-batches", { ...aiRequest, idempotencyKey: "same-work-new-click" });
  expect(await replay.json()).toMatchObject({ data: { id: batch.id, total: 51 } });
  expect(ai).toHaveLength(0);
  const rows = await read<OtwPlayReviewPageDto>(`/api/play/admin/review-items?source=playlist&jobId=${job.id}`);
  expect(rows.items).toHaveLength(50);
  const lastPage = await read<OtwPlayReviewPageDto>(`/api/play/admin/review-items?source=playlist&jobId=${job.id}&cursor=${encodeURIComponent(rows.nextCursor!)}`);
  expect(lastPage.items).toHaveLength(1);
  const subject = { kind: "new_external", clientKey: "workflow-singer", displayName: "Workflow Singer", entityKind: "person" };
  const draftInput = {
    song: { kind: "create", title: "Workflow Song", isOtwOriginal: false, originalReleaseDate: null,
      originalReleasePrecision: "unknown", aliases: [], originalArtists: [{ subject, creditOrder: 0, isPrimary: true }], tags: ["workflow-test"] },
    participants: [{ subject, participantRole: "vocal", creditOrder: 0 }],
    relationType: "cover", releaseType: "official_video", participationType: "solo",
    startSeconds: 0, endSeconds: null, internalNote: null,
  };
  const revisions = await db.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first();
  const recoveryDraftInput = { ...draftInput, song: { ...draftInput.song, title: "Workflow Recovery Song" } };
  const savedRows = [];
  for (const [row, input] of [[rows.items[0], draftInput], [lastPage.items[0], recoveryDraftInput]] as const) {
    const saved = await request(`/api/play/admin/import-candidates/${encodeURIComponent(row.id)}`, {
      expectedVersion: row.version, action: "save", input,
    }, true, "PATCH");
    expect(await saved.clone().json()).toMatchObject({ data: { status: "ready", reviewInput: input } });
    savedRows.push((await saved.json() as { data: OtwPlayIngestionReviewCandidateDto }).data);
  }
  expect(await db.prepare("SELECT revision FROM music_catalog_meta WHERE id=1").first()).toEqual(revisions);
  expect(await db.prepare("SELECT count(*) n FROM music_songs WHERE title='Workflow Song'").first()).toEqual({ n: 0 });
  expect(await db.prepare("SELECT count(*) n FROM music_entities WHERE display_name='Workflow Singer'").first()).toEqual({ n: 0 });
  const selection = {
    candidates: savedRows.map((row, index) => ({ id: row.id, expectedVersion: row.version - index })),
  };
  const beforeRegistration = videoReads;
  const final = await request(convertPath, selection);
  const finalResult = await final.json() as { data: OtwPlayConvertIngestionCandidatesResponse };
  expect(finalResult).toMatchObject({ data: { results: [{ outcome: "created" }, { outcome: "stale" }] } });
  expect(videoReads - beforeRegistration).toBe(1);
  const finalReplay = await request(convertPath, { candidates: selection.candidates.slice(0, 1) });
  expect(await finalReplay.json()).toMatchObject({ data: { results: [finalResult.data.results[0]] } });
  expect(videoReads - beforeRegistration).toBe(1);
  expect(await db.prepare("SELECT count(*) n FROM music_songs WHERE title='Workflow Song'").first()).toEqual({ n: 1 });
  expect(await db.prepare("SELECT count(*) n FROM music_entities WHERE display_name='Workflow Singer'").first()).toEqual({ n: 1 });
  expect(await db.prepare("SELECT publication_status FROM music_performances").first()).toEqual({ publication_status: "draft" });
  const catalog = await read<OtwPlayAdminCatalogDto>("/api/play/admin/catalog");
  const added = catalog.songs.find(song => song.title === "Workflow Song");
  expect(added?.tags).toEqual(["workflow-test"]);
  expect(catalog.performances.find(performance => performance.songId === added?.id)).toMatchObject({ publicationStatus: "draft" });
  expect((await read<OtwPlayReviewPageDto>(`/api/play/admin/review-items?source=playlist&jobId=${job.id}&status=ready`)).items).toMatchObject([{ id: savedRows[1].id }]);
  await db.prepare("UPDATE music_ingestion_candidates SET metadata_checked_at=1 WHERE id=?").bind(savedRows[1].id).run();
  expect(await new D1IngestionRepository(db).clearExpiredApiData(Date.now(), 1)).toBe(1);
  const readyPath = `/api/play/admin/review-items?source=playlist&jobId=${job.id}&status=ready`;
  const [expired] = (await read<OtwPlayReviewPageDto>(readyPath)).items;
  expect(expired).toMatchObject({ candidate: { availabilityStatus: "unknown", catalogChannelId: null, reviewInput: recoveryDraftInput } });
  const restore = await request(`/api/play/admin/import-candidates/${encodeURIComponent(expired.id)}`, {
    expectedVersion: expired.version, action: "refresh_metadata",
  }, true, "PATCH");
  expect(restore.status).toBe(200);
  const [restored] = (await read<OtwPlayReviewPageDto>(readyPath)).items;
  expect(restored).toMatchObject({ status: "ready", candidate: { availabilityStatus: "playable", catalogChannelId: "official-workflow-channel", reviewInput: recoveryDraftInput } });
  expect(await db.prepare("SELECT count(*) n FROM music_songs WHERE title='Workflow Recovery Song'").first()).toEqual({ n: 0 });
  await db.prepare("UPDATE music_channels SET active=0 WHERE id='official-workflow-channel'").run();
  const rejected = await request(`/api/play/admin/imports/${job.id}/convert`, {
    candidates: [{ id: restored.id, expectedVersion: restored.version }],
  });
  expect(await rejected.json()).toMatchObject({ data: { results: [{ outcome: "validation_failed", errorCode: "channel_not_approved" }] } });
  const [rejectedRow] = (await read<OtwPlayReviewPageDto>(readyPath)).items;
  expect(rejectedRow).toMatchObject({ id: restored.id, conversionErrorCode: "channel_not_approved" });
  await db.prepare("UPDATE music_channels SET active=1 WHERE id='official-workflow-channel'").run();
  const retrySelection = { candidates: [{ id: rejectedRow.id, expectedVersion: rejectedRow.version }] };
  const retried = await Promise.all([request(convertPath, retrySelection), request(convertPath, retrySelection)]);
  const retryResults = await Promise.all(retried.map(response => response.json() as Promise<{ data: OtwPlayConvertIngestionCandidatesResponse }>));
  expect(retryResults[0]).toMatchObject({ data: { results: [{ outcome: "created", performanceId: expect.any(String) }] } });
  expect(retryResults[1]).toEqual(retryResults[0]);
  expect((await read<OtwPlayReviewPageDto>(readyPath)).items).toEqual([]);
  const reloadedCatalog = await read<OtwPlayAdminCatalogDto>("/api/play/admin/catalog");
  expect(reloadedCatalog.performances).toHaveLength(2);
  expect(reloadedCatalog.performances.every(performance => performance.publicationStatus === "draft")).toBe(true);
  await db.prepare(`WITH RECURSIVE sequence(n) AS (
    VALUES (1) UNION ALL SELECT n+1 FROM sequence WHERE n<100
  ) INSERT INTO music_ingestion_jobs
    (id,source_kind,source_external_id,source_url,owner_channel_id,import_mode,range_start_position,requested_item_count,status,actor_user_id,idempotency_key,created_at,updated_at)
    SELECT 'newer-'||n,source_kind,source_external_id,source_url,owner_channel_id,import_mode,0,1,'completed',actor_user_id,
      'newer-'||n,created_at+1,updated_at+1 FROM music_ingestion_jobs CROSS JOIN sequence WHERE id=?`).bind(job.id).run();
  const newer = await (await request("/api/play/admin/imports?limit=100")).json() as { data: OtwPlayIngestionJobDto[]; nextCursor: string };
  expect(newer.data).toHaveLength(100);
  expect(newer.data.every(row => row.id !== job.id)).toBe(true);
  const older = await read<OtwPlayIngestionJobDto[]>(`/api/play/admin/imports?limit=100&cursor=${encodeURIComponent(newer.nextCursor)}`);
  expect(older.map(row => row.id)).toContain(job.id);
}, 60000);
