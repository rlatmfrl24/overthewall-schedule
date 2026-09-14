-- Preserve all dependent rows across the generated performance table rebuild.
CREATE TABLE `__clip_relation_backup_music_channel_upload_candidate_origins` AS SELECT * FROM `music_channel_upload_candidate_origins`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_ingestion_candidate_origins` AS SELECT * FROM `music_ingestion_candidate_origins`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_ingestion_events` AS SELECT * FROM `music_ingestion_events`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_cover_proposal_original_artists` AS SELECT * FROM `music_cover_proposal_original_artists`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_cover_proposal_participants` AS SELECT * FROM `music_cover_proposal_participants`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_performance_participants` AS SELECT * FROM `music_performance_participants`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_performance_sources` AS SELECT * FROM `music_performance_sources`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_performance_tags` AS SELECT * FROM `music_performance_tags`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_public_performance_sort_keys` AS SELECT * FROM `music_public_performance_sort_keys`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_ingestion_candidates` AS SELECT * FROM `music_ingestion_candidates`;--> statement-breakpoint
CREATE TABLE `__clip_relation_backup_music_cover_proposals` AS SELECT * FROM `music_cover_proposals`;--> statement-breakpoint
DELETE FROM `music_channel_upload_candidate_origins`;--> statement-breakpoint
DELETE FROM `music_ingestion_candidate_origins`;--> statement-breakpoint
DELETE FROM `music_ingestion_events`;--> statement-breakpoint
DELETE FROM `music_cover_proposal_original_artists`;--> statement-breakpoint
DELETE FROM `music_cover_proposal_participants`;--> statement-breakpoint
DELETE FROM `music_performance_participants`;--> statement-breakpoint
DELETE FROM `music_performance_sources`;--> statement-breakpoint
DELETE FROM `music_performance_tags`;--> statement-breakpoint
DELETE FROM `music_public_performance_sort_keys`;--> statement-breakpoint
DELETE FROM `music_ingestion_candidates`;--> statement-breakpoint
DELETE FROM `music_cover_proposals`;--> statement-breakpoint
CREATE TABLE `__new_music_performances` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`relation_type` text NOT NULL,
	`release_type` text NOT NULL,
	`participation_type` text NOT NULL,
	`publication_status` text DEFAULT 'draft' NOT NULL,
	`quality_status` text DEFAULT 'ok' NOT NULL,
	`released_at` integer,
	`broadcast_metadata` text,
	`catalog_published_at` integer,
	`internal_note` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_performances_broadcast_metadata_check" CHECK("__new_music_performances"."broadcast_metadata" IS NULL OR CASE WHEN json_valid("__new_music_performances"."broadcast_metadata") THEN coalesce((
      json_type("__new_music_performances"."broadcast_metadata") = 'object'
      AND json_type("__new_music_performances"."broadcast_metadata", '$.performedOn') IN ('text', 'null')
      AND json_type("__new_music_performances"."broadcast_metadata", '$.dateEvidence') IN ('text', 'null')
      AND json_type("__new_music_performances"."broadcast_metadata", '$.originalUrl') IN ('text', 'null')
      AND (json_type("__new_music_performances"."broadcast_metadata", '$.extent') = 'null' OR json_extract("__new_music_performances"."broadcast_metadata", '$.extent') IN ('full', 'partial'))) , 0)
      ELSE 0 END),
	CONSTRAINT "music_performances_catalog_published_at_check" CHECK("__new_music_performances"."catalog_published_at" IS NULL OR (typeof("__new_music_performances"."catalog_published_at") = 'integer' AND "__new_music_performances"."catalog_published_at" >= 0)),
	CONSTRAINT "music_performances_relation_type_check" CHECK("__new_music_performances"."relation_type" IN ('original', 'cover', 'singing_clip')),
	CONSTRAINT "music_performances_release_type_check" CHECK("__new_music_performances"."release_type" IN ('official_mv', 'official_video', 'broadcast', 'live', 'shorts')),
	CONSTRAINT "music_performances_participation_type_check" CHECK("__new_music_performances"."participation_type" IN ('solo', 'duet', 'unit', 'group', 'external_collab')),
	CONSTRAINT "music_performances_publication_status_check" CHECK("__new_music_performances"."publication_status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "music_performances_quality_status_check" CHECK("__new_music_performances"."quality_status" IN ('ok', 'needs_update')),
	CONSTRAINT "music_performances_required_text_check" CHECK(length(trim("__new_music_performances"."id")) > 0 AND length(trim("__new_music_performances"."dedupe_key")) > 0),
	CONSTRAINT "music_performances_release_time_check" CHECK("__new_music_performances"."released_at" IS NULL OR (typeof("__new_music_performances"."released_at") = 'integer' AND "__new_music_performances"."released_at" >= 0)),
	CONSTRAINT "music_performances_version_check" CHECK(typeof("__new_music_performances"."version") = 'integer' AND "__new_music_performances"."version" >= 0),
	CONSTRAINT "music_performances_time_check" CHECK(typeof("__new_music_performances"."created_at") = 'integer' AND "__new_music_performances"."created_at" >= 0
        AND typeof("__new_music_performances"."updated_at") = 'integer' AND "__new_music_performances"."updated_at" >= "__new_music_performances"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_music_performances`("id", "song_id", "dedupe_key", "relation_type", "release_type", "participation_type", "publication_status", "quality_status", "released_at", "broadcast_metadata", "catalog_published_at", "internal_note", "version", "created_at", "updated_at") SELECT "id", "song_id", "dedupe_key", CASE WHEN "release_type" = 'broadcast' THEN 'singing_clip' ELSE "relation_type" END, "release_type", "participation_type", "publication_status", "quality_status", "released_at", "broadcast_metadata", "catalog_published_at", "internal_note", "version", "created_at", "updated_at" FROM `music_performances`;--> statement-breakpoint
DROP TABLE `music_performances`;--> statement-breakpoint
ALTER TABLE `__new_music_performances` RENAME TO `music_performances`;--> statement-breakpoint
CREATE INDEX `idx_music_performances_broadcast_published` ON `music_performances` (`catalog_published_at`,`id`) WHERE "music_performances"."publication_status" = 'published' AND "music_performances"."release_type" = 'broadcast';--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_performances_dedupe_key` ON `music_performances` (`dedupe_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_performances_id_song_id` ON `music_performances` (`id`,`song_id`);--> statement-breakpoint
CREATE INDEX `idx_music_performances_song_id` ON `music_performances` (`song_id`);--> statement-breakpoint
CREATE INDEX `idx_music_performances_published_released_id` ON `music_performances` (`released_at` DESC,`id`) WHERE "music_performances"."publication_status" = 'published';--> statement-breakpoint
CREATE INDEX `idx_music_performances_published_song_released_id` ON `music_performances` (`song_id`,`released_at` DESC,`id`) WHERE "music_performances"."publication_status" = 'published';--> statement-breakpoint
CREATE INDEX `idx_music_performances_published_relation_released_id` ON `music_performances` (`relation_type`,`released_at` DESC,`id`) WHERE "music_performances"."publication_status" = 'published';--> statement-breakpoint
CREATE INDEX `idx_music_performances_published_released_song_id` ON `music_performances` (`released_at` DESC,`song_id`,`id`) WHERE "music_performances"."publication_status" = 'published';--> statement-breakpoint
CREATE INDEX `idx_music_performances_published_participation_released_song_id` ON `music_performances` (`participation_type`,`released_at` DESC,`song_id`,`id`) WHERE "music_performances"."publication_status" = 'published';
--> statement-breakpoint
INSERT INTO `music_cover_proposals` SELECT * FROM `__clip_relation_backup_music_cover_proposals`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_cover_proposals`;--> statement-breakpoint
INSERT INTO `music_ingestion_candidates` SELECT * FROM `__clip_relation_backup_music_ingestion_candidates`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_ingestion_candidates`;--> statement-breakpoint
INSERT INTO `music_public_performance_sort_keys` SELECT * FROM `__clip_relation_backup_music_public_performance_sort_keys`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_public_performance_sort_keys`;--> statement-breakpoint
INSERT INTO `music_performance_tags` SELECT * FROM `__clip_relation_backup_music_performance_tags`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_performance_tags`;--> statement-breakpoint
INSERT INTO `music_performance_sources` SELECT * FROM `__clip_relation_backup_music_performance_sources`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_performance_sources`;--> statement-breakpoint
INSERT INTO `music_performance_participants` SELECT * FROM `__clip_relation_backup_music_performance_participants`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_performance_participants`;--> statement-breakpoint
INSERT INTO `music_cover_proposal_participants` SELECT * FROM `__clip_relation_backup_music_cover_proposal_participants`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_cover_proposal_participants`;--> statement-breakpoint
INSERT INTO `music_cover_proposal_original_artists` SELECT * FROM `__clip_relation_backup_music_cover_proposal_original_artists`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_cover_proposal_original_artists`;--> statement-breakpoint
INSERT INTO `music_ingestion_events` SELECT * FROM `__clip_relation_backup_music_ingestion_events`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_ingestion_events`;--> statement-breakpoint
INSERT INTO `music_ingestion_candidate_origins` SELECT * FROM `__clip_relation_backup_music_ingestion_candidate_origins`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_ingestion_candidate_origins`;--> statement-breakpoint
INSERT INTO `music_channel_upload_candidate_origins` SELECT * FROM `__clip_relation_backup_music_channel_upload_candidate_origins`;--> statement-breakpoint
DROP TABLE `__clip_relation_backup_music_channel_upload_candidate_origins`;--> statement-breakpoint
UPDATE music_ingestion_candidates SET review_input_json = json_set(review_input_json, '$.relationType', 'singing_clip'), version = version + 1
WHERE candidate_kind = 'singing_clip' AND json_valid(review_input_json) AND json_extract(review_input_json, '$.releaseType') = 'broadcast';
