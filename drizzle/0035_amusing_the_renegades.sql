CREATE TABLE `youtube_api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`stale_until` integer NOT NULL,
	`last_status` integer,
	`last_error` text,
	CONSTRAINT "youtube_api_cache_type_check" CHECK(type IN ('uploads_playlist', 'channel_videos'))
);
--> statement-breakpoint
CREATE INDEX `idx_youtube_api_cache_type` ON `youtube_api_cache` (`type`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_cache_expires_at` ON `youtube_api_cache` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_cache_stale_until` ON `youtube_api_cache` (`stale_until`);--> statement-breakpoint
CREATE TABLE `youtube_api_usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation` text NOT NULL,
	`channel_id` text,
	`cache_key` text,
	`quota_units` integer NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	`error` text,
	CONSTRAINT "youtube_api_usage_events_operation_check" CHECK(operation IN ('channels.list', 'playlistItems.list', 'videos.list'))
);
--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_events_created_at` ON `youtube_api_usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_events_operation` ON `youtube_api_usage_events` (`operation`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_events_status` ON `youtube_api_usage_events` (`status`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_events_cache_key` ON `youtube_api_usage_events` (`cache_key`);