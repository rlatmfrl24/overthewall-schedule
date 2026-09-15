CREATE TABLE `music_ai_review_attempts` (
	`token` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`outcome` text DEFAULT 'running' NOT NULL,
	`usage_json` text,
	FOREIGN KEY (`review_id`) REFERENCES `music_ai_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_music_ai_review_attempts_started` ON `music_ai_review_attempts` (`started_at`);--> statement-breakpoint
CREATE TABLE `music_ai_review_requests` (
	`request_key` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`review_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `music_ai_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `music_ai_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text,
	`video_id` text NOT NULL,
	`candidate_kind` text NOT NULL,
	`range_json` text NOT NULL,
	`target_key` text NOT NULL,
	`input_hash` text NOT NULL,
	`input_json` text,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text,
	`usage_json` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`next_retry_at` integer,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "music_ai_reviews_status" CHECK("music_ai_reviews"."status" IN ('queued','running','retry_wait','succeeded','partial','failed')),
	CONSTRAINT "music_ai_reviews_kind" CHECK("music_ai_reviews"."candidate_kind" IN ('official_video','singing_clip')),
	CONSTRAINT "music_ai_reviews_attempts" CHECK("music_ai_reviews"."attempts" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE INDEX `idx_music_ai_reviews_target` ON `music_ai_reviews` (`target_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_music_ai_reviews_recovery` ON `music_ai_reviews` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_ai_reviews_active` ON `music_ai_reviews` (`input_hash`) WHERE "music_ai_reviews"."status" IN ('queued','running','retry_wait');