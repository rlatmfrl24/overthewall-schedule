import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const db = env.otw_db;
const testEnv = env as typeof env & {
  OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[];
  OTW_PLAY_EXTERNAL_IDENTITY_CONSOLIDATION_MIGRATIONS: D1Migration[];
};

const NOW = 1_787_870_000_000;
const CANONICAL_ID = "entity-external-canonical";
const DUPLICATE_ID = "entity-external-duplicate";

const seedDuplicateIdentityGraph = async () => {
  await db.batch([
    db.prepare(
      `INSERT INTO music_entities (
         id, member_uid, entity_kind, display_name, normalized_name, slug,
         version, created_at, updated_at
       ) VALUES (?, NULL, 'person', 'Duplicate Artist', 'duplicate artist',
                 'duplicate-artist-canonical', 0, ?, ?)`,
    ).bind(CANONICAL_ID, NOW, NOW),
    db.prepare(
      `INSERT INTO music_entities (
         id, member_uid, entity_kind, display_name, normalized_name, slug,
         version, created_at, updated_at
       ) VALUES (?, NULL, 'person', 'Duplicate Artist', 'duplicate artist',
                 'duplicate-artist-later', 0, ?, ?)`,
    ).bind(DUPLICATE_ID, NOW + 1_000, NOW + 1_000),
    db.prepare(
      `INSERT INTO music_entity_aliases
         (entity_id, alias, normalized_alias, locale, alias_kind)
       VALUES (?, 'Duplicate Alias', 'duplicate alias', 'en', 'alternate')`,
    ).bind(DUPLICATE_ID),
    db.prepare(
      `INSERT INTO music_songs (
         id, slug, title, normalized_title, dedupe_key, is_otw_original,
         original_release_precision, version, created_at, updated_at
       ) VALUES ('song-shared', 'song-shared', 'Shared Song', 'shared song',
                 'song:shared', 0, 'unknown', 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_songs (
         id, slug, title, normalized_title, dedupe_key, is_otw_original,
         original_release_precision, version, created_at, updated_at
       ) VALUES ('song-duplicate-only', 'song-duplicate-only', 'Duplicate Song',
                 'duplicate song', 'song:duplicate-only', 0, 'unknown', 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_song_original_artists
         (song_id, entity_id, credit_order, is_primary)
       VALUES ('song-shared', ?, 0, 0)`,
    ).bind(CANONICAL_ID),
    db.prepare(
      `INSERT INTO music_song_original_artists
         (song_id, entity_id, credit_order, is_primary)
       VALUES ('song-shared', ?, 1, 1)`,
    ).bind(DUPLICATE_ID),
    db.prepare(
      `INSERT INTO music_song_original_artists
         (song_id, entity_id, credit_order, is_primary)
       VALUES ('song-duplicate-only', ?, 0, 1)`,
    ).bind(DUPLICATE_ID),
    db.prepare(
      `INSERT INTO music_performances (
         id, song_id, dedupe_key, relation_type, release_type,
         participation_type, publication_status, quality_status,
         version, created_at, updated_at
       ) VALUES ('performance-shared', 'song-shared', 'performance:shared',
                 'cover', 'official_video', 'duet', 'draft', 'ok', 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_performance_participants (
         performance_id, entity_id, participant_role, credit_order,
         credit_name_snapshot
       ) VALUES ('performance-shared', ?, 'vocal', 0, 'Duplicate Artist')`,
    ).bind(CANONICAL_ID),
    db.prepare(
      `INSERT INTO music_performance_participants (
         performance_id, entity_id, participant_role, credit_order,
         credit_name_snapshot
       ) VALUES ('performance-shared', ?, 'chorus', 1, 'Duplicate Artist')`,
    ).bind(DUPLICATE_ID),
    db.prepare(
      `INSERT INTO music_public_performance_sort_keys (
         performance_id, song_id, representative_participant_entity_id,
         normalized_participant
       ) VALUES ('performance-shared', 'song-shared', ?, 'duplicate artist')`,
    ).bind(DUPLICATE_ID),
    db.prepare(
      `INSERT INTO music_channels (
         id, provider, external_channel_id, display_name, channel_role,
         verification_status, active, version, created_at, updated_at
       ) VALUES ('channel-shared', 'youtube', 'UCAAAAAAAAAAAAAAAAAAAAAA',
                 'Shared Channel', 'project_official', 'approved', 1, 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_channel_entities (channel_id, entity_id)
       VALUES ('channel-shared', ?)`,
    ).bind(CANONICAL_ID),
    db.prepare(
      `INSERT INTO music_channel_entities (channel_id, entity_id)
       VALUES ('channel-shared', ?)`,
    ).bind(DUPLICATE_ID),
    db.prepare(
      `INSERT INTO music_cover_proposals (
         id, submitted_by_user_id, idempotency_key, submitted_url,
         youtube_video_id, segment_start_seconds, submitted_title,
         submitted_tags_json, status, version, created_at, updated_at
       ) VALUES ('proposal-shared', 'member-user', 'proposal-key',
                 'https://youtu.be/AbCdEf123_-', 'AbCdEf123_-', 0,
                 'Proposal', '[]', 'pending_review', 0, ?, ?)`,
    ).bind(NOW, NOW),
    db.prepare(
      `INSERT INTO music_cover_proposal_participants (
         proposal_id, credit_order, resolved_entity_id, submitted_member_uid,
         submitted_name_snapshot, participant_role
       ) VALUES ('proposal-shared', 0, ?, NULL, 'Duplicate Artist', 'vocal')`,
    ).bind(DUPLICATE_ID),
    db.prepare(
      `INSERT INTO music_cover_proposal_original_artists (
         proposal_id, credit_order, resolved_entity_id, submitted_member_uid,
         submitted_name_snapshot
       ) VALUES ('proposal-shared', 0, ?, NULL, 'Duplicate Artist')`,
    ).bind(DUPLICATE_ID),
    db.prepare(
      `INSERT INTO music_ingestion_candidates (
         id, provider, external_video_id, candidate_kind, status,
         classification, availability_status, review_input_json,
         first_discovered_at, last_discovered_at, retention_expires_at,
         version, created_at, updated_at
       ) VALUES ('candidate-shared', 'youtube', 'ZyXwVu987_-',
                 'official_video', 'ready', 'eligible', 'playable', ?,
                 ?, ?, ?, 0, ?, ?)`,
    ).bind(
      JSON.stringify({
        song: {
          kind: "create",
          originalArtists: [{
            subject: { kind: "entity", entityId: DUPLICATE_ID },
          }],
        },
        participants: [{
          subject: { kind: "entity", entityId: DUPLICATE_ID },
        }],
      }),
      NOW,
      NOW,
      NOW + 30 * 24 * 60 * 60 * 1_000,
      NOW,
      NOW,
    ),
  ]);
};

describe("OTW Play external identity consolidation migration", () => {
  beforeEach(async () => {
    await applyD1Migrations(
      db,
      testEnv.OTW_PLAY_INGESTION_MIGRATIONS,
      "otw_play_external_identity_pre_migrations",
    );
  });

  it("moves every live reference to the canonical identity before enforcing uniqueness", async () => {
    await seedDuplicateIdentityGraph();
    const revisionBefore = await db
      .prepare("SELECT revision FROM music_catalog_meta WHERE id = 1")
      .first<{ revision: number }>();

    await applyD1Migrations(
      db,
      testEnv.OTW_PLAY_EXTERNAL_IDENTITY_CONSOLIDATION_MIGRATIONS,
      "otw_play_external_identity_consolidation_migrations",
    );

    const entities = await db
      .prepare(
        `SELECT id, version
         FROM music_entities
         WHERE normalized_name = 'duplicate artist'
         ORDER BY id`,
      )
      .all<{ id: string; version: number }>();
    expect(entities.results).toEqual([{ id: CANONICAL_ID, version: 1 }]);

    const aliases = await db
      .prepare(
        `SELECT entity_id, normalized_alias
         FROM music_entity_aliases
         WHERE normalized_alias = 'duplicate alias'`,
      )
      .all<{ entity_id: string; normalized_alias: string }>();
    expect(aliases.results).toEqual([{
      entity_id: CANONICAL_ID,
      normalized_alias: "duplicate alias",
    }]);

    const artists = await db
      .prepare(
        `SELECT song_id, entity_id, is_primary
         FROM music_song_original_artists
         ORDER BY song_id, entity_id`,
      )
      .all<{ song_id: string; entity_id: string; is_primary: number }>();
    expect(artists.results).toEqual([
      {
        song_id: "song-duplicate-only",
        entity_id: CANONICAL_ID,
        is_primary: 1,
      },
      { song_id: "song-shared", entity_id: CANONICAL_ID, is_primary: 1 },
    ]);

    const participants = await db
      .prepare(
        `SELECT performance_id, entity_id
         FROM music_performance_participants
         ORDER BY performance_id, entity_id`,
      )
      .all<{ performance_id: string; entity_id: string }>();
    expect(participants.results).toEqual([{
      performance_id: "performance-shared",
      entity_id: CANONICAL_ID,
    }]);

    const channelOwners = await db
      .prepare("SELECT channel_id, entity_id FROM music_channel_entities")
      .all<{ channel_id: string; entity_id: string }>();
    expect(channelOwners.results).toEqual([{
      channel_id: "channel-shared",
      entity_id: CANONICAL_ID,
    }]);

    const sortKey = await db
      .prepare(
        `SELECT representative_participant_entity_id AS entity_id
         FROM music_public_performance_sort_keys
         WHERE performance_id = 'performance-shared'`,
      )
      .first<{ entity_id: string }>();
    expect(sortKey?.entity_id).toBe(CANONICAL_ID);

    const proposalReferences = await db
      .prepare(
        `SELECT
           (SELECT resolved_entity_id
            FROM music_cover_proposal_participants
            WHERE proposal_id = 'proposal-shared') AS participant_id,
           (SELECT resolved_entity_id
            FROM music_cover_proposal_original_artists
            WHERE proposal_id = 'proposal-shared') AS artist_id`,
      )
      .first<{ participant_id: string; artist_id: string }>();
    expect(proposalReferences).toEqual({
      participant_id: CANONICAL_ID,
      artist_id: CANONICAL_ID,
    });

    const candidate = await db
      .prepare(
        `SELECT review_input_json, version
         FROM music_ingestion_candidates
         WHERE id = 'candidate-shared'`,
      )
      .first<{ review_input_json: string; version: number }>();
    expect(candidate?.review_input_json).toContain(CANONICAL_ID);
    expect(candidate?.review_input_json).not.toContain(DUPLICATE_ID);
    expect(candidate?.version).toBe(1);

    const mergeEvent = await db
      .prepare(
        `SELECT aggregate_id, event_type, actor_kind
         FROM music_catalog_events
         WHERE event_type = 'entity.merged'`,
      )
      .first<{
        aggregate_id: string;
        event_type: string;
        actor_kind: string;
      }>();
    expect(mergeEvent).toEqual({
      aggregate_id: CANONICAL_ID,
      event_type: "entity.merged",
      actor_kind: "system",
    });

    const revisions = await db
      .prepare(
        `SELECT catalog.revision AS catalog_revision,
                public_model.revision AS read_model_revision
         FROM music_catalog_meta AS catalog
         JOIN music_public_read_model_meta AS public_model
           ON public_model.id = catalog.id
         WHERE catalog.id = 1`,
      )
      .first<{ catalog_revision: number; read_model_revision: number }>();
    expect(revisions).toEqual({
      catalog_revision: Number(revisionBefore?.revision) + 1,
      read_model_revision: Number(revisionBefore?.revision) + 1,
    });

    const indexes = await db
      .prepare("PRAGMA index_list(music_entities)")
      .all<{ name: string; unique: number; partial: number }>();
    expect(indexes.results).toContainEqual(expect.objectContaining({
      name: "uidx_music_entities_external_kind_normalized_name",
      unique: 1,
      partial: 1,
    }));

    await expect(
      db.prepare(
        `INSERT INTO music_entities (
           id, member_uid, entity_kind, display_name, normalized_name, slug,
           version, created_at, updated_at
         ) VALUES ('entity-external-third', NULL, 'person', 'Duplicate Artist',
                   'duplicate artist', 'duplicate-artist-third', 0, ?, ?)`,
      ).bind(NOW + 2_000, NOW + 2_000).run(),
    ).rejects.toThrow(/UNIQUE/i);

    const foreignKeyCheck = await db.prepare("PRAGMA foreign_key_check").all();
    expect(foreignKeyCheck.results).toEqual([]);
  });
});
