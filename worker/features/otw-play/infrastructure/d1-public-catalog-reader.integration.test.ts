import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { PublicCatalogReaderQuery } from "../application/ports/public-catalog-reader";
import { parsePublicCatalogQuery } from "../domain/public-catalog-query";
import { encodePublicCatalogGroupKey } from "../domain/public-group-key";
import {
  buildD1ParticipantBrowseCandidateQuery,
  buildD1PublicCatalogCandidateQuery,
  D1PublicCatalogReader,
} from "./d1-public-catalog-reader";

const PUBLIC_MIGRATION_NAMES = [
  "0046_tan_nova.sql",
  "0047_nasty_cargill.sql",
  "0048_previous_the_phantom.sql",
  "0049_otw_play_catalog_meta_seed.sql",
  "0050_parched_marvel_apes.sql",
  "0051_clear_mantis.sql",
  "0052_otw-play-public-read-model-backfill.sql",
  "0053_red_talon.sql",
  "0054_odd_storm.sql",
  "0055_tiresome_pride.sql",
  "0056_moaning_killmonger.sql",
  "0057_numerous_luminals.sql",
  "0058_awesome_lorna_dane.sql",
] as const;

type PublicCatalogTestEnv = Env & {
  OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS: D1Migration[];
};

const testEnv = env as PublicCatalogTestEnv;
const db = testEnv.otw_db;
const NOW = Date.UTC(2026, 0, 10);
const DAY = 86_400_000;

const toReaderQuery = (query = ""): PublicCatalogReaderQuery => {
  const parsed = parsePublicCatalogQuery(new URLSearchParams(query).entries());
  return {
    normalizedQuery: parsed.normalizedQuery,
    memberUids: parsed.memberUids,
    memberMode: parsed.memberMode,
    groupKey: parsed.groupKey,
    group: parsed.group,
    participantSlug: parsed.participantSlug,
    participantRole: parsed.participantRole,
    relation: parsed.relation,
    participation: parsed.participation,
    originalArtistSlug: parsed.originalArtistSlug,
    publishedFrom: parsed.publishedFrom,
    publishedTo: parsed.publishedTo,
    sort: parsed.sort,
    limit: parsed.limit,
    cursor: null,
  };
};

const cleanup = async () => {
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
    db.prepare("DELETE FROM music_song_tags"),
    db.prepare("DELETE FROM music_song_aliases"),
    db.prepare("DELETE FROM music_entity_aliases"),
    db.prepare("DELETE FROM music_performances"),
    db.prepare("DELETE FROM music_media_sources"),
    db.prepare(
      "UPDATE music_songs SET merged_into_song_id = NULL WHERE merged_into_song_id IS NOT NULL",
    ),
    db.prepare("DELETE FROM music_songs"),
    db.prepare("DELETE FROM music_channels"),
    db.prepare("DELETE FROM music_entities"),
    db.prepare("DELETE FROM members"),
    db.prepare(
      `UPDATE music_catalog_meta
       SET revision = 7, public_read_enabled = 1,
           navigation_visible = 0, updated_at = ?
       WHERE id = 1`,
    ).bind(NOW),
    db.prepare(
      `UPDATE music_public_read_model_meta
       SET revision = 7, updated_at = ?
       WHERE id = 1`,
    ).bind(NOW),
  ]);
};

const rebuildReadModel = async () => {
  await db.batch([
    db.prepare("DELETE FROM music_search_gram_stats"),
    db.prepare("DELETE FROM music_search_grams"),
    db.prepare("DELETE FROM music_public_performance_sort_keys"),
    db.prepare(
      `INSERT INTO music_public_performance_sort_keys (
         performance_id, song_id, representative_participant_entity_id,
         normalized_participant
       )
       SELECT performance.id, performance.song_id,
              representative.entity_id, entity.normalized_name
       FROM music_performances AS performance
       LEFT JOIN music_performance_participants AS representative
         ON representative.performance_id = performance.id
        AND NOT EXISTS (
          SELECT 1
          FROM music_performance_participants AS earlier
          WHERE earlier.performance_id = representative.performance_id
            AND (
              earlier.credit_order < representative.credit_order
              OR (
                earlier.credit_order = representative.credit_order
                AND earlier.entity_id < representative.entity_id
              )
            )
        )
       LEFT JOIN music_entities AS entity
         ON entity.id = representative.entity_id`,
    ),
    db.prepare(
      `WITH RECURSIVE
         gram_sizes(gram_size) AS (
           SELECT 2 UNION ALL SELECT 3
         ),
         source_terms(song_id, normalized_term) AS (
           SELECT id, normalized_title FROM music_songs
           UNION
           SELECT song_id, normalized_term FROM music_search_terms
         ),
         gram_positions(song_id, normalized_term, gram_size, position) AS (
           SELECT source_terms.song_id, source_terms.normalized_term,
                  gram_sizes.gram_size, 1
           FROM source_terms
           CROSS JOIN gram_sizes
           WHERE length(source_terms.normalized_term) >= gram_sizes.gram_size
           UNION ALL
           SELECT song_id, normalized_term, gram_size, position + 1
           FROM gram_positions
           WHERE position < length(normalized_term) - gram_size + 1
         )
       INSERT OR IGNORE INTO music_search_grams (
         song_id, gram_size, normalized_gram
       )
       SELECT song_id, gram_size,
              substr(normalized_term, position, gram_size)
       FROM gram_positions`,
    ),
    db.prepare(
      `INSERT INTO music_search_gram_stats (
         gram_size, normalized_gram, song_count
       )
       SELECT gram_size, normalized_gram, COUNT(*)
       FROM music_search_grams
       GROUP BY gram_size, normalized_gram`,
    ),
    db.prepare(
      `UPDATE music_public_read_model_meta
       SET revision = (
             SELECT revision FROM music_catalog_meta WHERE id = 1
           ),
           updated_at = ?
       WHERE id = 1`,
    ).bind(NOW),
  ]);
};

const insertSong = (
  id: string,
  title = id,
  options: {
    archived?: boolean;
    mergedInto?: string | null;
    originalArtist?: string | null;
  } = {},
) => [
  db
    .prepare(
      `INSERT INTO music_songs (
         id, slug, title, normalized_title, dedupe_key, is_otw_original,
         original_release_precision, merged_into_song_id, archived_at,
         version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 0, 'unknown', ?, ?, 0, ?, ?)`,
    )
    .bind(
      id,
      `${id}-slug`,
      title,
      title.normalize("NFKC").toLowerCase(),
      `${id}-dedupe`,
      options.mergedInto ?? null,
      options.archived ? NOW : null,
      NOW,
      NOW,
    ),
  ...(options.originalArtist
    ? [
        db
          .prepare(
            `INSERT INTO music_song_original_artists (
               song_id, entity_id, credit_order, is_primary
             ) VALUES (?, ?, 0, 1)`,
          )
          .bind(id, options.originalArtist),
      ]
    : []),
];

const insertPerformance = (
  id: string,
  songId: string,
  options: {
    status?: "draft" | "published" | "withdrawn";
    releaseType?:
      | "official_mv"
      | "official_video"
      | "broadcast"
      | "live"
      | "shorts";
    relation?: "original" | "cover";
    participation?: "solo" | "duet" | "unit" | "group" | "external_collab";
    quality?: "ok" | "needs_update";
    releasedAt?: number | null;
  } = {},
) =>
  db
    .prepare(
      `INSERT INTO music_performances (
         id, song_id, dedupe_key, relation_type, release_type,
         participation_type, publication_status, quality_status,
         released_at, version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      id,
      songId,
      `${id}-dedupe`,
      options.relation ?? "cover",
      options.releaseType ?? "official_video",
      options.participation ?? "solo",
      options.status ?? "published",
      options.quality ?? "ok",
      options.releasedAt === undefined ? NOW : options.releasedAt,
      NOW,
      NOW,
    );

const insertParticipant = (
  performanceId: string,
  entityId: string,
  order: number,
  role: "vocal" | "featured_vocal" | "chorus" | "other" = "vocal",
) =>
  db
    .prepare(
      `INSERT INTO music_performance_participants (
         performance_id, entity_id, participant_role, credit_order,
         credit_name_snapshot
       )
       SELECT ?, id, ?, ?, display_name
       FROM music_entities
       WHERE id = ?`,
    )
    .bind(performanceId, role, order, entityId);

const seedIdentityAndChannels = async () => {
  await db.batch([
    db.prepare(
      `INSERT INTO members (uid, code, name, oshi_mark, unit_name, is_deprecated)
       VALUES (1, 'current-a', 'Current A', 'A', 'Unit Alpha', 0),
              (2, 'former-b', 'Former B', 'B', 'Unit Old', 1),
              (3, 'current-c', 'Current C', 'C', 'Unit Beta', NULL)`,
    ),
    db.prepare(
      `INSERT INTO music_entities (
         id, member_uid, entity_kind, display_name, normalized_name, slug,
         version, created_at, updated_at
       ) VALUES
         ('entity-current-a', 1, 'person', 'Current A', 'current a', 'current-a', 0, ?, ?),
         ('entity-former-b', 2, 'person', 'Former B', 'former b', 'former-b', 0, ?, ?),
         ('entity-current-c', 3, 'person', 'Current C', 'current c', 'current-c', 0, ?, ?),
         ('entity-group', NULL, 'group', 'OTW Unit', 'otw unit', 'otw-unit', 0, ?, ?),
         ('entity-artist', NULL, 'person', 'Original Artist', 'original artist', 'original-artist', 0, ?, ?)`,
    ).bind(NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW),
    db.prepare(
      `INSERT INTO music_channels (
         id, provider, external_channel_id, display_name, channel_role,
         verification_status, active, version, created_at, updated_at
       ) VALUES
         ('channel-public', 'youtube', 'UCaaaaaaaaaaaaaaaaaaaaaa', 'Public Channel',
          'member_music', 'approved', 1, 0, ?, ?),
         ('channel-pending', 'youtube', 'UCbbbbbbbbbbbbbbbbbbbbbb', 'Pending Channel',
          'member_main', 'pending', 0, 0, ?, ?),
         ('channel-kirinuki', 'youtube', 'UCcccccccccccccccccccccc', 'Kirinuki Channel',
          'approved_kirinuki', 'approved', 1, 0, ?, ?)`,
    ).bind(NOW, NOW, NOW, NOW, NOW, NOW),
  ]);
};

const seedVisibilityFixture = async () => {
  await seedIdentityAndChannels();
  await db.batch([
    ...insertSong("song-visible", "Visible Song", {
      originalArtist: "entity-artist",
    }),
    ...insertSong("song-no-source", "Metadata Only"),
    ...insertSong("song-draft", "Draft Song"),
    ...insertSong("song-withdrawn", "Withdrawn Song"),
    ...insertSong("song-broadcast", "Broadcast Song"),
    ...insertSong("song-archived", "Archived Song", { archived: true }),
    ...insertSong("song-merged", "Merged Song", {
      mergedInto: "song-visible",
    }),
    insertPerformance("performance-visible", "song-visible", {
      quality: "needs_update",
      releasedAt: NOW,
      participation: "group",
    }),
    insertPerformance("performance-no-source", "song-no-source", {
      releasedAt: null,
    }),
    insertPerformance("performance-draft", "song-draft", { status: "draft" }),
    insertPerformance("performance-withdrawn", "song-withdrawn", {
      status: "withdrawn",
    }),
    insertPerformance("performance-broadcast", "song-broadcast", {
      releaseType: "broadcast",
    }),
    insertPerformance("performance-archived", "song-archived"),
    insertPerformance("performance-merged", "song-merged"),
    insertParticipant("performance-visible", "entity-current-a", 0),
    insertParticipant("performance-visible", "entity-former-b", 1),
    insertParticipant("performance-visible", "entity-group", 2),
    db
      .prepare(
        `INSERT INTO music_cover_proposals (
           id, submitted_by_user_id, idempotency_key, submitted_url,
           youtube_video_id, segment_start_seconds, submitted_title,
           status, version, reviewed_by_user_id, reviewed_at,
           review_result_code, review_note, created_at, updated_at
         ) VALUES (
           'proposal-rejected', 'member-proposer', 'rejected-idempotency',
           'https://www.youtube.com/watch?v=EEEEEEEEEEE', 'EEEEEEEEEEE', 0,
           'Rejected Proposal Secret', 'rejected', 0, 'admin-reviewer', ?,
           'not_eligible', 'Proposal-only review note', ?, ?
         )`,
      )
      .bind(NOW, NOW, NOW),
    db.prepare(
      `INSERT INTO music_cover_proposal_participants (
         proposal_id, credit_order, resolved_entity_id,
         submitted_name_snapshot, participant_role
       ) VALUES ('proposal-rejected', 0, NULL, 'Proposal Only Singer', 'vocal')`,
    ),
    db.prepare(
      `INSERT INTO music_cover_proposal_original_artists (
         proposal_id, credit_order, resolved_entity_id,
         submitted_name_snapshot
       ) VALUES ('proposal-rejected', 0, NULL, 'Proposal Only Artist')`,
    ),
    db.prepare(
      `INSERT INTO music_media_sources (
         id, provider, external_id, channel_id, title, thumbnail_url,
         duration_seconds, provider_published_at, availability_status,
         version, created_at, updated_at
       ) VALUES
         ('source-primary', 'youtube', 'AAAAAAAAAAA', 'channel-public',
          'Primary unavailable', 'https://i.example/primary.jpg', 180, ?,
          'unavailable', 0, ?, ?),
         ('source-fallback', 'youtube', 'BBBBBBBBBBB', 'channel-public',
          'Playable fallback', 'https://i.example/fallback.jpg', 181, ?,
          'playable', 0, ?, ?),
         ('source-pending', 'youtube', 'CCCCCCCCCCC', 'channel-pending',
          'Pending channel', NULL, NULL, ?, 'playable', 0, ?, ?),
         ('source-kirinuki', 'youtube', 'DDDDDDDDDDD', 'channel-kirinuki',
          'Kirinuki source', NULL, NULL, ?, 'playable', 0, ?, ?)`,
    ).bind(NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW),
    db.prepare(
      `INSERT INTO music_performance_sources (
         performance_id, source_id, start_seconds, end_seconds,
         source_role, priority, is_primary
       ) VALUES
         ('performance-visible', 'source-primary', 0, NULL, 'official', 0, 1),
         ('performance-visible', 'source-fallback', 0, NULL, 'alternate', 1, 0),
         ('performance-visible', 'source-pending', 0, NULL, 'official', 2, 0),
         ('performance-visible', 'source-kirinuki', 0, NULL, 'official', 3, 0)`,
    ),
  ]);
  await rebuildReadModel();
};

describe("D1PublicCatalogReader", () => {
  beforeEach(async () => {
    expect(
      testEnv.OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS.slice(
        -PUBLIC_MIGRATION_NAMES.length,
      ).map(
        ({ name }) => name,
      ),
    ).toEqual(PUBLIC_MIGRATION_NAMES);
    await applyD1Migrations(
      db,
      testEnv.OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS,
      "otw_play_public_catalog_test_migrations",
    );
    await cleanup();
  });

  it("reads the singleton metadata before public catalog work", async () => {
    const reader = new D1PublicCatalogReader(db);
    await expect(reader.readMeta()).resolves.toEqual({
      revision: 7,
      readModelRevision: 7,
      publicReadEnabled: true,
      navigationVisible: false,
      updatedAt: NOW,
    });
    expect(reader.getLastReadDiagnostics()).toEqual({
      statements: 1,
      bindParameters: 0,
      rowsRead: expect.any(Number),
      statementRowsRead: [expect.any(Number)],
      usesOffset: false,
    });
  });

  it("applies the additive read-model tables, indexes, foreign keys, and fail-closed checks", async () => {
    const tableRows = await db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN (
             'music_public_performance_sort_keys',
             'music_public_read_model_meta',
             'music_search_grams',
             'music_search_gram_stats'
           )
         ORDER BY name`,
      )
      .all<{ name: string }>();
    expect(tableRows.results.map(({ name }) => name)).toEqual([
      "music_public_performance_sort_keys",
      "music_public_read_model_meta",
      "music_search_gram_stats",
      "music_search_grams",
    ]);

    const [sortIndexes, gramIndexes, performanceIndexes, sortForeignKeys] =
      await Promise.all([
        db
          .prepare("PRAGMA index_list(music_public_performance_sort_keys)")
          .all<{ name: string }>(),
        db
          .prepare("PRAGMA index_list(music_search_grams)")
          .all<{ name: string }>(),
        db
          .prepare("PRAGMA index_list(music_performances)")
          .all<{ name: string }>(),
        db
          .prepare(
            "PRAGMA foreign_key_list(music_public_performance_sort_keys)",
          )
          .all<{ from: string; table: string; to: string; on_delete: string }>(),
      ]);
    expect(sortIndexes.results.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "idx_music_public_performance_sort_keys_participant_song_performance",
        "idx_music_public_performance_sort_keys_missing_song_performance",
        "idx_music_public_performance_sort_keys_entity_performance",
      ]),
    );
    expect(gramIndexes.results.map(({ name }) => name)).toContain(
      "idx_music_search_grams_size_normalized_song",
    );
    expect(performanceIndexes.results.map(({ name }) => name)).toContain(
      "uidx_music_performances_id_song_id",
    );
    expect(sortForeignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "performance_id",
          table: "music_performances",
          to: "id",
          on_delete: "CASCADE",
        }),
        expect.objectContaining({
          from: "song_id",
          table: "music_performances",
          to: "song_id",
          on_delete: "CASCADE",
        }),
        expect.objectContaining({
          from: "representative_participant_entity_id",
          table: "music_entities",
          to: "id",
          on_delete: "RESTRICT",
        }),
      ]),
    );

    await expect(
      db
        .prepare(
          `INSERT INTO music_search_gram_stats (
             gram_size, normalized_gram, song_count
           ) VALUES (4, 'four', 1)`,
        )
        .run(),
    ).rejects.toThrow(/music_search_gram_stats_size_check/);

    await db.batch([
      ...insertSong("song-read-model-check", "Read Model Check"),
      insertPerformance(
        "performance-read-model-check",
        "song-read-model-check",
      ),
    ]);
    await expect(
      db
        .prepare(
          `INSERT INTO music_public_performance_sort_keys (
             performance_id, song_id,
             representative_participant_entity_id, normalized_participant
           ) VALUES (
             'performance-read-model-check', 'song-read-model-check',
             NULL, 'invalid unpaired value'
           )`,
        )
        .run(),
    ).rejects.toThrow(
      /music_public_performance_sort_keys_participant_pair_check/,
    );
  });

  it("projects only canonical published official catalog data and keeps unavailable metadata", async () => {
    await seedVisibilityFixture();
    await db.prepare(
      "INSERT INTO music_song_tags (song_id, tag_key, display_name) VALUES ('song-visible', 'j pop', 'J-POP')",
    ).run();
    const reader = new D1PublicCatalogReader(db);
    const page = await reader.readCatalog(toReaderQuery("limit=24"));

    expect(page.items.map(({ id }) => id)).toEqual([
      "song-visible",
      "song-no-source",
    ]);
    expect(page.items[0]?.tags).toEqual(["J-POP"]);
    await expect(
      reader.readCatalog(toReaderQuery("q=rejected%20proposal%20secret")),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      reader.readCatalog(toReaderQuery("q=draft%20song")),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      reader.readCatalog(toReaderQuery("q=withdrawn%20song")),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      reader.readCatalog(toReaderQuery("sort=participant")),
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({ id: "song-visible" }),
        expect.objectContaining({ id: "song-no-source" }),
      ],
    });
    const publicFacets = await reader.readFacets();
    expect(JSON.stringify({ page, publicFacets })).not.toContain(
      "Proposal Only",
    );
    expect(JSON.stringify({ page, publicFacets })).not.toContain(
      "Rejected Proposal Secret",
    );
    expect(JSON.stringify({ page, publicFacets })).not.toContain(
      "not_eligible",
    );
    expect(JSON.stringify({ page, publicFacets })).not.toContain(
      "Proposal-only review note",
    );
    const visible = page.items[0];
    expect(visible.representativePerformance).toMatchObject({
      id: "performance-visible",
      primarySourceId: "source-primary",
      playbackSourceId: "source-fallback",
      playable: true,
      fallbackReason: "primary_unplayable",
    });
    expect(
      visible.representativePerformance.sources.map(({ id }) => id),
    ).toEqual(["source-primary", "source-fallback"]);
    expect(visible.representativePerformance.sources[0]).toMatchObject({
      providerPublishedAt: NOW,
      availabilityStatus: "unavailable",
      channel: { channelRole: "member_music" },
    });
    expect(visible.representativePerformance.participants).toEqual([
      expect.objectContaining({
        id: "entity-current-a",
        kind: "current_member",
        member: expect.objectContaining({
          uid: 1,
          code: "current-a",
          unitName: "Unit Alpha",
        }),
      }),
      expect.objectContaining({
        id: "entity-former-b",
        kind: "external",
        member: null,
      }),
      expect.objectContaining({
        id: "entity-group",
        kind: "group",
        member: null,
      }),
    ]);
    expect(page.items[1].representativePerformance).toMatchObject({
      playable: false,
      primarySourceId: null,
      playbackSourceId: null,
      sources: [],
    });
  });

  it("accumulates metadata and content D1 costs in one request observation", async () => {
    const reader = new D1PublicCatalogReader(db);
    reader.beginReadObservation();
    await reader.readMeta();
    await reader.readFacets();

    const lastOperation = reader.getLastReadDiagnostics();
    const observation = reader.getReadObservation();
    expect(lastOperation.statements).toBe(4);
    expect(observation).toMatchObject({
      statements: 5,
      bindParameters: 0,
      usesOffset: false,
    });
    expect(observation?.statementRowsRead).toHaveLength(5);
    expect(observation?.rowsRead).toBeGreaterThanOrEqual(
      lastOperation.rowsRead,
    );
  });

  it("projects bounded canonical SEO slugs and playable representative metadata", async () => {
    await seedVisibilityFixture();
    const reader = new D1PublicCatalogReader(db);

    await expect(reader.listPublishedSeoSongSlugs()).resolves.toEqual([
      "song-no-source-slug",
      "song-visible-slug",
    ]);
    expect(reader.getLastReadDiagnostics()).toMatchObject({
      statements: 1,
      bindParameters: 0,
      usesOffset: false,
    });

    await expect(
      reader.readPublishedSongSeoBySlug("song-visible-slug"),
    ).resolves.toEqual({
      slug: "song-visible-slug",
      title: "Visible Song",
      originalArtistNames: ["Original Artist"],
      mainVocalNames: ["Current A", "Former B", "OTW Unit"],
      thumbnailUrl: "https://i.example/fallback.jpg",
    });
    await expect(
      reader.readPublishedSongSeoBySlug("song-no-source-slug"),
    ).resolves.toMatchObject({
      slug: "song-no-source-slug",
      thumbnailUrl: null,
    });
    for (const slug of [
      "song-draft-slug",
      "song-withdrawn-slug",
      "song-archived-slug",
      "song-merged-slug",
      "song-broadcast-slug",
    ]) {
      await expect(reader.readPublishedSongSeoBySlug(slug)).resolves.toBeNull();
    }

    await db
      .prepare(
        "UPDATE music_media_sources SET availability_status = 'unavailable' WHERE id = 'source-fallback'",
      )
      .run();
    await expect(
      reader.readPublishedSongSeoBySlug("song-visible-slug"),
    ).resolves.toMatchObject({
      slug: "song-visible-slug",
      thumbnailUrl: null,
    });
  });

  it("chooses the lowest performance ID when public release timestamps tie", async () => {
    await db.batch([
      ...insertSong("song-tie", "Tie Song"),
      insertPerformance("performance-z", "song-tie", { releasedAt: NOW }),
      insertPerformance("performance-a", "song-tie", { releasedAt: NOW }),
    ]);
    await rebuildReadModel();
    const reader = new D1PublicCatalogReader(db);
    const page = await reader.readCatalog(toReaderQuery("limit=24"));

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: "song-tie",
      publishedPerformanceCount: 2,
      representativePerformance: { id: "performance-a" },
    });
  });

  it("applies ANY, ALL, group, relation, participation, artist, and inclusive day filters to one performance", async () => {
    await seedIdentityAndChannels();
    await db.batch([
      ...insertSong("song-split", "Split Credits", {
        originalArtist: "entity-artist",
      }),
      ...insertSong("song-together", "Together Credits", {
        originalArtist: "entity-artist",
      }),
      insertPerformance("performance-split-a", "song-split", {
        relation: "cover",
        participation: "solo",
        releasedAt: Date.UTC(2026, 0, 1),
      }),
      insertPerformance("performance-split-c", "song-split", {
        relation: "original",
        participation: "solo",
        releasedAt: Date.UTC(2026, 0, 2),
      }),
      insertPerformance("performance-together", "song-together", {
        relation: "cover",
        participation: "duet",
        releasedAt: Date.UTC(2026, 0, 2),
      }),
      insertParticipant("performance-split-a", "entity-current-a", 0),
      insertParticipant("performance-split-c", "entity-current-c", 0),
      insertParticipant("performance-together", "entity-current-a", 0, "featured_vocal"),
      insertParticipant("performance-together", "entity-current-c", 1, "chorus"),
      insertParticipant("performance-together", "entity-group", 2),
    ]);
    await rebuildReadModel();
    const reader = new D1PublicCatalogReader(db);

    const all = await reader.readCatalog(
      toReaderQuery("member=1&member=3&memberMode=all"),
    );
    expect(all.items.map(({ id }) => id)).toEqual(["song-together"]);

    const crossed = await reader.readCatalog(
      toReaderQuery("member=1&relation=original"),
    );
    expect(crossed.items).toEqual([]);

    const exactParticipant = await reader.readCatalog(
      toReaderQuery("member=1&participant=current-c"),
    );
    expect(exactParticipant.items.map(({ id }) => id)).toEqual([
      "song-together",
    ]);
    const standaloneRole = await reader.readCatalog(
      toReaderQuery("participantRole=chorus"),
    );
    expect(standaloneRole.items.map(({ id }) => id)).toEqual(["song-together"]);

    const sameCreditRole = await reader.readCatalog(
      toReaderQuery("member=3&participantRole=chorus"),
    );
    expect(sameCreditRole.items.map(({ id }) => id)).toEqual(["song-together"]);

    const roleOnDifferentCredit = await reader.readCatalog(
      toReaderQuery("member=1&participantRole=chorus"),
    );
    expect(roleOnDifferentCredit.items).toEqual([]);

    const groupKey = encodeURIComponent(
      encodePublicCatalogGroupKey({ entityId: "entity-group", unitName: null }),
    );
    const group = await reader.readCatalog(
      toReaderQuery(
        `group=${groupKey}&participation=duet&originalArtist=original-artist&publishedFrom=2026-01-02&publishedTo=2026-01-02`,
      ),
    );
    expect(group.items.map(({ id }) => id)).toEqual(["song-together"]);

    const unitKey = encodeURIComponent(
      encodePublicCatalogGroupKey({ entityId: null, unitName: "Unit Alpha" }),
    );
    const unit = await reader.readCatalog(toReaderQuery(`group=${unitKey}`));
    expect(unit.items.map(({ id }) => id).sort()).toEqual([
      "song-split",
      "song-together",
    ]);

    const participantSortedCover = await reader.readCatalog(
      toReaderQuery("relation=cover&sort=participant"),
    );
    expect(
      participantSortedCover.items.map((song) => ({
        songId: song.id,
        performanceId: song.representativePerformance.id,
      })),
    ).toEqual([
      {
        songId: "song-split",
        performanceId: "performance-split-a",
      },
      {
        songId: "song-together",
        performanceId: "performance-together",
      },
    ]);
  });

  it("returns count-free member, entity-group, unit, and original-artist facets", async () => {
    await seedVisibilityFixture();
    const reader = new D1PublicCatalogReader(db);
    const facets = await reader.readFacets();

    expect(facets.members).toEqual([
      {
        memberUid: 1,
        entityId: "entity-current-a",
        code: "current-a",
        name: "Current A",
        oshiMark: "A",
        unitName: "Unit Alpha",
      },
    ]);
    expect(facets.groups).toEqual([
      expect.objectContaining({ kind: "entity", displayName: "OTW Unit" }),
      expect.objectContaining({ kind: "unit", displayName: "Unit Alpha" }),
    ]);
    expect(facets.originalArtists).toEqual([
      {
        id: "entity-artist",
        slug: "original-artist",
        displayName: "Original Artist",
        entityKind: "person",
      },
    ]);
    expect(Object.keys(facets.members[0])).not.toContain("count");
  });

  it("orders indexed search ranks before the bounded contains phase", async () => {
    await seedIdentityAndChannels();
    const searchSongs = [
      ["song-title-exact", "hello", NOW + 6 * DAY],
      ["song-alias-exact", "alias title", NOW + 5 * DAY],
      ["song-title-prefix", "hello world", NOW + 4 * DAY],
      ["song-artist-exact", "artist title", NOW + 3 * DAY],
      ["song-participant-exact", "participant title", NOW + 2 * DAY],
      ["song-contains", "middle hello value", NOW + DAY],
    ] as const;
    const statements = searchSongs.flatMap(([songId, title, releasedAt]) => [
      ...insertSong(songId, title),
      insertPerformance(`performance-${songId}`, songId, { releasedAt }),
    ]);
    statements.push(
      db.prepare(
        `INSERT INTO music_search_terms (
           song_id, term_kind, display_value, normalized_term
         ) VALUES
           ('song-alias-exact', 'title_alias', 'hello', 'hello'),
           ('song-artist-exact', 'original_artist', 'hello', 'hello'),
           ('song-participant-exact', 'participant', 'hello', 'hello'),
           ('song-contains', 'title_alias', 'middle hello value', 'middle hello value')`,
      ),
    );
    await db.batch(statements);
    await rebuildReadModel();

    const reader = new D1PublicCatalogReader(db);
    const page = await reader.readCatalog(toReaderQuery("q=hello&limit=24"));
    expect(page.items.map(({ id }) => id)).toEqual([
      "song-title-exact",
      "song-alias-exact",
      "song-title-prefix",
      "song-artist-exact",
      "song-participant-exact",
      "song-contains",
    ]);
  });

  it("keeps two-codepoint Unicode, repeated, title-only, and term-only contains complete across pages", async () => {
    const statements: D1PreparedStatement[] = [
      ...insertSong("song-contains-ko", "앞나다라뒤"),
      insertPerformance("performance-contains-ko", "song-contains-ko"),
      ...insertSong("song-contains-ja", "前東京タワー後"),
      insertPerformance("performance-contains-ja", "song-contains-ja"),
      ...insertSong("song-contains-repeat", "zaaaaz"),
      insertPerformance(
        "performance-contains-repeat",
        "song-contains-repeat",
      ),
      ...insertSong("song-contains-term", "Unrelated title"),
      insertPerformance("performance-contains-term", "song-contains-term"),
    ];
    for (let index = 0; index < 5; index += 1) {
      statements.push(
        ...insertSong(
          `song-contains-page-${index}`,
          `prefix 나다 page ${index}`,
        ),
        insertPerformance(
          `performance-contains-page-${index}`,
          `song-contains-page-${index}`,
        ),
      );
    }
    statements.push(
      db.prepare(
        `INSERT INTO music_search_terms (
           song_id, term_kind, display_value, normalized_term
         ) VALUES (
           'song-contains-term', 'title_alias',
           'prefix long needle suffix', 'prefix long needle suffix'
         )`,
      ),
    );
    await db.batch(statements);
    await rebuildReadModel();

    const reader = new D1PublicCatalogReader(db);
    for (const [query, expectedSongId] of [
      ["京タ", "song-contains-ja"],
      ["aaa", "song-contains-repeat"],
      ["long needle", "song-contains-term"],
    ] as const) {
      const page = await reader.readCatalog(
        toReaderQuery(`q=${encodeURIComponent(query)}`),
      );
      expect(page.items.map(({ id }) => id), query).toEqual([
        expectedSongId,
      ]);
    }

    const pagedIds: string[] = [];
    const base = toReaderQuery(`q=${encodeURIComponent("나다")}&limit=2`);
    let cursor: PublicCatalogReaderQuery["cursor"] = null;
    do {
      const page = await reader.readCatalog({ ...base, cursor });
      pagedIds.push(...page.items.map(({ id }) => id));
      cursor = page.nextPosition;
    } while (cursor);
    expect(pagedIds).toHaveLength(6);
    expect(new Set(pagedIds).size).toBe(6);
    expect(pagedIds).toContain("song-contains-ko");

    await expect(
      reader.readCatalog(
        toReaderQuery(`q=${encodeURIComponent("없는검색어")}`),
      ),
    ).resolves.toMatchObject({ items: [] });
  });

  it("uses stable keyset cursors without duplicate or missing songs for all three sorts", async () => {
    await seedIdentityAndChannels();
    const statements: D1PreparedStatement[] = [];
    for (let index = 0; index < 7; index += 1) {
      const songId = `song-page-${index}`;
      statements.push(
        ...insertSong(songId, `Page ${String.fromCharCode(71 - index)}`),
        insertPerformance(`performance-page-${index}`, songId, {
          releasedAt: index % 3 === 0 ? null : NOW + index * DAY,
        }),
      );
      if (index < 4) {
        statements.push(
          insertParticipant(
            `performance-page-${index}`,
            index % 2 === 0 ? "entity-current-a" : "entity-current-c",
            0,
          ),
        );
      }
    }
    await db.batch(statements);
    await rebuildReadModel();

    for (const sort of ["recent", "title", "participant"] as const) {
      const reader = new D1PublicCatalogReader(db);
      const base = toReaderQuery(`sort=${sort}&limit=2`);
      const ids: string[] = [];
      let cursor: PublicCatalogReaderQuery["cursor"] = null;
      do {
        const page = await reader.readCatalog({ ...base, cursor });
        ids.push(...page.items.map(({ id }) => id));
        cursor = page.nextPosition;
      } while (cursor);
      expect(new Set(ids).size, sort).toBe(7);
      expect(ids, sort).toHaveLength(7);
    }
  });

  it("reads public song and performance details without exposing hidden rows", async () => {
    await seedVisibilityFixture();
    const reader = new D1PublicCatalogReader(db);

    const song = await reader.readSongBySlug("song-visible-slug");
    expect(song).toMatchObject({
      id: "song-visible",
      performances: [
        {
          id: "performance-visible",
          playbackSourceId: "source-fallback",
        },
      ],
    });
    await expect(
      reader.readPerformanceById("performance-visible"),
    ).resolves.toMatchObject({
      song: { id: "song-visible" },
      performance: { id: "performance-visible" },
    });
    await expect(reader.readSongBySlug("song-draft-slug")).resolves.toBeNull();
    await expect(
      reader.readPerformanceById("performance-broadcast"),
    ).resolves.toBeNull();
  });

  it("uses generated published and participant read-model indexes in representative plans", async () => {
    const recentCandidate = buildD1PublicCatalogCandidateQuery(
      toReaderQuery("sort=recent&limit=24"),
      null,
      25,
    );
    const participationCandidate = buildD1PublicCatalogCandidateQuery(
      toReaderQuery("sort=recent&participation=duet&limit=24"),
      null,
      25,
    );
    const namedParticipantCandidate =
      buildD1ParticipantBrowseCandidateQuery(
        toReaderQuery("sort=participant&relation=cover&limit=24"),
        "named",
        25,
      );
    const missingParticipantCandidate =
      buildD1ParticipantBrowseCandidateQuery(
        toReaderQuery("sort=participant&relation=cover&limit=24"),
        "missing",
        25,
      );
    const [
      recentPlan,
      participationPlan,
      namedParticipantPlan,
      missingParticipantPlan,
    ] = await Promise.all([
      db
        .prepare(`EXPLAIN QUERY PLAN ${recentCandidate.sql}`)
        .bind(...recentCandidate.binds)
        .all<{ detail: string }>(),
      db
        .prepare(`EXPLAIN QUERY PLAN ${participationCandidate.sql}`)
        .bind(...participationCandidate.binds)
        .all<{ detail: string }>(),
      db
        .prepare(`EXPLAIN QUERY PLAN ${namedParticipantCandidate.sql}`)
        .bind(...namedParticipantCandidate.binds)
        .all<{ detail: string }>(),
      db
        .prepare(`EXPLAIN QUERY PLAN ${missingParticipantCandidate.sql}`)
        .bind(...missingParticipantCandidate.binds)
        .all<{ detail: string }>(),
    ]);
    expect(recentPlan.results.map(({ detail }) => detail).join("\n")).toContain(
      "idx_music_performances_published_released_song_id",
    );
    expect(
      participationPlan.results.map(({ detail }) => detail).join("\n"),
    ).toContain(
      "idx_music_performances_published_participation_released_song_id",
    );
    expect(
      namedParticipantPlan.results.map(({ detail }) => detail).join("\n"),
    ).toContain(
      "idx_music_public_performance_sort_keys_participant_song_performance",
    );
    expect(
      missingParticipantPlan.results.map(({ detail }) => detail).join("\n"),
    ).toContain(
      "idx_music_public_performance_sort_keys_missing_song_performance",
    );
  });

  it(
    "stays within the bounded query, bind, rows-read, and compressed response budgets",
    async () => {
      await db.batch([
        db.prepare(
          `INSERT INTO music_entities (
             id, member_uid, entity_kind, display_name, normalized_name, slug,
             version, created_at, updated_at
           ) VALUES (
             'scale-participant', NULL, 'person', 'Scale Participant',
             'scale participant', 'scale-participant', 0, ?, ?
           )`,
        ).bind(NOW, NOW),
        db.prepare(
          `WITH RECURSIVE sequence(value) AS (
             SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 3000
           )
           INSERT INTO music_songs (
             id, slug, title, normalized_title, dedupe_key, is_otw_original,
             original_release_precision, version, created_at, updated_at
           )
           SELECT 'scale-song-' || value, 'scale-song-' || value,
                  'Scale Song ' || value, 'scale song ' || value,
                  'scale-song-dedupe-' || value, 0, 'unknown', 0, ?, ?
           FROM sequence`,
        ).bind(NOW, NOW),
        db.prepare(
          `WITH RECURSIVE sequence(value) AS (
             SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 8000
           )
           INSERT INTO music_performances (
             id, song_id, dedupe_key, relation_type, release_type,
             participation_type, publication_status, quality_status,
             released_at, version, created_at, updated_at
           )
           SELECT 'scale-performance-' || value,
                  'scale-song-' || (((value - 1) % 3000) + 1),
                  'scale-performance-dedupe-' || value,
                  'cover', 'official_video', 'solo', 'published', 'ok',
                  ? + value, 0, ?, ?
           FROM sequence`,
        ).bind(NOW, NOW, NOW),
        db.prepare(
          `WITH RECURSIVE sequence(value) AS (
             SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 8000
           )
           INSERT INTO music_performance_participants (
             performance_id, entity_id, participant_role, credit_order,
             credit_name_snapshot
           )
           SELECT 'scale-performance-' || value, 'scale-participant',
                  'vocal', 0, 'Scale Participant'
           FROM sequence`,
        ),
        db.prepare(
          `WITH RECURSIVE sequence(value) AS (
             SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 10000
           )
           INSERT INTO music_search_terms (
             song_id, term_kind, display_value, normalized_term
           )
           SELECT 'scale-song-' || (((value - 1) % 3000) + 1),
                  'participant',
                  CASE WHEN value <= 100 THEN 'scale exact'
                       ELSE 'scale term ' || value END,
                  CASE WHEN value <= 100 THEN 'scale exact'
                       ELSE 'scale term ' || value END
           FROM sequence`,
        ),
      ]);
      await rebuildReadModel();

      const scaleQuery = toReaderQuery("q=scale%20exact&limit=60");
      const candidateQuery = buildD1PublicCatalogCandidateQuery(
        scaleQuery,
        "indexed",
        61,
      );
      const plan = await db
        .prepare(`EXPLAIN QUERY PLAN ${candidateQuery.sql}`)
        .bind(...candidateQuery.binds)
        .all<{ detail: string }>();
      const planDetails = plan.results.map(({ detail }) => detail);
      expect(planDetails).toContain("MATERIALIZE search_rank");
      expect(planDetails).toContain("SCAN search_rank");
      expect(
        planDetails.some(
          (detail) =>
            detail.includes(
              "SEARCH term USING COVERING INDEX idx_music_search_terms_normalized_kind_song",
            ) &&
            detail.includes("normalized_term>?") &&
            detail.includes("normalized_term<?"),
        ),
      ).toBe(true);
      expect(planDetails).toContain(
        "SEARCH performance USING INDEX idx_music_performances_published_song_released_id (song_id=?)",
      );
      let gzipItems: unknown[] = [];
      const scaleCases = [
        ...(["recent", "title", "participant"] as const).map((sort) => ({
          name: `indexed-${sort}`,
          query: `q=scale%20exact&limit=60&sort=${sort}`,
          expectedItems: 60,
        })),
        ...(["recent", "title", "participant"] as const).map((sort) => ({
          name: `browse-${sort}`,
          query: `limit=60&sort=${sort}`,
          expectedItems: 60,
        })),
        {
          name: "contains-fallback",
          query: "q=term%209999&limit=60",
          expectedItems: 1,
        },
        ...(["recent", "title", "participant"] as const).map((sort) => ({
          name: `contains-two-codepoint-common-${sort}`,
          query: `q=te&limit=60&sort=${sort}`,
          expectedItems: 60,
        })),
      ];
      for (const scaleCase of scaleCases) {
        const reader = new D1PublicCatalogReader(db);
        const page = await reader.readCatalog(toReaderQuery(scaleCase.query));
        const diagnostics = reader.getLastReadDiagnostics();
        expect(page.items, scaleCase.name).toHaveLength(
          scaleCase.expectedItems,
        );
        expect(
          diagnostics.statements + 1,
          scaleCase.name,
        ).toBeLessThanOrEqual(6);
        expect(
          diagnostics.bindParameters,
          scaleCase.name,
        ).toBeLessThanOrEqual(100);
        expect.soft(
          diagnostics.rowsRead,
          `${scaleCase.name}: ${JSON.stringify(diagnostics)}`,
        ).toBeLessThanOrEqual(5_000);
        expect(diagnostics.usesOffset, scaleCase.name).toBe(false);
        if (scaleCase.name === "browse-recent") gzipItems = page.items;
      }

      for (const sort of ["recent", "title", "participant"] as const) {
        const reader = new D1PublicCatalogReader(db);
        const base = toReaderQuery(`q=te&limit=25&sort=${sort}`);
        const ids: string[] = [];
        let cursor: PublicCatalogReaderQuery["cursor"] = null;
        for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
          const page = await reader.readCatalog({ ...base, cursor });
          ids.push(...page.items.map(({ id }) => id));
          cursor = page.nextPosition;
          const diagnostics = reader.getLastReadDiagnostics();
          expect(
            diagnostics.rowsRead,
            `contains-pagination-${sort}-${pageIndex}: ${JSON.stringify(diagnostics)}`,
          ).toBeLessThanOrEqual(5_000);
          expect(diagnostics.usesOffset, sort).toBe(false);
        }
        expect(ids, sort).toHaveLength(75);
        expect(new Set(ids).size, sort).toBe(75);
        expect(cursor, sort).not.toBeNull();
      }

      const compressed = new Response(
        new Blob([JSON.stringify({ data: { items: gzipItems } })])
          .stream()
          .pipeThrough(new CompressionStream("gzip")),
      );
      expect((await compressed.arrayBuffer()).byteLength).toBeLessThan(100_000);
    },
    30_000,
  );
});
