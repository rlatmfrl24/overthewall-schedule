PRAGMA foreign_keys=OFF;--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__otw_play_integrity_guard` (
  `ok` integer NOT NULL CHECK (`ok` = 1)
);--> statement-breakpoint
INSERT INTO `__otw_play_integrity_guard` (`ok`)
SELECT CASE WHEN
  NOT EXISTS (
    SELECT 1 FROM `music_cover_proposals`
    WHERE CASE
      WHEN typeof(`submitted_tags_json`) <> 'text' THEN 1
      WHEN json_valid(`submitted_tags_json`) = 0 THEN 1
      ELSE json_type(`submitted_tags_json`) <> 'array'
    END = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM `music_ingestion_candidates`
    WHERE CASE
        WHEN `review_input_json` IS NULL THEN 0
        WHEN typeof(`review_input_json`) <> 'text' THEN 1
        WHEN json_valid(`review_input_json`) = 0 THEN 1
        ELSE json_type(`review_input_json`) <> 'object'
      END = 1
      OR (`made_for_kids` IS NOT NULL AND (
        typeof(`made_for_kids`) <> 'integer' OR `made_for_kids` NOT IN (0, 1)
      ))
      OR CASE
        WHEN `last_conversion_outcome` IS NULL THEN
          NOT (`last_conversion_error_code` IS NULL
            AND `last_conversion_attempt_at` IS NULL)
        WHEN `last_conversion_outcome` NOT IN ('created', 'duplicate', 'stale',
          'validation_failed', 'retryable_failed') THEN 1
        WHEN typeof(`last_conversion_attempt_at`) <> 'integer'
          OR `last_conversion_attempt_at` < `created_at` THEN 1
        WHEN `last_conversion_error_code` IS NOT NULL
          AND length(trim(`last_conversion_error_code`)) = 0 THEN 1
        ELSE 0
      END = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM `music_channel_upload_monitors`
    WHERE typeof(`generation`) <> 'integer' OR `generation` < 0
      OR (`last_checked_at` IS NOT NULL
        AND (typeof(`last_checked_at`) <> 'integer' OR `last_checked_at` < 0))
      OR (`last_seen_published_at` IS NOT NULL
        AND (typeof(`last_seen_published_at`) <> 'integer' OR `last_seen_published_at` < 0))
      OR (`last_recent_reconciled_at` IS NOT NULL
        AND (typeof(`last_recent_reconciled_at`) <> 'integer' OR `last_recent_reconciled_at` < 0))
      OR (`lease_until` IS NOT NULL
        AND (typeof(`lease_until`) <> 'integer' OR `lease_until` < 0))
      OR (`deleted_at` IS NOT NULL
        AND (typeof(`deleted_at`) <> 'integer' OR `deleted_at` < `created_at`))
  )
  AND NOT EXISTS (
    SELECT 1 FROM `music_channel_upload_candidate_origins`
    WHERE typeof(`monitor_generation`) <> 'integer' OR `monitor_generation` < 0
      OR typeof(`discovered_at`) <> 'integer' OR `discovered_at` < 0
      OR (`provider_published_at` IS NOT NULL AND (
        typeof(`provider_published_at`) <> 'integer' OR `provider_published_at` < 0
      ))
  )
  AND NOT EXISTS (
    SELECT 1 FROM `music_cover_proposal_participants` AS child
    WHERE child.`submitted_member_uid` IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM `members` WHERE `uid` = child.`submitted_member_uid`)
  )
  AND NOT EXISTS (
    SELECT 1 FROM `music_cover_proposal_original_artists` AS child
    WHERE child.`submitted_member_uid` IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM `members` WHERE `uid` = child.`submitted_member_uid`)
  )
THEN 1 ELSE 0 END;--> statement-breakpoint
DROP TABLE `__otw_play_integrity_guard`;--> statement-breakpoint
CREATE TABLE `__backup_music_channel_websub_deliveries` AS
SELECT * FROM `music_channel_websub_deliveries`;--> statement-breakpoint
CREATE TABLE `__backup_music_channel_websub_subscriptions` AS
SELECT * FROM `music_channel_websub_subscriptions`;--> statement-breakpoint
CREATE TABLE `__backup_music_channel_upload_candidate_origins` AS
SELECT * FROM `music_channel_upload_candidate_origins`;--> statement-breakpoint
CREATE TABLE `__backup_music_cover_proposal_participants` AS
SELECT * FROM `music_cover_proposal_participants`;--> statement-breakpoint
CREATE TABLE `__backup_music_cover_proposal_original_artists` AS
SELECT * FROM `music_cover_proposal_original_artists`;--> statement-breakpoint
CREATE TABLE `__backup_music_ingestion_candidate_origins` AS
SELECT * FROM `music_ingestion_candidate_origins`;--> statement-breakpoint
CREATE TABLE `__backup_music_ingestion_events` AS
SELECT * FROM `music_ingestion_events`;--> statement-breakpoint
DROP TABLE `music_channel_websub_deliveries`;--> statement-breakpoint
DROP TABLE `music_channel_websub_subscriptions`;--> statement-breakpoint
DROP TABLE `music_channel_upload_candidate_origins`;--> statement-breakpoint
DROP TABLE `music_cover_proposal_participants`;--> statement-breakpoint
DROP TABLE `music_cover_proposal_original_artists`;--> statement-breakpoint
DROP TABLE `music_ingestion_candidate_origins`;--> statement-breakpoint
DROP TABLE `music_ingestion_events`;--> statement-breakpoint
CREATE TABLE `__new_music_channel_upload_monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`uploads_playlist_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`check_interval_minutes` integer DEFAULT 360 NOT NULL,
	`last_checked_at` integer,
	`next_check_at` integer NOT NULL,
	`last_seen_video_id` text,
	`last_seen_published_at` integer,
	`last_recent_reconciled_at` integer,
	`last_error_code` text,
	`lease_until` integer,
	`generation` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_by_user_id` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `music_channels`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_channel_upload_monitors_identity_check" CHECK(length(trim("__new_music_channel_upload_monitors"."id")) > 0
        AND length("__new_music_channel_upload_monitors"."uploads_playlist_id") = 24
        AND substr("__new_music_channel_upload_monitors"."uploads_playlist_id", 1, 2) = 'UU'
        AND substr("__new_music_channel_upload_monitors"."uploads_playlist_id", 3) NOT GLOB '*[^A-Za-z0-9_-]*'
        AND length(trim("__new_music_channel_upload_monitors"."created_by_user_id")) > 0),
	CONSTRAINT "music_channel_upload_monitors_status_interval_check" CHECK("__new_music_channel_upload_monitors"."status" IN ('active', 'paused')
        AND typeof("__new_music_channel_upload_monitors"."check_interval_minutes") = 'integer'
        AND "__new_music_channel_upload_monitors"."check_interval_minutes" >= 60
        AND "__new_music_channel_upload_monitors"."check_interval_minutes" <= 1440),
	CONSTRAINT "music_channel_upload_monitors_watermark_check" CHECK(("__new_music_channel_upload_monitors"."last_seen_video_id" IS NULL
          OR (length("__new_music_channel_upload_monitors"."last_seen_video_id") = 11
            AND "__new_music_channel_upload_monitors"."last_seen_video_id" NOT GLOB '*[^A-Za-z0-9_-]*'))
        AND ("__new_music_channel_upload_monitors"."last_error_code" IS NULL OR length(trim("__new_music_channel_upload_monitors"."last_error_code")) > 0)),
	CONSTRAINT "music_channel_upload_monitors_version_time_check" CHECK(typeof("__new_music_channel_upload_monitors"."version") = 'integer' AND "__new_music_channel_upload_monitors"."version" >= 0
        AND typeof("__new_music_channel_upload_monitors"."generation") = 'integer' AND "__new_music_channel_upload_monitors"."generation" >= 0
        AND typeof("__new_music_channel_upload_monitors"."created_at") = 'integer' AND "__new_music_channel_upload_monitors"."created_at" >= 0
        AND typeof("__new_music_channel_upload_monitors"."updated_at") = 'integer' AND "__new_music_channel_upload_monitors"."updated_at" >= "__new_music_channel_upload_monitors"."created_at"
        AND typeof("__new_music_channel_upload_monitors"."next_check_at") = 'integer' AND "__new_music_channel_upload_monitors"."next_check_at" >= 0
        AND ("__new_music_channel_upload_monitors"."last_checked_at" IS NULL
          OR (typeof("__new_music_channel_upload_monitors"."last_checked_at") = 'integer' AND "__new_music_channel_upload_monitors"."last_checked_at" >= 0))
        AND ("__new_music_channel_upload_monitors"."last_seen_published_at" IS NULL
          OR (typeof("__new_music_channel_upload_monitors"."last_seen_published_at") = 'integer' AND "__new_music_channel_upload_monitors"."last_seen_published_at" >= 0))
        AND ("__new_music_channel_upload_monitors"."last_recent_reconciled_at" IS NULL
          OR (typeof("__new_music_channel_upload_monitors"."last_recent_reconciled_at") = 'integer' AND "__new_music_channel_upload_monitors"."last_recent_reconciled_at" >= 0))
        AND ("__new_music_channel_upload_monitors"."lease_until" IS NULL
          OR (typeof("__new_music_channel_upload_monitors"."lease_until") = 'integer' AND "__new_music_channel_upload_monitors"."lease_until" >= 0))
        AND ("__new_music_channel_upload_monitors"."deleted_at" IS NULL
          OR (typeof("__new_music_channel_upload_monitors"."deleted_at") = 'integer' AND "__new_music_channel_upload_monitors"."deleted_at" >= "__new_music_channel_upload_monitors"."created_at")))
);
--> statement-breakpoint
INSERT INTO `__new_music_channel_upload_monitors`("id", "channel_id", "uploads_playlist_id", "status", "check_interval_minutes", "last_checked_at", "next_check_at", "last_seen_video_id", "last_seen_published_at", "last_recent_reconciled_at", "last_error_code", "lease_until", "generation", "deleted_at", "created_by_user_id", "version", "created_at", "updated_at") SELECT "id", "channel_id", "uploads_playlist_id", "status", "check_interval_minutes", "last_checked_at", "next_check_at", "last_seen_video_id", "last_seen_published_at", "last_recent_reconciled_at", "last_error_code", "lease_until", "generation", "deleted_at", "created_by_user_id", "version", "created_at", "updated_at" FROM `music_channel_upload_monitors`;--> statement-breakpoint
DROP TABLE `music_channel_upload_monitors`;--> statement-breakpoint
ALTER TABLE `__new_music_channel_upload_monitors` RENAME TO `music_channel_upload_monitors`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_upload_monitors_channel` ON `music_channel_upload_monitors` (`channel_id`) WHERE "music_channel_upload_monitors"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_music_channel_upload_monitors_due` ON `music_channel_upload_monitors` (`status`,`next_check_at`,`lease_until`,`id`);--> statement-breakpoint
CREATE TABLE `__new_music_cover_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`submitted_url` text NOT NULL,
	`youtube_video_id` text NOT NULL,
	`segment_start_seconds` integer DEFAULT 0 NOT NULL,
	`submitted_title` text NOT NULL,
	`submitted_tags_json` text DEFAULT '[]' NOT NULL,
	`suggested_song_id` text,
	`submitted_note` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`review_lock_token` text,
	`review_lock_expires_at` integer,
	`reviewed_by_user_id` text,
	`reviewed_at` integer,
	`review_result_code` text,
	`review_note` text,
	`approved_performance_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`suggested_song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_performance_id`) REFERENCES `music_performances`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_cover_proposals_required_text_check" CHECK(length(trim("__new_music_cover_proposals"."id")) > 0
        AND length(trim("__new_music_cover_proposals"."submitted_by_user_id")) > 0
        AND length(trim("__new_music_cover_proposals"."idempotency_key")) > 0
        AND length(trim("__new_music_cover_proposals"."submitted_url")) > 0
        AND length(trim("__new_music_cover_proposals"."submitted_title")) > 0),
	CONSTRAINT "music_cover_proposals_video_id_check" CHECK(length("__new_music_cover_proposals"."youtube_video_id") = 11 AND "__new_music_cover_proposals"."youtube_video_id" NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "music_cover_proposals_segment_check" CHECK(typeof("__new_music_cover_proposals"."segment_start_seconds") = 'integer' AND "__new_music_cover_proposals"."segment_start_seconds" >= 0),
	CONSTRAINT "music_cover_proposals_tags_json_check" CHECK(CASE
        WHEN typeof("__new_music_cover_proposals"."submitted_tags_json") <> 'text' THEN 0
        WHEN json_valid("__new_music_cover_proposals"."submitted_tags_json") = 0 THEN 0
        ELSE json_type("__new_music_cover_proposals"."submitted_tags_json") = 'array'
      END),
	CONSTRAINT "music_cover_proposals_status_check" CHECK("__new_music_cover_proposals"."status" IN ('pending_review', 'approved', 'rejected', 'withdrawn')),
	CONSTRAINT "music_cover_proposals_version_check" CHECK(typeof("__new_music_cover_proposals"."version") = 'integer' AND "__new_music_cover_proposals"."version" >= 0),
	CONSTRAINT "music_cover_proposals_lock_pair_check" CHECK(("__new_music_cover_proposals"."review_lock_token" IS NULL AND "__new_music_cover_proposals"."review_lock_expires_at" IS NULL)
        OR ("__new_music_cover_proposals"."review_lock_token" IS NOT NULL
          AND length(trim("__new_music_cover_proposals"."review_lock_token")) > 0
          AND typeof("__new_music_cover_proposals"."review_lock_expires_at") = 'integer'
          AND "__new_music_cover_proposals"."review_lock_expires_at" >= 0)),
	CONSTRAINT "music_cover_proposals_review_pair_check" CHECK(("__new_music_cover_proposals"."reviewed_by_user_id" IS NULL AND "__new_music_cover_proposals"."reviewed_at" IS NULL)
        OR ("__new_music_cover_proposals"."reviewed_by_user_id" IS NOT NULL
          AND length(trim("__new_music_cover_proposals"."reviewed_by_user_id")) > 0
          AND typeof("__new_music_cover_proposals"."reviewed_at") = 'integer'
          AND "__new_music_cover_proposals"."reviewed_at" >= "__new_music_cover_proposals"."created_at")),
	CONSTRAINT "music_cover_proposals_status_outcome_check" CHECK(("__new_music_cover_proposals"."status" = 'pending_review'
          AND "__new_music_cover_proposals"."reviewed_by_user_id" IS NULL
          AND "__new_music_cover_proposals"."reviewed_at" IS NULL
          AND "__new_music_cover_proposals"."review_result_code" IS NULL
          AND "__new_music_cover_proposals"."review_note" IS NULL
          AND "__new_music_cover_proposals"."approved_performance_id" IS NULL)
        OR ("__new_music_cover_proposals"."status" = 'approved'
          AND "__new_music_cover_proposals"."reviewed_by_user_id" IS NOT NULL
          AND "__new_music_cover_proposals"."reviewed_at" IS NOT NULL
          AND "__new_music_cover_proposals"."approved_performance_id" IS NOT NULL)
        OR ("__new_music_cover_proposals"."status" = 'rejected'
          AND "__new_music_cover_proposals"."reviewed_by_user_id" IS NOT NULL
          AND "__new_music_cover_proposals"."reviewed_at" IS NOT NULL
          AND "__new_music_cover_proposals"."approved_performance_id" IS NULL)
        OR ("__new_music_cover_proposals"."status" = 'withdrawn'
          AND "__new_music_cover_proposals"."reviewed_by_user_id" IS NULL
          AND "__new_music_cover_proposals"."reviewed_at" IS NULL
          AND "__new_music_cover_proposals"."review_result_code" IS NULL
          AND "__new_music_cover_proposals"."review_note" IS NULL
          AND "__new_music_cover_proposals"."approved_performance_id" IS NULL)),
	CONSTRAINT "music_cover_proposals_terminal_lock_check" CHECK("__new_music_cover_proposals"."status" = 'pending_review'
        OR ("__new_music_cover_proposals"."review_lock_token" IS NULL AND "__new_music_cover_proposals"."review_lock_expires_at" IS NULL)),
	CONSTRAINT "music_cover_proposals_optional_text_check" CHECK(("__new_music_cover_proposals"."submitted_note" IS NULL OR length(trim("__new_music_cover_proposals"."submitted_note")) > 0)
        AND ("__new_music_cover_proposals"."review_result_code" IS NULL OR length(trim("__new_music_cover_proposals"."review_result_code")) > 0)
        AND ("__new_music_cover_proposals"."review_note" IS NULL OR length(trim("__new_music_cover_proposals"."review_note")) > 0)),
	CONSTRAINT "music_cover_proposals_time_check" CHECK(typeof("__new_music_cover_proposals"."created_at") = 'integer' AND "__new_music_cover_proposals"."created_at" >= 0
        AND typeof("__new_music_cover_proposals"."updated_at") = 'integer' AND "__new_music_cover_proposals"."updated_at" >= "__new_music_cover_proposals"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_music_cover_proposals`("id", "submitted_by_user_id", "idempotency_key", "submitted_url", "youtube_video_id", "segment_start_seconds", "submitted_title", "submitted_tags_json", "suggested_song_id", "submitted_note", "status", "version", "review_lock_token", "review_lock_expires_at", "reviewed_by_user_id", "reviewed_at", "review_result_code", "review_note", "approved_performance_id", "created_at", "updated_at") SELECT "id", "submitted_by_user_id", "idempotency_key", "submitted_url", "youtube_video_id", "segment_start_seconds", "submitted_title", "submitted_tags_json", "suggested_song_id", "submitted_note", "status", "version", "review_lock_token", "review_lock_expires_at", "reviewed_by_user_id", "reviewed_at", "review_result_code", "review_note", "approved_performance_id", "created_at", "updated_at" FROM `music_cover_proposals`;--> statement-breakpoint
DROP TABLE `music_cover_proposals`;--> statement-breakpoint
ALTER TABLE `__new_music_cover_proposals` RENAME TO `music_cover_proposals`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_submitter_idempotency` ON `music_cover_proposals` (`submitted_by_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_pending_video_segment` ON `music_cover_proposals` (`youtube_video_id`,`segment_start_seconds`) WHERE "music_cover_proposals"."status" = 'pending_review';--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_approved_performance` ON `music_cover_proposals` (`approved_performance_id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_status_created_id` ON `music_cover_proposals` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_submitter_created_id` ON `music_cover_proposals` (`submitted_by_user_id`,"created_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_reviewer_reviewed_id` ON `music_cover_proposals` (`reviewed_by_user_id`,"reviewed_at" DESC,`id`) WHERE "music_cover_proposals"."reviewed_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_suggested_song_id` ON `music_cover_proposals` (`suggested_song_id`);--> statement-breakpoint
CREATE TABLE `__new_music_cover_proposal_participants` (
	`proposal_id` text NOT NULL,
	`credit_order` integer DEFAULT 0 NOT NULL,
	`resolved_entity_id` text,
	`submitted_member_uid` integer,
	`submitted_name_snapshot` text NOT NULL,
	`participant_role` text NOT NULL,
	PRIMARY KEY(`proposal_id`, `credit_order`),
	FOREIGN KEY (`proposal_id`) REFERENCES `music_cover_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_entity_id`) REFERENCES `music_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`submitted_member_uid`) REFERENCES `members`(`uid`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "music_cover_proposal_participants_credit_order_check" CHECK(typeof("__new_music_cover_proposal_participants"."credit_order") = 'integer' AND "__new_music_cover_proposal_participants"."credit_order" >= 0),
	CONSTRAINT "music_cover_proposal_participants_snapshot_check" CHECK(length(trim("__new_music_cover_proposal_participants"."submitted_name_snapshot")) > 0),
	CONSTRAINT "music_cover_proposal_participants_role_check" CHECK("__new_music_cover_proposal_participants"."participant_role" IN ('vocal', 'featured_vocal', 'chorus', 'other'))
);--> statement-breakpoint
INSERT INTO `__new_music_cover_proposal_participants` (
  `proposal_id`, `credit_order`, `resolved_entity_id`, `submitted_member_uid`,
  `submitted_name_snapshot`, `participant_role`
) SELECT
  `proposal_id`, `credit_order`, `resolved_entity_id`, `submitted_member_uid`,
  `submitted_name_snapshot`, `participant_role`
FROM `__backup_music_cover_proposal_participants`;--> statement-breakpoint
DROP TABLE `__backup_music_cover_proposal_participants`;--> statement-breakpoint
ALTER TABLE `__new_music_cover_proposal_participants` RENAME TO `music_cover_proposal_participants`;--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposal_participants_entity_proposal` ON `music_cover_proposal_participants` (`resolved_entity_id`,`proposal_id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposal_participants_member_proposal` ON `music_cover_proposal_participants` (`submitted_member_uid`,`proposal_id`);--> statement-breakpoint

CREATE TABLE `__new_music_cover_proposal_original_artists` (
	`proposal_id` text NOT NULL,
	`credit_order` integer DEFAULT 0 NOT NULL,
	`resolved_entity_id` text,
	`submitted_member_uid` integer,
	`submitted_name_snapshot` text NOT NULL,
	PRIMARY KEY(`proposal_id`, `credit_order`),
	FOREIGN KEY (`proposal_id`) REFERENCES `music_cover_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_entity_id`) REFERENCES `music_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`submitted_member_uid`) REFERENCES `members`(`uid`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "music_cover_proposal_original_artists_credit_order_check" CHECK(typeof("__new_music_cover_proposal_original_artists"."credit_order") = 'integer' AND "__new_music_cover_proposal_original_artists"."credit_order" >= 0),
	CONSTRAINT "music_cover_proposal_original_artists_snapshot_check" CHECK(length(trim("__new_music_cover_proposal_original_artists"."submitted_name_snapshot")) > 0)
);--> statement-breakpoint
INSERT INTO `__new_music_cover_proposal_original_artists` (
  `proposal_id`, `credit_order`, `resolved_entity_id`, `submitted_member_uid`,
  `submitted_name_snapshot`
) SELECT
  `proposal_id`, `credit_order`, `resolved_entity_id`, `submitted_member_uid`,
  `submitted_name_snapshot`
FROM `__backup_music_cover_proposal_original_artists`;--> statement-breakpoint
DROP TABLE `__backup_music_cover_proposal_original_artists`;--> statement-breakpoint
ALTER TABLE `__new_music_cover_proposal_original_artists` RENAME TO `music_cover_proposal_original_artists`;--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposal_original_artists_entity_proposal` ON `music_cover_proposal_original_artists` (`resolved_entity_id`,`proposal_id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposal_original_artists_member_proposal` ON `music_cover_proposal_original_artists` (`submitted_member_uid`,`proposal_id`);--> statement-breakpoint
CREATE TABLE `__new_music_ingestion_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'youtube' NOT NULL,
	`external_video_id` text NOT NULL,
	`candidate_kind` text DEFAULT 'official_video' NOT NULL,
	`status` text DEFAULT 'discovered' NOT NULL,
	`classification` text DEFAULT 'pending_metadata' NOT NULL,
	`exclusion_reason` text,
	`title` text,
	`channel_id` text,
	`channel_title` text,
	`thumbnail_url` text,
	`duration_seconds` integer,
	`provider_published_at` integer,
	`availability_status` text DEFAULT 'unknown' NOT NULL,
	`made_for_kids` integer,
	`metadata_checked_at` integer,
	`review_input_json` text,
	`reviewed_by_user_id` text,
	`last_conversion_outcome` text,
	`last_conversion_error_code` text,
	`last_conversion_attempt_at` integer,
	`first_discovered_at` integer NOT NULL,
	`last_discovered_at` integer NOT NULL,
	`retention_expires_at` integer NOT NULL,
	`next_retry_at` integer,
	`linked_performance_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`linked_performance_id`) REFERENCES `music_performances`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_ingestion_candidates_identity_check" CHECK("__new_music_ingestion_candidates"."provider" = 'youtube'
        AND length("__new_music_ingestion_candidates"."external_video_id") = 11
        AND "__new_music_ingestion_candidates"."external_video_id" NOT GLOB '*[^A-Za-z0-9_-]*'
        AND "__new_music_ingestion_candidates"."candidate_kind" IN ('official_video', 'singing_clip')),
	CONSTRAINT "music_ingestion_candidates_status_check" CHECK("__new_music_ingestion_candidates"."status" IN ('discovered', 'needs_input', 'ready', 'converted', 'ignored', 'blocked')),
	CONSTRAINT "music_ingestion_candidates_classification_check" CHECK("__new_music_ingestion_candidates"."classification" IN ('pending_metadata', 'eligible', 'existing_catalog',
        'existing_proposal', 'existing_candidate', 'channel_review', 'policy_blocked',
        'unavailable', 'scope_review', 'playlist_duplicate')),
	CONSTRAINT "music_ingestion_candidates_metadata_check" CHECK(("__new_music_ingestion_candidates"."exclusion_reason" IS NULL OR length(trim("__new_music_ingestion_candidates"."exclusion_reason")) > 0)
        AND ("__new_music_ingestion_candidates"."title" IS NULL OR length(trim("__new_music_ingestion_candidates"."title")) > 0)
        AND ("__new_music_ingestion_candidates"."channel_id" IS NULL OR length(trim("__new_music_ingestion_candidates"."channel_id")) > 0)
        AND ("__new_music_ingestion_candidates"."channel_title" IS NULL OR length(trim("__new_music_ingestion_candidates"."channel_title")) > 0)
        AND ("__new_music_ingestion_candidates"."duration_seconds" IS NULL
          OR (typeof("__new_music_ingestion_candidates"."duration_seconds") = 'integer' AND "__new_music_ingestion_candidates"."duration_seconds" >= 0))),
	CONSTRAINT "music_ingestion_candidates_availability_check" CHECK("__new_music_ingestion_candidates"."availability_status" IN ('unknown', 'playable', 'private',
        'embed_disabled', 'deleted', 'region_blocked', 'unavailable')),
	CONSTRAINT "music_ingestion_candidates_review_json_check" CHECK(CASE
        WHEN "__new_music_ingestion_candidates"."review_input_json" IS NULL THEN 1
        WHEN typeof("__new_music_ingestion_candidates"."review_input_json") <> 'text' THEN 0
        WHEN json_valid("__new_music_ingestion_candidates"."review_input_json") = 0 THEN 0
        ELSE json_type("__new_music_ingestion_candidates"."review_input_json") = 'object'
      END),
	CONSTRAINT "music_ingestion_candidates_boolean_check" CHECK("__new_music_ingestion_candidates"."made_for_kids" IS NULL
        OR (typeof("__new_music_ingestion_candidates"."made_for_kids") = 'integer'
          AND "__new_music_ingestion_candidates"."made_for_kids" IN (0, 1))),
	CONSTRAINT "music_ingestion_candidates_conversion_check" CHECK(CASE
        WHEN "__new_music_ingestion_candidates"."last_conversion_outcome" IS NULL THEN
          "__new_music_ingestion_candidates"."last_conversion_error_code" IS NULL
          AND "__new_music_ingestion_candidates"."last_conversion_attempt_at" IS NULL
        WHEN "__new_music_ingestion_candidates"."last_conversion_outcome" NOT IN ('created', 'duplicate', 'stale',
          'validation_failed', 'retryable_failed') THEN 0
        WHEN typeof("__new_music_ingestion_candidates"."last_conversion_attempt_at") <> 'integer'
          OR "__new_music_ingestion_candidates"."last_conversion_attempt_at" < "__new_music_ingestion_candidates"."created_at" THEN 0
        WHEN "__new_music_ingestion_candidates"."last_conversion_error_code" IS NOT NULL
          AND length(trim("__new_music_ingestion_candidates"."last_conversion_error_code")) = 0 THEN 0
        ELSE 1
      END),
	CONSTRAINT "music_ingestion_candidates_version_time_check" CHECK(typeof("__new_music_ingestion_candidates"."version") = 'integer' AND "__new_music_ingestion_candidates"."version" >= 0
        AND typeof("__new_music_ingestion_candidates"."first_discovered_at") = 'integer' AND "__new_music_ingestion_candidates"."first_discovered_at" >= 0
        AND typeof("__new_music_ingestion_candidates"."last_discovered_at") = 'integer'
        AND "__new_music_ingestion_candidates"."last_discovered_at" >= "__new_music_ingestion_candidates"."first_discovered_at"
        AND typeof("__new_music_ingestion_candidates"."retention_expires_at") = 'integer'
        AND "__new_music_ingestion_candidates"."retention_expires_at" >= "__new_music_ingestion_candidates"."last_discovered_at"
        AND ("__new_music_ingestion_candidates"."metadata_checked_at" IS NULL
          OR (typeof("__new_music_ingestion_candidates"."metadata_checked_at") = 'integer' AND "__new_music_ingestion_candidates"."metadata_checked_at" >= 0))
        AND ("__new_music_ingestion_candidates"."next_retry_at" IS NULL
          OR (typeof("__new_music_ingestion_candidates"."next_retry_at") = 'integer' AND "__new_music_ingestion_candidates"."next_retry_at" >= 0))
        AND typeof("__new_music_ingestion_candidates"."created_at") = 'integer' AND "__new_music_ingestion_candidates"."created_at" >= 0
        AND typeof("__new_music_ingestion_candidates"."updated_at") = 'integer' AND "__new_music_ingestion_candidates"."updated_at" >= "__new_music_ingestion_candidates"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_music_ingestion_candidates`("id", "provider", "external_video_id", "candidate_kind", "status", "classification", "exclusion_reason", "title", "channel_id", "channel_title", "thumbnail_url", "duration_seconds", "provider_published_at", "availability_status", "made_for_kids", "metadata_checked_at", "review_input_json", "reviewed_by_user_id", "last_conversion_outcome", "last_conversion_error_code", "last_conversion_attempt_at", "first_discovered_at", "last_discovered_at", "retention_expires_at", "next_retry_at", "linked_performance_id", "version", "created_at", "updated_at") SELECT "id", "provider", "external_video_id", "candidate_kind", "status", "classification", "exclusion_reason", "title", "channel_id", "channel_title", "thumbnail_url", "duration_seconds", "provider_published_at", "availability_status", "made_for_kids", "metadata_checked_at", "review_input_json", "reviewed_by_user_id", "last_conversion_outcome", "last_conversion_error_code", "last_conversion_attempt_at", "first_discovered_at", "last_discovered_at", "retention_expires_at", "next_retry_at", "linked_performance_id", "version", "created_at", "updated_at" FROM `music_ingestion_candidates`;--> statement-breakpoint
DROP TABLE `music_ingestion_candidates`;--> statement-breakpoint
ALTER TABLE `__new_music_ingestion_candidates` RENAME TO `music_ingestion_candidates`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_ingestion_candidates_provider_video` ON `music_ingestion_candidates` (`provider`,`external_video_id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_candidates_status_updated_id` ON `music_ingestion_candidates` (`status`,"updated_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_candidates_channel_status_id` ON `music_ingestion_candidates` (`channel_id`,`status`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_candidates_refresh_id` ON `music_ingestion_candidates` (`metadata_checked_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_candidates_retention_id` ON `music_ingestion_candidates` (`retention_expires_at`,`id`);--> statement-breakpoint
CREATE TABLE `music_ingestion_candidate_origins` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`job_id` text NOT NULL,
	`origin_kind` text DEFAULT 'playlist_import' NOT NULL,
	`playlist_id` text NOT NULL,
	`playlist_item_id` text NOT NULL,
	`playlist_position` integer NOT NULL,
	`is_playlist_duplicate` integer DEFAULT false NOT NULL,
	`discovered_at` integer NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `music_ingestion_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `music_ingestion_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_ingestion_origins_required_check" CHECK("music_ingestion_candidate_origins"."origin_kind" = 'playlist_import'
        AND length(trim("music_ingestion_candidate_origins"."id")) > 0
        AND length(trim("music_ingestion_candidate_origins"."playlist_id")) > 0
        AND length(trim("music_ingestion_candidate_origins"."playlist_item_id")) > 0
        AND typeof("music_ingestion_candidate_origins"."playlist_position") = 'integer'
        AND "music_ingestion_candidate_origins"."playlist_position" >= 0
        AND typeof("music_ingestion_candidate_origins"."is_playlist_duplicate") = 'integer'
        AND "music_ingestion_candidate_origins"."is_playlist_duplicate" IN (0, 1)
        AND typeof("music_ingestion_candidate_origins"."discovered_at") = 'integer'
        AND "music_ingestion_candidate_origins"."discovered_at" >= 0)
);--> statement-breakpoint
INSERT INTO `music_ingestion_candidate_origins`
SELECT * FROM `__backup_music_ingestion_candidate_origins`;--> statement-breakpoint
DROP TABLE `__backup_music_ingestion_candidate_origins`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_ingestion_origins_job_item` ON `music_ingestion_candidate_origins` (`job_id`,`playlist_item_id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_origins_job_position_id` ON `music_ingestion_candidate_origins` (`job_id`,`playlist_position`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_origins_candidate_discovered_id` ON `music_ingestion_candidate_origins` (`candidate_id`,"discovered_at" DESC,`id`);--> statement-breakpoint

CREATE TABLE `music_ingestion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`candidate_id` text,
	`event_type` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `music_ingestion_jobs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `music_ingestion_candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_ingestion_events_required_check" CHECK(length(trim("music_ingestion_events"."id")) > 0
        AND ("music_ingestion_events"."job_id" IS NOT NULL OR "music_ingestion_events"."candidate_id" IS NOT NULL)
        AND length(trim("music_ingestion_events"."event_type")) > 0
        AND length(trim("music_ingestion_events"."actor_user_id")) > 0
        AND json_valid("music_ingestion_events"."detail_json") = 1
        AND json_type("music_ingestion_events"."detail_json") = 'object'
        AND typeof("music_ingestion_events"."created_at") = 'integer'
        AND "music_ingestion_events"."created_at" >= 0)
);--> statement-breakpoint
INSERT INTO `music_ingestion_events`
SELECT * FROM `__backup_music_ingestion_events`;--> statement-breakpoint
DROP TABLE `__backup_music_ingestion_events`;--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_events_job_created_id` ON `music_ingestion_events` (`job_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_events_candidate_created_id` ON `music_ingestion_events` (`candidate_id`,`created_at`,`id`);--> statement-breakpoint

CREATE TABLE `music_channel_upload_candidate_origins` (
	`monitor_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`provider_published_at` integer,
	`discovered_at` integer NOT NULL,
	`monitor_generation` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`monitor_id`, `candidate_id`),
	FOREIGN KEY (`monitor_id`) REFERENCES `music_channel_upload_monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `music_ingestion_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_channel_upload_origins_generation_time_check" CHECK(typeof("music_channel_upload_candidate_origins"."monitor_generation") = 'integer'
        AND "music_channel_upload_candidate_origins"."monitor_generation" >= 0
        AND typeof("music_channel_upload_candidate_origins"."discovered_at") = 'integer'
        AND "music_channel_upload_candidate_origins"."discovered_at" >= 0
        AND ("music_channel_upload_candidate_origins"."provider_published_at" IS NULL
          OR (typeof("music_channel_upload_candidate_origins"."provider_published_at") = 'integer'
            AND "music_channel_upload_candidate_origins"."provider_published_at" >= 0)))
);--> statement-breakpoint
INSERT INTO `music_channel_upload_candidate_origins`
SELECT * FROM `__backup_music_channel_upload_candidate_origins`;--> statement-breakpoint
DROP TABLE `__backup_music_channel_upload_candidate_origins`;--> statement-breakpoint
CREATE INDEX `idx_music_channel_upload_origins_monitor_discovered` ON `music_channel_upload_candidate_origins` (`monitor_id`,"discovered_at" DESC,`candidate_id`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_upload_origins_monitor_generation_discovered` ON `music_channel_upload_candidate_origins` (`monitor_id`,`monitor_generation`,"discovered_at" DESC,`candidate_id`);--> statement-breakpoint

CREATE TABLE `music_channel_websub_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text NOT NULL,
	`monitor_generation` integer NOT NULL,
	`topic_url` text NOT NULL,
	`callback_token_hash` text NOT NULL,
	`secret_version` integer NOT NULL,
	`status` text NOT NULL,
	`pending_mode` text,
	`requested_at` integer NOT NULL,
	`verified_at` integer,
	`lease_expires_at` integer,
	`last_notification_at` integer,
	`last_error_code` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `music_channel_upload_monitors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_channel_websub_subscriptions_identity_check" CHECK(length(trim("music_channel_websub_subscriptions"."id")) > 0
        AND typeof("music_channel_websub_subscriptions"."monitor_generation") = 'integer'
        AND "music_channel_websub_subscriptions"."monitor_generation" >= 0
        AND length("music_channel_websub_subscriptions"."topic_url") = 80
        AND substr("music_channel_websub_subscriptions"."topic_url", 1, 56) = 'https://www.youtube.com/xml/feeds/videos.xml?channel_id='
        AND length("music_channel_websub_subscriptions"."callback_token_hash") = 64
        AND "music_channel_websub_subscriptions"."callback_token_hash" NOT GLOB '*[^a-f0-9]*'
        AND typeof("music_channel_websub_subscriptions"."secret_version") = 'integer'
        AND "music_channel_websub_subscriptions"."secret_version" >= 1),
	CONSTRAINT "music_channel_websub_subscriptions_status_check" CHECK("music_channel_websub_subscriptions"."status" IN ('pending', 'active', 'renewing', 'unsubscribing',
        'unsubscribed', 'denied', 'failed')
        AND ("music_channel_websub_subscriptions"."pending_mode" IS NULL
          OR "music_channel_websub_subscriptions"."pending_mode" IN ('subscribe', 'unsubscribe'))
        AND (("music_channel_websub_subscriptions"."status" IN ('pending', 'renewing') AND "music_channel_websub_subscriptions"."pending_mode" = 'subscribe')
          OR ("music_channel_websub_subscriptions"."status" = 'unsubscribing' AND "music_channel_websub_subscriptions"."pending_mode" = 'unsubscribe')
          OR ("music_channel_websub_subscriptions"."status" IN ('active', 'unsubscribed', 'denied', 'failed')
            AND "music_channel_websub_subscriptions"."pending_mode" IS NULL))
        AND ("music_channel_websub_subscriptions"."status" <> 'active'
          OR ("music_channel_websub_subscriptions"."verified_at" IS NOT NULL AND "music_channel_websub_subscriptions"."lease_expires_at" IS NOT NULL))),
	CONSTRAINT "music_channel_websub_subscriptions_time_check" CHECK(typeof("music_channel_websub_subscriptions"."version") = 'integer' AND "music_channel_websub_subscriptions"."version" >= 0
        AND typeof("music_channel_websub_subscriptions"."requested_at") = 'integer' AND "music_channel_websub_subscriptions"."requested_at" >= 0
        AND ("music_channel_websub_subscriptions"."verified_at" IS NULL
          OR (typeof("music_channel_websub_subscriptions"."verified_at") = 'integer' AND "music_channel_websub_subscriptions"."verified_at" >= 0))
        AND ("music_channel_websub_subscriptions"."lease_expires_at" IS NULL
          OR (typeof("music_channel_websub_subscriptions"."lease_expires_at") = 'integer'
            AND "music_channel_websub_subscriptions"."lease_expires_at" >= "music_channel_websub_subscriptions"."requested_at"))
        AND ("music_channel_websub_subscriptions"."last_notification_at" IS NULL
          OR (typeof("music_channel_websub_subscriptions"."last_notification_at") = 'integer'
            AND "music_channel_websub_subscriptions"."last_notification_at" >= 0))
        AND ("music_channel_websub_subscriptions"."last_error_code" IS NULL OR length(trim("music_channel_websub_subscriptions"."last_error_code")) > 0)
        AND typeof("music_channel_websub_subscriptions"."created_at") = 'integer' AND "music_channel_websub_subscriptions"."created_at" >= 0
        AND typeof("music_channel_websub_subscriptions"."updated_at") = 'integer' AND "music_channel_websub_subscriptions"."updated_at" >= "music_channel_websub_subscriptions"."created_at")
);--> statement-breakpoint
INSERT INTO `music_channel_websub_subscriptions`
SELECT * FROM `__backup_music_channel_websub_subscriptions`;--> statement-breakpoint
DROP TABLE `__backup_music_channel_websub_subscriptions`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_websub_subscriptions_monitor_generation` ON `music_channel_websub_subscriptions` (`monitor_id`,`monitor_generation`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_websub_subscriptions_callback_hash` ON `music_channel_websub_subscriptions` (`callback_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_websub_subscriptions_lease` ON `music_channel_websub_subscriptions` (`status`,`lease_expires_at`,`id`);--> statement-breakpoint

CREATE TABLE `music_channel_websub_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`monitor_id` text NOT NULL,
	`monitor_generation` integer NOT NULL,
	`external_channel_id` text NOT NULL,
	`external_video_id` text NOT NULL,
	`provider_updated_at` integer NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`received_at` integer NOT NULL,
	`enqueued_at` integer,
	`processed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `music_channel_websub_subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`monitor_id`) REFERENCES `music_channel_upload_monitors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_channel_websub_deliveries_identity_check" CHECK(length(trim("music_channel_websub_deliveries"."id")) > 0
        AND typeof("music_channel_websub_deliveries"."monitor_generation") = 'integer'
        AND "music_channel_websub_deliveries"."monitor_generation" >= 0
        AND length("music_channel_websub_deliveries"."external_channel_id") = 24
        AND substr("music_channel_websub_deliveries"."external_channel_id", 1, 2) = 'UC'
        AND substr("music_channel_websub_deliveries"."external_channel_id", 3) NOT GLOB '*[^A-Za-z0-9_-]*'
        AND length("music_channel_websub_deliveries"."external_video_id") = 11
        AND "music_channel_websub_deliveries"."external_video_id" NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "music_channel_websub_deliveries_status_check" CHECK("music_channel_websub_deliveries"."status" IN ('pending', 'enqueued', 'processing', 'completed',
        'rejected', 'failed', 'dead_letter')
        AND typeof("music_channel_websub_deliveries"."attempt_count") = 'integer'
        AND "music_channel_websub_deliveries"."attempt_count" >= 0
        AND ("music_channel_websub_deliveries"."last_error_code" IS NULL OR length(trim("music_channel_websub_deliveries"."last_error_code")) > 0)),
	CONSTRAINT "music_channel_websub_deliveries_time_check" CHECK(typeof("music_channel_websub_deliveries"."provider_updated_at") = 'integer' AND "music_channel_websub_deliveries"."provider_updated_at" >= 0
        AND typeof("music_channel_websub_deliveries"."received_at") = 'integer' AND "music_channel_websub_deliveries"."received_at" >= 0
        AND ("music_channel_websub_deliveries"."enqueued_at" IS NULL
          OR (typeof("music_channel_websub_deliveries"."enqueued_at") = 'integer' AND "music_channel_websub_deliveries"."enqueued_at" >= "music_channel_websub_deliveries"."received_at"))
        AND ("music_channel_websub_deliveries"."processed_at" IS NULL
          OR (typeof("music_channel_websub_deliveries"."processed_at") = 'integer' AND "music_channel_websub_deliveries"."processed_at" >= "music_channel_websub_deliveries"."received_at"))
        AND typeof("music_channel_websub_deliveries"."updated_at") = 'integer' AND "music_channel_websub_deliveries"."updated_at" >= "music_channel_websub_deliveries"."received_at")
);--> statement-breakpoint
INSERT INTO `music_channel_websub_deliveries`
SELECT * FROM `__backup_music_channel_websub_deliveries`;--> statement-breakpoint
DROP TABLE `__backup_music_channel_websub_deliveries`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_websub_deliveries_event` ON `music_channel_websub_deliveries` (`subscription_id`,`external_video_id`,`provider_updated_at`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_websub_deliveries_status_received` ON `music_channel_websub_deliveries` (`status`,`received_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_websub_deliveries_monitor_received` ON `music_channel_websub_deliveries` (`monitor_id`,"received_at" DESC,`id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
