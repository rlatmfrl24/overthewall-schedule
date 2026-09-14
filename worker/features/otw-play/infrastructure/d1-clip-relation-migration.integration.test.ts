import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { expect, it } from "vitest";

it("normalizes legacy broadcast relations without losing dependent reviews or credits", async () => {
  const testEnv = env as Env & { OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[] };
  const db = testEnv.otw_db;
  const name = "0091_tranquil_luke_cage.sql";
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS.filter(m => m.name !== name));
  await db.batch([
    db.prepare(`INSERT INTO music_songs (id, slug, title, normalized_title, dedupe_key, is_otw_original, created_at, updated_at)
      VALUES ('legacy-song', 'legacy-song', 'Legacy Song', 'legacy song', 'legacy-song', 0, 1, 1)`),
    db.prepare(`INSERT INTO music_entities (id, entity_kind, display_name, normalized_name, slug, created_at, updated_at)
      VALUES ('legacy-singer', 'person', 'Singer', 'singer', 'legacy-singer', 1, 1)`),
    db.prepare(`INSERT INTO music_performances (id, song_id, dedupe_key, relation_type, release_type, participation_type, created_at, updated_at)
      VALUES ('legacy-clip', 'legacy-song', 'legacy-clip-key', 'cover', 'broadcast', 'solo', 1, 1),
        ('legacy-official', 'legacy-song', 'legacy-official-key', 'cover', 'official_video', 'solo', 1, 1)`),
    db.prepare(`INSERT INTO music_performance_participants (performance_id, entity_id, participant_role, credit_order, credit_name_snapshot)
      VALUES ('legacy-clip', 'legacy-singer', 'vocal', 0, 'Singer')`),
    db.prepare(`INSERT INTO music_performance_tags (performance_id, tag_key, display_name)
      VALUES ('legacy-clip', 'acoustic', 'Acoustic')`),
    db.prepare(`INSERT INTO music_cover_proposals (id, submitted_by_user_id, idempotency_key, submitted_url, youtube_video_id, submitted_title,
      status, reviewed_by_user_id, reviewed_at, approved_performance_id, created_at, updated_at)
      VALUES ('legacy-proposal', 'user', 'legacy-request', 'https://youtu.be/AAAAAAAAAAA', 'AAAAAAAAAAA', 'Clip', 'approved', 'admin', 1, 'legacy-clip', 1, 1)`),
    db.prepare(`INSERT INTO music_cover_proposal_participants (proposal_id, credit_order, submitted_name_snapshot, participant_role)
      VALUES ('legacy-proposal', 0, 'Singer', 'vocal')`),
    db.prepare(`INSERT INTO music_ingestion_candidates (id, external_video_id, candidate_kind, first_discovered_at, last_discovered_at,
      retention_expires_at, linked_performance_id, review_input_json, created_at, updated_at)
      VALUES ('legacy-candidate', 'AAAAAAAAAAA', 'singing_clip', 1, 1, 1000, 'legacy-clip', ?, 1, 1)`)
      .bind(JSON.stringify({ song: { kind: 'existing', songId: 'legacy-song' }, relationType: 'cover', releaseType: 'broadcast', internalNote: 'Keep this review' })),
    db.prepare(`INSERT INTO music_ingestion_events (id, candidate_id, event_type, actor_user_id, detail_json, created_at)
      VALUES ('legacy-audit', 'legacy-candidate', 'review_saved', 'admin', '{"note":"preserve"}', 1)`),
  ]);
  const tables = ["music_performance_participants", "music_performance_tags", "music_cover_proposals", "music_cover_proposal_participants", "music_ingestion_events"];
  const before = await Promise.all(tables.map(table => db.prepare(`SELECT * FROM ${table}`).all()));
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS.filter(m => m.name === name));
  for (const [index, table] of tables.entries()) {
    expect((await db.prepare(`SELECT * FROM ${table}`).all()).results).toEqual(before[index]!.results);
  }
  expect(await db.prepare("SELECT relation_type, dedupe_key FROM music_performances WHERE id='legacy-clip'").first())
    .toEqual({ relation_type: "singing_clip", dedupe_key: "legacy-clip-key" });
  expect(await db.prepare("SELECT relation_type FROM music_performances WHERE id='legacy-official'").first())
    .toEqual({ relation_type: "cover" });
  const candidate = await db.prepare("SELECT linked_performance_id, review_input_json, version FROM music_ingestion_candidates WHERE id='legacy-candidate'")
    .first<{ linked_performance_id: string; review_input_json: string; version: number }>();
  expect(candidate).toMatchObject({ linked_performance_id: "legacy-clip", version: 1 });
  expect(JSON.parse(candidate!.review_input_json)).toMatchObject({ relationType: "singing_clip", internalNote: "Keep this review", song: { songId: "legacy-song" } });
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
