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
    db.prepare(
      "UPDATE music_catalog_meta SET revision = 0, updated_at = 0 WHERE id = 1",
    ),
    db.prepare(
      "UPDATE music_public_read_model_meta SET revision = 0, updated_at = 0 WHERE id = 1",
    ),
  ]);
});

describe("D1AdminCatalogRepository", () => {
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
