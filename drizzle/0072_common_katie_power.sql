ALTER TABLE `naver_cafe_posts` ADD `first_seen_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `naver_cafe_posts` ADD `hidden_reason` text;--> statement-breakpoint
ALTER TABLE `naver_cafe_posts` ADD `content_removed_at` integer;--> statement-breakpoint
ALTER TABLE `naver_cafe_sources` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `x_posts` ADD `first_seen_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `x_posts` ADD `hidden_reason` text;--> statement-breakpoint
ALTER TABLE `x_posts` ADD `content_removed_at` integer;