PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_members` (
	`uid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`main_color` text,
	`sub_color` text,
	`oshi_mark` text,
	`url_twitter` text,
	`url_youtube` text,
	`url_chzzk` text,
	`youtube_channel_id` text,
	`birth_date` text,
	`debut_date` text,
	`unit_name` text,
	`fan_name` text,
	`introduction` text,
	`is_deprecated` integer
);
--> statement-breakpoint
INSERT INTO `__new_members`("uid", "code", "name", "main_color", "sub_color", "oshi_mark", "url_twitter", "url_youtube", "url_chzzk", "youtube_channel_id", "birth_date", "debut_date", "unit_name", "fan_name", "introduction", "is_deprecated") SELECT "uid", "code", "name", "main_color", "sub_color", "oshi_mark", "url_twitter", "url_youtube", "url_chzzk", "youtube_channel_id", "birth_date", "debut_date", "unit_name", "fan_name", "introduction", "is_deprecated" FROM `members`;--> statement-breakpoint
DROP TABLE `members`;--> statement-breakpoint
ALTER TABLE `__new_members` RENAME TO `members`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`url` text,
	`type` text DEFAULT 'notice' NOT NULL,
	`is_active` integer DEFAULT true,
	`started_at` text,
	`ended_at` text,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "notices_type_check" CHECK(type IN ('notice', 'event'))
);
--> statement-breakpoint
INSERT INTO `__new_notices`("id", "content", "url", "type", "is_active", "started_at", "ended_at", "created_at") SELECT "id", "content", "url", "type", "is_active", "started_at", "ended_at", "created_at" FROM `notices`;--> statement-breakpoint
DROP TABLE `notices`;--> statement-breakpoint
ALTER TABLE `__new_notices` RENAME TO `notices`;