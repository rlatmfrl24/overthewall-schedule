ALTER TABLE `youtube_feed_sources` ADD `backfill_page_token` text;--> statement-breakpoint
ALTER TABLE `youtube_feed_sources` ADD `backfill_frontier_published_at` integer;--> statement-breakpoint
ALTER TABLE `youtube_feed_sources` ADD `backfill_exhausted_at` integer;--> statement-breakpoint
ALTER TABLE `youtube_feed_sources` ADD `backfill_lease_until` integer;--> statement-breakpoint
ALTER TABLE `youtube_feed_sources` ADD `backfill_retry_after` integer;--> statement-breakpoint
CREATE INDEX `idx_youtube_feed_videos_short_published` ON `youtube_feed_videos` (`is_short`,"published_at" DESC,`video_id`);