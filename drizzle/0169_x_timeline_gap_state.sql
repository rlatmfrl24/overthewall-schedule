ALTER TABLE `x_post_sources` ADD `sync_gap_state` text;--> statement-breakpoint
CREATE INDEX `idx_x_posts_handle_ordered_id` ON `x_posts` (`handle`,(length("id") + 10) || "id");