CREATE TABLE `x_activity_coordinator` (
	`id` integer PRIMARY KEY NOT NULL,
	`ready` integer DEFAULT false NOT NULL,
	`webhook_id` text,
	`webhook_url` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`bootstrap_extra_day` text,
	`bootstrap_extra_micros` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "x_activity_coordinator_singleton" CHECK("x_activity_coordinator"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `x_activity_dispatch` (
	`event_id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`payload` text,
	`received_at` integer NOT NULL,
	`charged` integer DEFAULT false NOT NULL,
	`otw_status` text DEFAULT 'not_target' NOT NULL,
	`luvdia_status` text DEFAULT 'not_target' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_x_activity_dispatch_pending` ON `x_activity_dispatch` (`next_attempt_at`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_x_activity_dispatch_post` ON `x_activity_dispatch` (`post_id`);--> statement-breakpoint
CREATE TABLE `x_activity_sites` (
	`site` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`pause_reason` text,
	`resume_at` integer,
	`synced_at` integer,
	`last_error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `x_activity_subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`tag` text NOT NULL,
	`subscription_id` text,
	`webhook_id` text,
	`expires_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x_activity_subscriptions_tag_unique` ON `x_activity_subscriptions` (`tag`);--> statement-breakpoint
CREATE UNIQUE INDEX `x_activity_subscriptions_subscription_id_unique` ON `x_activity_subscriptions` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `x_activity_targets` (
	`site` text NOT NULL,
	`handle` text NOT NULL,
	`user_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`site`, `handle`)
);
--> statement-breakpoint
CREATE INDEX `idx_x_activity_target_user` ON `x_activity_targets` (`user_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `x_shared_budgets` (
	`day` text PRIMARY KEY NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`limit_value` integer DEFAULT 1000000 NOT NULL,
	`seed_detail` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "x_shared_budget_nonnegative" CHECK("x_shared_budgets"."used" >= 0 AND "x_shared_budgets"."reserved" >= 0 AND "x_shared_budgets"."limit_value" = 1000000)
);
--> statement-breakpoint
CREATE TABLE `x_shared_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`site` text NOT NULL,
	`operation` text NOT NULL,
	`path` text NOT NULL,
	`status` text NOT NULL,
	`claim_token` text NOT NULL,
	`estimate` integer NOT NULL,
	`cost` integer DEFAULT 0 NOT NULL,
	`result` text,
	`post_ids` text DEFAULT '[]' NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_x_shared_requests_day` ON `x_shared_requests` (`day`,`status`);