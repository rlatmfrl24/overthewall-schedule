CREATE TABLE `naver_cafe_posts` (
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
	`fetched_at` integer NOT NULL,
	`hidden_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_posts_source_hidden_created` ON `naver_cafe_posts` (`source_id`,`hidden_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_posts_member_hidden_created` ON `naver_cafe_posts` (`member_uid`,`hidden_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_posts_hidden_created` ON `naver_cafe_posts` (`hidden_at`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_naver_cafe_source_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`source_name` text NOT NULL,
	`cafe_id` text NOT NULL,
	`menu_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`checked_at` integer NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`post_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	CONSTRAINT "naver_cafe_source_checks_trigger_check" CHECK("__new_naver_cafe_source_checks"."trigger" IN ('manual', 'scheduled')),
	CONSTRAINT "naver_cafe_source_checks_status_check" CHECK("__new_naver_cafe_source_checks"."status" IN ('ok', 'stale', 'error', 'private', 'invalid_response', 'disabled'))
);
--> statement-breakpoint
INSERT INTO `__new_naver_cafe_source_checks`("id", "source_id", "source_name", "cafe_id", "menu_id", "trigger", "status", "checked_at", "duration_ms", "post_count", "error") SELECT "id", "source_id", "source_name", "cafe_id", "menu_id", "trigger", "status", "checked_at", "duration_ms", "post_count", "error" FROM `naver_cafe_source_checks`;--> statement-breakpoint
DROP TABLE `naver_cafe_source_checks`;--> statement-breakpoint
ALTER TABLE `__new_naver_cafe_source_checks` RENAME TO `naver_cafe_source_checks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_source_checks_source_checked` ON `naver_cafe_source_checks` (`source_id`,`checked_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_source_checks_checked_at` ON `naver_cafe_source_checks` (`checked_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_source_checks_status` ON `naver_cafe_source_checks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_x_posts_handle_hidden_created` ON `x_posts` (`handle`,`hidden_at`,`created_at`);