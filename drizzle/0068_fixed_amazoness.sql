CREATE TABLE `scheduled_job_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`target_key` text NOT NULL,
	`phase` text NOT NULL,
	`lane` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`continuation_json` text,
	`result_json` text,
	`last_error_code` text,
	`last_error` text,
	`available_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `scheduled_job_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "scheduled_job_items_status_check" CHECK("scheduled_job_items"."status" IN ('queued', 'running', 'succeeded', 'failed', 'skipped', 'throttled')),
	CONSTRAINT "scheduled_job_items_attempts_check" CHECK(typeof("scheduled_job_items"."attempts") = 'integer' AND "scheduled_job_items"."attempts" >= 0),
	CONSTRAINT "scheduled_job_items_time_check" CHECK(typeof("scheduled_job_items"."available_at") = 'integer' AND "scheduled_job_items"."available_at" >= 0
        AND typeof("scheduled_job_items"."created_at") = 'integer' AND "scheduled_job_items"."created_at" >= 0
        AND typeof("scheduled_job_items"."updated_at") = 'integer' AND "scheduled_job_items"."updated_at" >= "scheduled_job_items"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_scheduled_job_items_run_target_phase` ON `scheduled_job_items` (`run_id`,`target_key`,`phase`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_items_lane_status_available` ON `scheduled_job_items` (`lane`,`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_items_lease` ON `scheduled_job_items` (`status`,`lease_until`);--> statement-breakpoint
CREATE TABLE `scheduled_job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_type` text NOT NULL,
	`source` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`scheduled_bucket` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`actor_ip` text,
	`scheduled_for` integer,
	`accepted_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`total_items` integer DEFAULT 0 NOT NULL,
	`completed_items` integer DEFAULT 0 NOT NULL,
	`failed_items` integer DEFAULT 0 NOT NULL,
	`skipped_items` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`summary_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "scheduled_job_runs_source_check" CHECK("scheduled_job_runs"."source" IN ('scheduled', 'manual')),
	CONSTRAINT "scheduled_job_runs_status_check" CHECK("scheduled_job_runs"."status" IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped', 'throttled')),
	CONSTRAINT "scheduled_job_runs_counts_check" CHECK(typeof("scheduled_job_runs"."total_items") = 'integer' AND "scheduled_job_runs"."total_items" >= 0
        AND typeof("scheduled_job_runs"."completed_items") = 'integer' AND "scheduled_job_runs"."completed_items" >= 0
        AND typeof("scheduled_job_runs"."failed_items") = 'integer' AND "scheduled_job_runs"."failed_items" >= 0
        AND typeof("scheduled_job_runs"."skipped_items") = 'integer' AND "scheduled_job_runs"."skipped_items" >= 0),
	CONSTRAINT "scheduled_job_runs_time_check" CHECK(typeof("scheduled_job_runs"."accepted_at") = 'integer' AND "scheduled_job_runs"."accepted_at" >= 0
        AND typeof("scheduled_job_runs"."created_at") = 'integer' AND "scheduled_job_runs"."created_at" >= 0
        AND typeof("scheduled_job_runs"."updated_at") = 'integer' AND "scheduled_job_runs"."updated_at" >= "scheduled_job_runs"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_scheduled_job_runs_idempotency` ON `scheduled_job_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_runs_job_status_accepted` ON `scheduled_job_runs` (`job_type`,`status`,`accepted_at`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_runs_status_updated` ON `scheduled_job_runs` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `scheduled_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`item_id` text NOT NULL,
	`lane` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`dispatched_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `scheduled_job_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `scheduled_job_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "scheduled_outbox_status_check" CHECK("scheduled_outbox"."status" IN ('pending', 'dispatching', 'dispatched', 'failed')),
	CONSTRAINT "scheduled_outbox_attempts_check" CHECK(typeof("scheduled_outbox"."attempts") = 'integer' AND "scheduled_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_scheduled_outbox_item_event` ON `scheduled_outbox` (`item_id`,`event_type`);--> statement-breakpoint
CREATE INDEX `idx_scheduled_outbox_status_available` ON `scheduled_outbox` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `scheduled_usage_daily` (
	`day` text NOT NULL,
	`lane` text NOT NULL,
	`resource` text NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`limit_value` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`day`, `lane`, `resource`),
	CONSTRAINT "scheduled_usage_daily_counts_check" CHECK(typeof("scheduled_usage_daily"."reserved") = 'integer' AND "scheduled_usage_daily"."reserved" >= 0
        AND typeof("scheduled_usage_daily"."used") = 'integer' AND "scheduled_usage_daily"."used" >= 0
        AND typeof("scheduled_usage_daily"."limit_value") = 'integer' AND "scheduled_usage_daily"."limit_value" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_usage_daily_day_resource` ON `scheduled_usage_daily` (`day`,`resource`);