INSERT INTO music_entities (
  id,
  member_uid,
  entity_kind,
  display_name,
  normalized_name,
  slug,
  archived_at,
  version,
  created_at,
  updated_at
)
SELECT
  'member:' || member.code,
  member.uid,
  'person',
  trim(member.name),
  lower(trim(member.name)),
  member.code,
  NULL,
  0,
  1787553000000,
  1787553000000
FROM members AS member
WHERE COALESCE(member.is_deprecated, 0) = 0
  AND length(trim(member.code)) > 0
  AND length(trim(member.name)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM music_entities AS entity
    WHERE entity.member_uid = member.uid
  )
ORDER BY member.uid;
--> statement-breakpoint
UPDATE music_catalog_meta
SET revision = revision + 1,
    updated_at = MAX(updated_at, 1787553000000)
WHERE id = 1;
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
WHERE id = 1;
