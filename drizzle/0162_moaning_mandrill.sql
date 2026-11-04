ALTER TABLE `x_fx_sources` ADD `rss_cadence_anchor_at` integer;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `rss_last_attempt_at` integer;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `rss_last_http_success_at` integer;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `rss_last_check_completed_at` integer;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `rss_last_error` text;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `rss_last_raw_count` integer;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `rss_previous_raw_count` integer;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `rss_last_candidate_count` integer;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `rss_pending_item_id` text;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `sync_origin_scope` text;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `sync_origin_started_at` integer;--> statement-breakpoint
ALTER TABLE `x_post_sources` ADD `sync_timeline_completed_at` integer;