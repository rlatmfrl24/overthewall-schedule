import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";
import aiMigration from "../../../../drizzle/0092_perfect_manta.sql?raw";
import { D1IngestionRepository } from "./d1-ingestion-repository";
import { D1AiBatchRepository } from "./d1-ai-batch-repository";
import { D1AiReviewRepository } from "./d1-ai-review-repository";
import { AiReviewService } from "../application/ai-review-service";
import { AiBatchService } from "../application/ai-batch-service";
import type { AiReviewResult } from "@contracts/otw-play-ai-review";
import { AiReviewError, type AiReviewContext } from "../application/ports/ai-review";

const db = env.otw_db, now = Date.UTC(2026, 8, 29);
const selection = { filters: { source: "playlist" as const, jobId: "batch-import" } };
const result: AiReviewResult = { videoAnalyzed: true, warnings: [], songs: [{ values: {
  song: { title: "Song", existingSongId: null, candidates: [], tags: [], originalArtists: [{ name: "Artist", entityKind: "person", subject: { kind: "new_external", clientKey: "artist", displayName: "Artist", entityKind: "person" } }] },
  participants: [{ name: "Singer", entityKind: "person", subject: { kind: "new_external", clientKey: "singer", displayName: "Singer", entityKind: "person" }, role: "vocal" }],
}, evidence: {}, warnings: [] }] };
async function candidates(count: number) {
  for (let n = 0; n < count; n++) {
    const video = String(n).padStart(11, "A"), id = `youtube:${video}`;
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO music_ingestion_candidates(id,provider,external_video_id,candidate_kind,status,classification,title,availability_status,first_discovered_at,last_discovered_at,retention_expires_at,version,created_at,updated_at)
        VALUES(?,'youtube',?,'official_video','needs_input','eligible','Video','playable',?,?,?,0,?,?)`).bind(id, video, now, now, now + 86400000, now, now),
      db.prepare("INSERT OR IGNORE INTO music_ingestion_candidate_origins(id,candidate_id,job_id,playlist_id,playlist_item_id,playlist_position,discovered_at) VALUES(?,?,'batch-import','PLbatch',?,?,?)").bind(`origin-${n}`, id, `playlist-${n}`, n, now),
    ]);
  }
}
beforeEach(async () => {
  await applyD1Migrations(db, (env as unknown as { OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[] }).OTW_PLAY_INGESTION_MIGRATIONS);
  await applyD1Migrations(db, [aiMigration].map((sql, n) => ({ name: `batch-${n}`, queries: sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean) })));
  await db.batch([
    db.prepare("DELETE FROM music_ai_review_batches"), db.prepare("DELETE FROM music_ai_reviews"),
    db.prepare("DELETE FROM music_cover_proposals WHERE id='batch-proposal'"),
    db.prepare("DELETE FROM music_ingestion_candidate_origins"), db.prepare("DELETE FROM music_ingestion_candidates"), db.prepare("DELETE FROM music_ingestion_jobs"),
  ]);
  await db.prepare(`INSERT INTO music_ingestion_jobs(id,source_external_id,source_url,source_title,owner_channel_id,owner_channel_title,import_mode,requested_item_count,actor_user_id,idempotency_key,created_at,updated_at)
    VALUES('batch-import','PLbatch','https://youtube.com/playlist?list=PLbatch','Batch','channel','Channel','all_new',100,'admin','batch-import',?,?)`).bind(now, now).run();
});

it("snapshots all pages, deduplicates concurrent submissions and never appends later candidates on replay", async () => {
  await candidates(55);
  const repo = new D1AiBatchRepository(db);
  expect(await repo.preview(selection)).toBe(55);
  const [a, b] = await Promise.all([repo.create("a", "admin", "same-key", selection, now), repo.create("b", "admin", "same-key", selection, now)]);
  expect(a.id).toBe(b.id); expect(a.total).toBe(55);
  const first = await repo.get(a.id), second = await repo.get(a.id, first.nextCursor!);
  expect(first.items).toHaveLength(50); expect(second.items).toHaveLength(5);
  expect(new Set([...first.items, ...second.items].map(i => i.candidateId)).size).toBe(55);
  await candidates(56);
  expect((await repo.create("replay", "admin", "same-key", selection, now)).total).toBe(55);
  expect(await repo.preview(selection)).toBe(1);
  await expect(repo.create("conflict", "admin", "same-key", { filters: { source: "automatic" } }, now)).rejects.toMatchObject({ code: "idempotency_conflict" });
  expect(await db.prepare("SELECT id FROM music_ai_review_batches WHERE id='conflict'").first()).toBeNull();
});

it("excludes completed reviews, stale versions, unavailable videos and pending proposals", async () => {
  await candidates(4);
  await db.prepare("UPDATE music_ingestion_candidates SET status='ready' WHERE external_video_id=?").bind("AAAAAAAAAA0").run();
  await db.prepare("UPDATE music_ingestion_candidates SET availability_status='private' WHERE external_video_id=?").bind("AAAAAAAAAA1").run();
  const repo = new D1AiBatchRepository(db);
  expect(await repo.preview(selection)).toBe(2);
  await db.prepare("INSERT INTO music_cover_proposals(id,submitted_by_user_id,idempotency_key,submitted_url,youtube_video_id,submitted_title,created_at,updated_at) VALUES('batch-proposal','user','batch-proposal','https://youtube.com/watch?v=AAAAAAAAAA3','AAAAAAAAAA3','Proposal',?,?)").bind(now, now).run();
  expect(await repo.preview(selection)).toBe(1);
  expect(await repo.preview({ candidates: [{ id: "youtube:AAAAAAAAAA2", version: 1 }] })).toBe(0);
});

it("includes only the latest AI summary on every review page without exposing the draft result", async () => {
  await candidates(55);
  const repo = new D1AiBatchRepository(db), inbox = new D1IngestionRepository(db);
  await repo.create("old", "admin", "old-request", selection, now);
  await db.prepare("UPDATE music_ai_review_batch_items SET status='saved',result_json=?").bind(JSON.stringify(result)).run();
  await repo.create("new", "admin", "new-request", { candidates: [{ id: "youtube:AAAAAAAAAA0", version: 0 }] }, now + 1);
  await db.prepare("UPDATE music_ai_review_batch_items SET status='failed',error_message='분석 실패' WHERE batch_id='new'").run();
  const first = await inbox.listReviewItems({ source: "playlist", jobId: "batch-import" });
  const second = await inbox.listReviewItems({ source: "playlist", jobId: "batch-import", cursor: first.nextCursor! });
  expect(first.items).toHaveLength(50); expect(second.items).toHaveLength(5);
  const rows = [...first.items, ...second.items];
  expect(rows.find(r => r.id === "youtube:AAAAAAAAAA0")?.aiDraft).toEqual({ status: "failed", errorMessage: "분석 실패" });
  expect(rows.filter(r => r.id !== "youtube:AAAAAAAAAA0").every(r => r.aiDraft?.status === "saved")).toBe(true);
  expect(rows.every(r => Object.keys(r.aiDraft!).length === 2)).toBe(true);
  const before = (await repo.get("new")).batch;
  await db.prepare("UPDATE music_ai_review_batch_items SET error_message='새 대기 사유',updated_at=? WHERE batch_id='new'").bind(now + 2).run();
  const after = (await repo.get("new")).batch;
  expect(after.counts).toEqual(before.counts);
  expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
  expect((await repo.list()).find(b => b.id === "new")?.updatedAt).toBe(after.updatedAt);
});

function services(repository = new D1AiBatchRepository(db), dailyLimit = 100) {
  let time = now;
  const catalog = { entities: [], songs: [], members: [] };
  const context = { candidate: async (id: string) => ({ videoId: id.slice(8), candidateKind: "official_video", status: "needs_input" }), catalog: async () => catalog } as unknown as AiReviewContext;
  const analyze = vi.fn(async () => ({ result: structuredClone(result), usage: null }));
  const analysis = new AiReviewService(new D1AiReviewRepository(db), {
    readVideo: async (videoId) => ({ videoId, title: "Video", channelId: "channel", channelTitle: "Channel", thumbnailUrl: null, durationSeconds: 180, publishedAt: now, availabilityStatus: "playable", privacyStatus: "public" }), readChannel: vi.fn(),
  }, { analyze }, context, { send: vi.fn() }, { enabled: true, model: "test", dailyLimit }, async s => s, () => crypto.randomUUID(), () => time);
  const send = vi.fn(async () => {});
  const service = new AiBatchService(repository, analysis, send, true, () => crypto.randomUUID(), () => time, context);
  return { service, analyze, send, advance: (ms: number) => { time += ms; } };
}

it("completes durable drafts once after duplicate delivery, keeps human values and survives analysis cleanup", async () => {
  await candidates(2);
  const human = JSON.stringify({ song: { kind: "existing", songId: "human-song" }, participants: [] });
  await db.prepare("UPDATE music_ingestion_candidates SET review_input_json=? WHERE external_video_id='AAAAAAAAAA1'").bind(human).run();
  const repo = new D1AiBatchRepository(db), { service, analyze } = services(repo);
  const batch = await service.start(selection, "batch-start", "admin");
  const items = (await service.get(batch.id)).items;
  await Promise.all([service.process(items[0].id), service.process(items[0].id)]);
  await service.process(items[1].id);
  expect(analyze).toHaveBeenCalledTimes(2);
  expect((await service.get(batch.id)).batch.counts.saved).toBe(2);
  expect((await repo.draft("youtube:AAAAAAAAAA0"))?.autoApply).toBe(true);
  expect((await repo.draft("youtube:AAAAAAAAAA1"))?.autoApply).toBe(false);
  await db.prepare("DELETE FROM music_ai_reviews").run();
  expect((await repo.draft("youtube:AAAAAAAAAA0"))?.result.songs).toHaveLength(1);
  expect(await db.prepare("SELECT review_input_json,status,version FROM music_ingestion_candidates WHERE external_video_id='AAAAAAAAAA1'").first()).toEqual({ review_input_json: human, status: "needs_input", version: 0 });
  expect((await db.prepare("SELECT count(*) AS n FROM music_songs").first<{ n: number }>())!.n).toBe(0);
  expect((await db.prepare("SELECT count(*) AS n FROM music_performances").first<{ n: number }>())!.n).toBe(0);
});

it("retries only saving after a persistence failure and marks an intervening human edit as changed", async () => {
  await candidates(1);
  const repo = new D1AiBatchRepository(db), { service, analyze } = services(repo);
  const batch = await service.start(selection, "save-retry", "admin"), item = (await service.get(batch.id)).items[0];
  vi.spyOn(repo, "finish").mockRejectedValueOnce(new Error("D1 unavailable"));
  await expect(service.process(item.id)).rejects.toThrow("D1 unavailable");
  expect((await service.get(batch.id)).items[0].status).toBe("saving");
  await service.process(item.id);
  expect(analyze).toHaveBeenCalledTimes(1);
  expect((await repo.draft(item.candidateId))?.autoApply).toBe(true);
  await db.prepare("UPDATE music_ingestion_candidates SET version=version+1 WHERE id=?").bind(item.candidateId).run();
  expect((await repo.draft(item.candidateId))?.autoApply).toBe(false);
  const next = await service.start(selection, "changed-mid-analysis", "admin"), nextItem = (await service.get(next.id)).items[0];
  await db.prepare("UPDATE music_ingestion_candidates SET version=version+1 WHERE id=?").bind(item.candidateId).run();
  await service.process(nextItem.id);
  expect((await service.get(next.id)).items[0].status).toBe("changed");
  expect(analyze).toHaveBeenCalledTimes(1);
});

it("recovers dispatch and abandoned leases, preserves multi-song results for selection", async () => {
  await candidates(1);
  const repo = new D1AiBatchRepository(db), { service, analyze, send, advance } = services(repo);
  send.mockRejectedValueOnce(new Error("queue offline"));
  const batch = await service.start(selection, "dispatch-retry", "admin"), item = (await service.get(batch.id)).items[0];
  expect(await repo.hasRecoveryWork(now)).toBe(false);
  advance(600001);
  expect(await repo.hasRecoveryWork(now + 600001)).toBe(true);
  expect(await service.recover()).toEqual({ queued: 1, failed: 0 });
  await repo.claim(item.id, "crashed-worker", now + 600001);
  expect(await repo.claim(item.id, "duplicate", now + 600002)).toBeNull();
  advance(300001);
  analyze.mockResolvedValueOnce({ result: { ...result, songs: [result.songs[0], result.songs[0]] }, usage: null });
  await service.process(item.id);
  expect((await repo.draft(item.candidateId))?.result.songs).toHaveLength(2);
  expect((await service.get(batch.id)).batch.counts.needs_selection).toBe(1);
  expect(await repo.hasRecoveryWork(now + 1200001)).toBe(false);
});

it("retries failed items without reprocessing successful drafts and blocks edits made during analysis", async () => {
  await candidates(2);
  const repo = new D1AiBatchRepository(db), { service, analyze } = services(repo);
  const batch = await service.start(selection, "partial-batch", "admin"), items = (await service.get(batch.id)).items;
  analyze.mockRejectedValueOnce(new AiReviewError("analysis_failed", "분석 실패", 502));
  await service.process(items[0].id);
  await service.process(items[1].id);
  expect((await service.get(batch.id)).batch.counts).toMatchObject({ failed: 1, saved: 1 });
  await service.retry(batch.id);
  await service.process(items[0].id); await service.process(items[1].id);
  expect(analyze).toHaveBeenCalledTimes(3);
  expect((await service.get(batch.id)).batch.counts.saved).toBe(2);
  await db.prepare("DELETE FROM music_ai_reviews").run();
  const again = await service.start(selection, "race-batch", "admin"), item = (await service.get(again.id)).items[0];
  analyze.mockImplementationOnce(async () => {
    await db.prepare("UPDATE music_ingestion_candidates SET version=version+1 WHERE id=?").bind(item.candidateId).run();
    return { result: structuredClone(result), usage: null };
  });
  await service.process(item.id);
  expect((await service.get(again.id)).items.find(i => i.id === item.id)?.status).toBe("changed");
  expect((await repo.draft(item.candidateId))?.autoApply).toBe(false);
});
it("keeps daily-budget waits pending, exposes the reason, and resumes with the same analysis", async () => {
  await candidates(2);
  const repo = new D1AiBatchRepository(db), { service, analyze, advance } = services(repo, 1);
  const batch = await service.start(selection, "quota-batch", "admin"), items = (await service.get(batch.id)).items;
  await service.process(items[0].id);
  expect(await service.process(items[1].id)).toBeGreaterThan(0);
  expect((await service.get(batch.id)).items[1]).toMatchObject({ status: "analyzing", errorMessage: "일일 AI 호출 한도에 도달했습니다." });
  advance(700000);
  expect(await service.recover()).toEqual({ queued: 0, failed: 0 });
  advance(86400000);
  await service.process(items[1].id);
  expect((await service.get(batch.id)).batch.counts.saved).toBe(2);
  expect(analyze).toHaveBeenCalledTimes(2);
});
