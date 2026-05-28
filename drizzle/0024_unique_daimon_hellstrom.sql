CREATE TABLE `naver_cafe_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cafe_id` text NOT NULL,
	`menu_id` text NOT NULL,
	`cafe_url` text NOT NULL,
	`member_uid` integer,
	`enabled` integer DEFAULT true,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP,
	`updated_at` numeric DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_sources_enabled` ON `naver_cafe_sources` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_sources_member_uid` ON `naver_cafe_sources` (`member_uid`);--> statement-breakpoint
CREATE INDEX `idx_naver_cafe_sources_sort_order` ON `naver_cafe_sources` (`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_naver_cafe_sources_cafe_menu` ON `naver_cafe_sources` (`cafe_id`,`menu_id`);