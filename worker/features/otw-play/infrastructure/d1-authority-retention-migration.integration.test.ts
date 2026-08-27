import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { describe, expect, it } from "vitest";

type TestEnv = Env & {
  OTW_PLAY_PRE_HARDENING_MIGRATIONS: D1Migration[];
  OTW_PLAY_HARDENING_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;
const db = testEnv.otw_db;

describe("OTW Play authority and retention migration", () => {
  it("repairs false-active subscriptions and preserves valid authority", async () => {
    await applyD1Migrations(db, testEnv.OTW_PLAY_PRE_HARDENING_MIGRATIONS);
    const now = Date.now();
    await db.prepare(
      `INSERT INTO music_channels (
        id, provider, external_channel_id, display_name, channel_role,
        verification_status, active, version, created_at, updated_at
      ) VALUES ('migration-channel', 'youtube', 'UCmmmmmmmmmmmmmmmmmmmmmm',
        'Migration Channel', 'approved_kirinuki', 'approved', 1, 0, ?, ?)`,
    ).bind(now, now).run();
    await db.prepare(
      `INSERT INTO music_channel_upload_monitors (
        id, channel_id, uploads_playlist_id, status, check_interval_minutes,
        next_check_at, generation, created_by_user_id, version, created_at, updated_at
      ) VALUES ('migration-monitor', 'migration-channel',
        'UUmmmmmmmmmmmmmmmmmmmmmm', 'active', 360, ?, 0,
        'admin-test', 0, ?, ?)`,
    ).bind(now, now, now).run();
    const topic = "https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCmmmmmmmmmmmmmmmmmmmmmm";
    await db.prepare(
      `INSERT INTO music_channel_websub_subscriptions (
        id, monitor_id, monitor_generation, topic_url, callback_token_hash,
        secret_version, status, pending_mode, requested_at, verified_at,
        lease_expires_at, version, created_at, updated_at
      ) VALUES
        ('migration-null', 'migration-monitor', 0, ?, ?, 1, 'active', NULL, ?, NULL, NULL, 0, ?, ?),
        ('migration-expired', 'migration-monitor', 1, ?, ?, 1, 'active', NULL, ?, ?, ?, 0, ?, ?),
        ('migration-valid', 'migration-monitor', 2, ?, ?, 1, 'active', NULL, ?, ?, ?, 0, ?, ?)`,
    ).bind(
      topic, "a".repeat(64), now, now, now,
      topic, "b".repeat(64), 0, 0, 1, now, now,
      topic, "c".repeat(64), now, now, now + 86_400_000, now, now,
    ).run();
    await db.prepare(
      `INSERT INTO music_channel_websub_deliveries (
        id, subscription_id, monitor_id, monitor_generation,
        external_channel_id, external_video_id, provider_updated_at,
        status, attempt_count, received_at, updated_at
      ) VALUES ('migration-delivery', 'migration-valid', 'migration-monitor', 2,
        'UCmmmmmmmmmmmmmmmmmmmmmm', 'BBBBBBBBBBB', ?, 'pending', 0, ?, ?)`,
    ).bind(now, now, now).run();
    await db.prepare(
      `INSERT INTO music_ingestion_jobs (
        id, source_kind, source_external_id, source_url, source_title,
        owner_channel_id, owner_channel_title, import_mode,
        range_start_position, requested_item_count, status,
        actor_user_id, idempotency_key, created_at, updated_at
      ) VALUES ('migration-job', 'playlist_import', 'PLmigration',
        'https://youtube.com/playlist?list=PLmigration', 'Migration Playlist',
        'UCmigration', 'Migration Owner', 'all_new', 0, 1, 'queued',
        'admin-test', 'migration-job-request', ?, ?)`,
    ).bind(now, now).run();
    await db.prepare(
      `INSERT INTO music_ingestion_events (
        id, job_id, candidate_id, event_type, actor_user_id, detail_json, created_at
      ) VALUES ('migration-job-event', 'migration-job', NULL,
        'play.ingestion.job.created', 'admin-test', '{}', ?)`,
    ).bind(now).run();

    await applyD1Migrations(db, [testEnv.OTW_PLAY_HARDENING_MIGRATIONS[0]!]);

    const subscriptions = await db.prepare(
      `SELECT id, status, last_error_code
       FROM music_channel_websub_subscriptions ORDER BY id`,
    ).all<{ id: string; status: string; last_error_code: string | null }>();
    expect(subscriptions.results).toEqual([
      {
        id: "migration-expired",
        status: "failed",
        last_error_code: "migration_invalid_active_subscription",
      },
      {
        id: "migration-null",
        status: "failed",
        last_error_code: "migration_invalid_active_subscription",
      },
      { id: "migration-valid", status: "active", last_error_code: null },
    ]);
    expect(await db.prepare(
      "SELECT subscription_id, status FROM music_channel_websub_deliveries WHERE id = 'migration-delivery'",
    ).first()).toEqual({ subscription_id: "migration-valid", status: "pending" });
    expect(await db.prepare(
      "SELECT job_id, event_type FROM music_ingestion_events WHERE id = 'migration-job-event'",
    ).first()).toEqual({
      job_id: "migration-job",
      event_type: "play.ingestion.job.created",
    });
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);

    await applyD1Migrations(db, [testEnv.OTW_PLAY_HARDENING_MIGRATIONS[1]!]);
    await expect(db.prepare(
      `INSERT INTO music_channel_websub_subscriptions (
        id, monitor_id, monitor_generation, topic_url, callback_token_hash,
        secret_version, status, pending_mode, requested_at, version, created_at, updated_at
      ) VALUES ('migration-invalid-active', 'migration-monitor', 3, ?, ?, 1,
        'active', NULL, ?, 0, ?, ?)`,
    ).bind(topic, "d".repeat(64), now, now, now).run()).rejects.toThrow();

    const job = await db.prepare(
      `SELECT source_title, owner_channel_title, source_metadata_checked_at
       FROM music_ingestion_jobs WHERE id = 'migration-job'`,
    ).first<{
      source_title: string | null;
      owner_channel_title: string | null;
      source_metadata_checked_at: number | null;
    }>();
    expect(job).toEqual({
      source_title: "Migration Playlist",
      owner_channel_title: "Migration Owner",
      source_metadata_checked_at: now,
    });
    await db.prepare(
      `UPDATE music_ingestion_jobs
       SET source_title = NULL, owner_channel_title = NULL,
         source_metadata_checked_at = NULL
       WHERE id = 'migration-job'`,
    ).run();
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
});
