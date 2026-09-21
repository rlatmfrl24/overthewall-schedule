WITH RECURSIVE
     gram_sizes(gram_size) AS (
       SELECT 2 UNION ALL SELECT 3
     ),
     expected_terms(song_id, term_kind, normalized_term) AS (
       SELECT id, 'title', normalized_title FROM music_songs
       UNION
       SELECT song_id, 'title_alias', normalized_alias FROM music_song_aliases
       UNION
       SELECT artist.song_id, 'original_artist', entity.normalized_name
       FROM music_song_original_artists artist JOIN music_entities entity ON entity.id = artist.entity_id
       UNION
       SELECT performance.song_id, 'participant', entity.normalized_name
       FROM music_performances performance
       JOIN music_performance_participants participant ON participant.performance_id = performance.id
       JOIN music_entities entity ON entity.id = participant.entity_id
     ),
     missing_terms AS (
       SELECT * FROM expected_terms
       EXCEPT SELECT song_id, term_kind, normalized_term FROM music_search_terms
     ),
     unexpected_terms AS (
       SELECT song_id, term_kind, normalized_term FROM music_search_terms
       EXCEPT SELECT * FROM expected_terms
     ),
     source_terms(song_id, normalized_term) AS (
       SELECT DISTINCT song_id, normalized_term FROM expected_terms
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
     ),
     expected_grams AS (
       SELECT DISTINCT song_id, gram_size,
              substr(normalized_term, position, gram_size) AS normalized_gram
       FROM gram_positions
     ),
     posting_counts AS (
       SELECT gram_size, normalized_gram, COUNT(*) AS song_count
       FROM music_search_grams
       GROUP BY gram_size, normalized_gram
     )
     SELECT
       (SELECT COUNT(*) FROM missing_terms) AS missing_term_count,
       (SELECT COUNT(*) FROM unexpected_terms) AS unexpected_term_count,
       (SELECT COUNT(*) FROM expected_grams) AS expected_posting_count,
       (SELECT COUNT(*) FROM music_search_grams) AS posting_count,
       (SELECT COUNT(*) FROM posting_counts) AS distinct_gram_count,
       (SELECT COUNT(*) FROM music_search_gram_stats) AS stat_count,
       (SELECT COUNT(*)
          FROM expected_grams AS expected
          LEFT JOIN music_search_grams AS gram
            ON gram.song_id = expected.song_id
           AND gram.gram_size = expected.gram_size
           AND gram.normalized_gram = expected.normalized_gram
         WHERE gram.song_id IS NULL) AS missing_posting_count,
       (SELECT COUNT(*)
          FROM music_search_grams AS gram
          LEFT JOIN expected_grams AS expected
            ON expected.song_id = gram.song_id
           AND expected.gram_size = gram.gram_size
           AND expected.normalized_gram = gram.normalized_gram
         WHERE expected.song_id IS NULL) AS unexpected_posting_count,
       (SELECT COUNT(*)
          FROM posting_counts
          LEFT JOIN music_search_gram_stats AS stat
            ON stat.gram_size = posting_counts.gram_size
           AND stat.normalized_gram = posting_counts.normalized_gram
         WHERE stat.gram_size IS NULL) AS missing_stat_count,
       (SELECT COUNT(*)
          FROM music_search_gram_stats AS stat
          LEFT JOIN posting_counts
            ON posting_counts.gram_size = stat.gram_size
           AND posting_counts.normalized_gram = stat.normalized_gram
         WHERE posting_counts.gram_size IS NULL) AS unexpected_stat_count,
       (SELECT COUNT(*)
          FROM posting_counts
          JOIN music_search_gram_stats AS stat
            ON stat.gram_size = posting_counts.gram_size
           AND stat.normalized_gram = posting_counts.normalized_gram
         WHERE stat.song_count <> posting_counts.song_count) AS value_drift_count;
