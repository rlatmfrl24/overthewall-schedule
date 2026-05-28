CREATE TABLE `x_api_usage_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operation` text NOT NULL,
	`endpoint` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_count` integer NOT NULL,
	`estimated_cost_micros` integer NOT NULL,
	`status` integer NOT NULL,
	`created_at` integer NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `idx_x_api_usage_events_created_at` ON `x_api_usage_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_x_api_usage_events_operation` ON `x_api_usage_events` (`operation`);--> statement-breakpoint
CREATE TABLE `x_collection_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`checked_handles` integer DEFAULT 0 NOT NULL,
	`refreshed_handles` integer DEFAULT 0 NOT NULL,
	`posts_returned` integer DEFAULT 0 NOT NULL,
	`posts_stored` integer DEFAULT 0 NOT NULL,
	`api_calls` integer DEFAULT 0 NOT NULL,
	`estimated_cost_micros` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_x_collection_runs_started_at` ON `x_collection_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_x_collection_runs_status` ON `x_collection_runs` (`status`);--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `x_posts` ADD `hidden_at` integer;--> statement-breakpoint
CREATE INDEX `idx_x_posts_hidden_at` ON `x_posts` (`hidden_at`);