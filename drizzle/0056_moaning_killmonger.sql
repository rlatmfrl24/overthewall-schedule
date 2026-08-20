UPDATE `music_media_sources`
SET `next_check_at` = COALESCE(`last_checked_at`, `created_at`)
WHERE `next_check_at` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_music_catalog_events_type_created_id` ON `music_catalog_events` (`event_type`,"created_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_media_sources_next_check_id` ON `music_media_sources` (`next_check_at`,`id`);
