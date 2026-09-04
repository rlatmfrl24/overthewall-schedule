ALTER TABLE `x_post_references` ADD `lease_token` text;--> statement-breakpoint
ALTER TABLE `x_post_references` ADD `lease_until` integer;--> statement-breakpoint
ALTER TABLE `x_post_references` ADD `author_id` text;--> statement-breakpoint
ALTER TABLE `x_post_references` ADD `author_state` text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE `x_post_references` ADD `author_attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `x_post_references` ADD `author_next_attempt_at` integer;--> statement-breakpoint
ALTER TABLE `x_post_references` ADD `author_last_error_code` text;--> statement-breakpoint
CREATE INDEX `idx_x_post_references_author_due` ON `x_post_references` (`author_state`,`author_next_attempt_at`);