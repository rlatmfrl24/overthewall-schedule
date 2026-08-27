import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  OtwPlayCreatePlaylistImportRequest,
  OtwPlayIngestionReviewInput,
  OtwPlayPlaylistPreflightDto,
} from "@contracts/otw-play";
import type { OtwPlayYouTubeVideoObservation } from "../application/ports/youtube-metadata";
import { D1IngestionRepository } from "./d1-ingestion-repository";

type TestEnv = Env & {
  OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[];
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
  rangeStartPosition: 0,
  rangeEndExclusive: 4,
  nextRangeStart: null,
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

const reviewInput = {
  song: { kind: "existing" as const, songId: "song-1" },
  participants: [{
    subject: { kind: "entity" as const, entityId: "entity-1" },
    participantRole: "vocal" as const,
    creditOrder: 0,
  }],
  relationType: "cover" as const,
  releaseType: "official_video" as const,
  participationType: "solo" as const,
  internalNote: "private review note",
};

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_ingestion_events"),
    db.prepare("DELETE FROM music_ingestion_candidate_origins"),
    db.prepare("DELETE FROM music_ingestion_messages"),
    db.prepare("DELETE FROM music_ingestion_candidates"),
    db.prepare("DELETE FROM music_ingestion_jobs"),
    db.prepare("DELETE FROM music_media_sources WHERE id LIKE 'ingestion-%'"),
    db.prepare("DELETE FROM music_channels WHERE id LIKE 'ingestion-%'"),
    db.prepare("DELETE FROM music_entities WHERE id = 'entity-1'"),
  ]);
  await db.batch([
    db.prepare(
      `INSERT INTO music_channels (
        id, provider, external_channel_id, display_name, channel_role,
        verification_status, active, version, created_at, updated_at
      ) VALUES
        ('ingestion-approved-channel', 'youtube', 'UCaaaaaaaaaaaaaaaaaaaaaa',
          'Approved', 'member_music', 'approved', 1, 0, ?, ?),
        ('ingestion-kirinuki-channel', 'youtube', 'UCkkkkkkkkkkkkkkkkkkkkkk',
          'Kirinuki', 'approved_kirinuki', 'approved', 1, 0, ?, ?)`,
    ).bind(NOW, NOW, NOW, NOW),
    db.prepare(
      `INSERT INTO music_entities (
        id, member_uid, entity_kind, display_name, normalized_name, slug,
        version, created_at, updated_at
      ) VALUES ('entity-1', NULL, 'person', 'Review Singer',
        'review singer', 'review-singer', 0, ?, ?)`,
    ).bind(NOW, NOW),
  ]);
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
    const createdEvents = await db.prepare(
      `SELECT event_type, actor_user_id, detail_json
       FROM music_ingestion_events WHERE job_id = 'job-1'`,
    ).all<{
      event_type: string;
      actor_user_id: string;
      detail_json: string;
    }>();
    expect(createdEvents.results).toHaveLength(1);
    expect(createdEvents.results[0]).toMatchObject({
      event_type: "job.created",
      actor_user_id: "admin-1",
    });
    expect(createdEvents.results[0]?.detail_json).not.toContain("Official Covers");
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

  it("keeps 50-item persistence within small D1 batches", async () => {
    const batchSizes: number[] = [];
    const countedDb = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        batchSizes.push(statements.length);
        return db.batch(statements);
      },
    } as unknown as D1Database;
    const repository = new D1IngestionRepository(countedDb);
    const items = Array.from({ length: 50 }, (_, index) => ({
      playlistItemId: `item-${index}`,
      videoId: `V${String(index).padStart(10, "0")}`,
      position: index,
    }));
    const created = await repository.createJob({
      jobId: "job-50",
      actorUserId: "admin-1",
      input: { ...input, idempotencyKey: "request-0050" },
      preflight: {
        ...preflight,
        itemCount: 50,
        requestedItemCount: 50,
      },
      now: NOW,
    });
    const children = await repository.recordPlaylistPage(
      await repository.readMessage(created.message.idempotencyKey),
      { items, nextPageToken: "unused-after-limit" },
      NOW + 1,
    );
    const videoMessage = await repository.readMessage(children[0]!.idempotencyKey);
    await repository.recordVideoBatch(
      videoMessage,
      items.map((item) => ({
        videoId: item.videoId,
        availabilityStatus: "playable" as const,
        video: {
          videoId: item.videoId,
          channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
          channelTitle: "Approved",
          title: item.videoId,
          thumbnailUrl: null,
          durationSeconds: 240,
          publishedAt: NOW,
          availabilityStatus: "playable" as const,
          madeForKids: false,
          scopeReview: false,
        },
      })),
      NOW + 2,
    );

    expect(batchSizes).toEqual([3, 8, 8]);
    expect((await repository.getJob("job-50")).counts.metadataChecked).toBe(50);
  });

  it("requires explicit review for out-of-scope media and rejects non-official roles", async () => {
    const repository = new D1IngestionRepository(db);
    const created = await repository.createJob({
      jobId: "job-scope",
      actorUserId: "admin-1",
      input: { ...input, idempotencyKey: "request-scope" },
      preflight: { ...preflight, requestedItemCount: 2 },
      now: NOW,
    });
    const children = await repository.recordPlaylistPage(
      await repository.readMessage(created.message.idempotencyKey),
      {
        items: [
          { playlistItemId: "scope", videoId: "SSSSSSSSSSS", position: 0 },
          { playlistItemId: "kirinuki", videoId: "KKKKKKKKKKK", position: 1 },
        ],
        nextPageToken: null,
      },
      NOW + 1,
    );
    await repository.recordVideoBatch(
      await repository.readMessage(children[0]!.idempotencyKey),
      [
        {
          videoId: "SSSSSSSSSSS",
          availabilityStatus: "playable",
          video: {
            videoId: "SSSSSSSSSSS",
            channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
            channelTitle: "Approved",
            title: "Short",
            thumbnailUrl: null,
            durationSeconds: 120,
            publishedAt: NOW,
            availabilityStatus: "playable",
            madeForKids: false,
            scopeReview: true,
          },
        },
        {
          videoId: "KKKKKKKKKKK",
          availabilityStatus: "playable",
          video: {
            videoId: "KKKKKKKKKKK",
            channelId: "UCkkkkkkkkkkkkkkkkkkkkkk",
            channelTitle: "Kirinuki",
            title: "Kirinuki",
            thumbnailUrl: null,
            durationSeconds: 240,
            publishedAt: NOW,
            availabilityStatus: "playable",
            madeForKids: false,
            scopeReview: false,
          },
        },
      ],
      NOW + 2,
    );

    const page = await repository.listItems("job-scope", 10, null);
    expect(page.page.items.map((item) => [item.videoId, item.classification]))
      .toEqual([
        ["SSSSSSSSSSS", "scope_review"],
        ["KKKKKKKKKKK", "channel_review"],
      ]);
    await expect(repository.saveCandidateReview({
      candidateId: "youtube:SSSSSSSSSSS",
      expectedVersion: 1,
      input: {
        ...reviewInput,
        participants: [{
          ...reviewInput.participants[0],
          subject: { kind: "entity", entityId: "missing-entity" },
        }],
      },
      actorUserId: "admin-reviewer",
      eventId: "event-missing-entity-review",
      now: NOW + 3,
    })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(repository.saveCandidateReview({
      candidateId: "youtube:SSSSSSSSSSS",
      expectedVersion: 1,
      input: reviewInput,
      actorUserId: "admin-reviewer",
      eventId: "event-scope-review",
      now: NOW + 3,
    })).resolves.toMatchObject({
      classification: "eligible",
      status: "ready",
    });
    await expect(repository.saveCandidateReview({
      candidateId: "youtube:KKKKKKKKKKK",
      expectedVersion: 1,
      input: reviewInput,
      actorUserId: "admin-reviewer",
      eventId: "event-kirinuki-review",
      now: NOW + 3,
    })).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("uses a newly approved channel to continue a stale channel-review candidate", async () => {
    const repository = new D1IngestionRepository(db);
    const lateChannelId = `UC${"L".repeat(22)}`;
    const created = await repository.createJob({
      jobId: "job-late-channel",
      actorUserId: "admin-1",
      input: { ...input, idempotencyKey: "request-late-channel" },
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW,
    });
    const children = await repository.recordPlaylistPage(
      await repository.readMessage(created.message.idempotencyKey),
      {
        items: [{
          playlistItemId: "late-channel-item",
          videoId: "LLLLLLLLLLL",
          position: 0,
        }],
        nextPageToken: null,
      },
      NOW + 1,
    );
    await repository.recordVideoBatch(
      await repository.readMessage(children[0]!.idempotencyKey),
      [{
        videoId: "LLLLLLLLLLL",
        availabilityStatus: "playable",
        video: {
          videoId: "LLLLLLLLLLL",
          channelId: lateChannelId,
          channelTitle: "Late Approved",
          title: "Late Channel Candidate",
          thumbnailUrl: null,
          durationSeconds: 180,
          publishedAt: NOW,
          availabilityStatus: "playable",
          madeForKids: false,
          scopeReview: false,
        },
      }],
      NOW + 2,
    );
    await expect(repository.readReviewCandidate(
      null,
      "youtube:LLLLLLLLLLL",
    )).resolves.toMatchObject({
      classification: "channel_review",
      catalogChannelId: null,
    });

    await db.prepare(
      `INSERT INTO music_channels (
        id, provider, external_channel_id, display_name, channel_role,
        verification_status, active, version, created_at, updated_at
      ) VALUES ('ingestion-late-channel', 'youtube', ?, 'Late Approved',
        'member_music', 'approved', 1, 0, ?, ?)`,
    ).bind(lateChannelId, NOW + 3, NOW + 3).run();

    await expect(repository.getJob("job-late-channel")).resolves.toMatchObject({
      counts: { eligible: 1, channelReview: 0 },
    });
    const item = (
      await repository.listItems("job-late-channel", 10, null)
    ).page.items[0]!;
    expect(item).toMatchObject({
      classification: "eligible",
      candidateClassification: "eligible",
      catalogChannelId: "ingestion-late-channel",
    });
    await expect(repository.readReviewCandidate(
      null,
      item.candidateId,
    )).resolves.toMatchObject({
      classification: "eligible",
      catalogChannelId: "ingestion-late-channel",
    });
    await expect(repository.saveCandidateReview({
      candidateId: item.candidateId,
      expectedVersion: item.candidateVersion,
      input: reviewInput,
      actorUserId: "admin-reviewer",
      eventId: "event-late-channel-review",
      now: NOW + 4,
    })).resolves.toMatchObject({
      classification: "eligible",
      status: "ready",
      catalogChannelId: "ingestion-late-channel",
    });
  });

  it("saves a reviewed singing clip for an approved kirinuki channel", async () => {
    const repository = new D1IngestionRepository(db);
    await db.prepare(
      `INSERT INTO music_ingestion_candidates (
        id, provider, external_video_id, candidate_kind, status,
        classification, title, channel_id, channel_title,
        duration_seconds, availability_status, metadata_checked_at,
        first_discovered_at, last_discovered_at, retention_expires_at,
        version, created_at, updated_at
      ) VALUES ('youtube:RRRRRRRRRRR', 'youtube', 'RRRRRRRRRRR',
        'singing_clip', 'needs_input', 'eligible', 'Reviewed Clip',
        'UCkkkkkkkkkkkkkkkkkkkkkk', 'Kirinuki', 300, 'playable', ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(
      NOW,
      NOW,
      NOW,
      NOW + 90 * 86_400_000,
      NOW,
      NOW,
    ).run();
    const clipReviewInput: OtwPlayIngestionReviewInput = {
      ...reviewInput,
      releaseType: "broadcast",
      startSeconds: 45,
      endSeconds: 165,
    };

    await expect(repository.readReviewCandidate(
      null,
      "youtube:RRRRRRRRRRR",
    )).resolves.toMatchObject({
      candidateKind: "singing_clip",
      catalogChannelId: "ingestion-kirinuki-channel",
    });
    await expect(repository.saveCandidateReview({
      candidateId: "youtube:RRRRRRRRRRR",
      expectedVersion: 0,
      input: clipReviewInput,
      actorUserId: "admin-reviewer",
      eventId: "event-singing-clip-review",
      now: NOW + 1,
    })).resolves.toMatchObject({
      candidateKind: "singing_clip",
      version: 1,
      status: "ready",
      classification: "eligible",
      reviewInput: clipReviewInput,
    });

    const reviewEvent = await db.prepare(
      "SELECT detail_json FROM music_ingestion_events WHERE id = ?",
    ).bind("event-singing-clip-review").first<{ detail_json: string }>();
    expect(JSON.parse(reviewEvent!.detail_json)).toEqual({
      changedFields: [
        "song",
        "participants",
        "relationType",
        "releaseType",
        "participationType",
        "startSeconds",
        "endSeconds",
        "internalNote",
      ],
    });

    await expect(repository.saveCandidateReview({
      candidateId: "youtube:RRRRRRRRRRR",
      expectedVersion: 1,
      input: { ...clipReviewInput, releaseType: "official_video" },
      actorUserId: "admin-reviewer",
      eventId: "event-invalid-singing-clip-review",
      now: NOW + 2,
    })).rejects.toMatchObject({ code: "validation_failed" });

    await db.prepare(
      "UPDATE music_channels SET active = 0 WHERE id = 'ingestion-kirinuki-channel'",
    ).run();
    await expect(repository.recordConversionOutcome({
      jobId: null,
      candidateId: "youtube:RRRRRRRRRRR",
      expectedVersion: 1,
      outcome: "duplicate",
      performanceId: "performance-existing",
      errorCode: "duplicate_source",
      actorUserId: "admin-reviewer",
      eventId: "event-revoked-duplicate",
      now: NOW + 3,
    })).resolves.toBe("stale");
    await expect(repository.readReviewCandidate(
      null,
      "youtube:RRRRRRRRRRR",
    )).resolves.toMatchObject({
      version: 1,
      status: "ready",
      linkedPerformanceId: null,
    });
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
    expect(page.page.items[0]?.candidateClassification).toBe("pending_metadata");
  });

  it("saves a stale row when only background metadata changed its version", async () => {
    const repository = new D1IngestionRepository(db);
    const first = await repository.createJob({
      jobId: "job-review-first",
      actorUserId: "admin-1",
      input,
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW,
    });
    const firstChildren = await repository.recordPlaylistPage(
      await repository.readMessage(first.message.idempotencyKey),
      {
        items: [{ playlistItemId: "item-first", videoId: "AAAAAAAAAAA", position: 0 }],
        nextPageToken: null,
      },
      NOW,
    );
    const observation = {
      videoId: "AAAAAAAAAAA",
      availabilityStatus: "playable" as const,
      video: {
        videoId: "AAAAAAAAAAA",
        channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
        channelTitle: "Approved",
        title: "Eligible",
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: NOW,
        availabilityStatus: "playable" as const,
        madeForKids: false,
      },
    };
    await repository.recordVideoBatch(
      await repository.readMessage(firstChildren[0]!.idempotencyKey),
      [observation],
      NOW + 1,
    );
    const staleItem = (await repository.listItems("job-review-first", 10, null)).page.items[0]!;
    expect(staleItem).toMatchObject({ candidateVersion: 1, reviewInput: null });

    const second = await repository.createJob({
      jobId: "job-review-second",
      actorUserId: "admin-2",
      input: { ...input, idempotencyKey: "request-review-second" },
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW + 2,
    });
    const secondChildren = await repository.recordPlaylistPage(
      await repository.readMessage(second.message.idempotencyKey),
      {
        items: [{ playlistItemId: "item-second", videoId: "AAAAAAAAAAA", position: 0 }],
        nextPageToken: null,
      },
      NOW + 2,
    );
    await repository.recordVideoBatch(
      await repository.readMessage(secondChildren[0]!.idempotencyKey),
      [observation],
      NOW + 3,
    );

    await expect(repository.saveCandidateReview({
      candidateId: staleItem.candidateId,
      expectedVersion: staleItem.candidateVersion,
      expectedReviewInput: staleItem.reviewInput,
      expectedReviewStatus: staleItem.status,
      input: reviewInput,
      actorUserId: "admin-reviewer",
      eventId: "event-review-after-metadata",
      now: NOW + 4,
    })).resolves.toMatchObject({ version: 3, status: "ready", reviewInput });

    const reviewedItem = (await repository.listItems(
      "job-review-second",
      10,
      null,
    )).page.items[0]!;
    const third = await repository.createJob({
      jobId: "job-review-third",
      actorUserId: "admin-3",
      input: { ...input, idempotencyKey: "request-review-third" },
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW + 5,
    });
    const thirdChildren = await repository.recordPlaylistPage(
      await repository.readMessage(third.message.idempotencyKey),
      {
        items: [{ playlistItemId: "item-third", videoId: "AAAAAAAAAAA", position: 0 }],
        nextPageToken: null,
      },
      NOW + 5,
    );
    await repository.recordVideoBatch(
      await repository.readMessage(thirdChildren[0]!.idempotencyKey),
      [observation],
      NOW + 6,
    );
    const semanticallyEquivalentReviewInput = {
      internalNote: reviewInput.internalNote,
      participationType: reviewInput.participationType,
      releaseType: reviewInput.releaseType,
      relationType: reviewInput.relationType,
      participants: [{
        creditOrder: 0,
        participantRole: "vocal" as const,
        subject: { entityId: "entity-1", kind: "entity" as const },
      }],
      song: { songId: "song-1", kind: "existing" as const },
    } satisfies OtwPlayIngestionReviewInput;
    await expect(repository.saveCandidateReview({
      candidateId: reviewedItem.candidateId,
      expectedVersion: reviewedItem.candidateVersion,
      expectedReviewInput: semanticallyEquivalentReviewInput,
      expectedReviewStatus: reviewedItem.status,
      input: reviewInput,
      actorUserId: "admin-reviewer",
      eventId: "event-review-after-reviewed-metadata",
      now: NOW + 7,
    })).resolves.toMatchObject({ version: 5, status: "ready", reviewInput });

    await expect(repository.saveCandidateReview({
      candidateId: staleItem.candidateId,
      expectedVersion: 4,
      expectedReviewInput: null,
      expectedReviewStatus: staleItem.status,
      input: reviewInput,
      actorUserId: "other-reviewer",
      eventId: "event-review-real-conflict",
      now: NOW + 8,
    })).rejects.toMatchObject({ code: "stale_message" });

    await expect(repository.ignoreCandidate({
      candidateId: staleItem.candidateId,
      expectedVersion: 5,
      actorUserId: "other-reviewer",
      eventId: "event-review-ignore",
      now: NOW + 9,
    })).resolves.toMatchObject({ version: 6, status: "ignored", reviewInput: null });
    await expect(repository.saveCandidateReview({
      candidateId: staleItem.candidateId,
      expectedVersion: 4,
      expectedReviewInput: null,
      expectedReviewStatus: staleItem.status,
      input: reviewInput,
      actorUserId: "admin-reviewer",
      eventId: "event-review-ignore-conflict",
      now: NOW + 10,
    })).rejects.toMatchObject({ code: "stale_message" });
  });

  it("saves candidate review with CAS and preserves ignored decisions for 180 days", async () => {
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
          thumbnailUrl: null,
          durationSeconds: 180,
          publishedAt: NOW,
          availabilityStatus: "playable",
          madeForKids: false,
        },
      }],
      NOW + 1,
    );
    await expect(repository.saveCandidateReview({
      candidateId: "youtube:AAAAAAAAAAA",
      expectedVersion: 1,
      input: reviewInput,
      actorUserId: "admin-reviewer",
      eventId: "event-review-1",
      now: NOW + 2,
    })).resolves.toMatchObject({
      version: 2,
      status: "ready",
      reviewInput,
    });
    await expect(repository.saveCandidateReview({
      candidateId: "youtube:AAAAAAAAAAA",
      expectedVersion: 1,
      input: reviewInput,
      actorUserId: "admin-reviewer",
      eventId: "event-review-stale",
      now: NOW + 3,
    })).rejects.toMatchObject({ code: "stale_message" });
    await expect(repository.ignoreCandidate({
      candidateId: "youtube:AAAAAAAAAAA",
      expectedVersion: 2,
      actorUserId: "admin-reviewer",
      eventId: "event-ignore-1",
      now: NOW + 4,
    })).resolves.toMatchObject({ version: 3, status: "ignored" });
    await expect(repository.listItems("job-1", 10, null)).resolves.toMatchObject({
      page: { items: [] },
    });
    await expect(repository.listItems(
      "job-1",
      10,
      null,
      { status: "ignored" },
    )).resolves.toMatchObject({
      page: { items: [expect.objectContaining({ status: "ignored" })] },
    });
    const stored = await db.prepare(
      `SELECT retention_expires_at FROM music_ingestion_candidates
       WHERE id = 'youtube:AAAAAAAAAAA'`,
    ).first<{ retention_expires_at: number }>();
    expect(Number(stored?.retention_expires_at)).toBe(NOW + 4 + 180 * 86_400_000);

    const rediscovery = await repository.createJob({
      jobId: "job-rediscovery",
      actorUserId: "admin-2",
      input: { ...input, idempotencyKey: "request-rediscovery" },
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW + 5,
    });
    const rediscoveryChildren = await repository.recordPlaylistPage(
      await repository.readMessage(rediscovery.message.idempotencyKey),
      {
        items: [{ playlistItemId: "item-rediscovery", videoId: "AAAAAAAAAAA", position: 0 }],
        nextPageToken: null,
      },
      NOW + 5,
    );
    await repository.recordVideoBatch(
      await repository.readMessage(rediscoveryChildren[0]!.idempotencyKey),
      [{
        videoId: "AAAAAAAAAAA",
        availabilityStatus: "playable",
        video: {
          videoId: "AAAAAAAAAAA",
          channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
          channelTitle: "Approved",
          title: "Eligible",
          thumbnailUrl: null,
          durationSeconds: 180,
          publishedAt: NOW,
          availabilityStatus: "playable",
          madeForKids: false,
        },
      }],
      NOW + 6,
    );
    await expect(repository.readReviewCandidate(
      "job-rediscovery",
      "youtube:AAAAAAAAAAA",
    )).resolves.toMatchObject({
      version: 4,
      status: "ignored",
      reviewInput: null,
    });
    const rediscoveredRetention = await db.prepare(
      `SELECT retention_expires_at FROM music_ingestion_candidates
       WHERE id = 'youtube:AAAAAAAAAAA'`,
    ).first<{ retention_expires_at: number }>();
    expect(Number(rediscoveredRetention?.retention_expires_at))
      .toBe(NOW + 6 + 180 * 86_400_000);
    const event = await db.prepare(
      "SELECT actor_user_id, detail_json FROM music_ingestion_events WHERE id = ?",
    ).bind("event-review-1").first<{
      actor_user_id: string;
      detail_json: string;
    }>();
    expect(event?.actor_user_id).toBe("admin-reviewer");
    expect(event?.detail_json).not.toContain("private review note");

    await repository.createJob({
      jobId: "job-other",
      actorUserId: "admin-2",
      input: { ...input, idempotencyKey: "request-other" },
      preflight: { ...preflight, requestedItemCount: 1 },
      now: NOW + 5,
    });
    const beforeCrossJob = await repository.readReviewCandidate(
      "job-1",
      "youtube:AAAAAAAAAAA",
    );
    await expect(repository.recordConversionOutcome({
      jobId: "job-other",
      candidateId: "youtube:AAAAAAAAAAA",
      expectedVersion: beforeCrossJob.version,
      outcome: "validation_failed",
      performanceId: null,
      errorCode: "validation_failed",
      actorUserId: "admin-reviewer",
      eventId: "event-cross-job",
      now: NOW + 6,
    })).resolves.toBe("validation_failed");
    await expect(repository.readReviewCandidate(
      "job-1",
      "youtube:AAAAAAAAAAA",
    )).resolves.toMatchObject({ version: beforeCrossJob.version });
    await expect(db.prepare(
      "SELECT candidate_id FROM music_ingestion_events WHERE id = ?",
    ).bind("event-cross-job").first<{ candidate_id: string | null }>())
      .resolves.toEqual({ candidate_id: null });
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
    const retried = await repository.retryJob({
      jobId: "job-1",
      actorUserId: "admin-reviewer",
      eventId: "event-retry-1",
      now: NOW + 60_002,
    });
    expect(retried).toEqual([created.message]);
    expect(await repository.getJob("job-1")).toMatchObject({
      status: "collecting",
      counts: { retryPending: 0, permanentError: 0 },
    });
  });

  it("keeps a job partial when a playlist page completes after a sibling failed", async () => {
    const repository = new D1IngestionRepository(db);
    const created = await repository.createJob({
      jobId: "job-1",
      actorUserId: "admin-1",
      input,
      preflight,
      now: NOW,
    });
    const children = await repository.recordPlaylistPage(
      await repository.readMessage(created.message.idempotencyKey),
      {
        items: [{ playlistItemId: "item-a", videoId: "AAAAAAAAAAA", position: 0 }],
        nextPageToken: "next-page",
      },
      NOW + 1,
    );
    const childRecords = await Promise.all(
      children.map((message) => repository.readMessage(message.idempotencyKey)),
    );
    const videoMessage = childRecords.find((message) => message.kind === "video_batch")!;
    const nextPageMessage = childRecords.find((message) => message.kind === "playlist_page")!;
    await repository.markMessageDeadLetter(
      videoMessage.idempotencyKey,
      "queue_retries_exhausted",
      NOW + 2,
    );
    await repository.recordPlaylistPage(
      await repository.readMessage(nextPageMessage.idempotencyKey),
      { items: [], nextPageToken: null },
      NOW + 3,
    );

    expect(await repository.getJob("job-1")).toMatchObject({
      status: "partial",
      lastErrorCode: "queue_retries_exhausted",
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
    ).resolves.toBe(2);
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
    const retentionEvent = await db.prepare(
      `SELECT event_type, actor_user_id, detail_json
       FROM music_ingestion_events
       WHERE candidate_id = ? AND event_type = 'candidate.api_data_cleared'`,
    ).bind("youtube:AAAAAAAAAAA").first<{
      event_type: string;
      actor_user_id: string;
      detail_json: string;
    }>();
    expect(retentionEvent).toMatchObject({
      event_type: "candidate.api_data_cleared",
      actor_user_id: "system",
    });
    expect(retentionEvent?.detail_json).toBe('{"reason":"api_data_expired"}');
    const retainedJob = await repository.getJob("job-1");
    expect(retainedJob).toMatchObject({
      playlistTitle: null,
      playlistOwnerChannelTitle: null,
      sourceMetadataCheckedAt: null,
      retentionExpiresAt: null,
    });
  });

  it("persists an explicit range with absolute playlist positions and server filters", async () => {
    const repository = new D1IngestionRepository(db);
    const created = await repository.createJob({
      jobId: "job-range",
      actorUserId: "admin-1",
      input: {
        ...input,
        rangeStart: 5_000,
        rangeLimit: 1,
        idempotencyKey: "request-range",
      },
      preflight: {
        ...preflight,
        itemCount: 5_001,
        rangeStartPosition: 5_000,
        rangeEndExclusive: 5_001,
        requestedItemCount: 1,
      },
      now: NOW,
    });
    const children = await repository.recordPlaylistPage(
      await repository.readMessage(created.message.idempotencyKey),
      {
        items: [
          { playlistItemId: "before", videoId: "BBBBBBBBBBB", position: 4_999 },
          { playlistItemId: "selected", videoId: "AAAAAAAAAAA", position: 5_000 },
        ],
        nextPageToken: "unused-after-range",
      },
      NOW + 1,
    );
    expect(children).toHaveLength(1);
    await repository.recordVideoBatch(
      await repository.readMessage(children[0]!.idempotencyKey),
      [{
        videoId: "AAAAAAAAAAA",
        availabilityStatus: "playable",
        video: {
          videoId: "AAAAAAAAAAA",
          channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
          channelTitle: "Approved",
          title: "Range item",
          thumbnailUrl: null,
          durationSeconds: 240,
          publishedAt: NOW,
          availabilityStatus: "playable",
          madeForKids: false,
        },
      }],
      NOW + 2,
    );
    expect(await repository.getJob("job-range")).toMatchObject({
      rangeStartPosition: 5_000,
      rangeEndExclusive: 5_001,
      status: "completed",
    });
    const eligible = await repository.listItems(
      "job-range",
      10,
      null,
      { classification: "eligible" },
    );
    expect(eligible.page.items.map((item) => item.playlistPosition)).toEqual([5_000]);
    const blocked = await repository.listItems(
      "job-range",
      10,
      null,
      { status: "blocked" },
    );
    expect(blocked.page.items).toEqual([]);
  });
});
