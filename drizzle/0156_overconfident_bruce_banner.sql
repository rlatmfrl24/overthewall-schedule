CREATE TABLE `x_activity_cache_redactions` (
	`post_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_x_activity_redaction_pending` ON `x_activity_cache_redactions` (`next_attempt_at`) WHERE "x_activity_cache_redactions"."completed_at" IS NULL;