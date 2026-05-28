CREATE TABLE `x_post_sources` (
	`handle` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`username` text,
	`last_seen_post_id` text,
	`last_checked_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `x_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`user_id` text,
	`username` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_x_posts_handle_created_at` ON `x_posts` (`handle`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_x_posts_user_id` ON `x_posts` (`user_id`);