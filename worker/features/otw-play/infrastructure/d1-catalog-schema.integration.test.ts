import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const MUSIC_TABLES = [
  "music_channel_entities",
  "music_channels",
  "music_entities",
  "music_entity_aliases",
  "music_media_source_relations",
  "music_media_sources",
  "music_performance_participants",
  "music_performance_sources",
  "music_performances",
  "music_song_aliases",
  "music_song_original_artists",
  "music_songs",
] as const;

type MusicTable = (typeof MUSIC_TABLES)[number];

type ExpectedForeignKey = {
  from: string;
  table: string;
  to: string;
  on_delete: "CASCADE" | "RESTRICT" | "SET NULL";
};

type ExpectedIndex = {
  readonly columns: readonly string[];
  readonly unique: 0 | 1;
  readonly partial: 0 | 1;
};

const EXPECTED_COLUMNS = {
  music_channel_entities: ["channel_id", "entity_id"],
  music_channels: [
    "id",
    "provider",
    "external_channel_id",
    "display_name",
    "channel_role",
    "verification_status",
    "active",
    "version",
    "created_at",
    "updated_at",
  ],
  music_entities: [
    "id",
    "member_uid",
    "entity_kind",
    "display_name",
    "normalized_name",
    "slug",
    "archived_at",
    "version",
    "created_at",
    "updated_at",
  ],
  music_entity_aliases: [
    "entity_id",
    "alias",
    "normalized_alias",
    "locale",
    "alias_kind",
  ],
  music_media_source_relations: [
    "source_id",
    "related_source_id",
    "relation_type",
  ],
  music_media_sources: [
    "id",
    "provider",
    "external_id",
    "channel_id",
    "title",
    "thumbnail_url",
    "duration_seconds",
    "provider_published_at",
    "availability_status",
    "last_checked_at",
    "next_check_at",
    "version",
    "created_at",
    "updated_at",
  ],
  music_performance_participants: [
    "performance_id",
    "entity_id",
    "participant_role",
    "credit_order",
    "credit_name_snapshot",
  ],
  music_performance_sources: [
    "performance_id",
    "source_id",
    "start_seconds",
    "end_seconds",
    "source_role",
    "priority",
    "is_primary",
  ],
  music_performances: [
    "id",
    "song_id",
    "dedupe_key",
    "relation_type",
    "release_type",
    "participation_type",
    "publication_status",
    "quality_status",
    "released_at",
    "internal_note",
    "version",
    "created_at",
    "updated_at",
  ],
  music_song_aliases: [
    "song_id",
    "alias",
    "normalized_alias",
    "locale",
    "alias_kind",
  ],
  music_song_original_artists: [
    "song_id",
    "entity_id",
    "credit_order",
    "is_primary",
  ],
  music_songs: [
    "id",
    "slug",
    "title",
    "normalized_title",
    "dedupe_key",
    "is_otw_original",
    "original_release_date",
    "original_release_precision",
    "merged_into_song_id",
    "archived_at",
    "version",
    "created_at",
    "updated_at",
  ],
} as const satisfies Record<MusicTable, readonly string[]>;

const EXPECTED_FOREIGN_KEYS = {
  music_channel_entities: [
    {
      from: "channel_id",
      table: "music_channels",
      to: "id",
      on_delete: "CASCADE",
    },
    {
      from: "entity_id",
      table: "music_entities",
      to: "id",
      on_delete: "RESTRICT",
    },
  ],
  music_channels: [],
  music_entities: [
    {
      from: "member_uid",
      table: "members",
      to: "uid",
      on_delete: "SET NULL",
    },
  ],
  music_entity_aliases: [
    {
      from: "entity_id",
      table: "music_entities",
      to: "id",
      on_delete: "CASCADE",
    },
  ],
  music_media_source_relations: [
    {
      from: "related_source_id",
      table: "music_media_sources",
      to: "id",
      on_delete: "RESTRICT",
    },
    {
      from: "source_id",
      table: "music_media_sources",
      to: "id",
      on_delete: "RESTRICT",
    },
  ],
  music_media_sources: [
    {
      from: "channel_id",
      table: "music_channels",
      to: "id",
      on_delete: "RESTRICT",
    },
  ],
  music_performance_participants: [
    {
      from: "entity_id",
      table: "music_entities",
      to: "id",
      on_delete: "RESTRICT",
    },
    {
      from: "performance_id",
      table: "music_performances",
      to: "id",
      on_delete: "CASCADE",
    },
  ],
  music_performance_sources: [
    {
      from: "performance_id",
      table: "music_performances",
      to: "id",
      on_delete: "CASCADE",
    },
    {
      from: "source_id",
      table: "music_media_sources",
      to: "id",
      on_delete: "RESTRICT",
    },
  ],
  music_performances: [
    {
      from: "song_id",
      table: "music_songs",
      to: "id",
      on_delete: "RESTRICT",
    },
  ],
  music_song_aliases: [
    {
      from: "song_id",
      table: "music_songs",
      to: "id",
      on_delete: "CASCADE",
    },
  ],
  music_song_original_artists: [
    {
      from: "entity_id",
      table: "music_entities",
      to: "id",
      on_delete: "RESTRICT",
    },
    {
      from: "song_id",
      table: "music_songs",
      to: "id",
      on_delete: "CASCADE",
    },
  ],
  music_songs: [
    {
      from: "merged_into_song_id",
      table: "music_songs",
      to: "id",
      on_delete: "RESTRICT",
    },
  ],
} as const satisfies Record<MusicTable, readonly ExpectedForeignKey[]>;

const EXPECTED_INDEXES = {
  music_channel_entities: {
    idx_music_channel_entities_entity_channel: {
      columns: ["entity_id", "channel_id"],
      unique: 0,
      partial: 0,
    },
  },
  music_channels: {
    idx_music_channels_verification_active_role: {
      columns: ["verification_status", "active", "channel_role"],
      unique: 0,
      partial: 0,
    },
    uidx_music_channels_provider_external: {
      columns: ["provider", "external_channel_id"],
      unique: 1,
      partial: 0,
    },
  },
  music_entities: {
    idx_music_entities_normalized_name_id: {
      columns: ["normalized_name", "id"],
      unique: 0,
      partial: 0,
    },
    uidx_music_entities_member_uid: {
      columns: ["member_uid"],
      unique: 1,
      partial: 1,
    },
    uidx_music_entities_slug: {
      columns: ["slug"],
      unique: 1,
      partial: 0,
    },
  },
  music_entity_aliases: {
    idx_music_entity_aliases_normalized_alias_entity: {
      columns: ["normalized_alias", "entity_id"],
      unique: 0,
      partial: 0,
    },
  },
  music_media_source_relations: {
    idx_music_media_source_relations_related_type: {
      columns: ["related_source_id", "relation_type"],
      unique: 0,
      partial: 0,
    },
  },
  music_media_sources: {
    idx_music_media_sources_availability_checked: {
      columns: ["availability_status", "last_checked_at"],
      unique: 0,
      partial: 0,
    },
    idx_music_media_sources_channel_published_id: {
      columns: ["channel_id", "provider_published_at", "id"],
      unique: 0,
      partial: 0,
    },
    uidx_music_media_sources_provider_external: {
      columns: ["provider", "external_id"],
      unique: 1,
      partial: 0,
    },
  },
  music_performance_participants: {
    idx_music_performance_participants_entity_performance: {
      columns: ["entity_id", "performance_id"],
      unique: 0,
      partial: 0,
    },
    uidx_music_performance_participants_credit_order: {
      columns: ["performance_id", "credit_order"],
      unique: 1,
      partial: 0,
    },
  },
  music_performance_sources: {
    idx_music_performance_sources_performance_priority_source: {
      columns: ["performance_id", "priority", "source_id"],
      unique: 0,
      partial: 0,
    },
    uidx_music_performance_sources_primary: {
      columns: ["performance_id"],
      unique: 1,
      partial: 1,
    },
    uidx_music_performance_sources_source_start: {
      columns: ["source_id", "start_seconds"],
      unique: 1,
      partial: 0,
    },
  },
  music_performances: {
    idx_music_performances_song_id: {
      columns: ["song_id"],
      unique: 0,
      partial: 0,
    },
    uidx_music_performances_dedupe_key: {
      columns: ["dedupe_key"],
      unique: 1,
      partial: 0,
    },
  },
  music_song_aliases: {
    idx_music_song_aliases_normalized_alias_song: {
      columns: ["normalized_alias", "song_id"],
      unique: 0,
      partial: 0,
    },
  },
  music_song_original_artists: {
    idx_music_song_original_artists_entity_song: {
      columns: ["entity_id", "song_id"],
      unique: 0,
      partial: 0,
    },
    uidx_music_song_original_artists_credit_order: {
      columns: ["song_id", "credit_order"],
      unique: 1,
      partial: 0,
    },
  },
  music_songs: {
    idx_music_songs_merged_into_song_id: {
      columns: ["merged_into_song_id"],
      unique: 0,
      partial: 0,
    },
    idx_music_songs_normalized_title_id: {
      columns: ["normalized_title", "id"],
      unique: 0,
      partial: 0,
    },
    uidx_music_songs_dedupe_key: {
      columns: ["dedupe_key"],
      unique: 1,
      partial: 0,
    },
    uidx_music_songs_slug: {
      columns: ["slug"],
      unique: 1,
      partial: 0,
    },
  },
} as const satisfies Record<MusicTable, Record<string, ExpectedIndex>>;

const CATALOG_MIGRATION_NAME = "0046_tan_nova.sql";
const NOW = 1_786_000_000_000;

type CatalogTestEnv = Env & {
  OTW_PLAY_CATALOG_MIGRATIONS: D1Migration[];
};

const testEnv = env as CatalogTestEnv;
const db = testEnv.otw_db;

const resetCatalogData = async () => {
  await db.batch([
    db.prepare("DELETE FROM music_performance_sources"),
    db.prepare("DELETE FROM music_performance_participants"),
    db.prepare("DELETE FROM music_media_source_relations"),
    db.prepare("DELETE FROM music_channel_entities"),
    db.prepare("DELETE FROM music_song_original_artists"),
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
  ]);
};

const expectConstraintFailure = async (
  operation: Promise<unknown>,
  pattern: RegExp,
) => {
  await expect(operation).rejects.toThrow(pattern);
};

const insertPerformance = async (
  id: string,
  dedupeKey: string,
  publicationStatus = "draft",
) =>
  db
    .prepare(
      `INSERT INTO music_performances (
         id, song_id, dedupe_key, relation_type, release_type,
         participation_type, publication_status, quality_status,
         released_at, version, created_at, updated_at
       ) VALUES (?, 'song-1', ?, 'cover', 'official_video', 'solo', ?, 'ok', ?, 0, ?, ?)`,
    )
    .bind(id, dedupeKey, publicationStatus, NOW, NOW, NOW)
    .run();

const insertSongWithReleaseDate = async (
  id: string,
  originalReleaseDate: string | null,
  originalReleasePrecision: "year" | "month" | "day" | "unknown",
) =>
  db
    .prepare(
      `INSERT INTO music_songs (
         id, slug, title, normalized_title, dedupe_key, is_otw_original,
         original_release_date, original_release_precision, version,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)`,
    )
    .bind(
      id,
      `${id}-slug`,
      `${id} title`,
      `${id} title`,
      `${id}-dedupe`,
      originalReleaseDate,
      originalReleasePrecision,
      NOW,
      NOW,
    )
    .run();

const insertCatalogFixture = async () => {
  await db.batch([
    db.prepare("INSERT INTO members (uid) VALUES (1)"),
    db.prepare(
      `INSERT INTO music_entities (
         id, member_uid, entity_kind, display_name, normalized_name, slug,
         version, created_at, updated_at
       ) VALUES ('entity-member', 1, 'person', 'OTW Member', 'otw member',
                 'otw-member', 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_entities (
         id, member_uid, entity_kind, display_name, normalized_name, slug,
         version, created_at, updated_at
       ) VALUES ('entity-artist', NULL, 'person', 'Original Artist',
                 'original artist', 'original-artist', 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_entity_aliases (
         entity_id, alias, normalized_alias, locale, alias_kind
       ) VALUES ('entity-artist', '원곡 가수', '원곡 가수', 'ko', 'localized')`,
    ),
    db.prepare(
      `INSERT INTO music_songs (
         id, slug, title, normalized_title, dedupe_key, is_otw_original,
         original_release_date, original_release_precision, version,
         created_at, updated_at
       ) VALUES ('song-1', 'catalog-song', 'Catalog Song', 'catalog song',
                 'song-dedupe-1', 0, NULL, 'unknown', 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_song_aliases (
         song_id, alias, normalized_alias, locale, alias_kind
       ) VALUES ('song-1', '카탈로그 송', '카탈로그 송', 'ko', 'localized')`,
    ),
    db.prepare(
      `INSERT INTO music_song_original_artists (
         song_id, entity_id, credit_order, is_primary
       ) VALUES ('song-1', 'entity-artist', 0, 1)`,
    ),
    db.prepare(
      `INSERT INTO music_channels (
         id, provider, external_channel_id, display_name, channel_role,
         verification_status, active, version, created_at, updated_at
       ) VALUES ('channel-1', 'youtube', 'UCaaaaaaaaaaaaaaaaaaaaaa',
                 'OTW Music', 'member_music', 'approved', 1, 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_channel_entities (channel_id, entity_id)
       VALUES ('channel-1', 'entity-member')`,
    ),
    db.prepare(
      `INSERT INTO music_media_sources (
         id, provider, external_id, channel_id, title, duration_seconds,
         provider_published_at, availability_status, last_checked_at,
         next_check_at, version, created_at, updated_at
       ) VALUES ('source-main', 'youtube', 'AbCdEf123_-', 'channel-1',
                 'Official cover', 240, ?, 'playable', ?, NULL, 0, ?, ?)`,
    ).bind(NOW, NOW, NOW, NOW),
    db.prepare(
      `INSERT INTO music_media_sources (
         id, provider, external_id, channel_id, title, duration_seconds,
         provider_published_at, availability_status, last_checked_at,
         next_check_at, version, created_at, updated_at
       ) VALUES ('source-alt', 'youtube', 'ZyXwVu987_-', 'channel-1',
                 'Unavailable alternate', 240, ?, 'unavailable', ?, NULL, 0, ?, ?)`,
    ).bind(NOW, NOW, NOW, NOW),
    db.prepare(
      `INSERT INTO music_media_source_relations (
         source_id, related_source_id, relation_type
       ) VALUES ('source-alt', 'source-main', 'alternate_of')`,
    ),
    db.prepare(
      `INSERT INTO music_performances (
         id, song_id, dedupe_key, relation_type, release_type,
         participation_type, publication_status, quality_status,
         released_at, version, created_at, updated_at
       ) VALUES ('performance-1', 'song-1', 'performance-dedupe-1', 'cover',
                 'official_video', 'solo', 'draft', 'ok', ?, 0, ?, ?)`,
    ).bind(NOW, NOW, NOW),
    db.prepare(
      `INSERT INTO music_performance_participants (
         performance_id, entity_id, participant_role, credit_order,
         credit_name_snapshot
       ) VALUES ('performance-1', 'entity-member', 'vocal', 0, 'OTW Member')`,
    ),
    db.prepare(
      `INSERT INTO music_performance_sources (
         performance_id, source_id, start_seconds, end_seconds,
         source_role, priority, is_primary
       ) VALUES ('performance-1', 'source-main', 0, NULL, 'official', 0, 1)`,
    ),
  ]);
};

describe("OTW Play catalog foundation migration", () => {
  beforeEach(async () => {
    expect(testEnv.OTW_PLAY_CATALOG_MIGRATIONS).toEqual([
      expect.objectContaining({ name: CATALOG_MIGRATION_NAME }),
    ]);

    await db
      .prepare("CREATE TABLE IF NOT EXISTS members (uid INTEGER PRIMARY KEY)")
      .run();
    await applyD1Migrations(
      db,
      testEnv.OTW_PLAY_CATALOG_MIGRATIONS,
      "otw_play_catalog_test_migrations",
    );
    await resetCatalogData();
  });

  it("applies the generated migration and exposes all 12 foundation tables", async () => {
    const tables = await db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'music_%'
         ORDER BY name`,
      )
      .all<{ name: string }>();
    const foreignKeyCheck = await db.prepare("PRAGMA foreign_key_check").all();

    expect(tables.results.map(({ name }) => name)).toEqual(MUSIC_TABLES);
    expect(foreignKeyCheck.results).toEqual([]);

    // Workerd D1 rejects integrity_check and schema_version with SQLITE_AUTH.
    // External SQLite validation and the full numbered-migration workflow own
    // those checks; this runtime suite verifies the exposed schema and behavior.
    for (const tableName of MUSIC_TABLES) {
      const columns = await db
        .prepare(`PRAGMA table_info(${tableName})`)
        .all<{ name: string }>();
      const foreignKeys = await db
        .prepare(`PRAGMA foreign_key_list(${tableName})`)
        .all<{
          from: string;
          table: string;
          to: string;
          on_delete: string;
        }>();
      const indexes = await db
        .prepare(`PRAGMA index_list(${tableName})`)
        .all<{ name: string; unique: number; partial: number }>();

      expect(columns.results.map(({ name }) => name), tableName).toEqual(
        EXPECTED_COLUMNS[tableName],
      );
      expect(
        foreignKeys.results
          .map(({ from, table, to, on_delete }) => ({
            from,
            table,
            to,
            on_delete,
          }))
          .sort((left, right) => left.from.localeCompare(right.from)),
        `${tableName} foreign keys`,
      ).toEqual(
        [...EXPECTED_FOREIGN_KEYS[tableName]].sort((left, right) =>
          left.from.localeCompare(right.from),
        ),
      );

      const namedIndexes = indexes.results.filter(
        ({ name }) => !name.startsWith("sqlite_autoindex_"),
      );
      const expectedIndexes = EXPECTED_INDEXES[tableName] as Record<
        string,
        ExpectedIndex
      >;
      expect(
        namedIndexes.map(({ name }) => name).sort(),
        `${tableName} named indexes`,
      ).toEqual(Object.keys(expectedIndexes).sort());

      for (const { name, unique, partial } of namedIndexes) {
        const indexColumns = await db
          .prepare(`PRAGMA index_info(${name})`)
          .all<{ name: string }>();
        const expectedIndex = expectedIndexes[name];

        expect(expectedIndex, `${tableName}.${name}`).toBeDefined();
        expect(
          { unique: Number(unique), partial: Number(partial) },
          `${tableName}.${name} flags`,
        ).toEqual({
          unique: expectedIndex.unique,
          partial: expectedIndex.partial,
        });
        expect(
          indexColumns.results.map(({ name: columnName }) => columnName),
          `${tableName}.${name} columns`,
        ).toEqual(expectedIndex.columns);
      }
    }
  });

  it("round-trips a normalized catalog graph through every foundation table", async () => {
    await insertCatalogFixture();

    const counts = await Promise.all(
      MUSIC_TABLES.map(async (tableName) => {
        const row = await db
          .prepare(`SELECT COUNT(*) AS total FROM ${tableName}`)
          .first<{ total: number }>();
        return [tableName, Number(row?.total ?? 0)] as const;
      }),
    );
    const readback = await db
      .prepare(
        `SELECT
           song.title AS song_title,
           artist.display_name AS original_artist,
           performance.publication_status,
           participant.credit_name_snapshot,
           source.external_id,
           source.availability_status,
           performance_source.start_seconds,
           channel.channel_role,
           relation.relation_type AS source_relation
         FROM music_performances AS performance
         JOIN music_songs AS song ON song.id = performance.song_id
         JOIN music_song_original_artists AS original_artist
           ON original_artist.song_id = song.id AND original_artist.is_primary = 1
         JOIN music_entities AS artist ON artist.id = original_artist.entity_id
         JOIN music_performance_participants AS participant
           ON participant.performance_id = performance.id
         JOIN music_performance_sources AS performance_source
           ON performance_source.performance_id = performance.id
         JOIN music_media_sources AS source ON source.id = performance_source.source_id
         JOIN music_channels AS channel ON channel.id = source.channel_id
         JOIN music_media_source_relations AS relation
           ON relation.related_source_id = source.id
         WHERE performance.id = 'performance-1'`,
      )
      .first<{
        song_title: string;
        original_artist: string;
        publication_status: string;
        credit_name_snapshot: string;
        external_id: string;
        availability_status: string;
        start_seconds: number;
        channel_role: string;
        source_relation: string;
      }>();

    expect(Object.fromEntries(counts)).toEqual({
      music_channel_entities: 1,
      music_channels: 1,
      music_entities: 2,
      music_entity_aliases: 1,
      music_media_source_relations: 1,
      music_media_sources: 2,
      music_performance_participants: 1,
      music_performance_sources: 1,
      music_performances: 1,
      music_song_aliases: 1,
      music_song_original_artists: 1,
      music_songs: 1,
    });
    expect(readback).toEqual({
      song_title: "Catalog Song",
      original_artist: "Original Artist",
      publication_status: "draft",
      credit_name_snapshot: "OTW Member",
      external_id: "AbCdEf123_-",
      availability_status: "playable",
      start_seconds: 0,
      channel_role: "member_music",
      source_relation: "alternate_of",
    });
  });

  it("rejects invalid enum values and keeps status axes separate", async () => {
    await insertCatalogFixture();

    await expectConstraintFailure(
      db
        .prepare(
          "UPDATE music_performances SET publication_status = 'unavailable' WHERE id = 'performance-1'",
        )
        .run(),
      /music_performances_publication_status_check/i,
    );
    await expectConstraintFailure(
      db
        .prepare(
          "UPDATE music_performances SET quality_status = 'pending_review' WHERE id = 'performance-1'",
        )
        .run(),
      /music_performances_quality_status_check/i,
    );
    await expectConstraintFailure(
      db
        .prepare(
          "UPDATE music_media_sources SET availability_status = 'published' WHERE id = 'source-main'",
        )
        .run(),
      /music_media_sources_availability_check/i,
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_media_source_relations (
             source_id, related_source_id, relation_type
           ) VALUES ('source-main', 'source-main', 'excerpt_of')`,
        )
        .run(),
      /music_media_source_relations_self_check/i,
    );
  });

  it("keeps song originality independent from performance relation type", async () => {
    await insertCatalogFixture();

    await db
      .prepare("UPDATE music_songs SET is_otw_original = 1 WHERE id = 'song-1'")
      .run();
    const otwOriginalCover = await db
      .prepare(
        `SELECT song.is_otw_original, performance.relation_type
         FROM music_songs AS song
         JOIN music_performances AS performance ON performance.song_id = song.id
         WHERE performance.id = 'performance-1'`,
      )
      .first<{ is_otw_original: number; relation_type: string }>();

    await db
      .prepare("UPDATE music_songs SET is_otw_original = 0 WHERE id = 'song-1'")
      .run();
    await db
      .prepare(
        "UPDATE music_performances SET relation_type = 'original' WHERE id = 'performance-1'",
      )
      .run();
    const externalOriginalPerformance = await db
      .prepare(
        `SELECT song.is_otw_original, performance.relation_type
         FROM music_songs AS song
         JOIN music_performances AS performance ON performance.song_id = song.id
         WHERE performance.id = 'performance-1'`,
      )
      .first<{ is_otw_original: number; relation_type: string }>();

    expect(otwOriginalCover).toEqual({
      is_otw_original: 1,
      relation_type: "cover",
    });
    expect(externalOriginalPerformance).toEqual({
      is_otw_original: 0,
      relation_type: "original",
    });
  });

  it("rejects a duplicate channel-to-entity link", async () => {
    await insertCatalogFixture();

    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_channel_entities (channel_id, entity_id)
           VALUES ('channel-1', 'entity-member')`,
        )
        .run(),
      /UNIQUE constraint failed.*music_channel_entities\.channel_id.*music_channel_entities\.entity_id/i,
    );
  });

  it("treats reverse source relations as separate directed rows", async () => {
    await insertCatalogFixture();

    await db
      .prepare(
        `INSERT INTO music_media_source_relations (
           source_id, related_source_id, relation_type
         ) VALUES ('source-main', 'source-alt', 'alternate_of')`,
      )
      .run();
    const relations = await db
      .prepare(
        `SELECT source_id, related_source_id, relation_type
         FROM music_media_source_relations
         ORDER BY source_id, related_source_id`,
      )
      .all<{
        source_id: string;
        related_source_id: string;
        relation_type: string;
      }>();

    expect(relations.results).toEqual([
      {
        source_id: "source-alt",
        related_source_id: "source-main",
        relation_type: "alternate_of",
      },
      {
        source_id: "source-main",
        related_source_id: "source-alt",
        relation_type: "alternate_of",
      },
    ]);
  });

  it("round-trips nullable and free-text alias kinds", async () => {
    await insertCatalogFixture();
    await db.batch([
      db.prepare(
        `INSERT INTO music_entity_aliases (
           entity_id, alias, normalized_alias, locale, alias_kind
         ) VALUES ('entity-artist', 'Artist Alias', 'artist alias', 'en', NULL)`,
      ),
      db.prepare(
        `INSERT INTO music_song_aliases (
           song_id, alias, normalized_alias, locale, alias_kind
         ) VALUES ('song-1', 'Community Title', 'community title', 'en',
                   'community_romanization_v7')`,
      ),
    ]);

    const aliases = await db
      .prepare(
        `SELECT 'entity' AS alias_scope, normalized_alias, alias_kind
         FROM music_entity_aliases
         WHERE normalized_alias = 'artist alias'
         UNION ALL
         SELECT 'song' AS alias_scope, normalized_alias, alias_kind
         FROM music_song_aliases
         WHERE normalized_alias = 'community title'
         ORDER BY alias_scope`,
      )
      .all<{
        alias_scope: string;
        normalized_alias: string;
        alias_kind: string | null;
      }>();

    expect(aliases.results).toEqual([
      {
        alias_scope: "entity",
        normalized_alias: "artist alias",
        alias_kind: null,
      },
      {
        alias_scope: "song",
        normalized_alias: "community title",
        alias_kind: "community_romanization_v7",
      },
    ]);
  });

  it("requires an explicit original flag and validates calendar release dates", async () => {
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_songs (
             id, slug, title, normalized_title, dedupe_key,
             original_release_date, original_release_precision, version,
             created_at, updated_at
           ) VALUES ('song-omitted-original', 'song-omitted-original',
                     'Omitted Original', 'omitted original',
                     'song-omitted-original-dedupe', NULL, 'unknown', 0, ?, ?)`,
        )
        .bind(NOW, NOW)
        .run(),
      /NOT NULL constraint failed.*music_songs\.is_otw_original/i,
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_songs (
             id, slug, title, normalized_title, dedupe_key, is_otw_original,
             original_release_date, original_release_precision, version,
             created_at, updated_at
           ) VALUES ('song-null-original', 'song-null-original',
                     'Null Original', 'null original', 'song-null-original-dedupe',
                     NULL, NULL, 'unknown', 0, ?, ?)`,
        )
        .bind(NOW, NOW)
        .run(),
      /NOT NULL constraint failed.*music_songs\.is_otw_original/i,
    );

    for (const precision of ["year", "month", "day"] as const) {
      await expectConstraintFailure(
        insertSongWithReleaseDate(`song-null-${precision}`, null, precision),
        /music_songs_release_date_check/i,
      );
    }

    await expectConstraintFailure(
      insertSongWithReleaseDate("song-invalid-day", "2026-02-31", "day"),
      /music_songs_release_date_check/i,
    );
    await insertSongWithReleaseDate("song-leap-day", "2024-02-29", "day");

    const leapDay = await db
      .prepare(
        `SELECT original_release_date, original_release_precision,
                is_otw_original
         FROM music_songs
         WHERE id = 'song-leap-day'`,
      )
      .first<{
        original_release_date: string;
        original_release_precision: string;
        is_otw_original: number;
      }>();
    expect(leapDay).toEqual({
      original_release_date: "2024-02-29",
      original_release_precision: "day",
      is_otw_original: 0,
    });
  });

  it.each([
    {
      label: "aggregate version",
      operation: () =>
        db
          .prepare(
            "UPDATE music_entities SET version = 0.5 WHERE id = 'entity-member'",
          )
          .run(),
      constraint: /music_entities_version_check/i,
    },
    {
      label: "aggregate created_at",
      operation: () =>
        db
          .prepare(
            "UPDATE music_entities SET created_at = 0.5 WHERE id = 'entity-member'",
          )
          .run(),
      constraint: /music_entities_time_check/i,
    },
    {
      label: "participant credit_order",
      operation: () =>
        db
          .prepare(
            `UPDATE music_performance_participants
             SET credit_order = 0.5
             WHERE performance_id = 'performance-1'`,
          )
          .run(),
      constraint: /music_performance_participants_credit_order_check/i,
    },
    {
      label: "source duration_seconds",
      operation: () =>
        db
          .prepare(
            "UPDATE music_media_sources SET duration_seconds = 0.5 WHERE id = 'source-main'",
          )
          .run(),
      constraint: /music_media_sources_duration_check/i,
    },
    {
      label: "source last_checked_at",
      operation: () =>
        db
          .prepare(
            "UPDATE music_media_sources SET last_checked_at = 0.5 WHERE id = 'source-main'",
          )
          .run(),
      constraint: /music_media_sources_check_times_check/i,
    },
    {
      label: "performance released_at",
      operation: () =>
        db
          .prepare(
            "UPDATE music_performances SET released_at = 0.5 WHERE id = 'performance-1'",
          )
          .run(),
      constraint: /music_performances_release_time_check/i,
    },
    {
      label: "source segment start_seconds",
      operation: () =>
        db
          .prepare(
            `UPDATE music_performance_sources
             SET start_seconds = 0.5
             WHERE performance_id = 'performance-1'`,
          )
          .run(),
      constraint: /music_performance_sources_range_check/i,
    },
    {
      label: "source segment end_seconds",
      operation: () =>
        db
          .prepare(
            `UPDATE music_performance_sources
             SET end_seconds = 1.5
             WHERE performance_id = 'performance-1'`,
          )
          .run(),
      constraint: /music_performance_sources_range_check/i,
    },
  ])("rejects fractional $label values", async ({ operation, constraint }) => {
    await insertCatalogFixture();
    await expectConstraintFailure(operation(), constraint);
  });

  it("defaults source priority to zero and rejects invalid priority values", async () => {
    await insertCatalogFixture();
    await insertPerformance("performance-priority", "performance-priority");
    await db
      .prepare(
        `INSERT INTO music_performance_sources (
           performance_id, source_id, start_seconds, end_seconds,
           source_role, is_primary
         ) VALUES ('performance-priority', 'source-alt', 30, 45,
                   'alternate', 0)`,
      )
      .run();

    const priority = await db
      .prepare(
        `SELECT priority
         FROM music_performance_sources
         WHERE performance_id = 'performance-priority'`,
      )
      .first<{ priority: number }>();
    expect(priority?.priority).toBe(0);

    await expectConstraintFailure(
      db
        .prepare(
          `UPDATE music_performance_sources
           SET priority = NULL
           WHERE performance_id = 'performance-priority'`,
        )
        .run(),
      /NOT NULL constraint failed.*music_performance_sources\.priority/i,
    );
    await expectConstraintFailure(
      db
        .prepare(
          `UPDATE music_performance_sources
           SET priority = -1
           WHERE performance_id = 'performance-priority'`,
        )
        .run(),
      /music_performance_sources_priority_check/i,
    );
    await expectConstraintFailure(
      db
        .prepare(
          `UPDATE music_performance_sources
           SET priority = 0.5
           WHERE performance_id = 'performance-priority'`,
        )
        .run(),
      /music_performance_sources_priority_check/i,
    );
  });

  it("enforces exact duplicate keys while allowing multiple external entities", async () => {
    await insertCatalogFixture();

    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_entities (
             id, member_uid, entity_kind, display_name, normalized_name, slug,
             version, created_at, updated_at
           ) VALUES ('entity-member-duplicate', 1, 'person', 'Duplicate Member',
                     'duplicate member', 'duplicate-member', 0, ?, ?)`,
        )
        .bind(NOW, NOW)
        .run(),
      /UNIQUE constraint failed.*music_entities\.member_uid/i,
    );
    await db
      .prepare(
        `INSERT INTO music_entities (
           id, member_uid, entity_kind, display_name, normalized_name, slug,
           version, created_at, updated_at
         ) VALUES ('entity-external-2', NULL, 'person', 'Second Artist',
                   'second artist', 'second-artist', 0, ?, ?)`,
      )
      .bind(NOW, NOW)
      .run();
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_channels (
             id, provider, external_channel_id, display_name, channel_role,
             verification_status, active, version, created_at, updated_at
           ) VALUES ('channel-duplicate', 'youtube', 'UCaaaaaaaaaaaaaaaaaaaaaa',
                     'Duplicate Channel', 'member_main', 'approved', 1, 0, ?, ?)`,
        )
        .bind(NOW, NOW)
        .run(),
      /UNIQUE constraint failed.*music_channels\.provider.*music_channels\.external_channel_id/i,
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_media_sources (
             id, provider, external_id, channel_id, availability_status,
             version, created_at, updated_at
           ) VALUES ('source-duplicate', 'youtube', 'AbCdEf123_-', 'channel-1',
                     'unknown', 0, ?, ?)`,
        )
        .bind(NOW, NOW)
        .run(),
      /UNIQUE constraint failed.*music_media_sources\.provider.*music_media_sources\.external_id/i,
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_songs (
             id, slug, title, normalized_title, dedupe_key, is_otw_original,
             original_release_precision, version, created_at, updated_at
           ) VALUES ('song-duplicate', 'catalog-song-duplicate', 'Duplicate Song',
                     'duplicate song', 'song-dedupe-1', 0, 'unknown', 0, ?, ?)`,
        )
        .bind(NOW, NOW)
        .run(),
      /UNIQUE constraint failed.*music_songs\.dedupe_key/i,
    );
    await expectConstraintFailure(
      insertPerformance("performance-duplicate", "performance-dedupe-1"),
      /UNIQUE constraint failed.*music_performances\.dedupe_key/i,
    );

    const externalCount = await db
      .prepare(
        "SELECT COUNT(*) AS total FROM music_entities WHERE member_uid IS NULL",
      )
      .first<{ total: number }>();
    expect(Number(externalCount?.total)).toBe(2);
  });

  it("applies RESTRICT, CASCADE, and SET NULL without deleting source metadata", async () => {
    await insertCatalogFixture();

    await expectConstraintFailure(
      db.prepare("DELETE FROM music_songs WHERE id = 'song-1'").run(),
      /FOREIGN KEY constraint failed/i,
    );
    await expectConstraintFailure(
      db.prepare("DELETE FROM music_media_sources WHERE id = 'source-main'").run(),
      /FOREIGN KEY constraint failed/i,
    );
    await expectConstraintFailure(
      db.prepare("DELETE FROM music_entities WHERE id = 'entity-artist'").run(),
      /FOREIGN KEY constraint failed/i,
    );

    await db.prepare("DELETE FROM members WHERE uid = 1").run();
    const detachedMemberEntity = await db
      .prepare(
        "SELECT member_uid FROM music_entities WHERE id = 'entity-member'",
      )
      .first<{ member_uid: number | null }>();
    expect(detachedMemberEntity?.member_uid).toBeNull();

    await db
      .prepare("DELETE FROM music_performances WHERE id = 'performance-1'")
      .run();
    const [participantCount, sourceLinkCount, sourceCount] = await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) AS total FROM music_performance_participants",
        )
        .first<{ total: number }>(),
      db
        .prepare("SELECT COUNT(*) AS total FROM music_performance_sources")
        .first<{ total: number }>(),
      db
        .prepare("SELECT COUNT(*) AS total FROM music_media_sources")
        .first<{ total: number }>(),
    ]);
    expect(Number(participantCount?.total)).toBe(0);
    expect(Number(sourceLinkCount?.total)).toBe(0);
    expect(Number(sourceCount?.total)).toBe(2);

    await db.prepare("DELETE FROM music_songs WHERE id = 'song-1'").run();
    const [songAliasCount, originalArtistCount, entityCount] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS total FROM music_song_aliases")
        .first<{ total: number }>(),
      db
        .prepare("SELECT COUNT(*) AS total FROM music_song_original_artists")
        .first<{ total: number }>(),
      db
        .prepare("SELECT COUNT(*) AS total FROM music_entities")
        .first<{ total: number }>(),
    ]);
    expect(Number(songAliasCount?.total)).toBe(0);
    expect(Number(originalArtistCount?.total)).toBe(0);
    expect(Number(entityCount?.total)).toBe(2);
  });

  it("enforces one primary source and validates deterministic source segments", async () => {
    await insertCatalogFixture();
    await insertPerformance("performance-2", "performance-dedupe-2");
    await insertPerformance("performance-3", "performance-dedupe-3");

    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_performance_sources (
             performance_id, source_id, start_seconds, end_seconds,
             source_role, priority, is_primary
           ) VALUES ('performance-1', 'source-alt', 0, NULL, 'alternate', 1, 1)`,
        )
        .run(),
      /UNIQUE constraint failed.*music_performance_sources\.performance_id/i,
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_performance_sources (
             performance_id, source_id, start_seconds, end_seconds,
             source_role, priority, is_primary
           ) VALUES ('performance-2', 'source-alt', 30, 30, 'official', 0, 1)`,
        )
        .run(),
      /music_performance_sources_range_check/i,
    );
    await db
      .prepare(
        `INSERT INTO music_performance_sources (
           performance_id, source_id, start_seconds, end_seconds,
           source_role, priority, is_primary
         ) VALUES ('performance-2', 'source-alt', 30, 45, 'official', 0, 1)`,
      )
      .run();
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_performance_sources (
             performance_id, source_id, start_seconds, end_seconds,
             source_role, priority, is_primary
           ) VALUES ('performance-3', 'source-alt', 30, 45, 'official', 0, 1)`,
        )
        .run(),
      /UNIQUE constraint failed.*music_performance_sources\.source_id.*music_performance_sources\.start_seconds/i,
    );
    await db
      .prepare(
        `INSERT INTO music_performance_sources (
           performance_id, source_id, start_seconds, end_seconds,
           source_role, priority, is_primary
         ) VALUES ('performance-3', 'source-alt', 60, 90, 'official', 0, 1)`,
      )
      .run();

    const segments = await db
      .prepare(
        `SELECT performance_id, start_seconds, end_seconds
         FROM music_performance_sources
         WHERE source_id = 'source-alt'
         ORDER BY start_seconds`,
      )
      .all<{
        performance_id: string;
        start_seconds: number;
        end_seconds: number | null;
      }>();
    expect(segments.results).toEqual([
      {
        performance_id: "performance-2",
        start_seconds: 30,
        end_seconds: 45,
      },
      {
        performance_id: "performance-3",
        start_seconds: 60,
        end_seconds: 90,
      },
    ]);
  });

  it("allows a published performance to retain an unavailable source", async () => {
    await insertCatalogFixture();
    await insertPerformance("performance-published", "performance-published", "published");
    await db
      .prepare(
        `INSERT INTO music_performance_sources (
           performance_id, source_id, start_seconds, end_seconds,
           source_role, priority, is_primary
         ) VALUES ('performance-published', 'source-alt', 30, NULL,
                   'alternate', 0, 1)`,
      )
      .run();

    const state = await db
      .prepare(
        `SELECT performance.publication_status, source.availability_status
         FROM music_performances AS performance
         JOIN music_performance_sources AS link
           ON link.performance_id = performance.id
         JOIN music_media_sources AS source ON source.id = link.source_id
         WHERE performance.id = 'performance-published'`,
      )
      .first<{
        publication_status: string;
        availability_status: string;
      }>();

    expect(state).toEqual({
      publication_status: "published",
      availability_status: "unavailable",
    });
  });
});
