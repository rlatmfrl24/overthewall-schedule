ALTER TABLE `youtube_api_cache` ADD `refresh_after` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_youtube_api_usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation` text NOT NULL,
	`channel_id` text,
	`cache_key` text,
	`quota_units` integer NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	`error` text,
	`request_origin` text DEFAULT 'legacy_unknown' NOT NULL,
	CONSTRAINT "youtube_api_usage_events_operation_check" CHECK(operation IN ('channels.list', 'playlistItems.list', 'videos.list')),
	CONSTRAINT "youtube_api_usage_events_request_origin_check" CHECK(request_origin IN ('demand', 'manual', 'scheduled', 'legacy_unknown'))
);
--> statement-breakpoint
INSERT INTO `__new_youtube_api_usage_events`("id", "operation", "channel_id", "cache_key", "quota_units", "status", "duration_ms", "created_at", "error", "request_origin") SELECT "id", "operation", "channel_id", "cache_key", "quota_units", "status", "duration_ms", "created_at", "error", 'legacy_unknown' FROM `youtube_api_usage_events`;--> statement-breakpoint
DROP TABLE `youtube_api_usage_events`;--> statement-breakpoint
ALTER TABLE `__new_youtube_api_usage_events` RENAME TO `youtube_api_usage_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_events_created_at` ON `youtube_api_usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_events_operation` ON `youtube_api_usage_events` (`operation`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_events_status` ON `youtube_api_usage_events` (`status`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_events_cache_key` ON `youtube_api_usage_events` (`cache_key`);--> statement-breakpoint
CREATE INDEX `idx_youtube_api_usage_events_request_origin` ON `youtube_api_usage_events` (`request_origin`);--> statement-breakpoint
ALTER TABLE `youtube_warmup_runs` ADD `baseline_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `youtube_warmup_runs` ADD `changed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `youtube_warmup_runs` ADD `unchanged_count` integer DEFAULT 0 NOT NULL;
