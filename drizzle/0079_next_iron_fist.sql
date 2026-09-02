CREATE TABLE `x_api_resource_daily` (
	`utc_day` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`first_operation` text NOT NULL,
	`unit_cost_micros` integer NOT NULL,
	`first_seen_at` integer NOT NULL,
	PRIMARY KEY(`utc_day`, `resource_type`, `resource_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_x_api_resource_daily_seen` ON `x_api_resource_daily` (`first_seen_at`);--> statement-breakpoint
CREATE TABLE `x_api_usage_daily` (
	`utc_day` text NOT NULL,
	`operation` text NOT NULL,
	`resource_type` text NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`resource_count` integer DEFAULT 0 NOT NULL,
	`unique_resource_count` integer DEFAULT 0 NOT NULL,
	`listed_cost_micros` integer DEFAULT 0 NOT NULL,
	`conservative_cost_micros` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`utc_day`, `operation`, `resource_type`)
);
--> statement-breakpoint
CREATE INDEX `idx_x_api_usage_daily_day` ON `x_api_usage_daily` (`utc_day`);--> statement-breakpoint
CREATE TABLE `x_post_references` (
	`source_post_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`referenced_post_id` text NOT NULL,
	`resolution_state` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error_code` text,
	`hydrated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`source_post_id`, `relation_type`),
	FOREIGN KEY (`source_post_id`) REFERENCES `x_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "x_post_references_relation_check" CHECK("x_post_references"."relation_type" IN ('reply', 'quote')),
	CONSTRAINT "x_post_references_state_check" CHECK("x_post_references"."resolution_state" IN ('pending', 'local', 'hydrated', 'link_only', 'terminal'))
);
--> statement-breakpoint
CREATE INDEX `idx_x_post_references_due` ON `x_post_references` (`resolution_state`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `idx_x_post_references_target` ON `x_post_references` (`referenced_post_id`);--> statement-breakpoint
ALTER TABLE `x_collection_runs` ADD `effective_interval_minutes` integer;--> statement-breakpoint
ALTER TABLE `x_collection_runs` ADD `unique_resources` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `x_collection_runs` ADD `preview_deferred` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `x_collection_runs` ADD `coalesced_handles` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `lease_token` text;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `lease_until` integer;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `generation` integer DEFAULT 0 NOT NULL;