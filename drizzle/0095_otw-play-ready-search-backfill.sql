-- Repair songs materialized by Ready review before search projections were added.
-- Limit writes to the known missing-projection shape; preserve all catalog identities.
CREATE TABLE __ready_search_backfill_songs AS
SELECT song.id FROM music_songs song
WHERE EXISTS (SELECT 1 FROM music_catalog_events event
  WHERE event.aggregate_type = 'song' AND event.aggregate_id = song.id
    AND event.event_type = 'song.created_from_ingestion_review')
AND NOT EXISTS (SELECT 1 FROM music_search_terms term WHERE term.song_id = song.id)
AND NOT EXISTS (SELECT 1 FROM music_search_grams gram WHERE gram.song_id = song.id);
--> statement-breakpoint
INSERT OR IGNORE INTO music_search_terms (song_id, term_kind, display_value, normalized_term)
SELECT id, 'title', title, normalized_title FROM music_songs
WHERE id IN (SELECT id FROM __ready_search_backfill_songs)
UNION ALL
SELECT song_id, 'title_alias', alias, normalized_alias FROM music_song_aliases
WHERE song_id IN (SELECT id FROM __ready_search_backfill_songs)
UNION ALL
SELECT artist.song_id, 'original_artist', entity.display_name, entity.normalized_name
FROM music_song_original_artists artist JOIN music_entities entity ON entity.id = artist.entity_id
WHERE artist.song_id IN (SELECT id FROM __ready_search_backfill_songs)
UNION ALL
SELECT performance.song_id, 'participant', participant.credit_name_snapshot, entity.normalized_name
FROM music_performances performance
JOIN music_performance_participants participant ON participant.performance_id = performance.id
JOIN music_entities entity ON entity.id = participant.entity_id
WHERE performance.song_id IN (SELECT id FROM __ready_search_backfill_songs);
--> statement-breakpoint
INSERT OR IGNORE INTO music_search_grams (song_id, gram_size, normalized_gram)
WITH RECURSIVE terms AS (
  SELECT song_id, normalized_term FROM music_search_terms
  WHERE song_id IN (SELECT id FROM __ready_search_backfill_songs)
), positions(song_id, normalized_term, position) AS (
  SELECT song_id, normalized_term, 1 FROM terms
  UNION ALL SELECT song_id, normalized_term, position + 1 FROM positions
  WHERE position + 1 <= length(normalized_term)
)
SELECT song_id, 2, substr(normalized_term, position, 2) FROM positions WHERE position + 1 <= length(normalized_term)
UNION SELECT song_id, 3, substr(normalized_term, position, 3) FROM positions WHERE position + 2 <= length(normalized_term);
--> statement-breakpoint
INSERT INTO music_search_gram_stats (gram_size, normalized_gram, song_count)
SELECT gram.gram_size, gram.normalized_gram, count(*) FROM music_search_grams gram
WHERE EXISTS (
  SELECT 1 FROM music_search_grams repaired
  WHERE repaired.song_id IN (SELECT id FROM __ready_search_backfill_songs)
    AND repaired.gram_size = gram.gram_size AND repaired.normalized_gram = gram.normalized_gram
)
GROUP BY gram.gram_size, gram.normalized_gram
ON CONFLICT (gram_size, normalized_gram) DO UPDATE SET song_count = excluded.song_count;
--> statement-breakpoint
UPDATE music_catalog_meta SET revision = revision + 1, updated_at = unixepoch() * 1000
WHERE EXISTS (SELECT 1 FROM __ready_search_backfill_songs);
--> statement-breakpoint
UPDATE music_public_read_model_meta SET revision = (SELECT revision FROM music_catalog_meta WHERE id = 1),
updated_at = (SELECT updated_at FROM music_catalog_meta WHERE id = 1)
WHERE id = 1 AND EXISTS (SELECT 1 FROM __ready_search_backfill_songs);
--> statement-breakpoint
DROP TABLE __ready_search_backfill_songs;
