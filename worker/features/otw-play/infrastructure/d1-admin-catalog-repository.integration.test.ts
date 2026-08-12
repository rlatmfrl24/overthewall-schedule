import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminCatalogRepositoryError } from "../application/ports/admin-catalog-repository";
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
  kind: "person" | "organization" = "person",
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

beforeEach(async () => {
  idSequence = 0;
  await applyD1Migrations(db, testEnv.OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS);
  await db.batch([
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
    db.prepare("DELETE FROM music_media_source_relations"),
    db.prepare("DELETE FROM music_channel_entities"),
    db.prepare("DELETE FROM music_song_original_artists"),
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
        source: {
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          channelId: channel.data.id,
          startSeconds: 0,
          sourceRole: "official",
        },
      },
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
      actor,
      now: NOW,
      ids: {
        performanceId: id("performance"),
        sourceId: id("source"),
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
        source: {
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          channelId: channel.data.id,
          startSeconds: 30,
          sourceRole: "official",
        },
      },
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
      actor,
      now: NOW + 1,
      ids: {
        performanceId: id("performance"),
        sourceId: id("source"),
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
          id: song.data.id,
          expectedVersion: 99,
          slug: "should-not-commit",
          title: "Should Not Commit",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          aliases: [{ alias: "bad alias" }],
          originalArtists: [
            { entityId: artist.data.id, creditOrder: 0, isPrimary: true },
          ],
        },
        actor,
        id("event"),
        NOW + 1,
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
          ...songInput("dedupe-two", "Dedupe One"),
          id: second.data.id,
          expectedVersion: second.data.version,
        },
        actor,
        id("event"),
        NOW + 2,
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
        status, version, created_at, updated_at
      ) VALUES (?, 'member-1', 'proposal-key', ?, 'dQw4w9WgXcQ', 0,
        'Proposal Song', 'pending_review', 0, ?, ?)`,
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

    const result = await repository.approveProposal({
      proposalId,
      input: {
        expectedVersion: 0,
        song: {
          create: {
            slug: "proposal-song",
            title: "Proposal Song",
            isOtwOriginal: false,
            originalReleaseDate: null,
            originalReleasePrecision: "unknown",
            aliases: [],
            originalArtists: [
              {
                entityId: artist.data.id,
                creditOrder: 0,
                isPrimary: true,
              },
            ],
          },
        },
        performance: {
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
              creditNameSnapshot: "Proposal Singer",
            },
          ],
          source: {
            channelId: channel.data.id,
            startSeconds: 0,
            sourceRole: "official",
          },
        },
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
        songId: id("song"),
        performanceId: id("performance"),
        sourceId: id("source"),
        proposalEventId: id("event"),
        songEventId: id("event"),
        performanceEventId: id("event"),
      },
    });
    expect(result.data.status).toBe("approved");
    expect(result.data.approvedPerformanceId).toBeTruthy();
    expect(result.data.reviewedByUserId).toBe(actor.userId);
    const catalog = await repository.readCatalog();
    expect(catalog.revision).toBe(catalog.readModelRevision);
    expect(catalog.songs.map((song) => song.slug)).toContain("proposal-song");
    expect(
      catalog.performances.find(
        (performance) => performance.id === result.data.approvedPerformanceId,
      )?.publicationStatus,
    ).toBe("published");
    const eventTypes = await db
      .prepare(
        `SELECT event_type FROM music_catalog_events
      WHERE aggregate_id IN (?, ?) ORDER BY event_type`,
      )
      .bind(proposalId, result.data.approvedPerformanceId)
      .all<{ event_type: string }>();
    expect(eventTypes.results.map((event) => event.event_type)).toEqual([
      "performance.created_from_proposal",
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
});
