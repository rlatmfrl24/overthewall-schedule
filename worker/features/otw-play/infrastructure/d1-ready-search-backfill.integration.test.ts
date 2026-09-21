import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { expect, it } from "vitest";
import { projectionStatements } from "./d1-catalog-projection";

it("repairs Ready-only songs from canonical metadata and diagnoses missing terms independently of grams", async () => {
  const testEnv = env as Env & {
    OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[];
    OTW_PLAY_SEARCH_BACKFILL_MIGRATIONS: D1Migration[];
    OTW_PLAY_SEARCH_INTEGRITY_SQL: string;
  };
  const db = testEnv.otw_db;
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS);
  await db.batch([
    db.prepare(`INSERT INTO music_entities (id, entity_kind, display_name, normalized_name, slug, created_at, updated_at)
      VALUES ('backfill-artist', 'person', 'Artist', 'artist', 'backfill-artist', 1, 1)`),
    ...["ready-a", "ready-b", "ordinary"].map(id => db.prepare(`INSERT INTO music_songs
      (id, slug, title, normalized_title, dedupe_key, is_otw_original, created_at, updated_at)
      VALUES (?, ?, 'Shared Song', 'shared song', ?, 0, 1, 1)`).bind(id, id, id)),
    ...["ready-a", "ready-b"].map(id => db.prepare(`INSERT INTO music_catalog_events
      (id, aggregate_type, aggregate_id, event_type, actor_kind, actor_user_id, created_at)
      VALUES (?, 'song', ?, 'song.created_from_ingestion_review', 'admin', 'admin', 1)`).bind(id, id)),
    db.prepare("INSERT INTO music_song_aliases (song_id, alias, normalized_alias) VALUES ('ready-a', '별칭', '별칭')"),
    db.prepare("INSERT INTO music_song_original_artists (song_id, entity_id, credit_order, is_primary) VALUES ('ready-a', 'backfill-artist', 0, 1)"),
    ...projectionStatements(db, "ordinary"),
  ]);
  const status = () => db.prepare(testEnv.OTW_PLAY_SEARCH_INTEGRITY_SQL).first<Record<string, number>>();
  expect(await status()).toMatchObject({ missing_term_count: 4, unexpected_term_count: 0 });
  expect((await status())!.missing_posting_count).toBeGreaterThan(0);
  const songsBefore = (await db.prepare("SELECT * FROM music_songs ORDER BY id").all()).results;
  const revision = await db.prepare("SELECT revision FROM music_catalog_meta WHERE id = 1").first<number>("revision");
  await applyD1Migrations(db, testEnv.OTW_PLAY_SEARCH_BACKFILL_MIGRATIONS);
  expect(await status()).toMatchObject({ missing_term_count: 0, unexpected_term_count: 0, missing_posting_count: 0, unexpected_posting_count: 0, missing_stat_count: 0, unexpected_stat_count: 0, value_drift_count: 0 });
  expect((await db.prepare("SELECT * FROM music_songs ORDER BY id").all()).results).toEqual(songsBefore);
  expect(await db.prepare("SELECT revision FROM music_catalog_meta WHERE id = 1").first("revision")).toBe(revision! + 1);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  const statsBefore = (await db.prepare("SELECT * FROM music_search_gram_stats ORDER BY gram_size, normalized_gram").all()).results;
  // Replaying the repair SQL is a no-op, including revision and shared gram counts.
  await db.batch(testEnv.OTW_PLAY_SEARCH_BACKFILL_MIGRATIONS.flatMap(m => m.queries.map(q => db.prepare(q))));
  expect((await db.prepare("SELECT * FROM music_search_gram_stats ORDER BY gram_size, normalized_gram").all()).results).toEqual(statsBefore);
  expect(await db.prepare("SELECT revision FROM music_catalog_meta WHERE id = 1").first("revision")).toBe(revision! + 1);
  await db.prepare("DELETE FROM music_search_terms WHERE song_id = 'ready-a' AND term_kind = 'original_artist'").run();
  expect(await status()).toMatchObject({ missing_term_count: 1, missing_posting_count: 0 });
  await db.prepare("INSERT INTO music_search_terms (song_id, term_kind, display_value, normalized_term) VALUES ('ready-a', 'title_alias', 'X', 'x')").run();
  expect(await status()).toMatchObject({ missing_term_count: 1, unexpected_term_count: 1 });
});

