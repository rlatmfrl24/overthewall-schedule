CREATE TABLE `music_channel_upload_candidate_origins` (
	`monitor_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`provider_published_at` integer,
	`discovered_at` integer NOT NULL,
	PRIMARY KEY(`monitor_id`, `candidate_id`),
	FOREIGN KEY (`monitor_id`) REFERENCES `music_channel_upload_monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `music_ingestion_candidates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_music_channel_upload_origins_monitor_discovered` ON `music_channel_upload_candidate_origins` (`monitor_id`,"discovered_at" DESC,`candidate_id`);--> statement-breakpoint
CREATE TABLE `music_channel_upload_monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`uploads_playlist_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`check_interval_minutes` integer DEFAULT 360 NOT NULL,
	`last_checked_at` integer,
	`next_check_at` integer NOT NULL,
	`last_seen_video_id` text,
	`last_seen_published_at` integer,
	`last_error_code` text,
	`lease_until` integer,
	`created_by_user_id` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `music_channels`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_channel_upload_monitors_identity_check" CHECK(length(trim("music_channel_upload_monitors"."id")) > 0
        AND length("music_channel_upload_monitors"."uploads_playlist_id") = 24
        AND substr("music_channel_upload_monitors"."uploads_playlist_id", 1, 2) = 'UU'
        AND substr("music_channel_upload_monitors"."uploads_playlist_id", 3) NOT GLOB '*[^A-Za-z0-9_-]*'
        AND length(trim("music_channel_upload_monitors"."created_by_user_id")) > 0),
	CONSTRAINT "music_channel_upload_monitors_status_interval_check" CHECK("music_channel_upload_monitors"."status" IN ('active', 'paused')
        AND typeof("music_channel_upload_monitors"."check_interval_minutes") = 'integer'
        AND "music_channel_upload_monitors"."check_interval_minutes" >= 60
        AND "music_channel_upload_monitors"."check_interval_minutes" <= 1440),
	CONSTRAINT "music_channel_upload_monitors_watermark_check" CHECK(("music_channel_upload_monitors"."last_seen_video_id" IS NULL
          OR (length("music_channel_upload_monitors"."last_seen_video_id") = 11
            AND "music_channel_upload_monitors"."last_seen_video_id" NOT GLOB '*[^A-Za-z0-9_-]*'))
        AND ("music_channel_upload_monitors"."last_error_code" IS NULL OR length(trim("music_channel_upload_monitors"."last_error_code")) > 0)),
	CONSTRAINT "music_channel_upload_monitors_version_time_check" CHECK(typeof("music_channel_upload_monitors"."version") = 'integer' AND "music_channel_upload_monitors"."version" >= 0
        AND typeof("music_channel_upload_monitors"."created_at") = 'integer' AND "music_channel_upload_monitors"."created_at" >= 0
        AND typeof("music_channel_upload_monitors"."updated_at") = 'integer' AND "music_channel_upload_monitors"."updated_at" >= "music_channel_upload_monitors"."created_at"
        AND typeof("music_channel_upload_monitors"."next_check_at") = 'integer' AND "music_channel_upload_monitors"."next_check_at" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_upload_monitors_channel` ON `music_channel_upload_monitors` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_upload_monitors_due` ON `music_channel_upload_monitors` (`status`,`next_check_at`,`lease_until`,`id`);