CREATE TABLE `naver_cafe_usage_daily` (
	`kst_date` text PRIMARY KEY NOT NULL,
	`requests_used` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "naver_cafe_usage_daily_requests_check" CHECK("naver_cafe_usage_daily"."requests_used" >= 0 AND "naver_cafe_usage_daily"."requests_used" <= 240)
);
--> statement-breakpoint
CREATE TABLE `youtube_api_usage_contexts` (
	`usage_event_id` integer PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`origin` text NOT NULL,
	`workload` text NOT NULL,
	`scheduled_run_id` text,
	`scheduled_item_id` text,
	`ingestion_job_id` text,
	`monitor_id` text,
	FOREIGN KEY (`usage_event_id`) REFERENCES `youtube_api_usage_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_contexts_origin` ON `youtube_api_usage_contexts` (`origin`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_contexts_workload` ON `youtube_api_usage_contexts` (`workload`);--> statement-breakpoint
CREATE TABLE `youtube_feed_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_kind` text NOT NULL,
	`member_uid` integer,
	`kirinuki_channel_id` integer,
	`youtube_channel_id` text NOT NULL,
	`uploads_playlist_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`collection_started_at` integer NOT NULL,
	`initialization_completed_at` integer,
	`deactivated_at` integer,
	`last_seen_video_id` text,
	`sync_page_token` text,
	`sync_base_video_id` text,
	`sync_newest_video_id` text,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`next_check_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`member_uid`) REFERENCES `members`(`uid`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "youtube_feed_sources_owner_check" CHECK(("youtube_feed_sources"."source_kind" = 'official' AND "youtube_feed_sources"."member_uid" IS NOT NULL
          AND "youtube_feed_sources"."kirinuki_channel_id" IS NULL)
        OR ("youtube_feed_sources"."source_kind" = 'kirinuki' AND "youtube_feed_sources"."member_uid" IS NULL
          AND "youtube_feed_sources"."kirinuki_channel_id" IS NOT NULL)),
	CONSTRAINT "youtube_feed_sources_failure_check" CHECK("youtube_feed_sources"."consecutive_failures" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_youtube_feed_sources_channel_kind` ON `youtube_feed_sources` (`youtube_channel_id`,`source_kind`);--> statement-breakpoint
CREATE INDEX `idx_youtube_feed_sources_due` ON `youtube_feed_sources` (`enabled`,`next_check_at`,`id`);--> statement-breakpoint
CREATE TABLE `youtube_feed_videos` (
	`video_id` text PRIMARY KEY NOT NULL,
	`source_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`thumbnail_url` text,
	`channel_title` text DEFAULT '' NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`is_short` integer DEFAULT false NOT NULL,
	`published_at` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`available` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `youtube_feed_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_youtube_feed_videos_source_published` ON `youtube_feed_videos` (`source_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_youtube_feed_videos_fetched` ON `youtube_feed_videos` (`fetched_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_scheduled_job_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`target_key` text NOT NULL,
	`phase` text NOT NULL,
	`lane` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`continuation_json` text,
	`result_json` text,
	`last_error_code` text,
	`last_error` text,
	`available_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `scheduled_job_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "scheduled_job_items_status_check" CHECK("__new_scheduled_job_items"."status" IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped', 'throttled')),
	CONSTRAINT "scheduled_job_items_attempts_check" CHECK(typeof("__new_scheduled_job_items"."attempts") = 'integer' AND "__new_scheduled_job_items"."attempts" >= 0),
	CONSTRAINT "scheduled_job_items_time_check" CHECK(typeof("__new_scheduled_job_items"."available_at") = 'integer' AND "__new_scheduled_job_items"."available_at" >= 0
        AND typeof("__new_scheduled_job_items"."created_at") = 'integer' AND "__new_scheduled_job_items"."created_at" >= 0
        AND typeof("__new_scheduled_job_items"."updated_at") = 'integer' AND "__new_scheduled_job_items"."updated_at" >= "__new_scheduled_job_items"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_scheduled_job_items`("id", "run_id", "target_key", "phase", "lane", "status", "attempts", "lease_token", "lease_until", "continuation_json", "result_json", "last_error_code", "last_error", "available_at", "started_at", "finished_at", "created_at", "updated_at") SELECT "id", "run_id", "target_key", "phase", "lane", "status", "attempts", "lease_token", "lease_until", "continuation_json", "result_json", "last_error_code", "last_error", "available_at", "started_at", "finished_at", "created_at", "updated_at" FROM `scheduled_job_items`;--> statement-breakpoint
DROP TABLE `scheduled_job_items`;--> statement-breakpoint
ALTER TABLE `__new_scheduled_job_items` RENAME TO `scheduled_job_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_scheduled_job_items_run_target_phase` ON `scheduled_job_items` (`run_id`,`target_key`,`phase`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_items_lane_status_available` ON `scheduled_job_items` (`lane`,`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_items_lease` ON `scheduled_job_items` (`status`,`lease_until`);--> statement-breakpoint
ALTER TABLE `music_channel_upload_monitors` ADD `sync_page_token` text;--> statement-breakpoint
ALTER TABLE `music_channel_upload_monitors` ADD `sync_base_video_id` text;--> statement-breakpoint
ALTER TABLE `music_channel_upload_monitors` ADD `sync_newest_video_id` text;--> statement-breakpoint
ALTER TABLE `music_channel_upload_monitors` ADD `sync_started_at` integer;--> statement-breakpoint
ALTER TABLE `music_channel_upload_monitors` ADD `last_success_at` integer;--> statement-breakpoint
ALTER TABLE `music_channel_upload_monitors` ADD `consecutive_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `collection_started_at` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `initialization_completed_at` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `deactivated_at` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `last_seen_article_id` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `sync_page` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `sync_base_article_id` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `sync_newest_article_id` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `last_attempt_at` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `last_success_at` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `next_check_at` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `consecutive_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `last_error_code` text;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `collection_started_at` integer;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `initialization_completed_at` integer;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `deactivated_at` integer;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `sync_pagination_token` text;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `sync_base_post_id` text;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `sync_newest_post_id` text;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `last_attempt_at` integer;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `last_success_at` integer;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `next_check_at` integer;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `consecutive_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `last_error_code` text;--> statement-breakpoint
CREATE TABLE `__new_naver_cafe_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`source_name` text NOT NULL,
	`cafe_id` text NOT NULL,
	`menu_id` text NOT NULL,
	`member_uid` integer,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`read_count` integer DEFAULT 0 NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`is_new` integer DEFAULT false NOT NULL,
	`fetched_at` integer NOT NULL,
	`hidden_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `naver_cafe_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_naver_cafe_posts`("id", "article_id", "source_id", "source_name", "cafe_id", "menu_id", "member_uid", "title", "summary", "created_at", "url", "thumbnail_url", "comment_count", "read_count", "like_count", "is_new", "fetched_at", "hidden_at") SELECT "id", "article_id", "source_id", "source_name", "cafe_id", "menu_id", "member_uid", "title", "summary", "created_at", "url", "thumbnail_url", "comment_count", "read_count", "like_count", "is_new", "fetched_at", "hidden_at" FROM `naver_cafe_posts`;--> statement-breakpoint
DROP TABLE `naver_cafe_posts`;--> statement-breakpoint
ALTER TABLE `__new_naver_cafe_posts` RENAME TO `naver_cafe_posts`;--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_posts_source_hidden_created` ON `naver_cafe_posts` (`source_id`,`hidden_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_posts_member_hidden_created` ON `naver_cafe_posts` (`member_uid`,`hidden_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_posts_hidden_created` ON `naver_cafe_posts` (`hidden_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_naver_cafe_source_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`source_name` text NOT NULL,
	`cafe_id` text NOT NULL,
	`menu_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`checked_at` integer NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`post_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	FOREIGN KEY (`source_id`) REFERENCES `naver_cafe_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "naver_cafe_source_checks_trigger_check" CHECK("__new_naver_cafe_source_checks"."trigger" IN ('manual', 'scheduled')),
	CONSTRAINT "naver_cafe_source_checks_status_check" CHECK("__new_naver_cafe_source_checks"."status" IN ('ok', 'stale', 'error', 'private', 'invalid_response', 'disabled'))
);
--> statement-breakpoint
INSERT INTO `__new_naver_cafe_source_checks`("id", "source_id", "source_name", "cafe_id", "menu_id", "trigger", "status", "checked_at", "duration_ms", "post_count", "error") SELECT "id", "source_id", "source_name", "cafe_id", "menu_id", "trigger", "status", "checked_at", "duration_ms", "post_count", "error" FROM `naver_cafe_source_checks`;--> statement-breakpoint
DROP TABLE `naver_cafe_source_checks`;--> statement-breakpoint
ALTER TABLE `__new_naver_cafe_source_checks` RENAME TO `naver_cafe_source_checks`;--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_source_checks_source_checked` ON `naver_cafe_source_checks` (`source_id`,`checked_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_source_checks_checked_at` ON `naver_cafe_source_checks` (`checked_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_source_checks_status` ON `naver_cafe_source_checks` (`status`);