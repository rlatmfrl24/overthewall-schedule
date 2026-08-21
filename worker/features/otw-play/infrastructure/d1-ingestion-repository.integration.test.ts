import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  OtwPlayCreatePlaylistImportRequest,
  OtwPlayPlaylistPreflightDto,
} from "@contracts/otw-play";
import type { OtwPlayYouTubeVideoObservation } from "../application/ports/youtube-metadata";
import { D1IngestionRepository } from "./d1-ingestion-repository";

type TestEnv = Env & {
  OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;
const db = testEnv.otw_db;
const NOW = Date.UTC(2026, 7, 21, 3);

const preflight: OtwPlayPlaylistPreflightDto = {
  playlistId: "PL1234567890",
  canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890",
  title: "Official Covers",
  ownerChannelId: "UCowner",
  ownerChannelTitle: "Official",
  itemCount: 4,
  privacyStatus: "public",
  requestedItemCount: 4,
  estimatedPageCount: 1,
  estimatedVideoBatchCount: 1,
  hardCap: 5_000,
  requiresSplit: false,
  previousImport: null,
};

const input: OtwPlayCreatePlaylistImportRequest = {
  playlistUrl: preflight.canonicalUrl,
  mode: "all_new",
  idempotencyKey: "request-0001",
};

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_ingestion_candidate_origins"),
    db.prepare("DELETE FROM music_ingestion_messages"),
    db.prepare("DELETE FROM music_ingestion_candidates"),
    db.prepare("DELETE FROM music_ingestion_jobs"),
    db.prepare("DELETE FROM music_media_sources WHERE id LIKE 'ingestion-%'"),
    db.prepare("DELETE FROM music_channels WHERE id LIKE 'ingestion-%'"),
  ]);
  await db.prepare(
    `INSERT INTO music_channels (
      id, provider, external_channel_id, display_name, channel_role,
      verification_status, active, version, created_at, updated_at
    ) VALUES ('ingestion-approved-channel', 'youtube', 'UCaaaaaaaaaaaaaaaaaaaaaa',
      'Approved', 'member_music', 'approved', 1, 0, ?, ?)`,
  ).bind(NOW, NOW).run();
});

describe("D1IngestionRepository", () => {
  it("stores an idempotent job and authoritative first outbox message", async () => {
    const repository = new D1IngestionRepository(db);
    const created = await repository.createJob({
      jobId: "job-1",
      actorUserId: "admin-1",
      input,
      preflight,
      now: NOW,
    });
    expect(created.job).toMatchObject({
      id: "job-1",
      playlistId: preflight.playlistId,
      status: "queued",
      counts: { discovered: 0 },
    });
    await expect(
      repository.readMessage(created.message.idempotencyKey),
    ).resolves.toMatchObject({
      kind: "playlist_page",
      status: "pending",
      attempts: 0,
    });
    const replay = await repository.createJob({
      jobId: "job-replay",
      actorUserId: "admin-1",
      input,
      preflight,
      now: NOW + 1,
    });
    expect(replay.job.id).toBe("job-1");
    await expect(repository.createJob({
      jobId: "job-conflict",
      actorUserId: "admin-1",
      input: { ...input, mode: "recent", recentLimit: 1 },
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW + 2,
    })).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("preserves positions, classifies metadata, and completes once under duplicate delivery", async () => {
    const repository = new D1IngestionRepository(db);
    const created = await repository.createJob({
      jobId: "job-1",
      actorUserId: "admin-1",
      input,
      preflight,
      now: NOW,
    });
    const firstMessage = await repository.readMessage(
      created.message.idempotencyKey,
    );
    const children = await repository.recordPlaylistPage(firstMessage, {
      items: [
        { playlistItemId: "item-0", videoId: "AAAAAAAAAAA", position: 0 },
        { playlistItemId: "item-1", videoId: "BBBBBBBBBBB", position: 1 },
        { playlistItemId: "item-2", videoId: "AAAAAAAAAAA", position: 2 },
        { playlistItemId: "item-3", videoId: "CCCCCCCCCCC", position: 3 },
      ],
      nextPageToken: "must-not-be-enqueued-after-limit",
    }, NOW + 1);
    expect(children).toHaveLength(1);
    expect(await repository.getJob("job-1")).toMatchObject({
      status: "collecting",
      counts: { discovered: 4, playlistDuplicate: 1 },
    });

    const batchMessage = await repository.readMessage(children[0]!.idempotencyKey);
    expect(batchMessage.videoIds).toEqual([
      "AAAAAAAAAAA",
      "BBBBBBBBBBB",
      "CCCCCCCCCCC",
    ]);
    const observations: OtwPlayYouTubeVideoObservation[] = [
      {
        videoId: "AAAAAAAAAAA",
        availabilityStatus: "playable",
        video: {
          videoId: "AAAAAAAAAAA",
          channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
          channelTitle: "Approved",
          title: "Eligible",
          thumbnailUrl: "https://i.ytimg.com/a.jpg",
          durationSeconds: 180,
          publishedAt: NOW - 1_000,
          availabilityStatus: "playable",
          madeForKids: false,
        },
      },
      {
        videoId: "BBBBBBBBBBB",
        availabilityStatus: "playable",
        video: {
          videoId: "BBBBBBBBBBB",
          channelId: "UCunknown",
          channelTitle: "Unknown",
          title: "Kids",
          thumbnailUrl: null,
          durationSeconds: 200,
          publishedAt: NOW - 2_000,
          availabilityStatus: "playable",
          madeForKids: true,
        },
      },
      {
        videoId: "CCCCCCCCCCC",
        availabilityStatus: "deleted",
        video: null,
      },
    ];
    await repository.recordVideoBatch(batchMessage, observations, NOW + 2);
    const completed = await repository.getJob("job-1");
    expect(completed).toMatchObject({
      status: "completed",
      counts: {
        discovered: 4,
        metadataChecked: 3,
        eligible: 1,
        policyBlocked: 1,
        unavailable: 1,
        playlistDuplicate: 1,
      },
    });
    const page = await repository.listItems("job-1", 10, null);
    expect(page.page.items.map((item) => [
      item.playlistPosition,
      item.classification,
      item.status,
    ])).toEqual([
      [0, "eligible", "needs_input"],
      [1, "policy_blocked", "blocked"],
      [2, "playlist_duplicate", "needs_input"],
      [3, "unavailable", "blocked"],
    ]);
    const versionsBefore = await db.prepare(
      "SELECT external_video_id, version FROM music_ingestion_candidates ORDER BY external_video_id",
    ).all<{ external_video_id: string; version: number }>();
    await repository.recordVideoBatch(batchMessage, observations, NOW + 3);
    const versionsAfter = await db.prepare(
      "SELECT external_video_id, version FROM music_ingestion_candidates ORDER BY external_video_id",
    ).all<{ external_video_id: string; version: number }>();
    expect(versionsAfter.results).toEqual(versionsBefore.results);
  });

  it("shows a repeated discovery as an existing candidate without changing its global decision", async () => {
    const repository = new D1IngestionRepository(db);
    const first = await repository.createJob({
      jobId: "job-1",
      actorUserId: "admin-1",
      input,
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW,
    });
    await repository.recordPlaylistPage(
      await repository.readMessage(first.message.idempotencyKey),
      {
        items: [{ playlistItemId: "item-a", videoId: "AAAAAAAAAAA", position: 0 }],
        nextPageToken: null,
      },
      NOW,
    );
    const second = await repository.createJob({
      jobId: "job-2",
      actorUserId: "admin-2",
      input: { ...input, idempotencyKey: "request-0002" },
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW + 10,
    });
    await repository.recordPlaylistPage(
      await repository.readMessage(second.message.idempotencyKey),
      {
        items: [{ playlistItemId: "item-b", videoId: "AAAAAAAAAAA", position: 0 }],
        nextPageToken: null,
      },
      NOW + 10,
    );
    const page = await repository.listItems("job-2", 10, null);
    expect(page.page.items[0]?.classification).toBe("existing_candidate");
  });

  it("keeps retry state in D1 and marks exhausted messages partial", async () => {
    const repository = new D1IngestionRepository(db);
    const created = await repository.createJob({
      jobId: "job-1",
      actorUserId: "admin-1",
      input,
      preflight,
      now: NOW,
    });
    await repository.recordMessageFailure(
      created.message.idempotencyKey,
      "quota_exceeded",
      NOW + 60_000,
      NOW + 1,
    );
    expect(await repository.getJob("job-1")).toMatchObject({
      status: "queued",
      lastErrorCode: "quota_exceeded",
      counts: { retryPending: 1 },
    });
    expect(await repository.listPendingMessages(NOW + 59_999, 100)).toEqual([]);
    expect(await repository.listPendingMessages(NOW + 60_000, 100)).toHaveLength(1);
    await repository.markMessageDeadLetter(
      created.message.idempotencyKey,
      "queue_retries_exhausted",
      NOW + 60_001,
    );
    expect(await repository.getJob("job-1")).toMatchObject({
      status: "partial",
      counts: { retryPending: 0, permanentError: 1 },
    });
  });

  it("removes YouTube API data at 30 days while preserving the internal decision", async () => {
    const repository = new D1IngestionRepository(db);
    const created = await repository.createJob({
      jobId: "job-1",
      actorUserId: "admin-1",
      input,
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW,
    });
    const children = await repository.recordPlaylistPage(
      await repository.readMessage(created.message.idempotencyKey),
      {
        items: [{ playlistItemId: "item-a", videoId: "AAAAAAAAAAA", position: 0 }],
        nextPageToken: null,
      },
      NOW,
    );
    await repository.recordVideoBatch(
      await repository.readMessage(children[0]!.idempotencyKey),
      [{
        videoId: "AAAAAAAAAAA",
        availabilityStatus: "playable",
        video: {
          videoId: "AAAAAAAAAAA",
          channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
          channelTitle: "Approved",
          title: "Eligible",
          thumbnailUrl: "https://i.ytimg.com/a.jpg",
          durationSeconds: 180,
          publishedAt: NOW - 1_000,
          availabilityStatus: "playable",
          madeForKids: false,
        },
      }],
      NOW,
    );
    const thirtyDays = 30 * 86_400_000;
    await expect(
      repository.clearExpiredApiData(NOW + thirtyDays - 1, 100),
    ).resolves.toBe(0);
    await expect(
      repository.clearExpiredApiData(NOW + thirtyDays, 100),
    ).resolves.toBe(1);
    const candidate = await db.prepare(
      `SELECT title, channel_id, thumbnail_url, availability_status,
        metadata_checked_at, classification, status
       FROM music_ingestion_candidates WHERE external_video_id = ?`,
    ).bind("AAAAAAAAAAA").first<Record<string, unknown>>();
    expect(candidate).toMatchObject({
      title: null,
      channel_id: null,
      thumbnail_url: null,
      availability_status: "unknown",
      metadata_checked_at: null,
      classification: "eligible",
      status: "needs_input",
    });
  });
});
