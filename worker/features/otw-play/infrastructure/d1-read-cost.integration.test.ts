import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { expect, it } from "vitest";
import { D1AdminCatalogRepository } from "./d1-admin-catalog-repository";
import { D1IngestionRepository } from "./d1-ingestion-repository";
import { D1AiBatchRepository } from "./d1-ai-batch-repository";
import { IngestionService } from "../application/ingestion-service";
import { AdminCatalogService } from "../application/admin-catalog-service";
import type { OtwPlayIngestionQueueMessage } from "../application/ports/ingestion-repository";
import type { OtwPlayYouTubeIngestionReader } from "../application/ports/youtube-metadata";
import { meterD1 } from "../../../test-support/d1-meter";

// Real workerd D1 metadata, including reads performed by writes. Seeding and
// fixture writes are outside the meter; no mock D1 responses or estimated row counts.
const db = env.otw_db;

it("measures import and Ready/draft/publish reads at 50, 500 and 5000 rows", async () => {
  await applyD1Migrations(db, (env as Env & { OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[] }).OTW_PLAY_INGESTION_MIGRATIONS);
  const actor = { userId: "cost-admin", displayName: "Cost", ipAddress: null };
  const channelId = "UCaaaaaaaaaaaaaaaaaaaaaa";
  await db.prepare(`INSERT INTO music_channels (id, provider, external_channel_id, display_name, channel_role, verification_status, active, version, created_at, updated_at)
    VALUES ('cost-channel','youtube',?,'Cost channel','member_music','approved',1,0,1,1)`).bind(channelId).run();
  await db.prepare(`INSERT INTO music_entities (id, entity_kind, display_name, normalized_name, slug, version, created_at, updated_at)
    VALUES ('cost-artist','person','Cost Singer','cost singer','cost-singer',0,1,1)`).run();
  const singleSaveReads: number[] = [];
  const singleUpdateReads: number[] = [];
  for (const size of [50, 500, 5000]) {
    await db.prepare(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < ?)
      INSERT OR IGNORE INTO music_songs (id, slug, title, normalized_title, is_otw_original, original_release_precision, version, created_at, updated_at)
      SELECT 'background-'||n, 'background-'||n, 'Background '||n, 'background '||n, 1, 'unknown', 0, 1, 1 FROM seq`).bind(size).run();
    const measured = meterD1(db);
    const catalogRepo = new D1AdminCatalogRepository(measured.db);
    const repo = new D1IngestionRepository(measured.db);
    let sequence = 0;
    const id = () => `cost-${size}-${++sequence}`;
    const video = (videoId: string) => ({ videoId, channelId, channelTitle: "Cost channel", title: `Video ${videoId}`, thumbnailUrl: null,
      durationSeconds: 180, publishedAt: 1, availabilityStatus: "playable" as const, madeForKids: false });
    const metadata: OtwPlayYouTubeIngestionReader = {
      readVideo: async videoId => video(videoId), readChannel: async () => ({ channelId, displayName: "Cost channel" }),
      readChannelUploads: async () => null,
      readPlaylistSummary: async () => ({ playlistId: "PL1234567890", title: "Cost", ownerChannelId: channelId, ownerChannelTitle: "Cost channel", itemCount: size, privacyStatus: "public" }),
      readPlaylistPage: async (_playlist, token) => {
        const offset = Number(token ?? 0);
        return { items: Array.from({ length: Math.min(50, size - offset) }, (_, i) => ({ playlistItemId: `item-${offset+i}`,
          videoId: `V${String(size).padStart(5,"0")}${String(offset+i).padStart(5,"0")}`, position: offset+i })), nextPageToken: offset + 50 < size ? String(offset+50) : null };
      },
      readVideos: async ids => ids.map(videoId => ({ videoId, availabilityStatus: "playable", video: video(videoId) })),
    };
    const catalog = new AdminCatalogService(catalogRepo, metadata, { record: async () => {} }, id, true, () => 100);
    const pending: OtwPlayIngestionQueueMessage[] = [];
    const service = new IngestionService(repo, metadata, { send: async message => { pending.push(message); } }, id, () => 100, catalog);
    const job = await service.createJob(actor.userId, { playlistUrl: "PL1234567890", mode: "all_new", idempotencyKey: `cost-request-${size}` });
    while (pending.length) await service.process(pending.shift()!);
    expect((await service.getJob(job.id)).counts.metadataChecked).toBe(size);
    const importCost = measured.summary();
    const aiBatch = await new D1AiBatchRepository(measured.db).create(id(), actor.userId, id(), { importJobId: job.id }, 100);
    expect(aiBatch.total).toBe(size);
    await db.prepare("UPDATE music_ai_review_batch_items SET status = 'needs_selection' WHERE batch_id = ?").bind(aiBatch.id).run();
    // Identical 500-item workload at the representative size. The largest case
    // measures ingestion at 5000 and one isolated catalog mutation separately.
    const reviews = size === 5000 ? 1 : size;
    let firstSongId = "";
    for (let i = 0; i < reviews; i++) {
      if (i % 50 === 0) await repo.listReviewItems({ jobId: job.id, source: "playlist" });
      const candidateId = `youtube:V${String(size).padStart(5,"0")}${String(i).padStart(5,"0")}`;
      const before = measured.summary().rowsRead;
      const saved = await service.updateCandidate(candidateId, { action: "save", expectedVersion: 1, input: {
        song: { kind: "create", title: `Cost song ${size} ${i}`, isOtwOriginal: false, originalReleaseDate: null, originalReleasePrecision: "unknown",
          aliases: [], originalArtists: [{ subject: { kind: "entity", entityId: "cost-artist" }, creditOrder: 0, isPrimary: true }] },
        participants: [{ subject: { kind: "entity", entityId: "cost-artist" }, participantRole: "vocal", creditOrder: 0 }],
        relationType: "cover", releaseType: "official_video", participationType: "solo",
      } }, actor);
      if (i === 0) {
        singleSaveReads.push(measured.summary().rowsRead - before);
      }
      const { results: [converted] } = await service.convertCandidates(job.id, { candidates: [{ id: candidateId, expectedVersion: saved.version }] }, actor);
      expect(converted.outcome).toBe("created");
      const published = await catalog.transitionPerformance(converted.performanceId!, { expectedVersion: 0 }, "published", actor);
      expect(published.data.publicationStatus).toBe("published");
      if (i === 0) firstSongId = published.data.songId;
    }
    const total = measured.summary();
    await catalog.updateSong({ id: firstSongId, expectedVersion: 0, slug: `updated-${size}`, title: `Cost song ${size} revised`,
      isOtwOriginal: false, originalReleaseDate: null, originalReleasePrecision: "unknown", aliases: [],
      originalArtists: [{ subject: { kind: "entity", entityId: "cost-artist" }, creditOrder: 0, isPrimary: true }] }, actor);
    singleUpdateReads.push(measured.summary().rowsRead - total.rowsRead);
    console.log("PLAY_READ_COST", JSON.stringify({ size, reviews, importCost, total, singleReadyRowsRead: singleSaveReads.at(-1), singleSongUpdateRowsRead: singleUpdateReads.at(-1) }));
  }
  expect(singleSaveReads[2]).toBeLessThan(singleSaveReads[0] * 2);
  expect(singleUpdateReads[2]).toBeLessThan(singleUpdateReads[0] * 2);
}, 240_000);
