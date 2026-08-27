CREATE TABLE `__migration_0067_music_entity_merge_map` (
  `duplicate_id` text PRIMARY KEY NOT NULL,
  `canonical_id` text NOT NULL,
  CONSTRAINT `migration_0067_distinct_entity_check`
    CHECK (`duplicate_id` <> `canonical_id`)
);
--> statement-breakpoint
INSERT INTO `__migration_0067_music_entity_merge_map`
  (`duplicate_id`, `canonical_id`)
SELECT
  duplicate.id,
  (
    SELECT canonical.id
    FROM music_entities AS canonical
    WHERE canonical.member_uid IS NULL
      AND canonical.entity_kind = duplicate.entity_kind
      AND canonical.normalized_name = duplicate.normalized_name
    ORDER BY
      canonical.archived_at IS NOT NULL,
      canonical.created_at,
      canonical.id
    LIMIT 1
  ) AS canonical_id
FROM music_entities AS duplicate
WHERE duplicate.member_uid IS NULL
  AND duplicate.id <> (
    SELECT canonical.id
    FROM music_entities AS canonical
    WHERE canonical.member_uid IS NULL
      AND canonical.entity_kind = duplicate.entity_kind
      AND canonical.normalized_name = duplicate.normalized_name
    ORDER BY
      canonical.archived_at IS NOT NULL,
      canonical.created_at,
      canonical.id
    LIMIT 1
  );
--> statement-breakpoint
INSERT OR IGNORE INTO music_entity_aliases
  (entity_id, alias, normalized_alias, locale, alias_kind)
SELECT
  merge_map.canonical_id,
  alias.alias,
  alias.normalized_alias,
  alias.locale,
  alias.alias_kind
FROM music_entity_aliases AS alias
JOIN `__migration_0067_music_entity_merge_map` AS merge_map
  ON merge_map.duplicate_id = alias.entity_id;
--> statement-breakpoint
UPDATE music_song_original_artists
SET is_primary = 1
WHERE EXISTS (
  SELECT 1
  FROM music_song_original_artists AS duplicate_artist
  JOIN `__migration_0067_music_entity_merge_map` AS merge_map
    ON merge_map.duplicate_id = duplicate_artist.entity_id
  WHERE duplicate_artist.song_id = music_song_original_artists.song_id
    AND merge_map.canonical_id = music_song_original_artists.entity_id
    AND duplicate_artist.is_primary = 1
);
--> statement-breakpoint
DELETE FROM music_song_original_artists
WHERE EXISTS (
  SELECT 1
  FROM `__migration_0067_music_entity_merge_map` AS merge_map
  JOIN music_song_original_artists AS canonical_artist
    ON canonical_artist.song_id = music_song_original_artists.song_id
   AND canonical_artist.entity_id = merge_map.canonical_id
  WHERE merge_map.duplicate_id = music_song_original_artists.entity_id
);
--> statement-breakpoint
UPDATE music_song_original_artists
SET entity_id = (
  SELECT merge_map.canonical_id
  FROM `__migration_0067_music_entity_merge_map` AS merge_map
  WHERE merge_map.duplicate_id = music_song_original_artists.entity_id
)
WHERE entity_id IN (
  SELECT duplicate_id
  FROM `__migration_0067_music_entity_merge_map`
);
--> statement-breakpoint
DELETE FROM music_performance_participants
WHERE EXISTS (
  SELECT 1
  FROM `__migration_0067_music_entity_merge_map` AS merge_map
  JOIN music_performance_participants AS canonical_participant
    ON canonical_participant.performance_id = music_performance_participants.performance_id
   AND canonical_participant.entity_id = merge_map.canonical_id
  WHERE merge_map.duplicate_id = music_performance_participants.entity_id
);
--> statement-breakpoint
UPDATE music_performance_participants
SET entity_id = (
  SELECT merge_map.canonical_id
  FROM `__migration_0067_music_entity_merge_map` AS merge_map
  WHERE merge_map.duplicate_id = music_performance_participants.entity_id
)
WHERE entity_id IN (
  SELECT duplicate_id
  FROM `__migration_0067_music_entity_merge_map`
);
--> statement-breakpoint
DELETE FROM music_channel_entities
WHERE EXISTS (
  SELECT 1
  FROM `__migration_0067_music_entity_merge_map` AS merge_map
  JOIN music_channel_entities AS canonical_owner
    ON canonical_owner.channel_id = music_channel_entities.channel_id
   AND canonical_owner.entity_id = merge_map.canonical_id
  WHERE merge_map.duplicate_id = music_channel_entities.entity_id
);
--> statement-breakpoint
UPDATE music_channel_entities
SET entity_id = (
  SELECT merge_map.canonical_id
  FROM `__migration_0067_music_entity_merge_map` AS merge_map
  WHERE merge_map.duplicate_id = music_channel_entities.entity_id
)
WHERE entity_id IN (
  SELECT duplicate_id
  FROM `__migration_0067_music_entity_merge_map`
);
--> statement-breakpoint
UPDATE music_public_performance_sort_keys
SET representative_participant_entity_id = (
  SELECT merge_map.canonical_id
  FROM `__migration_0067_music_entity_merge_map` AS merge_map
  WHERE merge_map.duplicate_id = music_public_performance_sort_keys.representative_participant_entity_id
)
WHERE representative_participant_entity_id IN (
  SELECT duplicate_id
  FROM `__migration_0067_music_entity_merge_map`
);
--> statement-breakpoint
UPDATE music_cover_proposal_participants
SET resolved_entity_id = (
  SELECT merge_map.canonical_id
  FROM `__migration_0067_music_entity_merge_map` AS merge_map
  WHERE merge_map.duplicate_id = music_cover_proposal_participants.resolved_entity_id
)
WHERE resolved_entity_id IN (
  SELECT duplicate_id
  FROM `__migration_0067_music_entity_merge_map`
);
--> statement-breakpoint
UPDATE music_cover_proposal_original_artists
SET resolved_entity_id = (
  SELECT merge_map.canonical_id
  FROM `__migration_0067_music_entity_merge_map` AS merge_map
  WHERE merge_map.duplicate_id = music_cover_proposal_original_artists.resolved_entity_id
)
WHERE resolved_entity_id IN (
  SELECT duplicate_id
  FROM `__migration_0067_music_entity_merge_map`
);
--> statement-breakpoint
WITH RECURSIVE
ordered_merge_map AS (
  SELECT
    duplicate_id,
    canonical_id,
    ROW_NUMBER() OVER (ORDER BY duplicate_id) AS step
  FROM `__migration_0067_music_entity_merge_map`
),
candidate_rewrites(candidate_id, step, review_input_json) AS (
  SELECT candidate.id, 0, candidate.review_input_json
  FROM music_ingestion_candidates AS candidate
  WHERE candidate.review_input_json IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM json_tree(candidate.review_input_json) AS entity_reference
      JOIN `__migration_0067_music_entity_merge_map` AS merge_map
        ON merge_map.duplicate_id = entity_reference.atom
      WHERE entity_reference.key = 'entityId'
        AND entity_reference.type = 'text'
    )
  UNION ALL
  SELECT
    candidate_rewrites.candidate_id,
    ordered_merge_map.step,
    replace(
      candidate_rewrites.review_input_json,
      '"' || ordered_merge_map.duplicate_id || '"',
      '"' || ordered_merge_map.canonical_id || '"'
    )
  FROM candidate_rewrites
  JOIN ordered_merge_map
    ON ordered_merge_map.step = candidate_rewrites.step + 1
),
final_candidate_rewrites AS (
  SELECT candidate_id, review_input_json
  FROM candidate_rewrites
  WHERE step = (
    SELECT COUNT(*)
    FROM ordered_merge_map
  )
)
UPDATE music_ingestion_candidates
SET review_input_json = (
      SELECT rewrite.review_input_json
      FROM final_candidate_rewrites AS rewrite
      WHERE rewrite.candidate_id = music_ingestion_candidates.id
    ),
    version = version + 1,
    updated_at = MAX(updated_at, unixepoch() * 1000)
WHERE id IN (
  SELECT candidate_id
  FROM final_candidate_rewrites
);
--> statement-breakpoint
INSERT INTO music_catalog_events (
  id,
  aggregate_type,
  aggregate_id,
  event_type,
  actor_kind,
  actor_user_id,
  before_json,
  after_json,
  detail_json,
  created_at
)
SELECT
  'migration-0067-entity-merge-' || duplicate.id,
  'entity',
  canonical.id,
  'entity.merged',
  'system',
  NULL,
  json_object(
    'id', duplicate.id,
    'displayName', duplicate.display_name,
    'slug', duplicate.slug
  ),
  json_object(
    'id', canonical.id,
    'displayName', canonical.display_name,
    'slug', canonical.slug
  ),
  json_object(
    'reason', 'duplicate_external_normalized_identity',
    'entityKind', canonical.entity_kind,
    'normalizedName', canonical.normalized_name
  ),
  unixepoch() * 1000
FROM `__migration_0067_music_entity_merge_map` AS merge_map
JOIN music_entities AS duplicate
  ON duplicate.id = merge_map.duplicate_id
JOIN music_entities AS canonical
  ON canonical.id = merge_map.canonical_id;
--> statement-breakpoint
UPDATE music_entities
SET version = version + 1,
    updated_at = MAX(updated_at, unixepoch() * 1000)
WHERE id IN (
  SELECT canonical_id
  FROM `__migration_0067_music_entity_merge_map`
);
--> statement-breakpoint
DELETE FROM music_entities
WHERE id IN (
  SELECT duplicate_id
  FROM `__migration_0067_music_entity_merge_map`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_entities_external_kind_normalized_name`
ON `music_entities` (`entity_kind`, `normalized_name`)
WHERE `member_uid` IS NULL;
--> statement-breakpoint
UPDATE music_catalog_meta
SET revision = revision + 1,
    updated_at = MAX(updated_at, unixepoch() * 1000)
WHERE id = 1
  AND EXISTS (
    SELECT 1
    FROM `__migration_0067_music_entity_merge_map`
  );
--> statement-breakpoint
UPDATE music_public_read_model_meta
SET revision = (
      SELECT revision
      FROM music_catalog_meta
      WHERE id = 1
    ),
    updated_at = (
      SELECT updated_at
      FROM music_catalog_meta
      WHERE id = 1
    )
WHERE id = 1
  AND EXISTS (
    SELECT 1
    FROM `__migration_0067_music_entity_merge_map`
  );
--> statement-breakpoint
DROP TABLE `__migration_0067_music_entity_merge_map`;
