CREATE TABLE `music_ingestion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`candidate_id` text,
	`event_type` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `music_ingestion_jobs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `music_ingestion_candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_ingestion_events_required_check" CHECK(length(trim("music_ingestion_events"."id")) > 0
        AND ("music_ingestion_events"."job_id" IS NOT NULL OR "music_ingestion_events"."candidate_id" IS NOT NULL)
        AND length(trim("music_ingestion_events"."event_type")) > 0
        AND length(trim("music_ingestion_events"."actor_user_id")) > 0
        AND json_valid("music_ingestion_events"."detail_json") = 1
        AND json_type("music_ingestion_events"."detail_json") = 'object'
        AND typeof("music_ingestion_events"."created_at") = 'integer'
        AND "music_ingestion_events"."created_at" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_events_job_created_id` ON `music_ingestion_events` (`job_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_events_candidate_created_id` ON `music_ingestion_events` (`candidate_id`,`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `music_ingestion_candidates` ADD `review_input_json` text;--> statement-breakpoint
ALTER TABLE `music_ingestion_candidates` ADD `reviewed_by_user_id` text;--> statement-breakpoint
ALTER TABLE `music_ingestion_candidates` ADD `last_conversion_outcome` text;--> statement-breakpoint
ALTER TABLE `music_ingestion_candidates` ADD `last_conversion_error_code` text;--> statement-breakpoint
ALTER TABLE `music_ingestion_candidates` ADD `last_conversion_attempt_at` integer;