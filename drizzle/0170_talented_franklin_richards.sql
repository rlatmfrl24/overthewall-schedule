ALTER TABLE `x_post_sources` ADD `insert_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `x_posts` ADD `insert_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_x_posts_handle_insert_revision` ON `x_posts` (`handle`,`insert_revision`);--> statement-breakpoint
CREATE INDEX `idx_x_shared_requests_expiry` ON `x_shared_requests` (julianday(day) + CASE WHEN id GLOB 'otw:quote:*' OR id GLOB 'luvdia:quote:*' THEN 31 ELSE 2 END) WHERE "x_shared_requests"."status" != 'running';