-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `members` (
	`uid` integer PRIMARY KEY AUTOINCREMENT,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`main_color` text,
	`oshi_mark` text,
	`url_twitter` text,
	`url_youtube` text,
	`url_chzzk` text,
	`birth_date` text,
	`debut_date` text,
	`sub_color` text,
	`unit_name` text,
	`fan_name` text,
	`is_deprecated` numeric,
	CONSTRAINT "schedules_check_1" CHECK(status IN ('방송', '휴방', '게릴라')
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`member_uid` integer NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`title` text,
	`status` text NOT NULL,
	`created_at` numeric DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT "schedules_check_1" CHECK(status IN ('방송', '휴방', '게릴라')
);
--> statement-breakpoint
CREATE INDEX `idx_schedules_date` ON `schedules` (`date`);
*/