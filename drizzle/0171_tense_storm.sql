CREATE TABLE `schedule_image_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`month` text NOT NULL,
	`day` text NOT NULL,
	`active_until` integer NOT NULL,
	`started` integer DEFAULT 0 NOT NULL,
	`reserved_nano_usd` integer NOT NULL,
	`cost_nano_usd` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	CONSTRAINT "schedule_image_reads_cost" CHECK("schedule_image_reads"."reserved_nano_usd" >= 0 AND ("schedule_image_reads"."cost_nano_usd" IS NULL OR "schedule_image_reads"."cost_nano_usd" >= 0) AND "schedule_image_reads"."started" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_image_reads_month` ON `schedule_image_reads` (`site_id`,`month`);--> statement-breakpoint
CREATE INDEX `idx_schedule_image_reads_actor_day` ON `schedule_image_reads` (`site_id`,`actor_id`,`day`);--> statement-breakpoint
CREATE TABLE `schedule_image_results` (
	`site_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`result_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`site_id`, `actor_id`, `operation_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_image_results_expiry` ON `schedule_image_results` (`expires_at`);