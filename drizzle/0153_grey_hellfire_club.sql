CREATE TABLE `x_activity_inbox` (
	`event_id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`handle` text NOT NULL,
	`user_id` text NOT NULL,
	`payload` text,
	`hydrated_payload` text,
	`received_at` integer NOT NULL,
	`charged` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`media_source` text DEFAULT 'pending' NOT NULL,
	`media_count` integer DEFAULT 0 NOT NULL,
	`media_types` text DEFAULT '' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lookup_attempted_at` integer,
	`lookup_attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_x_activity_pending` ON `x_activity_inbox` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `idx_x_activity_received` ON `x_activity_inbox` (`received_at`);--> statement-breakpoint
CREATE INDEX `idx_x_activity_post` ON `x_activity_inbox` (`post_id`);--> statement-breakpoint
CREATE TABLE `x_activity_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`user_id` text NOT NULL,
	`tag` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'stopped' NOT NULL,
	`webhook_id` text,
	`subscription_id` text,
	`expires_at` integer,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "x_activity_single_member" CHECK("x_activity_state"."id" = 1)
);
