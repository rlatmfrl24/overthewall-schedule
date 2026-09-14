-- Preserve all existing performance identities, child rows and triggers.
-- Drizzle's table-rebuild output is replaced with equivalent additive column constraints.
ALTER TABLE music_performances ADD COLUMN broadcast_metadata text CONSTRAINT music_performances_broadcast_metadata_check CHECK ("music_performances"."broadcast_metadata" IS NULL OR CASE WHEN json_valid("music_performances"."broadcast_metadata") THEN coalesce((
      json_type("music_performances"."broadcast_metadata") = 'object'
      AND json_type("music_performances"."broadcast_metadata", '$.performedOn') IN ('text', 'null')
      AND json_type("music_performances"."broadcast_metadata", '$.dateEvidence') IN ('text', 'null')
      AND json_type("music_performances"."broadcast_metadata", '$.originalUrl') IN ('text', 'null')
      AND (json_type("music_performances"."broadcast_metadata", '$.extent') = 'null' OR json_extract("music_performances"."broadcast_metadata", '$.extent') IN ('full', 'partial'))) , 0)
      ELSE 0 END);
--> statement-breakpoint
ALTER TABLE music_performances ADD COLUMN catalog_published_at integer CONSTRAINT music_performances_catalog_published_at_check CHECK ("music_performances"."catalog_published_at" IS NULL OR (typeof("music_performances"."catalog_published_at") = 'integer' AND "music_performances"."catalog_published_at" >= 0));
--> statement-breakpoint
CREATE INDEX `idx_music_performances_broadcast_published` ON `music_performances` (`catalog_published_at`,`id`) WHERE "music_performances"."publication_status" = 'published' AND "music_performances"."release_type" = 'broadcast';
