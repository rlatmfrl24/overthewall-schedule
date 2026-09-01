import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AdminCatalogRepositoryError,
  type AdminApproveProposalCommand,
} from "../application/ports/admin-catalog-repository";
import { D1PublicCatalogReader } from "./d1-public-catalog-reader";
import { D1AdminCatalogRepository } from "./d1-admin-catalog-repository";

type TestEnv = Env & {
  OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;
const db = testEnv.otw_db;
const actor = {
  userId: "admin-user",
  displayName: "Admin",
  ipAddress: "127.0.0.1",
};
const NOW = Date.UTC(2026, 7, 11);
let idSequence = 0;
const id = (prefix: string) => `${prefix}-${++idSequence}`;

const createEntity = async (
  repository: D1AdminCatalogRepository,
  name: string,
  kind: "person" | "group" | "organization" = "person",
) =>
  repository.createEntity(
    {
      entityKind: kind,
      displayName: name,
      slug: name.toLowerCase().replace(/\s+/gu, "-"),
    },
    actor,
    { entityId: id("entity"), eventId: id("event") },
    NOW,
  );

const createDraftFixture = async (
  repository: D1AdminCatalogRepository,
  suffix: string,
  videoId: string,
  approved = false,
) => {
  const singer = await createEntity(repository, `Delete Singer ${suffix}`);
  const createdChannel = await repository.createChannel(
    {
      externalChannelId: `UC${suffix.slice(0, 1).toUpperCase().repeat(22)}`,
      displayName: `Delete Channel ${suffix}`,
      channelRole: "member_music",
      entityIds: [singer.data.id],
    },
    actor,
    { channelId: id("channel"), eventId: id("event") },
    NOW,
  );
  const channel = approved
    ? await repository.updateChannel(
        {
          id: createdChannel.data.id,
          externalChannelId: createdChannel.data.externalChannelId,
          displayName: createdChannel.data.displayName,
          channelRole: createdChannel.data.channelRole,
          verificationStatus: "approved",
          active: true,
          entityIds: createdChannel.data.entityIds,
          expectedVersion: createdChannel.data.version,
        },
        actor,
        id("event"),
        NOW,
      )
    : createdChannel;
  const song = await repository.createSong(
    {
      slug: `delete-song-${suffix}`,
      title: `Delete Song ${suffix}`,
      isOtwOriginal: true,
      originalReleaseDate: null,
      originalReleasePrecision: "unknown",
      aliases: [],
      originalArtists: [
        { entityId: singer.data.id, creditOrder: 0, isPrimary: true },
      ],
    },
    actor,
    { songId: id("song"), eventId: id("event") },
    NOW,
  );
  const performance = await repository.createPerformance({
    input: {
      songId: song.data.id,
      relationType: "original",
      releaseType: "official_video",
      participationType: "solo",
      qualityStatus: "ok",
      releasedAt: NOW,
      participants: [
        {
          entityId: singer.data.id,
          participantRole: "vocal",
          creditOrder: 0,
          creditNameSnapshot: singer.data.displayName,
        },
      ],
      sources: [{
        youtubeUrl: `https://youtu.be/${videoId}`,
        channelId: channel.data.id,
        startSeconds: 0,
        sourceRole: "official",
        priority: 0,
        isPrimary: true,
      }],
    },
    sources: [{
      input: {
        youtubeUrl: `https://youtu.be/${videoId}`,
        channelId: channel.data.id,
        startSeconds: 0,
        sourceRole: "official",
        priority: 0,
        isPrimary: true,
      },
      video: {
        videoId,
        channelId: channel.data.externalChannelId,
        channelTitle: channel.data.displayName,
        title: `Delete Video ${suffix}`,
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: NOW,
        availabilityStatus: "playable",
      },
      sourceId: id("source"),
    }],
    actor,
    now: NOW,
    ids: {
      performanceId: id("performance"),
      eventId: id("event"),
    },
  });
  return { singer, channel, song, performance };
};

beforeEach(async () => {
  idSequence = 0;
  await applyD1Migrations(db, testEnv.OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_ingestion_events"),
    db.prepare("DELETE FROM music_ingestion_candidate_origins"),
    db.prepare("DELETE FROM music_ingestion_messages"),
    db.prepare("DELETE FROM music_ingestion_candidates"),
    db.prepare("DELETE FROM music_ingestion_jobs"),
    db.prepare("DELETE FROM music_search_gram_stats"),
    db.prepare("DELETE FROM music_search_grams"),
    db.prepare("DELETE FROM music_public_performance_sort_keys"),
    db.prepare("DELETE FROM music_cover_proposal_participants"),
    db.prepare("DELETE FROM music_cover_proposal_original_artists"),
    db.prepare("DELETE FROM music_cover_proposals"),
    db.prepare("DELETE FROM music_catalog_events"),
    db.prepare("DELETE FROM music_search_terms"),
    db.prepare("DELETE FROM music_performance_sources"),
    db.prepare("DELETE FROM music_performance_participants"),
    db.prepare("DELETE FROM music_performance_tags"),
    db.prepare("DELETE FROM music_media_source_relations"),
    db.prepare("DELETE FROM music_channel_entities"),
    db.prepare("DELETE FROM music_song_original_artists"),
    db.prepare("DELETE FROM music_song_tags"),
    db.prepare("DELETE FROM music_song_aliases"),
    db.prepare("DELETE FROM music_entity_aliases"),
    db.prepare("DELETE FROM music_performances"),
    db.prepare("DELETE FROM music_media_sources"),
    db.prepare("UPDATE music_songs SET merged_into_song_id = NULL"),
    db.prepare("DELETE FROM music_songs"),
    db.prepare("DELETE FROM music_channels"),
    db.prepare("DELETE FROM music_entities"),
    db.prepare("DELETE FROM member_links WHERE member_uid = 901"),
    db.prepare("DELETE FROM members WHERE uid = 901"),
    db.prepare(
      "UPDATE music_catalog_meta SET revision = 0, updated_at = 0 WHERE id = 1",
    ),
    db.prepare(
      "UPDATE music_public_read_model_meta SET revision = 0, updated_at = 0 WHERE id = 1",
    ),
  ]);
});

describe("D1AdminCatalogRepository", () => {
  it("creates a draft and marks its ingestion candidate converted in one catalog batch", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const singer = await createEntity(repository, "Candidate Singer");
    const createdChannel = await repository.createChannel(
      {
        externalChannelId: `UC${"C".repeat(22)}`,
        displayName: "Candidate Channel",
        channelRole: "member_music",
        entityIds: [singer.data.id],
      },
      actor,
      { channelId: "candidate-channel", eventId: "candidate-channel-created" },
      NOW,
    );
    const channel = await repository.updateChannel(
      {
        id: createdChannel.data.id,
        externalChannelId: createdChannel.data.externalChannelId,
        displayName: createdChannel.data.displayName,
        channelRole: createdChannel.data.channelRole,
        verificationStatus: "approved",
        active: true,
        entityIds: createdChannel.data.entityIds,
        expectedVersion: createdChannel.data.version,
      },
      actor,
      "candidate-channel-approved",
      NOW,
    );
    const song = await repository.createSong(
      {
        slug: "candidate-song",
        title: "Candidate Song",
        isOtwOriginal: true,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [],
        originalArtists: [{
          entityId: singer.data.id,
          creditOrder: 0,
          isPrimary: true,
        }],
      },
      actor,
      { songId: "candidate-song", eventId: "candidate-song-created" },
      NOW,
    );
    await db.batch([
      db.prepare(
        `INSERT INTO music_ingestion_jobs (
          id, source_kind, source_external_id, source_url, source_title,
          owner_channel_id, owner_channel_title, import_mode,
          requested_item_count, status, actor_user_id, idempotency_key,
          created_at, completed_at, updated_at
        ) VALUES ('candidate-job', 'playlist_import', 'PLcandidate',
          'https://www.youtube.com/playlist?list=PLcandidate', 'Candidate List',
          ?, 'Candidate Channel', 'all_new', 1, 'completed', ?, 'candidate-request',
          ?, ?, ?)`,
      ).bind(channel.data.externalChannelId, actor.userId, NOW, NOW, NOW),
      db.prepare(
        `INSERT INTO music_ingestion_candidates (
          id, provider, external_video_id, candidate_kind, status,
          classification, title, channel_id, channel_title,
          availability_status, metadata_checked_at, review_input_json,
          reviewed_by_user_id, first_discovered_at, last_discovered_at,
          retention_expires_at, version, created_at, updated_at
        ) VALUES ('youtube:AAAAAAAAAAA', 'youtube', 'AAAAAAAAAAA',
          'official_video', 'ready', 'eligible', 'Candidate Video', ?,
          'Candidate Channel', 'playable', ?, '{}', ?, ?, ?, ?, 0, ?, ?)`,
      ).bind(
        channel.data.externalChannelId,
        NOW,
        actor.userId,
        NOW,
        NOW,
        NOW + 90 * 86_400_000,
        NOW,
        NOW,
      ),
      db.prepare(
        `INSERT INTO music_ingestion_candidate_origins (
          id, candidate_id, job_id, origin_kind, playlist_id,
          playlist_item_id, playlist_position, is_playlist_duplicate, discovered_at
        ) VALUES ('candidate-origin', 'youtube:AAAAAAAAAAA', 'candidate-job',
          'playlist_import', 'PLcandidate', 'playlist-item', 0, 0, ?)`,
      ).bind(NOW),
    ]);
    const video = {
      videoId: "AAAAAAAAAAA",
      channelId: channel.data.externalChannelId,
      channelTitle: channel.data.displayName,
      title: "Candidate Video",
      thumbnailUrl: null,
      durationSeconds: 180,
      publishedAt: NOW,
      availabilityStatus: "playable" as const,
    };
    const preflight = await repository.preflightCatalogEntry(video, 0);
    const result = await repository.createCatalogEntry({
      input: {
        expectedCatalogRevision: preflight.catalogRevision,
        youtubeUrl: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
        startSeconds: 0,
        endSeconds: null,
        song: { kind: "existing", songId: song.data.id },
        participants: [{
          subject: { kind: "entity", entityId: singer.data.id },
          participantRole: "vocal",
          creditOrder: 0,
        }],
        channel: { kind: "existing", channelId: channel.data.id },
        relationType: "cover",
        releaseType: "official_video",
        participationType: "solo",
        performanceTags: ["어쿠스틱", "2026 버전"],
        publicationTarget: "draft",
      },
      video,
      actor,
      now: NOW + 1,
      ids: {
        entityIds: {},
        entityEventIds: {},
        channelId: "unused-channel",
        channelEventId: "unused-channel-event",
        songId: "unused-song",
        songEventId: "unused-song-event",
        performanceId: "candidate-performance",
        performanceEventId: "candidate-performance-event",
        sourceId: "candidate-source",
      },
      candidateConversion: {
        jobId: "candidate-job",
        candidateId: "youtube:AAAAAAAAAAA",
        expectedVersion: 0,
        eventId: "candidate-converted-event",
      },
    });
    expect(result.data.performance).toMatchObject({
      id: "candidate-performance",
      publicationStatus: "draft",
    });
    const candidate = await db.prepare(
      `SELECT status, classification, linked_performance_id,
        last_conversion_outcome, version
       FROM music_ingestion_candidates WHERE id = 'youtube:AAAAAAAAAAA'`,
    ).first<Record<string, unknown>>();
    expect(candidate).toMatchObject({
      status: "converted",
      classification: "existing_catalog",
      linked_performance_id: "candidate-performance",
      last_conversion_outcome: "created",
      version: 1,
    });
    const conversionEvent = await db.prepare(
      "SELECT actor_user_id FROM music_ingestion_events WHERE id = ?",
    ).bind("candidate-converted-event").first<{ actor_user_id: string }>();
    expect(conversionEvent?.actor_user_id).toBe(actor.userId);
    const published = await db.prepare(
      "SELECT COUNT(*) AS count FROM music_performances WHERE publication_status = 'published'",
    ).first<{ count: number }>();
    expect(Number(published?.count)).toBe(0);
  });

  it("converts an approved kirinuki candidate into a private broadcast draft", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const singer = await createEntity(repository, "Clip Singer");
    const createdChannel = await repository.createChannel(
      {
        externalChannelId: `UC${"K".repeat(22)}`,
        displayName: "Approved Clip Channel",
        channelRole: "approved_kirinuki",
        entityIds: [singer.data.id],
      },
      actor,
      { channelId: "clip-channel", eventId: "clip-channel-created" },
      NOW,
    );
    const channel = await repository.updateChannel(
      {
        id: createdChannel.data.id,
        externalChannelId: createdChannel.data.externalChannelId,
        displayName: createdChannel.data.displayName,
        channelRole: createdChannel.data.channelRole,
        verificationStatus: "approved",
        active: true,
        entityIds: createdChannel.data.entityIds,
        expectedVersion: createdChannel.data.version,
      },
      actor,
      "clip-channel-approved",
      NOW,
    );
    const song = await repository.createSong(
      {
        slug: "clip-song",
        title: "Clip Song",
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [],
        originalArtists: [{
          entityId: singer.data.id,
          creditOrder: 0,
          isPrimary: true,
        }],
      },
      actor,
      { songId: "clip-song", eventId: "clip-song-created" },
      NOW,
    );
    await db.prepare(
      `INSERT INTO music_ingestion_candidates (
        id, provider, external_video_id, candidate_kind, status,
        classification, title, channel_id, channel_title,
        availability_status, metadata_checked_at, review_input_json,
        reviewed_by_user_id, first_discovered_at, last_discovered_at,
        retention_expires_at, version, created_at, updated_at
      ) VALUES ('youtube:BBBBBBBBBBB', 'youtube', 'BBBBBBBBBBB',
        'singing_clip', 'ready', 'eligible', 'Reviewed Singing Clip', ?,
        'Approved Clip Channel', 'playable', ?, '{}', ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(
      channel.data.externalChannelId,
      NOW,
      actor.userId,
      NOW,
      NOW,
      NOW + 90 * 86_400_000,
      NOW,
      NOW,
    ).run();
    const video = {
      videoId: "BBBBBBBBBBB",
      channelId: channel.data.externalChannelId,
      channelTitle: channel.data.displayName,
      title: "Reviewed Singing Clip",
      thumbnailUrl: null,
      durationSeconds: 300,
      publishedAt: NOW,
      availabilityStatus: "playable" as const,
    };
    const preflight = await repository.preflightCatalogEntry(video, 45);
    const result = await repository.createCatalogEntry({
      input: {
        expectedCatalogRevision: preflight.catalogRevision,
        youtubeUrl: "https://www.youtube.com/watch?v=BBBBBBBBBBB",
        startSeconds: 45,
        endSeconds: 165,
        song: { kind: "existing", songId: song.data.id },
        participants: [{
          subject: { kind: "entity", entityId: singer.data.id },
          participantRole: "vocal",
          creditOrder: 0,
        }],
        channel: { kind: "existing", channelId: channel.data.id },
        relationType: "cover",
        releaseType: "broadcast",
        participationType: "solo",
        publicationTarget: "draft",
      },
      video,
      actor,
      now: NOW + 1,
      ids: {
        entityIds: {},
        entityEventIds: {},
        channelId: "unused-clip-channel",
        channelEventId: "unused-clip-channel-event",
        songId: "unused-clip-song",
        songEventId: "unused-clip-song-event",
        performanceId: "clip-performance",
        performanceEventId: "clip-performance-event",
        sourceId: "clip-source",
      },
      candidateConversion: {
        jobId: null,
        candidateId: "youtube:BBBBBBBBBBB",
        expectedVersion: 0,
        eventId: "clip-candidate-converted-event",
      },
    });

    expect(result.data.performance).toMatchObject({
      id: "clip-performance",
      releaseType: "broadcast",
      publicationStatus: "draft",
    });
    await expect(db.prepare(
      `SELECT status, classification, linked_performance_id,
        last_conversion_outcome, version
       FROM music_ingestion_candidates WHERE id = 'youtube:BBBBBBBBBBB'`,
    ).first<Record<string, unknown>>()).resolves.toMatchObject({
      status: "converted",
      classification: "existing_catalog",
      linked_performance_id: "clip-performance",
      last_conversion_outcome: "created",
      version: 1,
    });
    await expect(db.prepare(
      `SELECT source_role, start_seconds, end_seconds
       FROM music_performance_sources WHERE performance_id = 'clip-performance'`,
    ).first<Record<string, unknown>>()).resolves.toMatchObject({
      source_role: "kirinuki",
      start_seconds: 45,
      end_seconds: 165,
    });
    const published = await db.prepare(
      "SELECT COUNT(*) AS count FROM music_performances WHERE publication_status = 'published'",
    ).first<{ count: number }>();
    expect(Number(published?.count)).toBe(0);
    await expect(repository.transitionPerformance(
      "clip-performance",
      result.data.performance.version,
      "published",
      actor,
      "clip-performance-publish-blocked",
      NOW + 2,
    )).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("creates a member, external identity, channel, song, performance, event, and projection in one catalog batch", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const memberChannelId = `UC${"M".repeat(22)}`;
    await db
      .prepare(
        `INSERT INTO members (uid, code, name, oshi_mark, youtube_channel_id, unit_name, is_deprecated)
        VALUES (901, 'workflow-member', '워크플로 멤버', '🌙', ?, '워크플로 유닛', 0)`,
      )
      .bind(memberChannelId)
      .run();
    const video = {
      videoId: "aBcDeFgHi_1",
      channelId: memberChannelId,
      channelTitle: "워크플로 멤버 공식 채널",
      title: "워크플로 공식 커버",
      thumbnailUrl: "https://i.ytimg.com/workflow.jpg",
      durationSeconds: 210,
      publishedAt: NOW,
      availabilityStatus: "playable" as const,
    };
    const preflight = await repository.preflightCatalogEntry(video, 0);
    expect(preflight.channel).toMatchObject({
      state: "recognized_member",
      memberUid: 901,
      channelRole: "member_main",
    });
    expect(preflight.duplicate).toBeNull();

    const result = await repository.createCatalogEntry({
      input: {
        expectedCatalogRevision: preflight.catalogRevision,
        youtubeUrl: `https://youtu.be/${video.videoId}`,
        startSeconds: 0,
        endSeconds: null,
        song: {
          kind: "create",
          title: "워크플로 곡",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          aliases: [{ alias: "Workflow Song" }],
          originalArtists: [
            {
              subject: {
                kind: "new_external",
                clientKey: "artist-chip",
                displayName: "외부 원곡 가수",
                entityKind: "person",
              },
              creditOrder: 0,
              isPrimary: true,
            },
          ],
        },
        participants: [
          {
            subject: { kind: "member", memberUid: 901 },
            participantRole: "vocal",
            creditOrder: 0,
            creditNameSnapshot: "워크플로 멤버",
          },
        ],
        channel: {
          kind: "recognized_member",
          memberUid: 901,
          channelRole: "member_music",
        },
        relationType: "cover",
        releaseType: "official_video",
        participationType: "solo",
        publicationTarget: "published",
      },
      video,
      actor,
      now: NOW,
      ids: {
        entityIds: {
          "member:901": "entity-member-901",
          "external:artist-chip": "entity-artist-chip",
        },
        entityEventIds: {
          "member:901": "event-member-901",
          "external:artist-chip": "event-artist-chip",
        },
        channelId: "channel-workflow",
        channelEventId: "event-channel-workflow",
        songId: "song-workflow",
        songEventId: "event-song-workflow",
        performanceId: "performance-workflow",
        performanceEventId: "event-performance-workflow",
        sourceId: "source-workflow",
      },
    });

    expect(result.data.song.title).toBe("워크플로 곡");
    expect(result.data.performance.publicationStatus).toBe("published");
    expect(result.data.channel).toMatchObject({
      verificationStatus: "approved",
      active: true,
      entityIds: ["entity-member-901"],
    });
    expect(result.data.createdEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberUid: 901 }),
        expect.objectContaining({ displayName: "외부 원곡 가수", memberUid: null }),
      ]),
    );
    expect(result.catalogRevision).toBe(1);

    const [meta, eventCount, searchTerms, duplicateAfter] = await Promise.all([
      db
        .prepare(
          `SELECT catalog.revision, read_model.revision AS read_model_revision
          FROM music_catalog_meta AS catalog
          JOIN music_public_read_model_meta AS read_model ON read_model.id = catalog.id
          WHERE catalog.id = 1`,
        )
        .first<{ revision: number; read_model_revision: number }>(),
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM music_catalog_events WHERE id LIKE 'event-%workflow' OR id IN ('event-member-901', 'event-artist-chip')",
        )
        .first<{ count: number }>(),
      db
        .prepare(
          "SELECT term_kind, normalized_term FROM music_search_terms WHERE song_id = 'song-workflow'",
        )
        .all<{ term_kind: string; normalized_term: string }>(),
      repository.preflightCatalogEntry(video, 0),
    ]);
    expect(meta).toEqual({ revision: 1, read_model_revision: 1 });
    expect(Number(eventCount?.count)).toBe(5);
    expect(searchTerms.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ term_kind: "participant", normalized_term: "워크플로 멤버" }),
        expect.objectContaining({ term_kind: "original_artist", normalized_term: "외부 원곡 가수" }),
      ]),
    );
    expect(duplicateAfter.duplicate).toEqual({
      songId: "song-workflow",
      performanceId: "performance-workflow",
    });
  });

  it("creates a cover from separate original title and artist input", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const memberChannelId = `UC${"C".repeat(22)}`;
    await db
      .prepare(
        `INSERT INTO members (uid, code, name, youtube_channel_id, is_deprecated)
        VALUES (901, 'cover-member', '커버 멤버', ?, 0)`,
      )
      .bind(memberChannelId)
      .run();
    const video = {
      videoId: "cOvErViDe_1",
      channelId: memberChannelId,
      channelTitle: "커버 멤버 채널",
      title: "영상 제목 기반 공식 커버",
      thumbnailUrl: null,
      durationSeconds: 180,
      publishedAt: NOW,
      availabilityStatus: "playable" as const,
    };
    const preflight = await repository.preflightCatalogEntry(video, 0);

    const result = await repository.createCatalogEntry({
      input: {
        expectedCatalogRevision: preflight.catalogRevision,
        youtubeUrl: `https://youtu.be/${video.videoId}`,
        startSeconds: 0,
        song: {
          kind: "create",
          title: "정식 원곡 제목",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          aliases: [],
          tags: ["J-POP", "보컬로이드"],
          originalArtists: [
            {
              subject: {
                kind: "new_external",
                clientKey: "cover-original-artist",
                displayName: "정식 원곡 가수",
                entityKind: "person",
              },
              creditOrder: 0,
              isPrimary: true,
            },
          ],
        },
        participants: [
          {
            subject: { kind: "member", memberUid: 901 },
            participantRole: "vocal",
            creditOrder: 0,
          },
        ],
        channel: {
          kind: "recognized_member",
          memberUid: 901,
          channelRole: "member_main",
        },
        relationType: "cover",
        releaseType: "official_video",
        participationType: "solo",
        performanceTags: ["어쿠스틱", "2026 버전"],
        publicationTarget: "draft",
      },
      video,
      actor,
      now: NOW,
      ids: {
        entityIds: {
          "member:901": "entity-cover-member",
          "external:cover-original-artist": "entity-cover-original-artist",
        },
        entityEventIds: {
          "member:901": "event-cover-member",
          "external:cover-original-artist": "event-cover-original-artist",
        },
        channelId: "channel-cover-member",
        channelEventId: "event-channel-cover-member",
        songId: "song-cover-from-video",
        songEventId: "event-song-cover-from-video",
        performanceId: "performance-cover-from-video",
        performanceEventId: "event-performance-cover-from-video",
        sourceId: "source-cover-from-video",
      },
    });

    expect(result.data.song).toMatchObject({
      title: "정식 원곡 제목",
      isOtwOriginal: false,
      tags: ["J-POP", "보컬로이드"],
      originalArtists: [
        expect.objectContaining({
          entityId: "entity-cover-original-artist",
          displayName: "정식 원곡 가수",
          isPrimary: true,
        }),
      ],
    });
    expect(result.data.createdEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberUid: 901 }),
        expect.objectContaining({
          id: "entity-cover-original-artist",
          displayName: "정식 원곡 가수",
        }),
      ]),
    );
    expect(result.data.performance).toMatchObject({
      relationType: "cover",
      publicationStatus: "draft",
      tags: ["2026 버전", "어쿠스틱"],
    });

    const originalVideo = {
      ...video,
      videoId: "oRiGiNaL__2",
      title: "영상 제목 기반 오리지널곡",
    };
    const originalPreflight = await repository.preflightCatalogEntry(
      originalVideo,
      0,
    );
    const originalResult = await repository.createCatalogEntry({
      input: {
        expectedCatalogRevision: originalPreflight.catalogRevision,
        youtubeUrl: `https://youtu.be/${originalVideo.videoId}`,
        startSeconds: 0,
        song: { kind: "from_video" },
        participants: [
          {
            subject: { kind: "member", memberUid: 901 },
            participantRole: "vocal",
            creditOrder: 0,
          },
        ],
        channel: { kind: "existing", channelId: result.data.channel.id },
        relationType: "original",
        releaseType: "official_video",
        participationType: "solo",
        publicationTarget: "draft",
      },
      video: originalVideo,
      actor,
      now: NOW + 1,
      ids: {
        entityIds: {},
        entityEventIds: {},
        channelId: "unused-original-channel",
        channelEventId: "unused-original-channel-event",
        songId: "song-original-from-video",
        songEventId: "event-song-original-from-video",
        performanceId: "performance-original-from-video",
        performanceEventId: "event-performance-original-from-video",
        sourceId: "source-original-from-video",
      },
    });

    expect(originalResult.data.song).toMatchObject({
      title: originalVideo.title,
      isOtwOriginal: true,
      originalArtists: [
        expect.objectContaining({
          entityId: "entity-cover-member",
          isPrimary: true,
        }),
      ],
    });
    expect(originalResult.data.performance.relationType).toBe("original");
  });

  it("writes a draft atomically and publishes only after official channel approval", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const singer = await createEntity(repository, "Singer");
    const artist = await createEntity(
      repository,
      "Original Artist",
      "organization",
    );
    const channel = await repository.createChannel(
      {
        externalChannelId: `UC${"A".repeat(22)}`,
        displayName: "Singer Channel",
        channelRole: "member_music",
        entityIds: [singer.data.id],
      },
      actor,
      { channelId: id("channel"), eventId: id("event") },
      NOW,
    );
    const song = await repository.createSong(
      {
        slug: "catalog-song",
        title: "Catalog Song",
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [{ alias: "카탈로그 송" }],
        originalArtists: [
          { entityId: artist.data.id, creditOrder: 0, isPrimary: true },
        ],
      },
      actor,
      { songId: id("song"), eventId: id("event") },
      NOW,
    );
    const performance = await repository.createPerformance({
      input: {
        songId: song.data.id,
        relationType: "cover",
        releaseType: "official_video",
        participationType: "solo",
        qualityStatus: "ok",
        releasedAt: NOW,
        participants: [
          {
            entityId: singer.data.id,
            participantRole: "vocal",
            creditOrder: 0,
            creditNameSnapshot: "Singer",
          },
        ],
        sources: [{
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          channelId: channel.data.id,
          startSeconds: 0,
          sourceRole: "official",
          priority: 0,
          isPrimary: true,
        }],
      },
      sources: [{
        input: { youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", channelId: channel.data.id, startSeconds: 0, sourceRole: "official", priority: 0, isPrimary: true },
        video: {
          videoId: "dQw4w9WgXcQ",
          channelId: channel.data.externalChannelId,
          channelTitle: "Singer Channel",
          title: "Catalog Song",
          thumbnailUrl: "https://i.ytimg.com/test.jpg",
          durationSeconds: 180,
          publishedAt: NOW,
          availabilityStatus: "unavailable",
        },
        sourceId: id("source"),
      }],
      actor,
      now: NOW,
      ids: {
        performanceId: id("performance"),
        eventId: id("event"),
      },
    });

    await repository.createPerformance({
      input: {
        songId: song.data.id,
        relationType: "cover",
        releaseType: "official_video",
        participationType: "solo",
        qualityStatus: "ok",
        releasedAt: NOW,
        participants: [
          {
            entityId: singer.data.id,
            participantRole: "vocal",
            creditOrder: 0,
            creditNameSnapshot: "Singer",
          },
        ],
        sources: [{
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          channelId: channel.data.id,
          startSeconds: 30,
          sourceRole: "official",
          priority: 0,
          isPrimary: true,
        }],
      },
      sources: [{
        input: { youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", channelId: channel.data.id, startSeconds: 30, sourceRole: "official", priority: 0, isPrimary: true },
        video: {
          videoId: "dQw4w9WgXcQ",
          channelId: channel.data.externalChannelId,
          channelTitle: "Singer Channel",
          title: "Untracked metadata overwrite",
          thumbnailUrl: null,
          durationSeconds: 999,
          publishedAt: NOW,
          availabilityStatus: "playable",
        },
        sourceId: id("source"),
      }],
      actor,
      now: NOW + 1,
      ids: {
        performanceId: id("performance"),
        eventId: id("event"),
      },
    });
    const reusedSource = await db
      .prepare(
        `SELECT title, duration_seconds, availability_status, version
        FROM music_media_sources WHERE external_id = ?`,
      )
      .bind("dQw4w9WgXcQ")
      .first<{
        title: string;
        duration_seconds: number;
        availability_status: string;
        version: number;
      }>();
    expect(reusedSource).toEqual({
      title: "Catalog Song",
      duration_seconds: 180,
      availability_status: "unavailable",
      version: 0,
    });

    await expect(
      repository.transitionPerformance(
        performance.data.id,
        performance.data.version,
        "published",
        actor,
        id("event"),
        NOW + 1,
      ),
    ).rejects.toMatchObject({
      code: "validation_failed",
    } satisfies Partial<AdminCatalogRepositoryError>);

    const afterRejectedPublish = await repository.readCatalog();
    expect(afterRejectedPublish.performances[0]?.publicationStatus).toBe(
      "draft",
    );
    const approvedChannel = await repository.updateChannel(
      {
        id: channel.data.id,
        externalChannelId: channel.data.externalChannelId,
        displayName: channel.data.displayName,
        channelRole: channel.data.channelRole,
        verificationStatus: "approved",
        active: true,
        entityIds: channel.data.entityIds,
        expectedVersion: channel.data.version,
      },
      actor,
      id("event"),
      NOW + 2,
    );
    expect(approvedChannel.data.active).toBe(true);

    const published = await repository.transitionPerformance(
      performance.data.id,
      performance.data.version,
      "published",
      actor,
      id("event"),
      NOW + 3,
    );
    expect(published.data.publicationStatus).toBe("published");
    expect(published.catalogRevision).toBeGreaterThan(
      performance.catalogRevision,
    );

    const [meta, event, searchTerms, sortKey, gram, foreignKeys] =
      await Promise.all([
        db
          .prepare(
            `SELECT catalog.revision, read_model.revision AS read_model_revision
        FROM music_catalog_meta AS catalog
        JOIN music_public_read_model_meta AS read_model ON read_model.id = catalog.id
        WHERE catalog.id = 1`,
          )
          .first<{ revision: number; read_model_revision: number }>(),
        db
          .prepare(
            `SELECT event_type FROM music_catalog_events
        WHERE aggregate_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
          )
          .bind(performance.data.id)
          .first<{ event_type: string }>(),
        db
          .prepare(
            "SELECT term_kind, normalized_term FROM music_search_terms WHERE song_id = ?",
          )
          .bind(song.data.id)
          .all<{ term_kind: string; normalized_term: string }>(),
        db
          .prepare(
            "SELECT normalized_participant FROM music_public_performance_sort_keys WHERE performance_id = ?",
          )
          .bind(performance.data.id)
          .first<{ normalized_participant: string }>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM music_search_grams WHERE song_id = ?",
          )
          .bind(song.data.id)
          .first<{ count: number }>(),
        db.prepare("PRAGMA foreign_key_check").all(),
      ]);
    expect(meta?.revision).toBe(published.catalogRevision);
    expect(meta?.read_model_revision).toBe(published.catalogRevision);
    expect(event?.event_type).toBe("performance.published");
    expect(searchTerms.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          term_kind: "title",
          normalized_term: "catalog song",
        }),
        expect.objectContaining({
          term_kind: "participant",
          normalized_term: "singer",
        }),
      ]),
    );
    expect(sortKey?.normalized_participant).toBe("singer");
    expect(Number(gram?.count)).toBeGreaterThan(0);
    expect(foreignKeys.results).toEqual([]);

    const publicReader = new D1PublicCatalogReader(db);
    const page = await publicReader.readCatalog({
      normalizedQuery: null,
      memberUids: [],
      memberMode: "any",
      groupKey: null,
      group: null,
      participantSlug: null,
      participantRole: null,
      relation: null,
      participation: null,
      originalArtistSlug: null,
      publishedFrom: null,
      publishedTo: null,
      sort: "recent",
      limit: 24,
      cursor: null,
    });
    expect(page.items.map((item) => item.id)).toEqual([song.data.id]);
    expect(page.items[0]?.representativePerformance.playable).toBe(false);
  });

  it("deletes draft and withdrawn test data while keeping events, projections, and revisions atomic", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const draft = await createDraftFixture(
      repository,
      "draft",
      "dQw4w9WgXcQ",
    );
    const deletedPerformance = await repository.deletePerformance(
      draft.performance.data.id,
      draft.performance.data.version,
      actor,
      id("event"),
      NOW + 1,
    );
    expect(deletedPerformance.data.id).toBe(draft.performance.data.id);
    expect(
      await db
        .prepare("SELECT id FROM music_media_sources WHERE external_id = ?")
        .bind("dQw4w9WgXcQ")
        .first(),
    ).toBeNull();

    const remainingSong = (await repository.readCatalog()).songs.find(
      (song) => song.id === draft.song.data.id,
    );
    expect(remainingSong).toBeTruthy();
    const deletedSong = await repository.deleteSong(
      draft.song.data.id,
      remainingSong!.version,
      actor,
      id("event"),
      NOW + 2,
    );
    const [rows, events, meta, foreignKeys] = await Promise.all([
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM music_songs WHERE id = ?) AS songs,
             (SELECT COUNT(*) FROM music_search_terms WHERE song_id = ?) AS search_terms,
             (SELECT COUNT(*) FROM music_search_grams WHERE song_id = ?) AS grams,
             (SELECT COUNT(*) FROM music_public_performance_sort_keys WHERE song_id = ?) AS sort_keys`,
        )
        .bind(
          draft.song.data.id,
          draft.song.data.id,
          draft.song.data.id,
          draft.song.data.id,
        )
        .first<Record<string, number>>(),
      db
        .prepare(
          `SELECT event_type FROM music_catalog_events
           WHERE event_type IN ('performance.deleted', 'song.deleted')
           ORDER BY created_at, id`,
        )
        .all<{ event_type: string }>(),
      db
        .prepare(
          `SELECT catalog.revision, read_model.revision AS read_model_revision
           FROM music_catalog_meta AS catalog
           JOIN music_public_read_model_meta AS read_model ON read_model.id = catalog.id
           WHERE catalog.id = 1`,
        )
        .first<{ revision: number; read_model_revision: number }>(),
      db.prepare("PRAGMA foreign_key_check").all(),
    ]);
    expect(rows).toEqual({
      songs: 0,
      search_terms: 0,
      grams: 0,
      sort_keys: 0,
    });
    expect(events.results.map((event) => event.event_type)).toEqual([
      "performance.deleted",
      "song.deleted",
    ]);
    expect(meta?.revision).toBe(deletedSong.catalogRevision);
    expect(meta?.read_model_revision).toBe(deletedSong.catalogRevision);
    expect(foreignKeys.results).toEqual([]);

    const draftWithChild = await createDraftFixture(
      repository,
      "child",
      "zYxWvUtSr_9",
    );
    const deletedSongWithChild = await repository.deleteSong(
      draftWithChild.song.data.id,
      draftWithChild.song.data.version,
      actor,
      id("event"),
      NOW + 3,
    );
    const cascaded = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM music_songs WHERE id = ?) AS songs,
           (SELECT COUNT(*) FROM music_performances WHERE id = ?) AS performances,
           (SELECT COUNT(*) FROM music_media_sources WHERE external_id = ?) AS sources`,
      )
      .bind(
        draftWithChild.song.data.id,
        draftWithChild.performance.data.id,
        "zYxWvUtSr_9",
      )
      .first<Record<string, number>>();
    expect(cascaded).toEqual({ songs: 0, performances: 0, sources: 0 });
    expect(deletedSongWithChild.catalogRevision).toBeGreaterThan(
      deletedSong.catalogRevision,
    );

    const publishedFixture = await createDraftFixture(
      repository,
      "published",
      "aBcDeFgHi_1",
      true,
    );
    const published = await repository.transitionPerformance(
      publishedFixture.performance.data.id,
      publishedFixture.performance.data.version,
      "published",
      actor,
      id("event"),
      NOW + 4,
    );
    await expect(
      repository.deletePerformance(
        published.data.id,
        published.data.version,
        actor,
        id("event"),
        NOW + 5,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(
      repository.deleteSong(
        publishedFixture.song.data.id,
        publishedFixture.song.data.version,
        actor,
        id("event"),
        NOW + 5,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });

    const withdrawn = await repository.transitionPerformance(
      published.data.id,
      published.data.version,
      "withdrawn",
      actor,
      id("event"),
      NOW + 6,
    );
    const deletedWithdrawnPerformance = await repository.deletePerformance(
      withdrawn.data.id,
      withdrawn.data.version,
      actor,
      id("event"),
      NOW + 7,
    );
    expect(deletedWithdrawnPerformance.data.id).toBe(withdrawn.data.id);
    const withdrawnDeleteEvent = await db
      .prepare(
        `SELECT before_json FROM music_catalog_events
         WHERE aggregate_id = ? AND event_type = 'performance.deleted'
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .bind(withdrawn.data.id)
      .first<{ before_json: string }>();
    expect(JSON.parse(withdrawnDeleteEvent!.before_json)).toMatchObject({
      publicationStatus: "withdrawn",
    });
    await expect(
      repository.deleteSong(
        publishedFixture.song.data.id,
        publishedFixture.song.data.version,
        actor,
        id("event"),
        NOW + 8,
      ),
    ).resolves.toMatchObject({ data: { id: publishedFixture.song.data.id } });

    const withdrawnChildFixture = await createDraftFixture(
      repository,
      "withdrawn-child",
      "wItHdRaWn_1",
      true,
    );
    const publishedChild = await repository.transitionPerformance(
      withdrawnChildFixture.performance.data.id,
      withdrawnChildFixture.performance.data.version,
      "published",
      actor,
      id("event"),
      NOW + 9,
    );
    await repository.transitionPerformance(
      publishedChild.data.id,
      publishedChild.data.version,
      "withdrawn",
      actor,
      id("event"),
      NOW + 10,
    );
    await repository.deleteSong(
      withdrawnChildFixture.song.data.id,
      withdrawnChildFixture.song.data.version,
      actor,
      id("event"),
      NOW + 11,
    );
    const withdrawnCascade = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM music_songs WHERE id = ?) AS songs,
           (SELECT COUNT(*) FROM music_performances WHERE id = ?) AS performances,
           (SELECT COUNT(*) FROM music_media_sources WHERE external_id = ?) AS sources`,
      )
      .bind(
        withdrawnChildFixture.song.data.id,
        withdrawnChildFixture.performance.data.id,
        "wItHdRaWn_1",
      )
      .first<Record<string, number>>();
    expect(withdrawnCascade).toEqual({
      songs: 0,
      performances: 0,
      sources: 0,
    });
  });

  it("deletes only unreferenced external identities and preserves protected identities", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const external = await createEntity(repository, "Disposable Group", "group");
    await db
      .prepare(
        `INSERT INTO music_entity_aliases
         (entity_id, alias, normalized_alias, locale, alias_kind)
         VALUES (?, 'Disposable Alias', 'disposable alias', 'en', 'alternate')`,
      )
      .bind(external.data.id)
      .run();

    const deleted = await repository.deleteEntity(
      external.data.id,
      external.data.version,
      actor,
      id("event"),
      NOW + 1,
    );
    const [deletedRows, deleteEvent, meta, foreignKeys] = await Promise.all([
      db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM music_entities WHERE id = ?) AS entities,
             (SELECT COUNT(*) FROM music_entity_aliases WHERE entity_id = ?) AS aliases`,
        )
        .bind(external.data.id, external.data.id)
        .first<Record<string, number>>(),
      db
        .prepare(
          `SELECT before_json FROM music_catalog_events
           WHERE aggregate_id = ? AND event_type = 'entity.deleted'`,
        )
        .bind(external.data.id)
        .first<{ before_json: string }>(),
      db
        .prepare(
          `SELECT catalog.revision, read_model.revision AS read_model_revision
           FROM music_catalog_meta AS catalog
           JOIN music_public_read_model_meta AS read_model ON read_model.id = catalog.id
           WHERE catalog.id = 1`,
        )
        .first<{ revision: number; read_model_revision: number }>(),
      db.prepare("PRAGMA foreign_key_check").all(),
    ]);
    expect(deletedRows).toEqual({ entities: 0, aliases: 0 });
    expect(JSON.parse(deleteEvent!.before_json)).toMatchObject({
      displayName: "Disposable Group",
      entityKind: "group",
      version: external.data.version,
    });
    expect(meta?.revision).toBe(deleted.catalogRevision);
    expect(meta?.read_model_revision).toBe(deleted.catalogRevision);
    expect(foreignKeys.results).toEqual([]);

    const staleExternal = await createEntity(repository, "Stale External");
    await expect(
      repository.deleteEntity(
        staleExternal.data.id,
        staleExternal.data.version + 1,
        actor,
        id("event"),
        NOW + 2,
      ),
    ).rejects.toMatchObject({ code: "stale_write" });

    const candidateReferenced = await createEntity(
      repository,
      "Candidate Review Singer",
    );
    await db.prepare(
      `INSERT INTO music_ingestion_candidates (
        id, provider, external_video_id, candidate_kind, status,
        classification, title, availability_status, review_input_json,
        first_discovered_at, last_discovered_at, retention_expires_at,
        version, created_at, updated_at
      ) VALUES ('youtube:EnTiTyReF01', 'youtube', 'EnTiTyReF01',
        'official_video', 'ready', 'eligible', 'Entity Reference Candidate',
        'playable', ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(
      JSON.stringify({
        participants: [{
          subject: {
            kind: "entity",
            entityId: candidateReferenced.data.id,
          },
        }],
      }),
      NOW,
      NOW,
      NOW + 90 * 86_400_000,
      NOW,
      NOW,
    ).run();
    await expect(
      repository.deleteEntity(
        candidateReferenced.data.id,
        candidateReferenced.data.version,
        actor,
        id("event"),
        NOW + 3,
      ),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fields: {
        entity: "referenced",
        references: expect.stringContaining("ingestionCandidates:1"),
      },
    });
    await db.prepare(
      `UPDATE music_ingestion_candidates
       SET status = 'converted', classification = 'existing_catalog'
       WHERE id = 'youtube:EnTiTyReF01'`,
    ).run();
    await expect(
      repository.deleteEntity(
        candidateReferenced.data.id,
        candidateReferenced.data.version,
        actor,
        id("event"),
        NOW + 4,
      ),
    ).resolves.toMatchObject({ data: { id: candidateReferenced.data.id } });

    await db.batch([
      db.prepare(
        `INSERT INTO members
         (uid, code, name, youtube_channel_id, is_deprecated)
         VALUES (901, 'protected-member', 'Protected Member', NULL, 0)`,
      ),
      db
        .prepare(
          `INSERT INTO music_entities (
             id, member_uid, entity_kind, display_name, normalized_name, slug,
             version, created_at, updated_at
           ) VALUES ('protected-member', 901, 'person', 'Protected Member',
                     'protected member', 'protected-member', 0, ?, ?)`,
        )
        .bind(NOW, NOW),
    ]);
    await expect(
      repository.deleteEntity(
        "protected-member",
        0,
        actor,
        id("event"),
        NOW + 3,
      ),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fields: { entity: "member_identity" },
    });

    const referenced = await createDraftFixture(
      repository,
      "referenced",
      "rEfErEnCe_1",
    );
    const revisionBeforeRejectedDelete = (await repository.readCatalog()).revision;
    await expect(
      repository.deleteEntity(
        referenced.singer.data.id,
        referenced.singer.data.version,
        actor,
        id("event"),
        NOW + 4,
      ),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fields: {
        entity: "referenced",
        references: expect.stringContaining("songs:1"),
      },
    });
    expect((await repository.readCatalog()).revision).toBe(
      revisionBeforeRejectedDelete,
    );
  });

  it("rolls back the integrated entry when its event fails and rejects a stale preflight revision", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const singer = await createEntity(repository, "Atomic Singer");
    const artist = await createEntity(repository, "Atomic Artist", "organization");
    const pending = await repository.createChannel(
      {
        externalChannelId: `UC${"R".repeat(22)}`,
        displayName: "Atomic Channel",
        channelRole: "member_music",
        entityIds: [singer.data.id],
      },
      actor,
      { channelId: id("channel"), eventId: id("event") },
      NOW,
    );
    const channel = await repository.updateChannel(
      {
        ...pending.data,
        expectedVersion: pending.data.version,
        verificationStatus: "approved",
        active: true,
      },
      actor,
      id("event"),
      NOW + 1,
    );
    const song = await repository.createSong(
      {
        slug: "atomic-song",
        title: "Atomic Song",
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [],
        originalArtists: [
          { entityId: artist.data.id, creditOrder: 0, isPrimary: true },
        ],
      },
      actor,
      { songId: id("song"), eventId: id("event") },
      NOW + 2,
    );
    const video = {
      videoId: "zYxWvUtSr_2",
      channelId: channel.data.externalChannelId,
      channelTitle: channel.data.displayName,
      title: "Atomic Video",
      thumbnailUrl: null,
      durationSeconds: 120,
      publishedAt: NOW,
      availabilityStatus: "playable" as const,
    };
    const preflight = await repository.preflightCatalogEntry(video, 0);
    const base = {
      input: {
        expectedCatalogRevision: preflight.catalogRevision,
        youtubeUrl: `https://youtu.be/${video.videoId}`,
        startSeconds: 0,
        song: { kind: "existing" as const, songId: song.data.id },
        participants: [
          {
            subject: { kind: "entity" as const, entityId: singer.data.id },
            participantRole: "vocal" as const,
            creditOrder: 0,
          },
        ],
        channel: { kind: "existing" as const, channelId: channel.data.id },
        relationType: "cover" as const,
        releaseType: "official_video" as const,
        participationType: "solo" as const,
        publicationTarget: "draft" as const,
      },
      video,
      actor,
      now: NOW + 3,
      ids: {
        entityIds: {},
        entityEventIds: {},
        channelId: id("unused-channel"),
        channelEventId: id("unused-event"),
        songId: id("unused-song"),
        songEventId: id("unused-event"),
        performanceId: "atomic-performance",
        performanceEventId: "duplicate-event",
        sourceId: "atomic-source",
      },
    };
    await db
      .prepare(
        `INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, created_at)
        VALUES ('duplicate-event', 'test', 'test', 'test.created', 'admin', ?, ?)`,
      )
      .bind(actor.userId, NOW)
      .run();
    const before = await repository.readCatalog();
    await expect(repository.createCatalogEntry(base)).rejects.toMatchObject({
      code: "validation_failed",
    });
    const afterFailure = await repository.readCatalog();
    expect(afterFailure.revision).toBe(before.revision);
    expect(afterFailure.performances).toEqual(before.performances);
    expect(
      await db
        .prepare("SELECT id FROM music_media_sources WHERE id = 'atomic-source'")
        .first(),
    ).toBeNull();

    await db
      .prepare(
        `CREATE TRIGGER fail_catalog_sort_key_projection
        BEFORE INSERT ON music_public_performance_sort_keys
        WHEN NEW.performance_id = 'read-model-failure'
        BEGIN SELECT RAISE(ABORT, 'forced read model failure'); END`,
      )
      .run();
    try {
      await expect(
        repository.createCatalogEntry({
          ...base,
          ids: {
            ...base.ids,
            performanceEventId: "read-model-failure-event",
            performanceId: "read-model-failure",
            sourceId: "read-model-failure-source",
          },
        }),
      ).rejects.toMatchObject({ code: "validation_failed" });
    } finally {
      await db.prepare("DROP TRIGGER fail_catalog_sort_key_projection").run();
    }
    const afterProjectionFailure = await repository.readCatalog();
    expect(afterProjectionFailure.revision).toBe(before.revision);
    expect(afterProjectionFailure.performances).toEqual(before.performances);
    expect(
      await db
        .prepare(
          "SELECT id FROM music_media_sources WHERE id = 'read-model-failure-source'",
        )
        .first(),
    ).toBeNull();

    await expect(
      repository.createCatalogEntry({
        ...base,
        input: {
          ...base.input,
          expectedCatalogRevision: preflight.catalogRevision - 1,
        },
        ids: {
          ...base.ids,
          performanceEventId: "fresh-event",
          performanceId: "stale-performance",
          sourceId: "stale-source",
        },
      }),
    ).rejects.toMatchObject({ code: "stale_write" });
    const afterStale = await repository.readCatalog();
    expect(afterStale.revision).toBe(before.revision);
    expect(afterStale.performances).toEqual(before.performances);
  });

  it("allows an unknown channel to save only a draft and blocks it after revocation", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const singer = await createEntity(repository, "Pending Singer");
    const artist = await createEntity(repository, "Pending Artist", "organization");
    const song = await repository.createSong(
      {
        slug: "pending-channel-song",
        title: "Pending Channel Song",
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [],
        originalArtists: [
          { entityId: artist.data.id, creditOrder: 0, isPrimary: true },
        ],
      },
      actor,
      { songId: id("song"), eventId: id("event") },
      NOW,
    );
    const video = {
      videoId: "pEnDiNgCh_3",
      channelId: `UC${"N".repeat(22)}`,
      channelTitle: "Unknown Channel",
      title: "Pending Video",
      thumbnailUrl: null,
      durationSeconds: 90,
      publishedAt: NOW,
      availabilityStatus: "playable" as const,
    };
    const preflight = await repository.preflightCatalogEntry(video, 0);
    expect(preflight.channel.state).toBe("unknown");
    const command = {
      input: {
        expectedCatalogRevision: preflight.catalogRevision,
        youtubeUrl: `https://youtu.be/${video.videoId}`,
        startSeconds: 0,
        song: { kind: "existing" as const, songId: song.data.id },
        participants: [
          {
            subject: { kind: "entity" as const, entityId: singer.data.id },
            participantRole: "vocal" as const,
            creditOrder: 0,
          },
        ],
        channel: {
          kind: "pending" as const,
          channelRole: "project_official" as const,
          owners: [{ kind: "entity" as const, entityId: singer.data.id }],
        },
        relationType: "cover" as const,
        releaseType: "official_video" as const,
        participationType: "solo" as const,
        publicationTarget: "draft" as const,
      },
      video,
      actor,
      now: NOW + 1,
      ids: {
        entityIds: {},
        entityEventIds: {},
        channelId: "channel-pending-inline",
        channelEventId: "event-pending-inline",
        songId: "unused-song",
        songEventId: "unused-song-event",
        performanceId: "performance-pending-inline",
        performanceEventId: "event-performance-pending-inline",
        sourceId: "source-pending-inline",
      },
    };
    await expect(
      repository.createCatalogEntry({
        ...command,
        input: { ...command.input, publicationTarget: "published" as const },
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect((await repository.readCatalog()).channels).toEqual([]);

    const result = await repository.createCatalogEntry(command);
    expect(result.data.performance.publicationStatus).toBe("draft");
    expect(result.data.channel).toMatchObject({
      verificationStatus: "pending",
      active: false,
    });
    await repository.updateChannel(
      {
        id: result.data.channel.id,
        externalChannelId: result.data.channel.externalChannelId,
        displayName: result.data.channel.displayName,
        channelRole: result.data.channel.channelRole,
        verificationStatus: "revoked",
        active: false,
        entityIds: result.data.channel.entityIds,
        expectedVersion: result.data.channel.version,
      },
      actor,
      id("event"),
      NOW + 2,
    );
    expect((await repository.preflightCatalogEntry(video, 30)).channel.state).toBe(
      "revoked",
    );
  });

  it("rolls back every side effect on a stale version", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const artist = await createEntity(repository, "Artist", "organization");
    const song = await repository.createSong(
      {
        slug: "stale-song",
        title: "Stale Song",
        isOtwOriginal: false,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [],
        originalArtists: [
          { entityId: artist.data.id, creditOrder: 0, isPrimary: true },
        ],
      },
      actor,
      { songId: id("song"), eventId: id("event") },
      NOW,
    );
    const before = await repository.readCatalog();

    await expect(
      repository.updateSong(
        {
          input: {
            id: song.data.id,
            expectedVersion: 99,
            slug: "should-not-commit",
            title: "Should Not Commit",
            isOtwOriginal: false,
            originalReleaseDate: null,
            originalReleasePrecision: "unknown",
            aliases: [{ alias: "bad alias" }],
            originalArtists: [
              {
                subject: { kind: "entity", entityId: artist.data.id },
                creditOrder: 0,
                isPrimary: true,
              },
            ],
          },
          actor,
          ids: {
            entityIds: {},
            entityEventIds: {},
            songEventId: id("event"),
          },
          now: NOW + 1,
        },
      ),
    ).rejects.toMatchObject({ code: "stale_write" });

    const after = await repository.readCatalog();
    expect(after.revision).toBe(before.revision);
    expect(after.readModelRevision).toBe(before.readModelRevision);
    expect(after.songs.find((item) => item.id === song.data.id)).toEqual(
      song.data,
    );
    const strayEvent = await db
      .prepare(
        `SELECT COUNT(*) AS count FROM music_catalog_events
      WHERE event_type = 'song.updated'`,
      )
      .first<{ count: number }>();
    expect(Number(strayEvent?.count)).toBe(0);
  });

  it("creates a new original artist and updates the song in one catalog batch", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const previousArtist = await createEntity(repository, "Previous Artist", "person");
    const song = await repository.createSong(
      {
        slug: "editable-song",
        title: "Editable Song",
        isOtwOriginal: false,
        originalReleaseDate: "2020-05-03",
        originalReleasePrecision: "day",
        tags: ["J-POP"],
        aliases: [],
        originalArtists: [
          {
            entityId: previousArtist.data.id,
            creditOrder: 0,
            isPrimary: true,
          },
        ],
      },
      actor,
      { songId: id("song"), eventId: id("event") },
      NOW,
    );
    const before = await repository.readCatalog();
    const entityId = id("entity");

    const updated = await repository.updateSong({
      input: {
        id: song.data.id,
        expectedVersion: song.data.version,
        slug: song.data.slug,
        title: "Edited Song",
        isOtwOriginal: false,
        originalReleaseDate: song.data.originalReleaseDate,
        originalReleasePrecision: song.data.originalReleasePrecision,
        aliases: [],
        originalArtists: [
          {
            subject: {
              kind: "new_external",
              clientKey: "new-artist-chip",
              displayName: "New Original Artist",
              entityKind: "person",
            },
            creditOrder: 0,
            isPrimary: true,
          },
        ],
      },
      actor,
      ids: {
        entityIds: { "external:new-artist-chip": entityId },
        entityEventIds: { "external:new-artist-chip": id("event") },
        songEventId: id("event"),
      },
      now: NOW + 1,
    });

    expect(updated.catalogRevision).toBe(before.revision + 1);
    expect(updated.data).toMatchObject({
      title: "Edited Song",
      originalReleaseDate: "2020-05-03",
      originalReleasePrecision: "day",
      tags: ["J-POP"],
      originalArtists: [
        {
          entityId,
          displayName: "New Original Artist",
          creditOrder: 0,
          isPrimary: true,
        },
      ],
    });
    const after = await repository.readCatalog();
    expect(after.readModelRevision).toBe(updated.catalogRevision);
    expect(after.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: entityId, displayName: "New Original Artist" }),
      ]),
    );
    const searchTerm = await db
      .prepare(
        `SELECT normalized_term FROM music_search_terms
         WHERE song_id = ? AND term_kind = 'original_artist'`,
      )
      .bind(song.data.id)
      .first<{ normalized_term: string }>();
    expect(searchTerm?.normalized_term).toBe("new original artist");
  });

  it("fails closed instead of healing an already stale public read model", async () => {
    const repository = new D1AdminCatalogRepository(db);
    await db
      .prepare(
        "UPDATE music_public_read_model_meta SET revision = 1, updated_at = ? WHERE id = 1",
      )
      .bind(NOW)
      .run();

    await expect(
      createEntity(repository, "Must Not Commit"),
    ).rejects.toMatchObject({
      code: "unavailable",
    } satisfies Partial<AdminCatalogRepositoryError>);

    const [entityCount, meta] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS count FROM music_entities")
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT catalog.revision, read_model.revision AS read_model_revision
        FROM music_catalog_meta AS catalog
        JOIN music_public_read_model_meta AS read_model ON read_model.id = catalog.id
        WHERE catalog.id = 1`,
        )
        .first<{ revision: number; read_model_revision: number }>(),
    ]);
    expect(Number(entityCount?.count)).toBe(0);
    expect(meta).toEqual({ revision: 0, read_model_revision: 1 });
  });

  it("recomputes the song duplicate identity and rolls back a conflicting edit", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const artist = await createEntity(
      repository,
      "Dedupe Artist",
      "organization",
    );
    const songInput = (slug: string, title: string) => ({
      slug,
      title,
      isOtwOriginal: false,
      originalReleaseDate: null,
      originalReleasePrecision: "unknown" as const,
      aliases: [],
      originalArtists: [
        { entityId: artist.data.id, creditOrder: 0, isPrimary: true },
      ],
    });
    await repository.createSong(
      songInput("dedupe-one", "Dedupe One"),
      actor,
      { songId: id("song"), eventId: id("event") },
      NOW,
    );
    const second = await repository.createSong(
      songInput("dedupe-two", "Dedupe Two"),
      actor,
      { songId: id("song"), eventId: id("event") },
      NOW + 1,
    );
    const before = await repository.readCatalog();

    await expect(
      repository.updateSong(
        {
          input: {
            ...songInput("dedupe-two", "Dedupe One"),
            originalArtists: [
              {
                subject: { kind: "entity", entityId: artist.data.id },
                creditOrder: 0,
                isPrimary: true,
              },
            ],
            id: second.data.id,
            expectedVersion: second.data.version,
          },
          actor,
          ids: {
            entityIds: {},
            entityEventIds: {},
            songEventId: id("event"),
          },
          now: NOW + 2,
        },
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });

    const after = await repository.readCatalog();
    expect(after.revision).toBe(before.revision);
    expect(after.songs.find((song) => song.id === second.data.id)?.title).toBe(
      "Dedupe Two",
    );
  });

  it("does not repoint a channel identity after a source references it", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const channel = await repository.createChannel(
      {
        externalChannelId: `UC${"A".repeat(22)}`,
        displayName: "Stable Channel",
        channelRole: "member_music",
        entityIds: [],
      },
      actor,
      { channelId: id("channel"), eventId: id("event") },
      NOW,
    );
    await db
      .prepare(
        `INSERT INTO music_media_sources (
      id, provider, external_id, channel_id, availability_status,
      version, created_at, updated_at
    ) VALUES (?, 'youtube', 'dQw4w9WgXcQ', ?, 'playable', 0, ?, ?)`,
      )
      .bind(id("source"), channel.data.id, NOW, NOW)
      .run();
    const before = await repository.readCatalog();

    await expect(
      repository.updateChannel(
        {
          id: channel.data.id,
          externalChannelId: `UC${"B".repeat(22)}`,
          displayName: "Different Channel",
          channelRole: "member_music",
          verificationStatus: "approved",
          active: true,
          entityIds: [],
          expectedVersion: channel.data.version,
        },
        actor,
        id("event"),
        NOW + 1,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });

    const after = await repository.readCatalog();
    expect(after.revision).toBe(before.revision);
    expect(after.channels[0]?.externalChannelId).toBe(
      channel.data.externalChannelId,
    );
  });

  it("replaces channel subject links atomically and records the correction", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const wrongSubject = await createEntity(repository, "Wrong Channel Group", "group");
    const correctSubject = await createEntity(repository, "Correct Channel Owner");
    const created = await repository.createChannel(
      {
        externalChannelId: `UC${"S".repeat(22)}`,
        displayName: "Subject Correction Channel",
        channelRole: "member_main",
        entityIds: [wrongSubject.data.id],
      },
      actor,
      { channelId: id("channel"), eventId: id("event") },
      NOW,
    );
    const before = await repository.readCatalog();
    const eventId = id("event");

    const updated = await repository.updateChannel(
      {
        id: created.data.id,
        externalChannelId: created.data.externalChannelId,
        displayName: created.data.displayName,
        channelRole: created.data.channelRole,
        verificationStatus: "approved",
        active: true,
        entityIds: [correctSubject.data.id],
        expectedVersion: created.data.version,
      },
      actor,
      eventId,
      NOW + 1,
    );

    expect(updated.data.entityIds).toEqual([correctSubject.data.id]);
    expect(updated.catalogRevision).toBe(before.revision + 1);
    const linkRows = await db
      .prepare(
        "SELECT entity_id FROM music_channel_entities WHERE channel_id = ? ORDER BY entity_id",
      )
      .bind(created.data.id)
      .all<{ entity_id: string }>();
    expect(linkRows.results).toEqual([{ entity_id: correctSubject.data.id }]);
    const event = await db
      .prepare(
        "SELECT before_json, after_json FROM music_catalog_events WHERE id = ?",
      )
      .bind(eventId)
      .first<{ before_json: string; after_json: string }>();
    expect(JSON.parse(event?.before_json ?? "{}")).toMatchObject({
      entityIds: [wrongSubject.data.id],
      verificationStatus: "pending",
      active: false,
    });
    expect(JSON.parse(event?.after_json ?? "{}")).toMatchObject({
      entityIds: [correctSubject.data.id],
      verificationStatus: "approved",
      active: true,
    });
  });

  it("approves a proposal with canonical catalog, events, and projection in one batch", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const singer = await createEntity(repository, "Proposal Singer");
    const artist = await createEntity(
      repository,
      "Proposal Artist",
      "organization",
    );
    const pendingChannel = await repository.createChannel(
      {
        externalChannelId: `UC${"P".repeat(22)}`,
        displayName: "Proposal Channel",
        channelRole: "member_music",
        entityIds: [singer.data.id],
      },
      actor,
      { channelId: id("channel"), eventId: id("event") },
      NOW,
    );
    const channel = await repository.updateChannel(
      {
        id: pendingChannel.data.id,
        externalChannelId: pendingChannel.data.externalChannelId,
        displayName: pendingChannel.data.displayName,
        channelRole: pendingChannel.data.channelRole,
        verificationStatus: "approved",
        active: true,
        entityIds: pendingChannel.data.entityIds,
        expectedVersion: pendingChannel.data.version,
      },
      actor,
      id("event"),
      NOW + 1,
    );
    const proposalId = id("proposal");
    await db.batch([
      db
        .prepare(
          `INSERT INTO music_cover_proposals (
        id, submitted_by_user_id, idempotency_key, submitted_url,
        youtube_video_id, segment_start_seconds, submitted_title,
        submitted_tags_json, status, version, created_at, updated_at
      ) VALUES (?, 'member-1', 'proposal-key', ?, 'dQw4w9WgXcQ', 0,
        'Proposal Song', '["J-POP"]', 'pending_review', 0, ?, ?)`,
        )
        .bind(proposalId, "https://youtu.be/dQw4w9WgXcQ", NOW, NOW),
      db
        .prepare(
          `INSERT INTO music_cover_proposal_participants (
        proposal_id, credit_order, resolved_entity_id,
        submitted_name_snapshot, participant_role
      ) VALUES (?, 0, ?, 'Proposal Singer', 'vocal')`,
        )
        .bind(proposalId, singer.data.id),
      db
        .prepare(
          `INSERT INTO music_cover_proposal_original_artists (
        proposal_id, credit_order, resolved_entity_id, submitted_name_snapshot
      ) VALUES (?, 0, ?, 'Proposal Artist')`,
        )
        .bind(proposalId, artist.data.id),
    ]);

    await expect(repository.readProposals("pending_review")).resolves.toEqual([
      expect.objectContaining({ id: proposalId, tags: ["J-POP"] }),
    ]);

    const revisionBeforeApproval = (await repository.readCatalog()).revision;
    const publicReader = new D1PublicCatalogReader(db);
    const publicQuery = {
      normalizedQuery: null,
      memberUids: [],
      memberMode: "any" as const,
      groupKey: null,
      group: null,
      participantSlug: null,
      participantRole: null,
      relation: null,
      participation: null,
      originalArtistSlug: null,
      publishedFrom: null,
      publishedTo: null,
      sort: "recent" as const,
      limit: 24,
      cursor: null,
    };
    expect((await publicReader.readCatalog(publicQuery)).items).toEqual([]);
    const approvalCommand = (): AdminApproveProposalCommand => ({
      proposalId,
      input: {
        expectedVersion: 0,
        expectedCatalogRevision: revisionBeforeApproval,
        song: {
          kind: "create",
            title: "Proposal Song",
            isOtwOriginal: false,
            originalReleaseDate: null,
            originalReleasePrecision: "unknown",
            aliases: [],
            tags: ["J-POP"],
            originalArtists: [
              {
                subject: { kind: "entity", entityId: artist.data.id },
                creditOrder: 0,
                isPrimary: true,
              },
            ],
        },
        participants: [
          {
            subject: { kind: "entity", entityId: singer.data.id },
            participantRole: "vocal",
            creditOrder: 0,
            creditNameSnapshot: "Proposal Singer",
          },
        ],
        channel: { kind: "existing", channelId: channel.data.id },
        releaseType: "official_video",
        participationType: "solo",
        singingCreditConfirmed: true,
        publish: true,
      },
      video: {
        videoId: "dQw4w9WgXcQ",
        channelId: channel.data.externalChannelId,
        channelTitle: channel.data.displayName,
        title: "Proposal Song",
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: NOW,
        availabilityStatus: "playable",
      },
      actor,
      now: NOW + 2,
      ids: {
        lockToken: id("lock"),
        entityIds: {},
        entityEventIds: {},
        channelId: id("channel"),
        channelEventId: id("event"),
        songId: id("song"),
        performanceId: id("performance"),
        sourceId: id("source"),
        proposalEventId: id("event"),
        songEventId: id("event"),
        performanceEventId: id("event"),
      },
    });
    const attempts = await Promise.allSettled([
      repository.approveProposal(approvalCommand()),
      repository.approveProposal(approvalCommand()),
    ]);
    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof repository.approveProposal>>> =>
        attempt.status === "fulfilled",
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(AdminCatalogRepositoryError);
    const result = fulfilled[0]!.value;
    expect(result.data.status).toBe("approved");
    expect(result.data.approvedPerformanceId).toBeTruthy();
    expect(result.data.reviewedByUserId).toBe(actor.userId);
    const catalog = await repository.readCatalog();
    expect(catalog.revision).toBe(catalog.readModelRevision);
    expect(catalog.revision).toBe(revisionBeforeApproval + 1);
    expect(catalog.songs.map((song) => song.title)).toContain("Proposal Song");
    expect(catalog.songs.find((song) => song.title === "Proposal Song")?.tags)
      .toEqual(["J-POP"]);
    expect(
      catalog.performances.find(
        (performance) => performance.id === result.data.approvedPerformanceId,
      )?.publicationStatus,
    ).toBe("published");
    expect(
      (await publicReader.readCatalog(publicQuery)).items.map((item) => item.title),
    ).toContain("Proposal Song");
    const eventTypes = await db
      .prepare(
        `SELECT event_type FROM music_catalog_events
      WHERE aggregate_id IN (?, ?) ORDER BY event_type`,
      )
      .bind(proposalId, result.data.approvedPerformanceId)
      .all<{ event_type: string }>();
    expect(eventTypes.results.map((event) => event.event_type)).toEqual([
      "performance.created_inline",
      "proposal.approved",
    ]);
  });

  it("rolls back authority and projection when the authoritative event insert fails", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const artist = await createEntity(
      repository,
      "Rollback Artist",
      "organization",
    );
    const duplicateEventId = id("event");
    await db
      .prepare(
        `INSERT INTO music_catalog_events (
      id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, created_at
    ) VALUES (?, 'test', 'test', 'test.created', 'admin', ?, ?)`,
      )
      .bind(duplicateEventId, actor.userId, NOW)
      .run();
    const before = await repository.readCatalog();

    await expect(
      repository.createSong(
        {
          slug: "rolled-back-song",
          title: "Rolled Back Song",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          aliases: [{ alias: "Should disappear" }],
          originalArtists: [
            { entityId: artist.data.id, creditOrder: 0, isPrimary: true },
          ],
        },
        actor,
        { songId: id("song"), eventId: duplicateEventId },
        NOW + 1,
      ),
    ).rejects.toMatchObject({ code: "validation_failed" });

    const after = await repository.readCatalog();
    expect(after.revision).toBe(before.revision);
    expect(after.songs).toEqual(before.songs);
    const leakedTerms = await db
      .prepare(
        `SELECT COUNT(*) AS count
      FROM music_search_terms WHERE display_value = 'Should disappear'`,
      )
      .first<{ count: number }>();
    expect(Number(leakedTerms?.count)).toBe(0);
  });

  it("atomically corrects every performance field and rebuilds participant identities and projections", async () => {
    const repository = new D1AdminCatalogRepository(db);
    const fixture = await createDraftFixture(
      repository,
      "update",
      "dQw4w9WgXcQ",
      true,
    );
    const targetArtist = await createEntity(repository, "Target Artist");
    const targetSong = await repository.createSong(
      {
        slug: "performance-update-target",
        title: "Performance Update Target",
        isOtwOriginal: true,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown",
        aliases: [],
        originalArtists: [
          {
            entityId: targetArtist.data.id,
            creditOrder: 0,
            isPrimary: true,
          },
        ],
      },
      actor,
      { songId: id("song"), eventId: id("event") },
      NOW,
    );
    await db
      .prepare(
        `INSERT INTO members
        (uid, code, name, oshi_mark, youtube_channel_id, unit_name, is_deprecated)
        VALUES (901, 'correction-member', '수정 멤버', '🌙', NULL, '수정 유닛', 0)`,
      )
      .run();
    const memberEntityId = id("entity-member");
    const guestEntityId = id("entity-guest");
    const revisionBefore = (await repository.readCatalog()).revision;

    const updated = await repository.updatePerformance({
      input: {
        id: fixture.performance.data.id,
        expectedVersion: fixture.performance.data.version,
        songId: targetSong.data.id,
        relationType: "cover",
        releaseType: "official_mv",
        participationType: "duet",
        qualityStatus: "needs_update",
        releasedAt: NOW + 60_000,
        internalNote: "all fields corrected",
        tags: ["라이브", "듀엣 버전"],
        participants: [
          {
            subject: { kind: "member", memberUid: 901 },
            participantRole: "featured_vocal",
            creditOrder: 0,
            creditNameSnapshot: "수정 멤버 크레딧",
          },
          {
            subject: {
              kind: "new_external",
              clientKey: "guest-chip",
              displayName: "수정 게스트",
              entityKind: "person",
            },
            participantRole: "vocal",
            creditOrder: 1,
            creditNameSnapshot: "게스트 크레딧",
          },
        ],
        sources: [{
          youtubeUrl: "https://youtu.be/ASRCBcCY_qE",
          channelId: fixture.channel.data.id,
          startSeconds: 12,
          endSeconds: 170,
          sourceRole: "alternate",
          priority: 0,
          isPrimary: true,
        }],
      },
      sources: [{
        input: { youtubeUrl: "https://youtu.be/ASRCBcCY_qE", channelId: fixture.channel.data.id, startSeconds: 12, endSeconds: 170, sourceRole: "alternate", priority: 0, isPrimary: true },
        video: {
          videoId: "ASRCBcCY_qE",
          channelId: fixture.channel.data.externalChannelId,
          channelTitle: fixture.channel.data.displayName,
          title: "Corrected performance video",
          thumbnailUrl: null,
          durationSeconds: 190,
          publishedAt: NOW + 60_000,
          availabilityStatus: "playable",
        },
        sourceId: id("source"),
      }],
      actor,
      now: NOW + 60_000,
      ids: {
        entityIds: {
          "member:901": memberEntityId,
          "external:guest-chip": guestEntityId,
        },
        entityEventIds: {
          "member:901": id("event"),
          "external:guest-chip": id("event"),
        },
        eventId: id("event"),
      },
    });

    expect(updated.data.songId).toBe(targetSong.data.id);
    expect(updated.data.relationType).toBe("cover");
    expect(updated.data.releaseType).toBe("official_mv");
    expect(updated.data.participationType).toBe("duet");
    expect(updated.data.qualityStatus).toBe("needs_update");
    expect(updated.data.releasedAt).toBe(NOW + 60_000);
    expect(updated.data.internalNote).toBe("all fields corrected");
    expect(updated.data.tags).toEqual(["듀엣 버전", "라이브"]);
    expect(updated.data.participants).toEqual([
      expect.objectContaining({
        entityId: memberEntityId,
        displayName: "수정 멤버",
        participantRole: "featured_vocal",
        creditOrder: 0,
        creditNameSnapshot: "수정 멤버 크레딧",
      }),
      expect.objectContaining({
        entityId: guestEntityId,
        displayName: "수정 게스트",
        participantRole: "vocal",
        creditOrder: 1,
        creditNameSnapshot: "게스트 크레딧",
      }),
    ]);
    expect(updated.data.sources).toEqual([
      expect.objectContaining({
        startSeconds: 12,
        endSeconds: 170,
        sourceRole: "alternate",
        source: expect.objectContaining({
          externalId: "ASRCBcCY_qE",
          channelId: fixture.channel.data.id,
        }),
      }),
    ]);
    const oldSource = await db
      .prepare(
        "SELECT id FROM music_media_sources WHERE external_id = 'dQw4w9WgXcQ'",
      )
      .first();
    expect(oldSource).toBeNull();
    const catalogAfter = await repository.readCatalog();
    expect(catalogAfter.revision).toBe(revisionBefore + 1);
    expect(catalogAfter.readModelRevision).toBe(catalogAfter.revision);
    expect(
      catalogAfter.entities.find((entity) => entity.id === memberEntityId)
        ?.memberUid,
    ).toBe(901);
    expect(
      catalogAfter.entities.find((entity) => entity.id === guestEntityId)
        ?.displayName,
    ).toBe("수정 게스트");
    const event = await db
      .prepare(
        "SELECT event_type FROM music_catalog_events WHERE aggregate_id = ? AND event_type = 'performance.updated'",
      )
      .bind(updated.data.id)
      .first<{ event_type: string }>();
    expect(event?.event_type).toBe("performance.updated");

    const leakEntityId = id("entity-leak");
    const beforeStale = await repository.readCatalog();
    await expect(
      repository.updatePerformance({
        input: {
          id: updated.data.id,
          expectedVersion: fixture.performance.data.version,
          songId: targetSong.data.id,
          relationType: "cover",
          releaseType: "official_mv",
          participationType: "solo",
          qualityStatus: "ok",
          releasedAt: null,
          participants: [
            {
              subject: {
                kind: "new_external",
                clientKey: "leak-chip",
                displayName: "Must Roll Back",
                entityKind: "person",
              },
              participantRole: "vocal",
              creditOrder: 0,
              creditNameSnapshot: "Must Roll Back",
            },
          ],
          sources: [{
            youtubeUrl: "https://youtu.be/ASRCBcCY_qE",
            channelId: fixture.channel.data.id,
            startSeconds: 12,
            endSeconds: 170,
            sourceRole: "alternate",
            priority: 0,
            isPrimary: true,
          }],
        },
        sources: [{
          input: { youtubeUrl: "https://youtu.be/ASRCBcCY_qE", channelId: fixture.channel.data.id, startSeconds: 12, endSeconds: 170, sourceRole: "alternate", priority: 0, isPrimary: true },
          video: {
            videoId: "ASRCBcCY_qE",
            channelId: fixture.channel.data.externalChannelId,
            channelTitle: fixture.channel.data.displayName,
            title: "Corrected performance video",
            thumbnailUrl: null,
            durationSeconds: 190,
            publishedAt: NOW + 60_000,
            availabilityStatus: "playable",
          },
          sourceId: id("source"),
        }],
        actor,
        now: NOW + 120_000,
        ids: {
          entityIds: { "external:leak-chip": leakEntityId },
          entityEventIds: { "external:leak-chip": id("event") },
          eventId: id("event"),
        },
      }),
    ).rejects.toBeInstanceOf(AdminCatalogRepositoryError);
    const afterStale = await repository.readCatalog();
    expect(afterStale.revision).toBe(beforeStale.revision);
    expect(afterStale.performances).toEqual(beforeStale.performances);
    expect(
      afterStale.entities.some((entity) => entity.id === leakEntityId),
    ).toBe(false);
  });
});
