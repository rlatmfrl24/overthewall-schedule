CREATE TABLE `auto_update_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`range_days` integer NOT NULL,
	`checked_count` integer DEFAULT 0 NOT NULL,
	`updated_count` integer DEFAULT 0 NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	`existing_count` integer DEFAULT 0 NOT NULL,
	`pending_created_count` integer DEFAULT 0 NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`actor_ip` text,
	`error` text,
	`detail` text,
	CONSTRAINT "auto_update_runs_source_check" CHECK("auto_update_runs"."source" IN ('scheduled', 'manual')),
	CONSTRAINT "auto_update_runs_status_check" CHECK("auto_update_runs"."status" IN ('success', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_auto_update_runs_started_at` ON `auto_update_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_auto_update_runs_status` ON `auto_update_runs` (`status`);--> statement-breakpoint
CREATE INDEX `idx_auto_update_runs_source_started` ON `auto_update_runs` (`source`,`started_at`);--> statement-breakpoint
CREATE TABLE `naver_cafe_source_checks` (
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
	CONSTRAINT "naver_cafe_source_checks_trigger_check" CHECK("naver_cafe_source_checks"."trigger" IN ('manual')),
	CONSTRAINT "naver_cafe_source_checks_status_check" CHECK("naver_cafe_source_checks"."status" IN ('ok', 'stale', 'error', 'private', 'invalid_response', 'disabled'))
);
--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_source_checks_source_checked` ON `naver_cafe_source_checks` (`source_id`,`checked_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_source_checks_checked_at` ON `naver_cafe_source_checks` (`checked_at`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_source_checks_status` ON `naver_cafe_source_checks` (`status`);