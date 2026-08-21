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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_ingestion_origins_job_item` ON `music_ingestion_candidate_origins` (`job_id`,`playlist_item_id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_origins_job_position_id` ON `music_ingestion_candidate_origins` (`job_id`,`playlist_position`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_origins_candidate_discovered_id` ON `music_ingestion_candidate_origins` (`candidate_id`,"discovered_at" DESC,`id`);--> statement-breakpoint
CREATE TABLE `music_ingestion_candidates` (
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
	`first_discovered_at` integer NOT NULL,
	`last_discovered_at` integer NOT NULL,
	`retention_expires_at` integer NOT NULL,
	`next_retry_at` integer,
	`linked_performance_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`linked_performance_id`) REFERENCES `music_performances`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_ingestion_candidates_identity_check" CHECK("music_ingestion_candidates"."provider" = 'youtube'
        AND length("music_ingestion_candidates"."external_video_id") = 11
        AND "music_ingestion_candidates"."external_video_id" NOT GLOB '*[^A-Za-z0-9_-]*'
        AND "music_ingestion_candidates"."candidate_kind" IN ('official_video', 'singing_clip')),
	CONSTRAINT "music_ingestion_candidates_status_check" CHECK("music_ingestion_candidates"."status" IN ('discovered', 'needs_input', 'ready', 'converted', 'ignored', 'blocked')),
	CONSTRAINT "music_ingestion_candidates_classification_check" CHECK("music_ingestion_candidates"."classification" IN ('pending_metadata', 'eligible', 'existing_catalog',
        'existing_proposal', 'existing_candidate', 'channel_review', 'policy_blocked',
        'unavailable', 'scope_review', 'playlist_duplicate')),
	CONSTRAINT "music_ingestion_candidates_metadata_check" CHECK(("music_ingestion_candidates"."exclusion_reason" IS NULL OR length(trim("music_ingestion_candidates"."exclusion_reason")) > 0)
        AND ("music_ingestion_candidates"."title" IS NULL OR length(trim("music_ingestion_candidates"."title")) > 0)
        AND ("music_ingestion_candidates"."channel_id" IS NULL OR length(trim("music_ingestion_candidates"."channel_id")) > 0)
        AND ("music_ingestion_candidates"."channel_title" IS NULL OR length(trim("music_ingestion_candidates"."channel_title")) > 0)
        AND ("music_ingestion_candidates"."duration_seconds" IS NULL
          OR (typeof("music_ingestion_candidates"."duration_seconds") = 'integer' AND "music_ingestion_candidates"."duration_seconds" >= 0))),
	CONSTRAINT "music_ingestion_candidates_availability_check" CHECK("music_ingestion_candidates"."availability_status" IN ('unknown', 'playable', 'private',
        'embed_disabled', 'deleted', 'region_blocked', 'unavailable')),
	CONSTRAINT "music_ingestion_candidates_version_time_check" CHECK(typeof("music_ingestion_candidates"."version") = 'integer' AND "music_ingestion_candidates"."version" >= 0
        AND typeof("music_ingestion_candidates"."first_discovered_at") = 'integer' AND "music_ingestion_candidates"."first_discovered_at" >= 0
        AND typeof("music_ingestion_candidates"."last_discovered_at") = 'integer'
        AND "music_ingestion_candidates"."last_discovered_at" >= "music_ingestion_candidates"."first_discovered_at"
        AND typeof("music_ingestion_candidates"."retention_expires_at") = 'integer'
        AND "music_ingestion_candidates"."retention_expires_at" >= "music_ingestion_candidates"."last_discovered_at"
        AND ("music_ingestion_candidates"."metadata_checked_at" IS NULL
          OR (typeof("music_ingestion_candidates"."metadata_checked_at") = 'integer' AND "music_ingestion_candidates"."metadata_checked_at" >= 0))
        AND ("music_ingestion_candidates"."next_retry_at" IS NULL
          OR (typeof("music_ingestion_candidates"."next_retry_at") = 'integer' AND "music_ingestion_candidates"."next_retry_at" >= 0))
        AND typeof("music_ingestion_candidates"."created_at") = 'integer' AND "music_ingestion_candidates"."created_at" >= 0
        AND typeof("music_ingestion_candidates"."updated_at") = 'integer' AND "music_ingestion_candidates"."updated_at" >= "music_ingestion_candidates"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_ingestion_candidates_provider_video` ON `music_ingestion_candidates` (`provider`,`external_video_id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_candidates_status_updated_id` ON `music_ingestion_candidates` (`status`,"updated_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_candidates_channel_status_id` ON `music_ingestion_candidates` (`channel_id`,`status`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_candidates_refresh_id` ON `music_ingestion_candidates` (`metadata_checked_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_candidates_retention_id` ON `music_ingestion_candidates` (`retention_expires_at`,`id`);--> statement-breakpoint
CREATE TABLE `music_ingestion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_kind` text DEFAULT 'playlist_import' NOT NULL,
	`source_external_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_title` text NOT NULL,
	`owner_channel_id` text NOT NULL,
	`owner_channel_title` text NOT NULL,
	`import_mode` text NOT NULL,
	`requested_item_count` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`actor_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`last_error_code` text,
	`next_retry_at` integer,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "music_ingestion_jobs_required_text_check" CHECK(length(trim("music_ingestion_jobs"."id")) > 0
        AND "music_ingestion_jobs"."source_kind" = 'playlist_import'
        AND length(trim("music_ingestion_jobs"."source_external_id")) > 0
        AND length(trim("music_ingestion_jobs"."source_url")) > 0
        AND length(trim("music_ingestion_jobs"."source_title")) > 0
        AND length(trim("music_ingestion_jobs"."owner_channel_id")) > 0
        AND length(trim("music_ingestion_jobs"."owner_channel_title")) > 0
        AND length(trim("music_ingestion_jobs"."actor_user_id")) > 0
        AND length(trim("music_ingestion_jobs"."idempotency_key")) > 0),
	CONSTRAINT "music_ingestion_jobs_mode_count_check" CHECK("music_ingestion_jobs"."import_mode" IN ('all_new', 'recent')
        AND typeof("music_ingestion_jobs"."requested_item_count") = 'integer'
        AND "music_ingestion_jobs"."requested_item_count" >= 0
        AND "music_ingestion_jobs"."requested_item_count" <= 5000),
	CONSTRAINT "music_ingestion_jobs_status_check" CHECK("music_ingestion_jobs"."status" IN ('queued', 'collecting', 'completed', 'partial', 'failed')),
	CONSTRAINT "music_ingestion_jobs_error_check" CHECK(("music_ingestion_jobs"."last_error_code" IS NULL OR length(trim("music_ingestion_jobs"."last_error_code")) > 0)
        AND ("music_ingestion_jobs"."next_retry_at" IS NULL
          OR (typeof("music_ingestion_jobs"."next_retry_at") = 'integer' AND "music_ingestion_jobs"."next_retry_at" >= 0))),
	CONSTRAINT "music_ingestion_jobs_time_check" CHECK(typeof("music_ingestion_jobs"."created_at") = 'integer' AND "music_ingestion_jobs"."created_at" >= 0
        AND typeof("music_ingestion_jobs"."updated_at") = 'integer' AND "music_ingestion_jobs"."updated_at" >= "music_ingestion_jobs"."created_at"
        AND ("music_ingestion_jobs"."started_at" IS NULL
          OR (typeof("music_ingestion_jobs"."started_at") = 'integer' AND "music_ingestion_jobs"."started_at" >= "music_ingestion_jobs"."created_at"))
        AND ("music_ingestion_jobs"."completed_at" IS NULL
          OR (typeof("music_ingestion_jobs"."completed_at") = 'integer' AND "music_ingestion_jobs"."completed_at" >= "music_ingestion_jobs"."created_at")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_ingestion_jobs_actor_idempotency` ON `music_ingestion_jobs` (`actor_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_jobs_source_updated_id` ON `music_ingestion_jobs` (`source_kind`,`source_external_id`,"updated_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_jobs_status_retry_id` ON `music_ingestion_jobs` (`status`,`next_retry_at`,`id`);--> statement-breakpoint
CREATE TABLE `music_ingestion_messages` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`message_kind` text NOT NULL,
	`payload_key` text NOT NULL,
	`page_token` text,
	`video_ids_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`next_retry_at` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `music_ingestion_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_ingestion_messages_required_check" CHECK(length(trim("music_ingestion_messages"."idempotency_key")) > 0
        AND length(trim("music_ingestion_messages"."payload_key")) > 0
        AND "music_ingestion_messages"."message_kind" IN ('playlist_page', 'video_batch')
        AND "music_ingestion_messages"."status" IN ('pending', 'completed', 'failed')
        AND typeof("music_ingestion_messages"."attempts") = 'integer' AND "music_ingestion_messages"."attempts" >= 0),
	CONSTRAINT "music_ingestion_messages_payload_check" CHECK(("music_ingestion_messages"."message_kind" = 'playlist_page' AND "music_ingestion_messages"."video_ids_json" IS NULL)
        OR ("music_ingestion_messages"."message_kind" = 'video_batch'
          AND "music_ingestion_messages"."page_token" IS NULL
          AND "music_ingestion_messages"."video_ids_json" IS NOT NULL
          AND json_valid("music_ingestion_messages"."video_ids_json") = 1
          AND json_type("music_ingestion_messages"."video_ids_json") = 'array')),
	CONSTRAINT "music_ingestion_messages_time_check" CHECK(typeof("music_ingestion_messages"."created_at") = 'integer' AND "music_ingestion_messages"."created_at" >= 0
        AND typeof("music_ingestion_messages"."updated_at") = 'integer' AND "music_ingestion_messages"."updated_at" >= "music_ingestion_messages"."created_at"
        AND ("music_ingestion_messages"."completed_at" IS NULL
          OR (typeof("music_ingestion_messages"."completed_at") = 'integer' AND "music_ingestion_messages"."completed_at" >= "music_ingestion_messages"."created_at"))
        AND ("music_ingestion_messages"."next_retry_at" IS NULL
          OR (typeof("music_ingestion_messages"."next_retry_at") = 'integer' AND "music_ingestion_messages"."next_retry_at" >= 0)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_ingestion_messages_job_kind_payload` ON `music_ingestion_messages` (`job_id`,`message_kind`,`payload_key`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_messages_status_retry_key` ON `music_ingestion_messages` (`status`,`next_retry_at`,`idempotency_key`);