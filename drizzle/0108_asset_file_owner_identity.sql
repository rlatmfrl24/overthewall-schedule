ALTER TABLE `asset_file_cleanup` ADD `generation` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `asset_file_versions` ADD `member_uid` integer;--> statement-breakpoint
ALTER TABLE `asset_file_versions` ADD `member_code` text;