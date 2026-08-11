CREATE TABLE `music_catalog_events` (
	`id` text PRIMARY KEY NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_kind` text NOT NULL,
	`actor_user_id` text,
	`before_json` text,
	`after_json` text,
	`detail_json` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "music_catalog_events_required_text_check" CHECK(length(trim("music_catalog_events"."id")) > 0
        AND length(trim("music_catalog_events"."aggregate_type")) > 0
        AND length(trim("music_catalog_events"."aggregate_id")) > 0
        AND length(trim("music_catalog_events"."event_type")) > 0),
	CONSTRAINT "music_catalog_events_actor_kind_check" CHECK("music_catalog_events"."actor_kind" IN ('member', 'admin', 'system')),
	CONSTRAINT "music_catalog_events_actor_check" CHECK(("music_catalog_events"."actor_kind" = 'system' AND "music_catalog_events"."actor_user_id" IS NULL)
        OR ("music_catalog_events"."actor_kind" IN ('member', 'admin')
          AND "music_catalog_events"."actor_user_id" IS NOT NULL
          AND length(trim("music_catalog_events"."actor_user_id")) > 0)),
	CONSTRAINT "music_catalog_events_json_check" CHECK(CASE
          WHEN "music_catalog_events"."before_json" IS NULL THEN 1
          WHEN typeof("music_catalog_events"."before_json") <> 'text' THEN 0
          WHEN json_valid("music_catalog_events"."before_json") = 0 THEN 0
          ELSE json_type("music_catalog_events"."before_json") = 'object'
        END
        AND CASE
          WHEN "music_catalog_events"."after_json" IS NULL THEN 1
          WHEN typeof("music_catalog_events"."after_json") <> 'text' THEN 0
          WHEN json_valid("music_catalog_events"."after_json") = 0 THEN 0
          ELSE json_type("music_catalog_events"."after_json") = 'object'
        END
        AND CASE
          WHEN "music_catalog_events"."detail_json" IS NULL THEN 1
          WHEN typeof("music_catalog_events"."detail_json") <> 'text' THEN 0
          WHEN json_valid("music_catalog_events"."detail_json") = 0 THEN 0
          ELSE json_type("music_catalog_events"."detail_json") = 'object'
        END),
	CONSTRAINT "music_catalog_events_time_check" CHECK(typeof("music_catalog_events"."created_at") = 'integer' AND "music_catalog_events"."created_at" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_music_catalog_events_aggregate_created_id` ON `music_catalog_events` (`aggregate_type`,`aggregate_id`,"created_at" DESC,`id`);--> statement-breakpoint
CREATE TABLE `music_cover_proposal_original_artists` (
	`proposal_id` text NOT NULL,
	`credit_order` integer DEFAULT 0 NOT NULL,
	`resolved_entity_id` text,
	`submitted_name_snapshot` text NOT NULL,
	PRIMARY KEY(`proposal_id`, `credit_order`),
	FOREIGN KEY (`proposal_id`) REFERENCES `music_cover_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_entity_id`) REFERENCES `music_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_cover_proposal_original_artists_credit_order_check" CHECK(typeof("music_cover_proposal_original_artists"."credit_order") = 'integer' AND "music_cover_proposal_original_artists"."credit_order" >= 0),
	CONSTRAINT "music_cover_proposal_original_artists_snapshot_check" CHECK(length(trim("music_cover_proposal_original_artists"."submitted_name_snapshot")) > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposal_original_artists_entity_proposal` ON `music_cover_proposal_original_artists` (`resolved_entity_id`,`proposal_id`);--> statement-breakpoint
CREATE TABLE `music_cover_proposal_participants` (
	`proposal_id` text NOT NULL,
	`credit_order` integer DEFAULT 0 NOT NULL,
	`resolved_entity_id` text,
	`submitted_name_snapshot` text NOT NULL,
	`participant_role` text NOT NULL,
	PRIMARY KEY(`proposal_id`, `credit_order`),
	FOREIGN KEY (`proposal_id`) REFERENCES `music_cover_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_entity_id`) REFERENCES `music_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_cover_proposal_participants_credit_order_check" CHECK(typeof("music_cover_proposal_participants"."credit_order") = 'integer' AND "music_cover_proposal_participants"."credit_order" >= 0),
	CONSTRAINT "music_cover_proposal_participants_snapshot_check" CHECK(length(trim("music_cover_proposal_participants"."submitted_name_snapshot")) > 0),
	CONSTRAINT "music_cover_proposal_participants_role_check" CHECK("music_cover_proposal_participants"."participant_role" IN ('vocal', 'featured_vocal', 'chorus', 'other'))
);
--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposal_participants_entity_proposal` ON `music_cover_proposal_participants` (`resolved_entity_id`,`proposal_id`);--> statement-breakpoint
CREATE TABLE `music_cover_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_by_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`submitted_url` text NOT NULL,
	`youtube_video_id` text NOT NULL,
	`segment_start_seconds` integer DEFAULT 0 NOT NULL,
	`submitted_title` text NOT NULL,
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
	CONSTRAINT "music_cover_proposals_required_text_check" CHECK(length(trim("music_cover_proposals"."id")) > 0
        AND length(trim("music_cover_proposals"."submitted_by_user_id")) > 0
        AND length(trim("music_cover_proposals"."idempotency_key")) > 0
        AND length(trim("music_cover_proposals"."submitted_url")) > 0
        AND length(trim("music_cover_proposals"."submitted_title")) > 0),
	CONSTRAINT "music_cover_proposals_video_id_check" CHECK(length("music_cover_proposals"."youtube_video_id") = 11 AND "music_cover_proposals"."youtube_video_id" NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "music_cover_proposals_segment_check" CHECK(typeof("music_cover_proposals"."segment_start_seconds") = 'integer' AND "music_cover_proposals"."segment_start_seconds" >= 0),
	CONSTRAINT "music_cover_proposals_status_check" CHECK("music_cover_proposals"."status" IN ('pending_review', 'approved', 'rejected', 'withdrawn')),
	CONSTRAINT "music_cover_proposals_version_check" CHECK(typeof("music_cover_proposals"."version") = 'integer' AND "music_cover_proposals"."version" >= 0),
	CONSTRAINT "music_cover_proposals_lock_pair_check" CHECK(("music_cover_proposals"."review_lock_token" IS NULL AND "music_cover_proposals"."review_lock_expires_at" IS NULL)
        OR ("music_cover_proposals"."review_lock_token" IS NOT NULL
          AND length(trim("music_cover_proposals"."review_lock_token")) > 0
          AND typeof("music_cover_proposals"."review_lock_expires_at") = 'integer'
          AND "music_cover_proposals"."review_lock_expires_at" >= 0)),
	CONSTRAINT "music_cover_proposals_review_pair_check" CHECK(("music_cover_proposals"."reviewed_by_user_id" IS NULL AND "music_cover_proposals"."reviewed_at" IS NULL)
        OR ("music_cover_proposals"."reviewed_by_user_id" IS NOT NULL
          AND length(trim("music_cover_proposals"."reviewed_by_user_id")) > 0
          AND typeof("music_cover_proposals"."reviewed_at") = 'integer'
          AND "music_cover_proposals"."reviewed_at" >= "music_cover_proposals"."created_at")),
	CONSTRAINT "music_cover_proposals_status_outcome_check" CHECK(("music_cover_proposals"."status" = 'pending_review'
          AND "music_cover_proposals"."reviewed_by_user_id" IS NULL
          AND "music_cover_proposals"."reviewed_at" IS NULL
          AND "music_cover_proposals"."review_result_code" IS NULL
          AND "music_cover_proposals"."review_note" IS NULL
          AND "music_cover_proposals"."approved_performance_id" IS NULL)
        OR ("music_cover_proposals"."status" = 'approved'
          AND "music_cover_proposals"."reviewed_by_user_id" IS NOT NULL
          AND "music_cover_proposals"."reviewed_at" IS NOT NULL
          AND "music_cover_proposals"."approved_performance_id" IS NOT NULL)
        OR ("music_cover_proposals"."status" = 'rejected'
          AND "music_cover_proposals"."reviewed_by_user_id" IS NOT NULL
          AND "music_cover_proposals"."reviewed_at" IS NOT NULL
          AND "music_cover_proposals"."approved_performance_id" IS NULL)
        OR ("music_cover_proposals"."status" = 'withdrawn'
          AND "music_cover_proposals"."reviewed_by_user_id" IS NULL
          AND "music_cover_proposals"."reviewed_at" IS NULL
          AND "music_cover_proposals"."review_result_code" IS NULL
          AND "music_cover_proposals"."review_note" IS NULL
          AND "music_cover_proposals"."approved_performance_id" IS NULL)),
	CONSTRAINT "music_cover_proposals_terminal_lock_check" CHECK("music_cover_proposals"."status" = 'pending_review'
        OR ("music_cover_proposals"."review_lock_token" IS NULL AND "music_cover_proposals"."review_lock_expires_at" IS NULL)),
	CONSTRAINT "music_cover_proposals_optional_text_check" CHECK(("music_cover_proposals"."submitted_note" IS NULL OR length(trim("music_cover_proposals"."submitted_note")) > 0)
        AND ("music_cover_proposals"."review_result_code" IS NULL OR length(trim("music_cover_proposals"."review_result_code")) > 0)
        AND ("music_cover_proposals"."review_note" IS NULL OR length(trim("music_cover_proposals"."review_note")) > 0)),
	CONSTRAINT "music_cover_proposals_time_check" CHECK(typeof("music_cover_proposals"."created_at") = 'integer' AND "music_cover_proposals"."created_at" >= 0
        AND typeof("music_cover_proposals"."updated_at") = 'integer' AND "music_cover_proposals"."updated_at" >= "music_cover_proposals"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_submitter_idempotency` ON `music_cover_proposals` (`submitted_by_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_pending_video_segment` ON `music_cover_proposals` (`youtube_video_id`,`segment_start_seconds`) WHERE "music_cover_proposals"."status" = 'pending_review';--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_approved_performance` ON `music_cover_proposals` (`approved_performance_id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_status_created_id` ON `music_cover_proposals` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_submitter_created_id` ON `music_cover_proposals` (`submitted_by_user_id`,"created_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_reviewer_reviewed_id` ON `music_cover_proposals` (`reviewed_by_user_id`,"reviewed_at" DESC,`id`) WHERE "music_cover_proposals"."reviewed_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_suggested_song_id` ON `music_cover_proposals` (`suggested_song_id`);