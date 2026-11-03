CREATE TABLE `x_fx_sources` (
	`handle` text PRIMARY KEY NOT NULL,
	`cursor` text,
	`collection_started_at` integer NOT NULL,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`last_completed_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`consecutive_successes` integer DEFAULT 0 NOT NULL,
	`fallback_active` integer DEFAULT false NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `last_completed_at` integer;--> statement-breakpoint
ALTER TABLE `x_posts` ADD `source_authority` text;--> statement-breakpoint
ALTER TABLE `x_posts` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `x_posts` ADD `revision` integer DEFAULT 0 NOT NULL;