import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

type TestEnv = Env & { OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[] };

const testEnv = env as TestEnv;
const db = testEnv.otw_db;
const NOW = Date.UTC(2026, 7, 27, 6);

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_cover_proposal_participants WHERE proposal_id LIKE 'hardening-%'"),
    db.prepare("DELETE FROM music_cover_proposal_original_artists WHERE proposal_id LIKE 'hardening-%'"),
    db.prepare("DELETE FROM music_cover_proposals WHERE id LIKE 'hardening-%'"),
    db.prepare("DELETE FROM music_channel_upload_candidate_origins WHERE monitor_id LIKE 'hardening-%'"),
    db.prepare("DELETE FROM music_channel_websub_subscriptions WHERE monitor_id LIKE 'hardening-%'"),
    db.prepare("DELETE FROM music_channel_upload_monitors WHERE id LIKE 'hardening-%'"),
    db.prepare("DELETE FROM music_ingestion_candidates WHERE id LIKE 'hardening-%'"),
    db.prepare("DELETE FROM music_ingestion_jobs WHERE id LIKE 'hardening-%'"),
    db.prepare("DELETE FROM music_channels WHERE id LIKE 'hardening-%'"),
    db.prepare("DELETE FROM members WHERE uid = 999991"),
  ]);
});

const insertProposal = (id: string, tagsJson = "[]") => db.prepare(
  `INSERT INTO music_cover_proposals (
    id, submitted_by_user_id, idempotency_key, submitted_url,
    youtube_video_id, segment_start_seconds, submitted_title,
    submitted_tags_json, status, version, created_at, updated_at
  ) VALUES (?, 'member-test', ?, 'https://youtu.be/AAAAAAAAAAA',
    'AAAAAAAAAAA', 0, 'Snapshot Song', ?, 'pending_review', 0, ?, ?)`,
).bind(id, `request-${id}`, tagsJson, NOW, NOW).run();

const insertCandidate = (values: {
  id: string;
  madeForKids?: number | null;
  reviewInputJson?: string | null;
  conversionOutcome?: string | null;
  conversionError?: string | null;
  conversionAttemptAt?: number | null;
}) => db.prepare(
  `INSERT INTO music_ingestion_candidates (
    id, provider, external_video_id, candidate_kind, status, classification,
    availability_status, made_for_kids, review_input_json,
    last_conversion_outcome, last_conversion_error_code,
    last_conversion_attempt_at, first_discovered_at, last_discovered_at,
    retention_expires_at, version, created_at, updated_at
  ) VALUES (?, 'youtube', ?, 'official_video', 'discovered',
    'pending_metadata', 'unknown', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
).bind(
  values.id,
  values.id.slice(-11),
  values.madeForKids ?? null,
  values.reviewInputJson ?? null,
  values.conversionOutcome ?? null,
  values.conversionError ?? null,
  values.conversionAttemptAt ?? null,
  NOW,
  NOW,
  NOW + 30 * 86_400_000,
  NOW,
  NOW,
).run();

describe("OTW Play architecture hardening migrations", () => {
  it("uses SET NULL for proposal member snapshots and preserves the names", async () => {
    for (const tableName of [
      "music_cover_proposal_participants",
      "music_cover_proposal_original_artists",
    ]) {
      const foreignKeys = await db.prepare(`PRAGMA foreign_key_list(${tableName})`).all<{
        from: string;
        on_delete: string;
      }>();
      expect(foreignKeys.results.find(({ from }) => from === "submitted_member_uid"))
        .toMatchObject({ on_delete: "SET NULL" });
    }

    await db.prepare(
      "INSERT INTO members (uid, code, name, is_deprecated) VALUES (999991, 'hardening-member', 'Snapshot Member', 0)",
    ).run();
    await insertProposal("hardening-snapshot");
    await db.batch([
      db.prepare(
        `INSERT INTO music_cover_proposal_participants (
          proposal_id, credit_order, submitted_member_uid,
          submitted_name_snapshot, participant_role
        ) VALUES ('hardening-snapshot', 0, 999991, 'Participant Snapshot', 'vocal')`,
      ),
      db.prepare(
        `INSERT INTO music_cover_proposal_original_artists (
          proposal_id, credit_order, submitted_member_uid, submitted_name_snapshot
        ) VALUES ('hardening-snapshot', 0, 999991, 'Artist Snapshot')`,
      ),
    ]);

    await db.prepare("DELETE FROM members WHERE uid = 999991").run();
    await expect(db.prepare(
      `SELECT submitted_member_uid, submitted_name_snapshot
       FROM music_cover_proposal_participants
       WHERE proposal_id = 'hardening-snapshot'`,
    ).first()).resolves.toMatchObject({
      submitted_member_uid: null,
      submitted_name_snapshot: "Participant Snapshot",
    });
    await expect(db.prepare(
      `SELECT submitted_member_uid, submitted_name_snapshot
       FROM music_cover_proposal_original_artists
       WHERE proposal_id = 'hardening-snapshot'`,
    ).first()).resolves.toMatchObject({
      submitted_member_uid: null,
      submitted_name_snapshot: "Artist Snapshot",
    });
  });

  it("rejects invalid JSON, conversion, boolean, range, and generation inserts", async () => {
    await expect(insertProposal("hardening-invalid-tags", "{}"))
      .rejects.toThrow();
    await expect(insertCandidate({
      id: "hardening:AAAAAAAAAAA",
      reviewInputJson: "[]",
    })).rejects.toThrow();
    await expect(insertCandidate({
      id: "hardening:BBBBBBBBBBB",
      madeForKids: 2,
    })).rejects.toThrow();
    await expect(insertCandidate({
      id: "hardening:CCCCCCCCCCC",
      conversionOutcome: "unknown",
      conversionAttemptAt: NOW,
    })).rejects.toThrow();
    await expect(db.prepare(
      `INSERT INTO music_ingestion_jobs (
        id, source_kind, source_external_id, source_url, source_title,
        owner_channel_id, owner_channel_title, source_metadata_checked_at,
        import_mode, range_start_position, requested_item_count, status,
        actor_user_id, idempotency_key, created_at, updated_at
      ) VALUES ('hardening-job', 'playlist_import', 'PLhardening',
        'https://youtube.com/playlist?list=PLhardening', 'Hardening',
        'UChardening', 'Hardening', ?, 'all_new', 0.5, 1, 'queued',
        'admin-test', 'hardening-job-request', ?, ?)`,
    ).bind(NOW, NOW, NOW).run()).rejects.toThrow();

    await db.prepare(
      `INSERT INTO music_channels (
        id, provider, external_channel_id, display_name, channel_role,
        verification_status, active, version, created_at, updated_at
      ) VALUES ('hardening-channel', 'youtube', 'UChhhhhhhhhhhhhhhhhhhhhh',
        'Hardening Channel', 'approved_kirinuki', 'approved', 1, 0, ?, ?)`,
    ).bind(NOW, NOW).run();
    await expect(db.prepare(
      `INSERT INTO music_channel_upload_monitors (
        id, channel_id, uploads_playlist_id, status, check_interval_minutes,
        next_check_at, generation, created_by_user_id, version, created_at, updated_at
      ) VALUES ('hardening-monitor', 'hardening-channel',
        'UUhhhhhhhhhhhhhhhhhhhhhh', 'active', 360, ?, 0.5,
        'admin-test', 0, ?, ?)`,
    ).bind(NOW, NOW, NOW).run()).rejects.toThrow();

    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
});
