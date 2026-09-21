export const decrementGramStatsStatements = (
  database: D1Database,
  songId: string,
): D1PreparedStatement[] => [
  database
    .prepare(
      `DELETE FROM music_search_gram_stats
       WHERE song_count <= 1
         AND EXISTS (
         SELECT 1
         FROM music_search_grams AS existing
         WHERE existing.song_id = ?
           AND existing.gram_size = music_search_gram_stats.gram_size
           AND existing.normalized_gram = music_search_gram_stats.normalized_gram
       )`,
    )
    .bind(songId),
  database
    .prepare(
      `UPDATE music_search_gram_stats
       SET song_count = song_count - 1
       WHERE song_count > 1
         AND EXISTS (
         SELECT 1
         FROM music_search_grams AS existing
         WHERE existing.song_id = ?
           AND existing.gram_size = music_search_gram_stats.gram_size
           AND existing.normalized_gram = music_search_gram_stats.normalized_gram
       )`,
    )
    .bind(songId),
];

export const projectionStatements = (
  database: D1Database,
  songId: string,
  options: { decrementExistingGrams?: boolean } = {},
): D1PreparedStatement[] => [
  database
    .prepare("DELETE FROM music_search_terms WHERE song_id = ?")
    .bind(songId),
  database
    .prepare(
      `
    INSERT OR IGNORE INTO music_search_terms (
      song_id, term_kind, display_value, normalized_term
    )
    SELECT id, 'title', title, normalized_title
      FROM music_songs WHERE id = ?
    UNION ALL
    SELECT song_id, 'title_alias', alias, normalized_alias
      FROM music_song_aliases WHERE song_id = ?
    UNION ALL
    SELECT artist.song_id, 'original_artist', entity.display_name, entity.normalized_name
      FROM music_song_original_artists AS artist
      JOIN music_entities AS entity ON entity.id = artist.entity_id
      WHERE artist.song_id = ?
    UNION ALL
    SELECT performance.song_id, 'participant', participant.credit_name_snapshot,
           entity.normalized_name
      FROM music_performances AS performance
      JOIN music_performance_participants AS participant
        ON participant.performance_id = performance.id
      JOIN music_entities AS entity ON entity.id = participant.entity_id
      WHERE performance.song_id = ?
  `,
    )
    .bind(songId, songId, songId, songId),
  ...(options.decrementExistingGrams === false
    ? []
    : decrementGramStatsStatements(database, songId)),
  database
    .prepare("DELETE FROM music_search_grams WHERE song_id = ?")
    .bind(songId),
  database
    .prepare(
      `
    INSERT OR IGNORE INTO music_search_grams (
      song_id, gram_size, normalized_gram
    )
    WITH RECURSIVE source_terms(song_id, normalized_term) AS (
      SELECT song_id, normalized_term
      FROM music_search_terms
      WHERE song_id = ? AND length(normalized_term) >= 2
    ), positions(song_id, normalized_term, position) AS (
      SELECT song_id, normalized_term, 1 FROM source_terms
      UNION ALL
      SELECT song_id, normalized_term, position + 1
      FROM positions
      WHERE position + 1 <= length(normalized_term)
    )
    SELECT song_id, 2, substr(normalized_term, position, 2)
    FROM positions WHERE position + 1 <= length(normalized_term)
    UNION
    SELECT song_id, 3, substr(normalized_term, position, 3)
    FROM positions WHERE position + 2 <= length(normalized_term)
  `,
    )
    .bind(songId),
  database.prepare(`
    INSERT INTO music_search_gram_stats (gram_size, normalized_gram, song_count)
    SELECT gram_size, normalized_gram, 1
    FROM music_search_grams
    WHERE song_id = ?
    ON CONFLICT(gram_size, normalized_gram) DO UPDATE SET
      song_count = music_search_gram_stats.song_count + 1
  `).bind(songId),
  database
    .prepare("DELETE FROM music_public_performance_sort_keys WHERE song_id = ?")
    .bind(songId),
  database
    .prepare(
      `
    INSERT INTO music_public_performance_sort_keys (
      performance_id, song_id, representative_participant_entity_id,
      normalized_participant
    )
    SELECT performance.id, performance.song_id,
      (
        SELECT participant.entity_id
        FROM music_performance_participants AS participant
        WHERE participant.performance_id = performance.id
        ORDER BY participant.credit_order ASC, participant.entity_id ASC
        LIMIT 1
      ),
      (
        SELECT entity.normalized_name
        FROM music_performance_participants AS participant
        JOIN music_entities AS entity ON entity.id = participant.entity_id
        WHERE participant.performance_id = performance.id
        ORDER BY participant.credit_order ASC, participant.entity_id ASC
        LIMIT 1
      )
    FROM music_performances AS performance
    WHERE performance.song_id = ?
  `,
    )
    .bind(songId),
];

