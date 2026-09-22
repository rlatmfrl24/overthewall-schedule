import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiReviewService } from "../application/ai-review-service";
import type { OtwPlayAdminCatalogDto } from "@contracts/otw-play";
import migration from "../../../../drizzle/0092_perfect_manta.sql?raw";
import { D1AiReviewRepository } from "./d1-ai-review-repository";
import { D1AiReviewContext } from "./d1-ai-review-context";
import { resolveAiReviewCatalog } from "../domain/ai-review-result";
import type { AiReviewResult } from "@contracts/otw-play-ai-review";
import {
  AiReviewError,
  type AiReviewRecord,
} from "../application/ports/ai-review";
const db = env.otw_db;
const now = Date.UTC(2026, 8, 15);
const record = (id: string, hash = id): AiReviewRecord => ({
  id,
  candidateId: null,
  videoId: "BBBBBBBBBBB",
  candidateKind: "official_video",
  range: null,
  targetKey: "target",
  inputHash: hash,
  input: {
    promptVersion: "4",
    video: {
      videoId: "BBBBBBBBBBB",
      title: "Song",
      channelId: "channel",
      channelTitle: "Channel",
      thumbnailUrl: null,
      durationSeconds: 180,
      publishedAt: 1,
      availabilityStatus: "playable",
    },
    range: null,
    candidateKind: "official_video",
    members: [],
  },
  model: "test-model",
  status: "queued",
  result: null,
  usage: null,
  attempts: 0,
  leaseToken: null,
  errorCode: null,
  errorMessage: null,
  retryable: false,
  nextRetryAt: null,
  createdAt: now,
  updatedAt: now,
  expiresAt: now + 30 * 86400000,
});
beforeEach(async () => {
  await applyD1Migrations(db, [
    {
      name: "ai-review",
      queries: migration
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean),
    },
  ]);
  await db.prepare("DELETE FROM music_ai_reviews").run();
});
describe("AI review durable execution", () => {
  it("reuses completed analysis across presentation changes but rechecks privacy and evidence", async () => {
    const repo = new D1AiReviewRepository(db);
    const video = { ...record("source").input!.video, privacyStatus: "public", tags: ["J-POP", "Live"] };
    const readVideo = vi.fn().mockResolvedValue(video);
    const analyze = vi.fn().mockResolvedValue({ result: { videoAnalyzed: true, songs: [], warnings: [] }, usage: { inputTokens: 10, outputTokens: 1 } });
    const service = new AiReviewService(repo, { readVideo, readChannel: vi.fn() }, { analyze },
      { candidate: vi.fn(), catalog: vi.fn().mockResolvedValue({ entities: [], songs: [], members: [] }) },
      { send: vi.fn() }, { enabled: true, model: "model", dailyLimit: 100 }, async s => s,
      () => crypto.randomUUID(), () => now);
    const request = { target: { youtubeUrl: "https://www.youtube.com/watch?v=BBBBBBBBBBB", candidateKind: "official_video" as const }, range: null, idempotencyKey: "first" };
    const first = await service.start(request, "admin");
    await service.process(first.id);
    readVideo.mockResolvedValue({ ...video, thumbnailUrl: "https://example.com/new.jpg", tags: ["Live", "J-POP", "Live"] });
    const reused = await service.start({ ...request, idempotencyKey: "second" }, "admin");
    expect(reused).toMatchObject({ id: first.id, status: "succeeded" });
    expect(analyze).toHaveBeenCalledTimes(1);
    readVideo.mockResolvedValue({ ...video, privacyStatus: "private" });
    await expect(service.start({ ...request, idempotencyKey: "private" }, "admin")).rejects.toMatchObject({ code: "video_unavailable" });
    readVideo.mockResolvedValue({ ...video, description: "Changed original artist credit" });
    const changed = await service.start({ ...request, idempotencyKey: "changed" }, "admin");
    expect(changed.id).not.toBe(first.id);
    expect(changed.status).toBe("queued");
    readVideo.mockResolvedValue(video);
    const forced = await service.start({ ...request, force: true, idempotencyKey: "forced" }, "admin");
    expect(forced.id).not.toBe(first.id);
  });
  it("persists the catalog check after analysis and refreshes matches without another model call", async () => {
    const repo = new D1AiReviewRepository(db);
    const result: AiReviewResult = { videoAnalyzed: true, warnings: [], songs: [{ values: { song: { title: "うたたね", alternateTitles: ["선잠"], originalArtists: [{ name: "Leina", entityKind: "person", subject: null }], tags: [], existingSongId: null, candidates: [] } }, evidence: {}, warnings: [] }] };
    const analyze = vi.fn().mockResolvedValue({ result, usage: { inputTokens: 10, outputTokens: 10 } });
    const catalogValue = { entities: [], songs: [{ id: "existing-song", title: "선잠", aliases: [], tags: ["J-POP"], archivedAt: null, originalArtists: [{ entityId: "artist", displayName: "Leina" }] }] };
    const catalog = vi.fn().mockResolvedValue(catalogValue);
    const service = new AiReviewService(repo, { readVideo: vi.fn(), readChannel: vi.fn() }, { analyze }, { candidate: vi.fn(), catalog }, { send: vi.fn() }, { enabled: true, model: "model", dailyLimit: 100 }, async (s) => s, () => crypto.randomUUID(), () => now);
    await repo.create(record("catalog-check"), "catalog-check", "catalog-check", false, now);
    await service.process("catalog-check");
    expect((await repo.get("catalog-check"))?.result?.songs[0].values.song).toMatchObject({ existingSongId: "existing-song", title: "선잠", tags: ["J-POP"] });
    catalog.mockResolvedValue({ ...catalogValue, songs: [] });
    expect((await service.get("catalog-check")).result?.songs[0].values.song?.existingSongId).toBeNull();
    expect(analyze).toHaveBeenCalledTimes(1);
  });
  it("loads a real member without a music entity and resolves to the existing member ID without catalog writes", async () => {
    await applyD1Migrations(db, (env as unknown as { OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS: D1Migration[] }).OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS);
    await db.prepare("INSERT INTO members(uid,code,name,is_deprecated,youtube_channel_id,url_chzzk) VALUES(9876,'ai-review-member','테스트 가창자',0,'UC-test','https://chzzk.naver.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')").run();
    const context = new D1AiReviewContext(db);
    const catalog = await context.catalog();
    expect(catalog.members.find((m) => m.uid === 9876)).toMatchObject({ name: "테스트 가창자", youtubeChannelIds: ["UC-test"], chzzkChannelId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    const result = resolveAiReviewCatalog({ videoAnalyzed: true, warnings: [], songs: [{ values: { participants: [{ name: "테스트 가창자", entityKind: "person", role: "vocal", subject: null }] }, evidence: {}, warnings: [] }] }, catalog);
    expect(result.songs[0].values.participants?.[0].subject).toEqual({ kind: "member", memberUid: 9876 });
    expect(await db.prepare("SELECT id FROM music_entities WHERE member_uid=9876").first()).toBeNull();
  });
  it("checks broadcast ownership once per shared URL, drops original-song links and preserves analysis on lookup failure", async () => {
    const repo = new D1AiReviewRepository(db);
    const urls = ["https://youtu.be/AAAAAAAAAAA", "https://youtu.be/AAAAAAAAAAA", "https://youtu.be/CCCCCCCCCCC", "https://chzzk.naver.com/video/123"];
    const result: AiReviewResult = { videoAnalyzed: true, warnings: [], songs: urls.map((originalUrl) => ({ values: { originalUrl, participants: [{ name: "Member", entityKind: "person", role: "featured_vocal", subject: null }] }, evidence: {}, warnings: [] })) };
    const analyze = vi.fn().mockResolvedValue({ result, usage: { inputTokens: 100, outputTokens: 10 } });
    const read = vi.fn().mockResolvedValueOnce({ platform: "youtube", channelId: "member-channel", isBroadcast: true }).mockResolvedValueOnce({ platform: "youtube", channelId: "original-artist", isBroadcast: false }).mockRejectedValueOnce(new Error("timeout"));
    const catalog = vi.fn().mockResolvedValue({ entities: [], songs: [], members: [{ uid: 7, name: "Member", aliases: [], youtubeChannelIds: ["member-channel"], youtubeVodChannelIds: [] }] });
    const service = new AiReviewService(repo, { readVideo: vi.fn(), readChannel: vi.fn() }, { analyze }, { candidate: vi.fn(), catalog }, { send: vi.fn() }, { enabled: true, model: "model", dailyLimit: 100 }, async (s) => s, () => crypto.randomUUID(), () => now, { read });
    await repo.create(record("source-check"), "source-check", "source-check", false, now);
    await service.process("source-check");
    const saved = await service.get("source-check");
    expect(saved.status).toBe("succeeded");
    expect(saved.result?.songs.map((song) => song.values.originalUrl)).toEqual([urls[0], urls[1], undefined, undefined]);
    expect(saved.result?.songs[2].warnings.join(" ")).toContain("다시보기");
    expect(read).toHaveBeenCalledTimes(3);
    await service.get("source-check");
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("recovers a failed dispatch and reads a stored result without another model call", async () => {
    const repo = new D1AiReviewRepository(db);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("queue unavailable"))
      .mockResolvedValue(undefined);
    const analyze = vi
      .fn()
      .mockResolvedValue({
        result: { videoAnalyzed: true, songs: [], warnings: [] },
        usage: { inputTokens: 40, outputTokens: 10 },
      });
    const readVideo = vi
      .fn()
      .mockResolvedValue({
        ...record("input").input!.video,
        privacyStatus: "public",
      });
    const catalog = vi
      .fn()
      .mockResolvedValue({
        entities: [],
        songs: [],
      } as unknown as OtwPlayAdminCatalogDto);
    const service = new AiReviewService(
      repo,
      { readVideo, readChannel: vi.fn() },
      { analyze },
      { candidate: vi.fn(), catalog },
      { send },
      { enabled: true, model: "stored-model", dailyLimit: 100 },
      async (value) => value,
      () => crypto.randomUUID(),
      () => now,
    );
    const request = {
      target: {
        youtubeUrl: "https://youtu.be/BBBBBBBBBBB",
        candidateKind: "official_video" as const,
      },
      range: null,
      idempotencyKey: "request-one",
    };
    const started = await service.start(request, "admin");
    expect(started.status).toBe("queued");
    expect(started).not.toHaveProperty("input");
    expect(analyze).not.toHaveBeenCalled();
    expect(await service.recover()).toEqual({ queued: 1, failed: 0 });
    await service.process(started.id);
    expect(analyze).toHaveBeenCalledWith(
      expect.objectContaining({ range: null }),
      "stored-model",
    );
    expect(await service.get(started.id)).toMatchObject({
      status: "succeeded",
      attempts: 1,
    });
    expect((await service.latest(request))?.id).toBe(started.id);
    expect(
      (
        await service.start(
          { ...request, idempotencyKey: "request-two" },
          "admin",
        )
      ).id,
    ).toBe(started.id);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests and never creates work for an idempotency conflict", async () => {
    const repo = new D1AiReviewRepository(db);
    const results = await Promise.all([
      repo.create(record("a", "same"), "admin:key1", "h1", false, now),
      repo.create(record("b", "same"), "admin:key2", "h1", false, now),
    ]);
    expect(results[0].id).toBe(results[1].id);
    await expect(
      repo.create(record("c", "different"), "admin:key1", "other", false, now),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect(await repo.get("c")).toBeNull();
    expect(
      (
        await db
          .prepare("SELECT count(*) AS count FROM music_ai_reviews")
          .first<{ count: number }>()
      )?.count,
    ).toBe(1);
  });
  it("claims one global call and counts attempts across retries against the UTC budget", async () => {
    const repo = new D1AiReviewRepository(db);
    await repo.create(record("a"), "key-a", "a", false, now);
    await repo.create(record("b"), "key-b", "b", false, now);
    const claimed = await Promise.all([
      repo.claim("a", "token-a", now, 1),
      repo.claim("b", "token-b", now, 1),
    ]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
    const active = claimed.find(Boolean)!;
    await repo.finish(
      active.id,
      active.leaseToken!,
      null,
      null,
      new AiReviewError("timeout", "timeout", 502, true),
      now + 10,
    );
    expect(await repo.claim(active.id, "next", now + 60000, 1)).toBeNull();
    expect((await repo.get(active.id))?.errorCode).toBe("daily_limit");
    expect((await repo.get(active.id))?.nextRetryAt).toBe(now + 86400000);
    expect(
      await repo.claim(active.id, "tomorrow", now + 86400000, 1),
    ).toMatchObject({ attempts: 2 });
  });
  it("recovers leases, rejects late results, reuses successful results and honors force", async () => {
    const repo = new D1AiReviewRepository(db);
    await repo.create(record("a"), "a", "a", false, now);
    await repo.claim("a", "old", now, 100);
    expect(await repo.recover(now + 240001)).toEqual(["a"]);
    await repo.claim("a", "new", now + 240002, 100);
    await repo.finish(
      "a",
      "old",
      { videoAnalyzed: true, songs: [], warnings: [] },
      null,
      null,
      now + 240003,
    );
    expect((await repo.get("a"))?.status).toBe("running");
    await repo.finish(
      "a",
      "new",
      { videoAnalyzed: true, songs: [], warnings: [] },
      { inputTokens: 123, outputTokens: 12 },
      null,
      now + 240004,
    );
    expect(
      (await repo.create(record("b", "a"), "b", "b", false, now + 240005)).id,
    ).toBe("a");
    expect(
      (await repo.create(record("c", "a"), "c", "c", true, now + 240006)).id,
    ).toBe("c");
  });
  it("ends retries after three calls, records partial independently, and clears retained inputs", async () => {
    const repo = new D1AiReviewRepository(db);
    await repo.create(record("a"), "a", "a", false, now);
    for (let i = 0; i < 3; i++) {
      await repo.claim("a", `t${i}`, now + i * 120000, 100);
      await repo.finish(
        "a",
        `t${i}`,
        null,
        null,
        new AiReviewError("network", "network", 502, true),
        now + i * 120000 + 1,
      );
    }
    expect(await repo.get("a")).toMatchObject({
      status: "failed",
      attempts: 3,
    });
    await repo.create(record("b"), "b", "b", false, now);
    await repo.claim("b", "partial", now + 400000, 100);
    await repo.finish(
      "b",
      "partial",
      { videoAnalyzed: false, songs: [], warnings: ["video unavailable"] },
      null,
      null,
      now + 400001,
    );
    expect((await repo.get("b"))?.status).toBe("partial");
    expect(await repo.clearExpired(now + 30 * 86400000)).toBe(2);
    expect(
      (
        await db
          .prepare("SELECT count(*) AS n FROM music_ai_review_attempts")
          .first<{ n: number }>()
      )?.n,
    ).toBe(0);
  });
});
