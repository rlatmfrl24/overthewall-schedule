PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_member_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_uid` integer NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`youtube_channel_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP,
	`updated_at` numeric DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "member_links_type_check" CHECK(type IN ('youtube_vod', 'youtube_sub', 'twitcasting'))
);
--> statement-breakpoint
INSERT INTO `__new_member_links`("id", "member_uid", "type", "label", "url", "youtube_channel_id", "sort_order", "enabled", "created_at", "updated_at") SELECT "id", "member_uid", "type", "label", "url", "youtube_channel_id", "sort_order", "enabled", "created_at", "updated_at" FROM `member_links`;--> statement-breakpoint
DROP TABLE `member_links`;--> statement-breakpoint
ALTER TABLE `__new_member_links` RENAME TO `member_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_member_links_member_uid` ON `member_links` (`member_uid`);--> statement-breakpoint
CREATE INDEX `idx_member_links_member_sort` ON `member_links` (`member_uid`,`sort_order`);