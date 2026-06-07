CREATE TABLE `member_links` (
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
	CONSTRAINT "member_links_type_check" CHECK(type IN ('youtube_vod', 'youtube_sub'))
);
--> statement-breakpoint
CREATE INDEX `idx_member_links_member_uid` ON `member_links` (`member_uid`);--> statement-breakpoint
CREATE INDEX `idx_member_links_member_sort` ON `member_links` (`member_uid`,`sort_order`);--> statement-breakpoint
CREATE TABLE `member_profile_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_uid` integer NOT NULL,
	`image_url` text NOT NULL,
	`alt` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_member_profile_images_member_uid` ON `member_profile_images` (`member_uid`);--> statement-breakpoint
CREATE INDEX `idx_member_profile_images_member_sort` ON `member_profile_images` (`member_uid`,`sort_order`);