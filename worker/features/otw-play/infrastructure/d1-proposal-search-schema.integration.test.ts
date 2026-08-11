import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import localD1SeedSql from "../../../../scripts/fixtures/local-d1-seed.sql?raw";

const FOUNDATION_MIGRATION_NAME = "0046_tan_nova.sql";
const PROPOSAL_SEARCH_MIGRATION_NAMES = [
  "0047_nasty_cargill.sql",
  "0048_previous_the_phantom.sql",
  "0049_otw_play_catalog_meta_seed.sql",
] as const;
const NOW = 1_786_000_000_000;

const NEW_TABLES = [
  "music_catalog_events",
  "music_catalog_meta",
  "music_cover_proposal_original_artists",
  "music_cover_proposal_participants",
  "music_cover_proposals",
  "music_search_terms",
] as const;

const ALL_MUSIC_TABLES = [
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
  ...NEW_TABLES,
].sort();

type NewTable = (typeof NEW_TABLES)[number];

type ExpectedForeignKey = {
  readonly from: string;
  readonly table: string;
  readonly to: string;
  readonly on_delete: "CASCADE" | "RESTRICT" | "SET NULL";
};

type ExpectedIndex = {
  readonly columns: readonly string[];
  readonly descending?: readonly (0 | 1)[];
  readonly unique: 0 | 1;
  readonly partial: 0 | 1;
};

const EXPECTED_COLUMNS = {
  music_catalog_events: [
    "id",
    "aggregate_type",
    "aggregate_id",
    "event_type",
    "actor_kind",
    "actor_user_id",
    "before_json",
    "after_json",
    "detail_json",
    "created_at",
  ],
  music_catalog_meta: [
    "id",
    "revision",
    "public_read_enabled",
    "navigation_visible",
    "updated_at",
  ],
  music_cover_proposal_original_artists: [
    "proposal_id",
    "credit_order",
    "resolved_entity_id",
    "submitted_name_snapshot",
  ],
  music_cover_proposal_participants: [
    "proposal_id",
    "credit_order",
    "resolved_entity_id",
    "submitted_name_snapshot",
    "participant_role",
  ],
  music_cover_proposals: [
    "id",
    "submitted_by_user_id",
    "idempotency_key",
    "submitted_url",
    "youtube_video_id",
    "segment_start_seconds",
    "submitted_title",
    "suggested_song_id",
    "submitted_note",
    "status",
    "version",
    "review_lock_token",
    "review_lock_expires_at",
    "reviewed_by_user_id",
    "reviewed_at",
    "review_result_code",
    "review_note",
    "approved_performance_id",
    "created_at",
    "updated_at",
  ],
  music_search_terms: [
    "song_id",
    "term_kind",
    "display_value",
    "normalized_term",
  ],
} as const satisfies Record<NewTable, readonly string[]>;

const EXPECTED_PRIMARY_KEYS = {
  music_catalog_events: ["id"],
  music_catalog_meta: ["id"],
  music_cover_proposal_original_artists: ["proposal_id", "credit_order"],
  music_cover_proposal_participants: ["proposal_id", "credit_order"],
  music_cover_proposals: ["id"],
  music_search_terms: ["song_id", "term_kind", "normalized_term"],
} as const satisfies Record<NewTable, readonly string[]>;

const EXPECTED_FOREIGN_KEYS = {
  music_catalog_events: [],
  music_catalog_meta: [],
  music_cover_proposal_original_artists: [
    {
      from: "proposal_id",
      table: "music_cover_proposals",
      to: "id",
      on_delete: "CASCADE",
    },
    {
      from: "resolved_entity_id",
      table: "music_entities",
      to: "id",
      on_delete: "RESTRICT",
    },
  ],
  music_cover_proposal_participants: [
    {
      from: "proposal_id",
      table: "music_cover_proposals",
      to: "id",
      on_delete: "CASCADE",
    },
    {
      from: "resolved_entity_id",
      table: "music_entities",
      to: "id",
      on_delete: "RESTRICT",
    },
  ],
  music_cover_proposals: [
    {
      from: "approved_performance_id",
      table: "music_performances",
      to: "id",
      on_delete: "RESTRICT",
    },
    {
      from: "suggested_song_id",
      table: "music_songs",
      to: "id",
      on_delete: "SET NULL",
    },
  ],
  music_search_terms: [
    {
      from: "song_id",
      table: "music_songs",
      to: "id",
      on_delete: "CASCADE",
    },
  ],
} as const satisfies Record<NewTable, readonly ExpectedForeignKey[]>;

const EXPECTED_INDEXES = {
  music_catalog_events: {
    idx_music_catalog_events_aggregate_created_id: {
      columns: ["aggregate_type", "aggregate_id", "created_at", "id"],
      descending: [0, 0, 1, 0],
      unique: 0,
      partial: 0,
    },
  },
  music_catalog_meta: {},
  music_cover_proposal_original_artists: {
    idx_music_cover_proposal_original_artists_entity_proposal: {
      columns: ["resolved_entity_id", "proposal_id"],
      unique: 0,
      partial: 0,
    },
  },
  music_cover_proposal_participants: {
    idx_music_cover_proposal_participants_entity_proposal: {
      columns: ["resolved_entity_id", "proposal_id"],
      unique: 0,
      partial: 0,
    },
  },
  music_cover_proposals: {
    idx_music_cover_proposals_reviewer_reviewed_id: {
      columns: ["reviewed_by_user_id", "reviewed_at", "id"],
      descending: [0, 1, 0],
      unique: 0,
      partial: 1,
    },
    idx_music_cover_proposals_status_created_id: {
      columns: ["status", "created_at", "id"],
      unique: 0,
      partial: 0,
    },
    idx_music_cover_proposals_submitter_created_id: {
      columns: ["submitted_by_user_id", "created_at", "id"],
      descending: [0, 1, 0],
      unique: 0,
      partial: 0,
    },
    idx_music_cover_proposals_suggested_song_id: {
      columns: ["suggested_song_id"],
      unique: 0,
      partial: 0,
    },
    uidx_music_cover_proposals_approved_performance: {
      columns: ["approved_performance_id"],
      unique: 1,
      partial: 0,
    },
    uidx_music_cover_proposals_pending_video_segment: {
      columns: ["youtube_video_id", "segment_start_seconds"],
      unique: 1,
      partial: 1,
    },
    uidx_music_cover_proposals_submitter_idempotency: {
      columns: ["submitted_by_user_id", "idempotency_key"],
      unique: 1,
      partial: 0,
    },
  },
  music_search_terms: {
    idx_music_search_terms_normalized_kind_song: {
      columns: ["normalized_term", "term_kind", "song_id"],
      unique: 0,
      partial: 0,
    },
  },
} as const satisfies Record<NewTable, Record<string, ExpectedIndex>>;

const EXPECTED_CHECK_NAMES = {
  music_catalog_events: [
    "music_catalog_events_required_text_check",
    "music_catalog_events_actor_kind_check",
    "music_catalog_events_actor_check",
    "music_catalog_events_json_check",
    "music_catalog_events_time_check",
  ],
  music_catalog_meta: [
    "music_catalog_meta_singleton_check",
    "music_catalog_meta_revision_check",
    "music_catalog_meta_flags_check",
    "music_catalog_meta_navigation_check",
    "music_catalog_meta_time_check",
  ],
  music_cover_proposal_original_artists: [
    "music_cover_proposal_original_artists_credit_order_check",
    "music_cover_proposal_original_artists_snapshot_check",
  ],
  music_cover_proposal_participants: [
    "music_cover_proposal_participants_credit_order_check",
    "music_cover_proposal_participants_snapshot_check",
    "music_cover_proposal_participants_role_check",
  ],
  music_cover_proposals: [
    "music_cover_proposals_required_text_check",
    "music_cover_proposals_video_id_check",
    "music_cover_proposals_segment_check",
    "music_cover_proposals_status_check",
    "music_cover_proposals_version_check",
    "music_cover_proposals_lock_pair_check",
    "music_cover_proposals_review_pair_check",
    "music_cover_proposals_status_outcome_check",
    "music_cover_proposals_terminal_lock_check",
    "music_cover_proposals_optional_text_check",
    "music_cover_proposals_time_check",
  ],
  music_search_terms: [
    "music_search_terms_kind_check",
    "music_search_terms_required_text_check",
  ],
} as const satisfies Record<NewTable, readonly string[]>;

const PUBLISHED_INDEXES = {
  idx_music_performances_published_released_id: ["released_at", "id"],
  idx_music_performances_published_song_released_id: [
    "song_id",
    "released_at",
    "id",
  ],
  idx_music_performances_published_relation_released_id: [
    "relation_type",
    "released_at",
    "id",
  ],
} as const;

const PUBLISHED_INDEX_DIRECTIONS = {
  idx_music_performances_published_released_id: [1, 0],
  idx_music_performances_published_song_released_id: [0, 1, 0],
  idx_music_performances_published_relation_released_id: [0, 1, 0],
} as const satisfies Record<
  keyof typeof PUBLISHED_INDEXES,
  readonly (0 | 1)[]
>;

type ProposalSearchTestEnv = Env & {
  OTW_PLAY_CATALOG_MIGRATIONS: D1Migration[];
  OTW_PLAY_PROPOSAL_SEARCH_MIGRATIONS: D1Migration[];
};

const testEnv = env as ProposalSearchTestEnv;
const db = testEnv.otw_db;
let migratedCatalogMeta: {
  id: number;
  revision: number;
  public_read_enabled: number;
  navigation_visible: number;
  updated_at: number;
} | null = null;

const expectConstraintFailure = async (operation: Promise<unknown>) => {
  await expect(operation).rejects.toThrow(/constraint|foreign key|unique/i);
};

const resetData = async () => {
  await db.batch([
    db.prepare("DELETE FROM music_cover_proposal_participants"),
    db.prepare("DELETE FROM music_cover_proposal_original_artists"),
    db.prepare("DELETE FROM music_search_terms"),
    db.prepare("DELETE FROM music_catalog_events"),
    db.prepare("DELETE FROM music_cover_proposals"),
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
    db.prepare(
      `UPDATE music_catalog_meta
       SET revision = 0, public_read_enabled = 0,
           navigation_visible = 0, updated_at = 0
       WHERE id = 1`,
    ),
  ]);
};

const insertFoundationGraph = async (publicationStatus = "draft") => {
  await db.batch([
    db.prepare(
      `INSERT INTO music_entities (
         id, member_uid, entity_kind, display_name, normalized_name, slug,
         version, created_at, updated_at
       ) VALUES ('entity-1', NULL, 'person', 'OTW Member', 'otw member',
                 'otw-member', 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_songs (
         id, slug, title, normalized_title, dedupe_key, is_otw_original,
         original_release_date, original_release_precision, version,
         created_at, updated_at
       ) VALUES ('song-1', 'catalog-song', 'Catalog Song', 'catalog song',
                 'song-dedupe-1', 0, NULL, 'unknown', 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_performances (
         id, song_id, dedupe_key, relation_type, release_type,
         participation_type, publication_status, quality_status,
         released_at, version, created_at, updated_at
       ) VALUES ('performance-1', 'song-1', 'performance-dedupe-1', 'cover',
                 'official_video', 'solo', ?, 'ok', ?, 0, ?, ?)`,
    ).bind(publicationStatus, NOW, NOW, NOW),
  ]);
};

type PendingProposalInput = {
  id: string;
  userId: string;
  idempotencyKey: string;
  videoId?: string;
  segmentStart?: number;
  suggestedSongId?: string | null;
};

const insertPendingProposal = async ({
  id,
  userId,
  idempotencyKey,
  videoId = "AbCdEf123_-",
  segmentStart = 0,
  suggestedSongId = null,
}: PendingProposalInput) =>
  db
    .prepare(
      `INSERT INTO music_cover_proposals (
         id, submitted_by_user_id, idempotency_key, submitted_url,
         youtube_video_id, segment_start_seconds, submitted_title,
         suggested_song_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      idempotencyKey,
      `https://youtu.be/${videoId}`,
      videoId,
      segmentStart,
      `Submitted ${id}`,
      suggestedSongId,
      NOW,
      NOW,
    )
    .run();

type ReviewedProposalInput = PendingProposalInput & {
  status: "approved" | "rejected";
  approvedPerformanceId?: string | null;
};

const insertReviewedProposal = async ({
  id,
  userId,
  idempotencyKey,
  videoId = "ZyXwVu987_-",
  segmentStart = 0,
  suggestedSongId = null,
  status,
  approvedPerformanceId = null,
}: ReviewedProposalInput) =>
  db
    .prepare(
      `INSERT INTO music_cover_proposals (
         id, submitted_by_user_id, idempotency_key, submitted_url,
         youtube_video_id, segment_start_seconds, submitted_title,
         suggested_song_id, status, reviewed_by_user_id, reviewed_at,
         review_result_code, approved_performance_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin-1', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      idempotencyKey,
      `https://youtu.be/${videoId}`,
      videoId,
      segmentStart,
      `Submitted ${id}`,
      suggestedSongId,
      status,
      NOW,
      status,
      approvedPerformanceId,
      NOW,
      NOW,
    )
    .run();

const insertWithdrawnProposal = async (
  id: string,
  userId: string,
  idempotencyKey: string,
  videoId: string,
) =>
  db
    .prepare(
      `INSERT INTO music_cover_proposals (
         id, submitted_by_user_id, idempotency_key, submitted_url,
         youtube_video_id, segment_start_seconds, submitted_title,
         status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 0, ?, 'withdrawn', ?, ?)`,
    )
    .bind(
      id,
      userId,
      idempotencyKey,
      `https://youtu.be/${videoId}`,
      videoId,
      `Submitted ${id}`,
      NOW,
      NOW,
    )
    .run();

const insertCatalogEvent = async (
  id: string,
  aggregateId: string,
  actorKind = "admin",
  actorUserId: string | null = "admin-1",
) =>
  db
    .prepare(
      `INSERT INTO music_catalog_events (
         id, aggregate_type, aggregate_id, event_type, actor_kind,
         actor_user_id, before_json, after_json, detail_json, created_at
       ) VALUES (?, 'cover_proposal', ?, 'proposal.rejected', ?, ?,
                 '{"status":"pending_review"}', '{"status":"rejected"}',
                 '{"resultCode":"duplicate"}', ?)`,
    )
    .bind(id, aggregateId, actorKind, actorUserId, NOW)
    .run();

const normalizeSql = (sql: string) =>
  sql.replaceAll('"', "").replaceAll("`", "").replace(/\s+/g, " ").trim();

describe("OTW Play proposal, event, search, and meta migrations", () => {
  beforeAll(async () => {
    expect(testEnv.OTW_PLAY_CATALOG_MIGRATIONS).toEqual([
      expect.objectContaining({ name: FOUNDATION_MIGRATION_NAME }),
    ]);
    expect(
      testEnv.OTW_PLAY_PROPOSAL_SEARCH_MIGRATIONS.map(({ name }) => name),
    ).toEqual(PROPOSAL_SEARCH_MIGRATION_NAMES);

    await db
      .prepare("CREATE TABLE IF NOT EXISTS members (uid INTEGER PRIMARY KEY)")
      .run();
    await applyD1Migrations(
      db,
      testEnv.OTW_PLAY_CATALOG_MIGRATIONS,
      "otw_play_proposal_search_foundation_migrations",
    );
    await applyD1Migrations(
      db,
      testEnv.OTW_PLAY_PROPOSAL_SEARCH_MIGRATIONS,
      "otw_play_proposal_search_test_migrations",
    );
    migratedCatalogMeta = await db
      .prepare(
        `SELECT id, revision, public_read_enabled, navigation_visible,
                updated_at
         FROM music_catalog_meta`,
      )
      .first<{
        id: number;
        revision: number;
        public_read_enabled: number;
        navigation_visible: number;
        updated_at: number;
      }>();
  });

  beforeEach(resetData);

  it("applies the exact migrations and exposes the exact tables, columns, foreign keys, indexes, and checks", async () => {
    const allMusicTables = await db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'music_%'
         ORDER BY name`,
      )
      .all<{ name: string }>();
    const tables = await db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN (${NEW_TABLES.map(() => "?").join(", ")})
         ORDER BY name`,
      )
      .bind(...NEW_TABLES)
      .all<{ name: string }>();

    expect(allMusicTables.results.map(({ name }) => name)).toEqual(
      ALL_MUSIC_TABLES,
    );
    expect(tables.results.map(({ name }) => name)).toEqual(NEW_TABLES);

    for (const tableName of NEW_TABLES) {
      const columns = await db
        .prepare(`PRAGMA table_info(${tableName})`)
        .all<{ name: string; pk: number }>();
      const foreignKeys = await db
        .prepare(`PRAGMA foreign_key_list(${tableName})`)
        .all<{
          from: string;
          table: string;
          to: string;
          on_delete: ExpectedForeignKey["on_delete"];
        }>();
      const indexes = await db
        .prepare(`PRAGMA index_list(${tableName})`)
        .all<{ name: string; unique: number; partial: number }>();
      const tableDefinition = await db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
        )
        .bind(tableName)
        .first<{ sql: string }>();

      expect(columns.results.map(({ name }) => name), tableName).toEqual(
        EXPECTED_COLUMNS[tableName],
      );
      expect(
        columns.results
          .filter(({ pk }) => Number(pk) > 0)
          .sort((left, right) => Number(left.pk) - Number(right.pk))
          .map(({ name }) => name),
        `${tableName} primary key`,
      ).toEqual(EXPECTED_PRIMARY_KEYS[tableName]);
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
      expect(namedIndexes.map(({ name }) => name).sort()).toEqual(
        Object.keys(expectedIndexes).sort(),
      );

      for (const { name, unique, partial } of namedIndexes) {
        const indexColumns = await db
          .prepare(`PRAGMA index_xinfo(${name})`)
          .all<{ name: string | null; desc: number; key: number }>();
        const keyColumns = indexColumns.results.filter(
          (column): column is { name: string; desc: number; key: number } =>
            Number(column.key) === 1 && column.name !== null,
        );
        expect({ unique: Number(unique), partial: Number(partial) }).toEqual({
          unique: expectedIndexes[name].unique,
          partial: expectedIndexes[name].partial,
        });
        expect(keyColumns.map(({ name: columnName }) => columnName)).toEqual(
          expectedIndexes[name].columns,
        );
        expect(keyColumns.map(({ desc }) => Number(desc))).toEqual(
          expectedIndexes[name].descending ??
            expectedIndexes[name].columns.map(() => 0),
        );
      }

      for (const checkName of EXPECTED_CHECK_NAMES[tableName]) {
        expect(tableDefinition?.sql, `${tableName}.${checkName}`).toContain(
          `CONSTRAINT "${checkName}" CHECK`,
        );
      }
    }

    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
      [],
    );
  });

  it("stores proposal snapshots without creating canonical catalog rows", async () => {
    await insertPendingProposal({
      id: "proposal-staging",
      userId: "member-1",
      idempotencyKey: "request-1",
    });
    await db.batch([
      db.prepare(
        `INSERT INTO music_cover_proposal_participants (
           proposal_id, credit_order, resolved_entity_id,
           submitted_name_snapshot, participant_role
         ) VALUES ('proposal-staging', 0, NULL, 'Submitted Vocal', 'vocal')`,
      ),
      db.prepare(
        `INSERT INTO music_cover_proposal_original_artists (
           proposal_id, credit_order, resolved_entity_id,
           submitted_name_snapshot
         ) VALUES ('proposal-staging', 0, NULL, 'Submitted Artist')`,
      ),
    ]);

    const canonicalCounts = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM music_entities) AS entities,
           (SELECT COUNT(*) FROM music_songs) AS songs,
           (SELECT COUNT(*) FROM music_performances) AS performances`,
      )
      .first<{ entities: number; songs: number; performances: number }>();
    const snapshots = await db
      .prepare(
        `SELECT participant.submitted_name_snapshot AS participant_name,
                artist.submitted_name_snapshot AS artist_name,
                proposal.status, proposal.segment_start_seconds,
                proposal.version
         FROM music_cover_proposals AS proposal
         JOIN music_cover_proposal_participants AS participant
           ON participant.proposal_id = proposal.id
         JOIN music_cover_proposal_original_artists AS artist
           ON artist.proposal_id = proposal.id
         WHERE proposal.id = 'proposal-staging'`,
      )
      .first<{
        participant_name: string;
        artist_name: string;
        status: string;
        segment_start_seconds: number;
        version: number;
      }>();

    expect(canonicalCounts).toEqual({
      entities: 0,
      songs: 0,
      performances: 0,
    });
    expect(snapshots).toEqual({
      participant_name: "Submitted Vocal",
      artist_name: "Submitted Artist",
      status: "pending_review",
      segment_start_seconds: 0,
      version: 0,
    });
  });

  it("keeps distinct submitted credits and rejects invalid child rows", async () => {
    await insertPendingProposal({
      id: "proposal-credits",
      userId: "member-1",
      idempotencyKey: "request-credits",
    });
    await db.batch([
      db.prepare(
        `INSERT INTO music_cover_proposal_participants (
           proposal_id, credit_order, resolved_entity_id,
           submitted_name_snapshot, participant_role
         ) VALUES ('proposal-credits', 0, NULL, 'Same Name', 'vocal')`,
      ),
      db.prepare(
        `INSERT INTO music_cover_proposal_participants (
           proposal_id, credit_order, resolved_entity_id,
           submitted_name_snapshot, participant_role
         ) VALUES ('proposal-credits', 1, NULL, 'Same Name', 'vocal')`,
      ),
    ]);

    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_cover_proposal_participants (
             proposal_id, credit_order, resolved_entity_id,
             submitted_name_snapshot, participant_role
           ) VALUES ('proposal-credits', 1, NULL, 'Duplicate Order', 'chorus')`,
        )
        .run(),
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_cover_proposal_original_artists (
             proposal_id, credit_order, resolved_entity_id,
             submitted_name_snapshot
           ) VALUES ('proposal-credits', 0.5, NULL, 'Artist')`,
        )
        .run(),
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_cover_proposal_participants (
             proposal_id, credit_order, resolved_entity_id,
             submitted_name_snapshot, participant_role
           ) VALUES ('proposal-credits', 2, NULL, 'Role', 'instrument')`,
        )
        .run(),
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_cover_proposal_original_artists (
             proposal_id, credit_order, resolved_entity_id,
             submitted_name_snapshot
           ) VALUES ('proposal-credits', 2, NULL, '   ')`,
        )
        .run(),
    );

    expect(
      await db
        .prepare(
          `SELECT COUNT(*) AS total
           FROM music_cover_proposal_participants
           WHERE proposal_id = 'proposal-credits'`,
        )
        .first<{ total: number }>(),
    ).toEqual({ total: 2 });
  });

  it("enforces idempotency and pending video duplicates without merging terminal proposals", async () => {
    await insertPendingProposal({
      id: "proposal-1",
      userId: "member-1",
      idempotencyKey: "request-1",
    });

    await expectConstraintFailure(
      insertPendingProposal({
        id: "proposal-idempotency-duplicate",
        userId: "member-1",
        idempotencyKey: "request-1",
        videoId: "QwErTy456_-",
      }),
    );
    await expectConstraintFailure(
      insertPendingProposal({
        id: "proposal-invalid-video",
        userId: "member-1",
        idempotencyKey: "invalid-video",
        videoId: "too-short",
      }),
    );
    await expectConstraintFailure(
      insertPendingProposal({
        id: "proposal-video-duplicate",
        userId: "member-2",
        idempotencyKey: "request-2",
      }),
    );

    await insertReviewedProposal({
      id: "proposal-rejected-same-video",
      userId: "member-2",
      idempotencyKey: "request-3",
      videoId: "AbCdEf123_-",
      status: "rejected",
    });
    await insertPendingProposal({
      id: "proposal-other-user",
      userId: "member-2",
      idempotencyKey: "request-1",
      videoId: "QwErTy456_-",
    });

    const statuses = await db
      .prepare(
        `SELECT id, status
         FROM music_cover_proposals
         WHERE youtube_video_id = 'AbCdEf123_-'
         ORDER BY id`,
      )
      .all<{ id: string; status: string }>();
    expect(statuses.results).toEqual([
      { id: "proposal-1", status: "pending_review" },
      { id: "proposal-rejected-same-video", status: "rejected" },
    ]);
  });

  it("keeps member ownership in the query predicate and proposal status separate from publication", async () => {
    await insertFoundationGraph("published");
    await insertReviewedProposal({
      id: "proposal-rejected",
      userId: "member-1",
      idempotencyKey: "request-rejected",
      status: "rejected",
    });

    const ownerRead = await db
      .prepare(
        `SELECT id, status
         FROM music_cover_proposals
         WHERE id = ? AND submitted_by_user_id = ?`,
      )
      .bind("proposal-rejected", "member-1")
      .first<{ id: string; status: string }>();
    const otherMemberRead = await db
      .prepare(
        `SELECT id
         FROM music_cover_proposals
         WHERE id = ? AND submitted_by_user_id = ?`,
      )
      .bind("proposal-rejected", "member-2")
      .first<{ id: string }>();
    const independentState = await db
      .prepare(
        `SELECT proposal.status AS proposal_status,
                performance.publication_status
         FROM music_cover_proposals AS proposal
         CROSS JOIN music_performances AS performance
         WHERE proposal.id = 'proposal-rejected'
           AND performance.id = 'performance-1'`,
      )
      .first<{
        proposal_status: string;
        publication_status: string;
      }>();

    expect(ownerRead).toEqual({
      id: "proposal-rejected",
      status: "rejected",
    });
    expect(otherMemberRead).toBeNull();
    expect(independentState).toEqual({
      proposal_status: "rejected",
      publication_status: "published",
    });
  });

  it("enforces proposal lock pairs, review outcomes, status values, and integer fields", async () => {
    await insertFoundationGraph();
    await insertPendingProposal({
      id: "proposal-lock",
      userId: "member-1",
      idempotencyKey: "request-lock",
    });
    await db
      .prepare(
        `UPDATE music_cover_proposals
         SET review_lock_token = 'lock-1', review_lock_expires_at = ?
         WHERE id = 'proposal-lock'`,
      )
      .bind(NOW + 60_000)
      .run();

    await expectConstraintFailure(
      db
        .prepare(
          `UPDATE music_cover_proposals
           SET submitted_note = '   '
           WHERE id = 'proposal-lock'`,
        )
        .run(),
    );

    await expectConstraintFailure(
      db
        .prepare(
          `UPDATE music_cover_proposals
           SET review_lock_expires_at = NULL
           WHERE id = 'proposal-lock'`,
        )
        .run(),
    );
    await expectConstraintFailure(
      db
        .prepare(
          `UPDATE music_cover_proposals
           SET status = 'rejected', reviewed_by_user_id = 'admin-1',
               reviewed_at = ?, review_result_code = 'duplicate'
           WHERE id = 'proposal-lock'`,
        )
        .bind(NOW)
        .run(),
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_cover_proposals (
             id, submitted_by_user_id, idempotency_key, submitted_url,
             youtube_video_id, segment_start_seconds, submitted_title,
             status, version, created_at, updated_at
           ) VALUES ('proposal-invalid-status', 'member-1', 'invalid-status',
                     'https://youtu.be/QwErTy456_-', 'QwErTy456_-', 0,
                     'Invalid', 'published', 0, ?, ?)`,
        )
        .bind(NOW, NOW)
        .run(),
    );
    await expectConstraintFailure(
      insertPendingProposal({
        id: "proposal-fractional",
        userId: "member-1",
        idempotencyKey: "fractional",
        videoId: "QwErTy456_-",
        segmentStart: 0.5,
      }),
    );

    await db
      .prepare(
        `UPDATE music_cover_proposals
         SET review_lock_token = NULL, review_lock_expires_at = NULL
         WHERE id = 'proposal-lock'`,
      )
      .run();
    await insertReviewedProposal({
      id: "proposal-approved",
      userId: "member-2",
      idempotencyKey: "request-approved",
      videoId: "QwErTy456_-",
      status: "approved",
      approvedPerformanceId: "performance-1",
    });
    await insertWithdrawnProposal(
      "proposal-withdrawn",
      "member-3",
      "request-withdrawn",
      "MnOpQr789_-",
    );
    await expectConstraintFailure(
      insertReviewedProposal({
        id: "proposal-approved-duplicate",
        userId: "member-4",
        idempotencyKey: "request-approved-duplicate",
        videoId: "LmNoPq321_-",
        status: "approved",
        approvedPerformanceId: "performance-1",
      }),
    );

    const reviewed = await db
      .prepare(
        `SELECT status, reviewed_by_user_id, reviewed_at,
                approved_performance_id, review_lock_token
         FROM music_cover_proposals
         WHERE id = 'proposal-approved'`,
      )
      .first();
    expect(reviewed).toEqual({
      status: "approved",
      reviewed_by_user_id: "admin-1",
      reviewed_at: NOW,
      approved_performance_id: "performance-1",
      review_lock_token: null,
    });
    expect(
      await db
        .prepare(
          `SELECT status, reviewed_by_user_id, approved_performance_id
           FROM music_cover_proposals
           WHERE id = 'proposal-withdrawn'`,
        )
        .first(),
    ).toEqual({
      status: "withdrawn",
      reviewed_by_user_id: null,
      approved_performance_id: null,
    });
  });

  it("applies proposal SET NULL, RESTRICT, and child CASCADE policies", async () => {
    await insertFoundationGraph();
    await db
      .prepare(
        `INSERT INTO music_songs (
           id, slug, title, normalized_title, dedupe_key, is_otw_original,
           original_release_date, original_release_precision, version,
           created_at, updated_at
         ) VALUES ('song-suggested', 'suggested-song', 'Suggested Song',
                   'suggested song', 'song-dedupe-suggested', 0, NULL,
                   'unknown', 0, ?, ?)`,
      )
      .bind(NOW, NOW)
      .run();
    await insertPendingProposal({
      id: "proposal-fks",
      userId: "member-1",
      idempotencyKey: "request-fks",
      suggestedSongId: "song-suggested",
    });
    await db.batch([
      db.prepare(
        `INSERT INTO music_cover_proposal_participants (
           proposal_id, credit_order, resolved_entity_id,
           submitted_name_snapshot, participant_role
         ) VALUES ('proposal-fks', 0, 'entity-1', 'OTW Member', 'vocal')`,
      ),
      db.prepare(
        `INSERT INTO music_cover_proposal_original_artists (
           proposal_id, credit_order, resolved_entity_id,
           submitted_name_snapshot
         ) VALUES ('proposal-fks', 0, 'entity-1', 'OTW Member')`,
      ),
    ]);

    await db.prepare("DELETE FROM music_songs WHERE id = 'song-suggested'").run();
    expect(
      await db
        .prepare(
          "SELECT suggested_song_id FROM music_cover_proposals WHERE id = 'proposal-fks'",
        )
        .first(),
    ).toEqual({ suggested_song_id: null });
    await expectConstraintFailure(
      db.prepare("DELETE FROM music_entities WHERE id = 'entity-1'").run(),
    );

    await db
      .prepare("DELETE FROM music_cover_proposals WHERE id = 'proposal-fks'")
      .run();
    const children = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM music_cover_proposal_participants) AS participants,
           (SELECT COUNT(*) FROM music_cover_proposal_original_artists) AS artists`,
      )
      .first<{ participants: number; artists: number }>();
    expect(children).toEqual({ participants: 0, artists: 0 });

    await insertReviewedProposal({
      id: "proposal-approved-fk",
      userId: "member-2",
      idempotencyKey: "request-approved-fk",
      videoId: "QwErTy456_-",
      status: "approved",
      approvedPerformanceId: "performance-1",
    });
    await expectConstraintFailure(
      db.prepare("DELETE FROM music_performances WHERE id = 'performance-1'").run(),
    );
  });

  it("validates event actors and JSON objects while preserving rejected authority rows", async () => {
    await insertReviewedProposal({
      id: "proposal-rejected-event",
      userId: "member-1",
      idempotencyKey: "request-event",
      status: "rejected",
    });
    await insertCatalogEvent("event-1", "proposal-rejected-event");

    await expectConstraintFailure(
      insertCatalogEvent("event-system-user", "proposal-rejected-event", "system", "admin-1"),
    );
    await expectConstraintFailure(
      insertCatalogEvent("event-admin-no-user", "proposal-rejected-event", "admin", null),
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_catalog_events (
             id, aggregate_type, aggregate_id, event_type, actor_kind,
             actor_user_id, after_json, created_at
           ) VALUES ('event-array-json', 'cover_proposal',
                     'proposal-rejected-event', 'proposal.rejected',
                     'system', NULL, '[]', ?)`,
        )
        .bind(NOW)
        .run(),
    );

    const authority = await db
      .prepare(
        `SELECT proposal.status, event.actor_kind, event.actor_user_id,
                event.before_json, event.after_json, event.detail_json
         FROM music_cover_proposals AS proposal
         JOIN music_catalog_events AS event
           ON event.aggregate_id = proposal.id
         WHERE proposal.id = 'proposal-rejected-event'`,
      )
      .first();
    expect(authority).toEqual({
      status: "rejected",
      actor_kind: "admin",
      actor_user_id: "admin-1",
      before_json: '{"status":"pending_review"}',
      after_json: '{"status":"rejected"}',
      detail_json: '{"resultCode":"duplicate"}',
    });
  });

  it("enforces search projection enum, composite identity, cascade, and BINARY GLOB prefix index", async () => {
    await insertFoundationGraph();
    await db
      .prepare(
        `INSERT INTO music_search_terms (
           song_id, term_kind, display_value, normalized_term
         ) VALUES ('song-1', 'title', 'Catalog Song', 'catalog song')`,
      )
      .run();

    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_search_terms (
             song_id, term_kind, display_value, normalized_term
           ) VALUES ('song-1', 'title', 'Other Display', 'catalog song')`,
        )
        .run(),
    );
    await db
      .prepare(
        `INSERT INTO music_search_terms (
           song_id, term_kind, display_value, normalized_term
         ) VALUES ('song-1', 'title_alias', 'Catalog Song Alias', 'catalog song')`,
      )
      .run();
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_search_terms (
             song_id, term_kind, display_value, normalized_term
           ) VALUES ('song-1', 'channel', 'Channel', 'channel')`,
        )
        .run(),
    );
    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_search_terms (
             song_id, term_kind, display_value, normalized_term
           ) VALUES ('song-1', 'participant', '   ', 'participant')`,
        )
        .run(),
    );

    const queryPlan = await db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT song_id, term_kind, display_value
         FROM music_search_terms
         WHERE normalized_term GLOB ?
         ORDER BY normalized_term, term_kind, song_id`,
      )
      .bind("catalog*")
      .all<{ detail: string }>();
    expect(queryPlan.results.map(({ detail }) => detail).join("\n")).toMatch(
      /SEARCH music_search_terms USING INDEX idx_music_search_terms_normalized_kind_song/i,
    );
    const exactMatches = await db
      .prepare(
        `SELECT song_id, term_kind
         FROM music_search_terms
         WHERE normalized_term = 'catalog song' AND term_kind = 'title'`,
      )
      .all<{ song_id: string; term_kind: string }>();
    expect(exactMatches.results).toEqual([
      { song_id: "song-1", term_kind: "title" },
    ]);
    const searchIndexColumns = await db
      .prepare(
        "PRAGMA index_xinfo(idx_music_search_terms_normalized_kind_song)",
      )
      .all<{ coll: string; key: number }>();
    expect(
      searchIndexColumns.results
        .filter(({ key }) => Number(key) === 1)
        .map(({ coll }) => coll),
    ).toEqual(["BINARY", "BINARY", "BINARY"]);

    await db.prepare("DELETE FROM music_performances").run();
    await db.prepare("DELETE FROM music_songs WHERE id = 'song-1'").run();
    expect(
      await db
        .prepare("SELECT COUNT(*) AS total FROM music_search_terms")
        .first<{ total: number }>(),
    ).toEqual({ total: 0 });
  });

  it("seeds exactly one strict fail-closed meta row and supports CAS revision increments", async () => {
    expect(migratedCatalogMeta).toEqual({
      id: 1,
      revision: 0,
      public_read_enabled: 0,
      navigation_visible: 0,
      updated_at: 0,
    });
    const initial = await db
      .prepare(
        `SELECT id, revision, public_read_enabled, navigation_visible,
                updated_at, typeof(id) AS id_type,
                typeof(revision) AS revision_type,
                typeof(public_read_enabled) AS public_type,
                typeof(navigation_visible) AS navigation_type,
                typeof(updated_at) AS updated_type
         FROM music_catalog_meta`,
      )
      .first();
    expect(initial).toEqual({
      id: 1,
      revision: 0,
      public_read_enabled: 0,
      navigation_visible: 0,
      updated_at: 0,
      id_type: "integer",
      revision_type: "integer",
      public_type: "integer",
      navigation_type: "integer",
      updated_type: "integer",
    });

    await expectConstraintFailure(
      db
        .prepare(
          `INSERT INTO music_catalog_meta (
             id, revision, public_read_enabled, navigation_visible, updated_at
           ) VALUES (2, 0, 0, 0, 0)`,
        )
        .run(),
    );
    await expectConstraintFailure(
      db.prepare("UPDATE music_catalog_meta SET revision = 0.5").run(),
    );
    await expectConstraintFailure(
      db
        .prepare("UPDATE music_catalog_meta SET public_read_enabled = 2")
        .run(),
    );
    await expectConstraintFailure(
      db.prepare("UPDATE music_catalog_meta SET updated_at = 0.5").run(),
    );
    await expectConstraintFailure(
      db.prepare("UPDATE music_catalog_meta SET navigation_visible = 1").run(),
    );

    const increment = await db
      .prepare(
        `UPDATE music_catalog_meta
         SET revision = revision + 1, updated_at = ?
         WHERE id = 1 AND revision = ?`,
      )
      .bind(NOW, 0)
      .run();
    const staleIncrement = await db
      .prepare(
        `UPDATE music_catalog_meta
         SET revision = revision + 1, updated_at = ?
         WHERE id = 1 AND revision = ?`,
      )
      .bind(NOW + 1, 0)
      .run();
    await db
      .prepare(
        `UPDATE music_catalog_meta
         SET public_read_enabled = 1, navigation_visible = 1
         WHERE id = 1`,
      )
      .run();

    expect(increment.meta.changes).toBe(1);
    expect(staleIncrement.meta.changes).toBe(0);
    expect(
      await db
        .prepare(
          `SELECT COUNT(*) AS total, revision, public_read_enabled,
                  navigation_visible, updated_at
           FROM music_catalog_meta`,
        )
        .first(),
    ).toEqual({
      total: 1,
      revision: 1,
      public_read_enabled: 1,
      navigation_visible: 1,
      updated_at: NOW,
    });
  });

  it("defines all published partial indexes and uses them for literal published queries", async () => {
    await insertFoundationGraph("published");

    for (const [indexName, expectedColumns] of Object.entries(
      PUBLISHED_INDEXES,
    )) {
      const definition = await db
        .prepare(
          `SELECT sql
           FROM sqlite_master
           WHERE type = 'index' AND name = ?`,
        )
        .bind(indexName)
        .first<{ sql: string }>();
      const columns = await db
        .prepare(`PRAGMA index_xinfo(${indexName})`)
        .all<{ name: string | null; desc: number; key: number }>();
      const keyColumns = columns.results.filter(
        (column): column is { name: string; desc: number; key: number } =>
          Number(column.key) === 1 && column.name !== null,
      );

      expect(keyColumns.map(({ name }) => name)).toEqual(expectedColumns);
      expect(keyColumns.map(({ desc }) => Number(desc))).toEqual(
        PUBLISHED_INDEX_DIRECTIONS[
          indexName as keyof typeof PUBLISHED_INDEX_DIRECTIONS
        ],
      );
      expect(normalizeSql(definition?.sql ?? "")).toContain(
        "WHERE music_performances.publication_status = 'published'",
      );
    }

    await db
      .prepare(
        `INSERT INTO music_performances (
           id, song_id, dedupe_key, relation_type, release_type,
           participation_type, publication_status, quality_status,
           released_at, version, created_at, updated_at
         ) VALUES ('performance-draft', 'song-1', 'performance-dedupe-draft',
                   'cover', 'official_video', 'solo', 'draft', 'ok', ?, 0, ?, ?)`,
      )
      .bind(NOW - 1, NOW, NOW)
      .run();
    expect(
      (
        await db
          .prepare(
            `SELECT id FROM music_performances
             WHERE publication_status = 'published'
             ORDER BY released_at DESC, id`,
          )
          .all<{ id: string }>()
      ).results,
    ).toEqual([{ id: "performance-1" }]);

    const queries = [
      {
        index: "idx_music_performances_published_released_id",
        sql: `SELECT id FROM music_performances
              WHERE publication_status = 'published'
              ORDER BY released_at DESC, id LIMIT 20`,
      },
      {
        index: "idx_music_performances_published_song_released_id",
        sql: `SELECT id FROM music_performances
              WHERE publication_status = 'published' AND song_id = 'song-1'
              ORDER BY released_at DESC, id LIMIT 20`,
      },
      {
        index: "idx_music_performances_published_relation_released_id",
        sql: `SELECT id FROM music_performances
              WHERE publication_status = 'published' AND relation_type = 'cover'
              ORDER BY released_at DESC, id LIMIT 20`,
      },
    ];

    for (const query of queries) {
      const plan = await db
        .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
        .all<{ detail: string }>();
      expect(plan.results.map(({ detail }) => detail).join("\n")).toContain(
        query.index,
      );
    }

    const draftPlan = await db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT id FROM music_performances
         WHERE publication_status = 'draft'
         ORDER BY released_at DESC, id LIMIT 20`,
      )
      .all<{ detail: string }>();
    const draftDetails = draftPlan.results.map(({ detail }) => detail).join("\n");
    for (const indexName of Object.keys(PUBLISHED_INDEXES)) {
      expect(draftDetails).not.toContain(indexName);
    }
  });

  it("preserves the migration-owned meta row through the actual fixture music cleanup", async () => {
    await insertFoundationGraph();
    await insertPendingProposal({
      id: "proposal-fixture",
      userId: "member-1",
      idempotencyKey: "request-fixture",
      suggestedSongId: "song-1",
    });
    await db.batch([
      db.prepare(
        `INSERT INTO music_cover_proposal_participants (
           proposal_id, credit_order, resolved_entity_id,
           submitted_name_snapshot, participant_role
         ) VALUES ('proposal-fixture', 0, 'entity-1', 'OTW Member', 'vocal')`,
      ),
      db.prepare(
        `INSERT INTO music_search_terms (
           song_id, term_kind, display_value, normalized_term
         ) VALUES ('song-1', 'title', 'Catalog Song', 'catalog song')`,
      ),
      db.prepare(
        `UPDATE music_catalog_meta
         SET revision = 9, public_read_enabled = 1,
             navigation_visible = 1, updated_at = ?
         WHERE id = 1`,
      ).bind(NOW),
    ]);
    await insertCatalogEvent("event-fixture", "proposal-fixture", "system", null);

    const nonMusicDeleteIndex = localD1SeedSql.indexOf(
      "DELETE FROM member_links;",
    );
    expect(nonMusicDeleteIndex).toBeGreaterThan(0);
    const musicCleanupStatements = localD1SeedSql
      .slice(0, nonMusicDeleteIndex)
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    await db.batch(musicCleanupStatements.map((statement) => db.prepare(statement)));

    const remaining = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM music_cover_proposals) AS proposals,
           (SELECT COUNT(*) FROM music_catalog_events) AS events,
           (SELECT COUNT(*) FROM music_search_terms) AS search_terms,
           (SELECT COUNT(*) FROM music_songs) AS songs,
           (SELECT COUNT(*) FROM music_performances) AS performances`,
      )
      .first();
    const meta = await db
      .prepare(
        `SELECT id, revision, public_read_enabled, navigation_visible, updated_at
         FROM music_catalog_meta`,
      )
      .first();

    expect(remaining).toEqual({
      proposals: 0,
      events: 0,
      search_terms: 0,
      songs: 0,
      performances: 0,
    });
    expect(meta).toEqual({
      id: 1,
      revision: 9,
      public_read_enabled: 1,
      navigation_visible: 1,
      updated_at: NOW,
    });
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
      [],
    );
  });
});
