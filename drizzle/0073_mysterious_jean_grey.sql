PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_naver_cafe_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`source_name` text NOT NULL,
	`cafe_id` text NOT NULL,
	`menu_id` text NOT NULL,
	`member_uid` integer,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	`url` text NOT NULL,
	`thumbnail_url` text,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`read_count` integer DEFAULT 0 NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`is_new` integer DEFAULT false NOT NULL,
	`first_seen_at` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer NOT NULL,
	`hidden_at` integer,
	`hidden_reason` text,
	`content_removed_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `naver_cafe_sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_naver_cafe_posts`("id", "article_id", "source_id", "source_name", "cafe_id", "menu_id", "member_uid", "title", "summary", "created_at", "url", "thumbnail_url", "comment_count", "read_count", "like_count", "is_new", "first_seen_at", "fetched_at", "hidden_at", "hidden_reason", "content_removed_at") SELECT "id", "article_id", "source_id", "source_name", "cafe_id", "menu_id", "member_uid", "title", "summary", "created_at", "url", "thumbnail_url", "comment_count", "read_count", "like_count", "is_new", "first_seen_at", "fetched_at", "hidden_at", "hidden_reason", "content_removed_at" FROM `naver_cafe_posts`;--> statement-breakpoint
DROP TABLE `naver_cafe_posts`;--> statement-breakpoint
ALTER TABLE `__new_naver_cafe_posts` RENAME TO `naver_cafe_posts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_posts_source_hidden_created` ON `naver_cafe_posts` (`source_id`,`hidden_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_posts_member_hidden_created` ON `naver_cafe_posts` (`member_uid`,`hidden_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_posts_hidden_created` ON `naver_cafe_posts` (`hidden_at`,`created_at`);