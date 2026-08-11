INSERT INTO `music_public_performance_sort_keys` (
  `performance_id`,
  `song_id`,
  `representative_participant_entity_id`,
  `normalized_participant`
)
SELECT
  performance.id,
  performance.song_id,
  representative.entity_id,
  entity.normalized_name
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
  ON entity.id = representative.entity_id;
--> statement-breakpoint
WITH RECURSIVE
  gram_sizes(gram_size) AS (
    SELECT 2
    UNION ALL
    SELECT 3
  ),
  source_terms(song_id, normalized_term) AS (
    SELECT id, normalized_title
    FROM music_songs
    UNION
    SELECT song_id, normalized_term
    FROM music_search_terms
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
INSERT OR IGNORE INTO `music_search_grams` (
  `song_id`,
  `gram_size`,
  `normalized_gram`
)
SELECT song_id, gram_size, substr(normalized_term, position, gram_size)
FROM gram_positions;
--> statement-breakpoint
INSERT INTO `music_search_gram_stats` (
  `gram_size`,
  `normalized_gram`,
  `song_count`
)
SELECT gram_size, normalized_gram, COUNT(*)
FROM music_search_grams
GROUP BY gram_size, normalized_gram;
--> statement-breakpoint
INSERT INTO `music_public_read_model_meta` (`id`, `revision`, `updated_at`)
SELECT id, revision, updated_at
FROM music_catalog_meta
WHERE id = 1;
