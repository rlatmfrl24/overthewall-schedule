CREATE TABLE `x_api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_x_api_cache_type` ON `x_api_cache` (`type`);--> statement-breakpoint
CREATE INDEX `idx_x_api_cache_expires_at` ON `x_api_cache` (`expires_at`);