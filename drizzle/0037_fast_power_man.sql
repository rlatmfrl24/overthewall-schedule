CREATE TABLE `youtube_warmup_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`target_count` integer NOT NULL,
	`skipped_fresh_count` integer NOT NULL,
	`refreshed_count` integer NOT NULL,
	`failed_count` integer NOT NULL,
	`stale_fallback_count` integer NOT NULL,
	`api_calls` integer NOT NULL,
	`quota_units` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`error` text,
	CONSTRAINT "youtube_warmup_runs_source_check" CHECK(source IN ('scheduled', 'manual')),
	CONSTRAINT "youtube_warmup_runs_status_check" CHECK(status IN ('success', 'skipped', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_youtube_warmup_runs_started_at` ON `youtube_warmup_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_youtube_warmup_runs_status` ON `youtube_warmup_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_youtube_warmup_runs_source` ON `youtube_warmup_runs` (`source`);