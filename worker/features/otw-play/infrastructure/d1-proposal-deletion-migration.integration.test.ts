import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { expect, it } from "vitest";

it("preserves approved proposals and their credits when adding deletion snapshots", async () => {
  const testEnv = env as Env & { OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[] };
  const db = testEnv.otw_db;
  const name = "0094_reflective_spirit.sql";
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS.filter(m => m.name < name));
  await db.batch([
    db.prepare(`INSERT INTO music_songs (id, slug, title, normalized_title, dedupe_key, is_otw_original, created_at, updated_at)
      VALUES ('song', 'song', 'Song', 'song', 'song', 0, 1, 1)`),
    db.prepare(`INSERT INTO music_performances (id, song_id, dedupe_key, relation_type, release_type, participation_type, created_at, updated_at)
      VALUES ('performance', 'song', 'performance', 'cover', 'official_video', 'solo', 1, 1)`),
    db.prepare(`INSERT INTO music_cover_proposals (id, submitted_by_user_id, idempotency_key, submitted_url, youtube_video_id, submitted_title,
      status, reviewed_by_user_id, reviewed_at, approved_performance_id, created_at, updated_at)
      VALUES ('proposal', 'user', 'request', 'https://youtu.be/AAAAAAAAAAA', 'AAAAAAAAAAA', 'Song', 'approved', 'admin', 1, 'performance', 1, 1)`),
    db.prepare(`INSERT INTO music_cover_proposal_participants (proposal_id, credit_order, submitted_name_snapshot, participant_role)
      VALUES ('proposal', 0, 'Singer', 'vocal')`),
    db.prepare(`INSERT INTO music_cover_proposal_original_artists (proposal_id, credit_order, submitted_name_snapshot)
      VALUES ('proposal', 0, 'Artist')`),
  ]);
  const tables = ["music_cover_proposals", "music_cover_proposal_participants", "music_cover_proposal_original_artists"];
  const before = await Promise.all(tables.map(table => db.prepare(`SELECT * FROM ${table}`).all()));
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS.filter(m => m.name === name));
  for (const [index, table] of tables.entries()) {
    const expected = before[index]!.results.map(row => index === 0 ? { ...row, approved_performance_snapshot_json: null } : row);
    expect((await db.prepare(`SELECT * FROM ${table}`).all()).results).toEqual(expected);
  }
  await expect(db.prepare("UPDATE music_cover_proposals SET approved_performance_id = NULL").run()).rejects.toThrow();
  await expect(db.prepare("UPDATE music_cover_proposals SET approved_performance_id = NULL, approved_performance_snapshot_json = '{}'").run()).rejects.toThrow();
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
