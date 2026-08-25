DROP INDEX `uidx_music_channel_upload_monitors_channel`;--> statement-breakpoint
ALTER TABLE `music_channel_upload_monitors` ADD `generation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `music_channel_upload_monitors` ADD `deleted_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_upload_monitors_channel` ON `music_channel_upload_monitors` (`channel_id`) WHERE "music_channel_upload_monitors"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE `music_channel_upload_candidate_origins` ADD `monitor_generation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_music_channel_upload_origins_monitor_generation_discovered` ON `music_channel_upload_candidate_origins` (`monitor_id`,`monitor_generation`,"discovered_at" DESC,`candidate_id`);