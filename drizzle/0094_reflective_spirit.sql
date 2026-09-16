-- Preserve proposal participants and original artists during the D1 table rebuild.
CREATE TABLE `__proposal_delete_participants` AS SELECT * FROM `music_cover_proposal_participants`;--> statement-breakpoint
CREATE TABLE `__proposal_delete_artists` AS SELECT * FROM `music_cover_proposal_original_artists`;--> statement-breakpoint
DELETE FROM `music_cover_proposal_participants`;--> statement-breakpoint
DELETE FROM `music_cover_proposal_original_artists`;--> statement-breakpoint
CREATE TABLE `__new_music_cover_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`submitted_url` text NOT NULL,
	`youtube_video_id` text NOT NULL,
	`segment_start_seconds` integer DEFAULT 0 NOT NULL,
	`submission_kind` text DEFAULT 'official_cover' NOT NULL,
	`submitted_broadcast_json` text,
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
	`approved_performance_snapshot_json` text,
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
          AND ("__new_music_cover_proposals"."approved_performance_id" IS NOT NULL
            OR "__new_music_cover_proposals"."approved_performance_snapshot_json" IS NOT NULL))
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
	CONSTRAINT "music_cover_proposals_deleted_approval_check" CHECK("__new_music_cover_proposals"."approved_performance_snapshot_json" IS NULL OR CASE
        WHEN json_valid("__new_music_cover_proposals"."approved_performance_snapshot_json") = 0 THEN 0
        ELSE coalesce("__new_music_cover_proposals"."status" = 'approved'
          AND "__new_music_cover_proposals"."approved_performance_id" IS NULL
          AND json_type("__new_music_cover_proposals"."approved_performance_snapshot_json") = 'object'
          AND json_type("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.performanceId') = 'text'
          AND length(trim(json_extract("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.performanceId'))) > 0
          AND json_type("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.songId') = 'text'
          AND json_type("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.deletedAt') = 'integer'
          AND json_extract("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.deletedAt') >= "__new_music_cover_proposals"."reviewed_at", 0)
        END),
	CONSTRAINT "music_cover_proposals_terminal_lock_check" CHECK("__new_music_cover_proposals"."status" = 'pending_review'
        OR ("__new_music_cover_proposals"."review_lock_token" IS NULL AND "__new_music_cover_proposals"."review_lock_expires_at" IS NULL)),
	CONSTRAINT "music_cover_proposals_optional_text_check" CHECK(("__new_music_cover_proposals"."submitted_note" IS NULL OR length(trim("__new_music_cover_proposals"."submitted_note")) > 0)
        AND ("__new_music_cover_proposals"."review_result_code" IS NULL OR length(trim("__new_music_cover_proposals"."review_result_code")) > 0)
        AND ("__new_music_cover_proposals"."review_note" IS NULL OR length(trim("__new_music_cover_proposals"."review_note")) > 0)),
	CONSTRAINT "music_cover_proposals_time_check" CHECK(typeof("__new_music_cover_proposals"."created_at") = 'integer' AND "__new_music_cover_proposals"."created_at" >= 0
        AND typeof("__new_music_cover_proposals"."updated_at") = 'integer' AND "__new_music_cover_proposals"."updated_at" >= "__new_music_cover_proposals"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_music_cover_proposals`("id", "submitted_by_user_id", "idempotency_key", "submitted_url", "youtube_video_id", "segment_start_seconds", "submission_kind", "submitted_broadcast_json", "submitted_title", "submitted_tags_json", "suggested_song_id", "submitted_note", "status", "version", "review_lock_token", "review_lock_expires_at", "reviewed_by_user_id", "reviewed_at", "review_result_code", "review_note", "approved_performance_id", "approved_performance_snapshot_json", "created_at", "updated_at") SELECT "id", "submitted_by_user_id", "idempotency_key", "submitted_url", "youtube_video_id", "segment_start_seconds", "submission_kind", "submitted_broadcast_json", "submitted_title", "submitted_tags_json", "suggested_song_id", "submitted_note", "status", "version", "review_lock_token", "review_lock_expires_at", "reviewed_by_user_id", "reviewed_at", "review_result_code", "review_note", "approved_performance_id", NULL, "created_at", "updated_at" FROM `music_cover_proposals`;--> statement-breakpoint
DROP TABLE `music_cover_proposals`;--> statement-breakpoint
ALTER TABLE `__new_music_cover_proposals` RENAME TO `music_cover_proposals`;--> statement-breakpoint
INSERT INTO `music_cover_proposal_participants` SELECT * FROM `__proposal_delete_participants`;--> statement-breakpoint
INSERT INTO `music_cover_proposal_original_artists` SELECT * FROM `__proposal_delete_artists`;--> statement-breakpoint
DROP TABLE `__proposal_delete_participants`;--> statement-breakpoint
DROP TABLE `__proposal_delete_artists`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_submitter_idempotency` ON `music_cover_proposals` (`submitted_by_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_pending_video_segment` ON `music_cover_proposals` (`youtube_video_id`,`segment_start_seconds`) WHERE "music_cover_proposals"."status" = 'pending_review';--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_approved_performance` ON `music_cover_proposals` (`approved_performance_id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_status_created_id` ON `music_cover_proposals` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_submitter_created_id` ON `music_cover_proposals` (`submitted_by_user_id`,"created_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_reviewer_reviewed_id` ON `music_cover_proposals` (`reviewed_by_user_id`,"reviewed_at" DESC,`id`) WHERE "music_cover_proposals"."reviewed_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_suggested_song_id` ON `music_cover_proposals` (`suggested_song_id`);