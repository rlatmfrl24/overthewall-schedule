CREATE INDEX `idx_music_ai_reviews_expires_id` ON `music_ai_reviews` (`expires_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ai_reviews_hash_expiry` ON `music_ai_reviews` (`input_hash`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_video` ON `music_cover_proposals` (`youtube_video_id`);--> statement-breakpoint
CREATE INDEX `idx_music_media_sources_unplayable_checked` ON `music_media_sources` (CASE WHEN "last_checked_at" IS NULL THEN 0 ELSE "last_checked_at" END,`id`) WHERE "music_media_sources"."availability_status" <> 'playable';