CREATE TABLE `x_compliance_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_job_id` text,
	`status` text NOT NULL,
	`input_count` integer DEFAULT 0 NOT NULL,
	`input_json` text,
	`upload_url` text,
	`download_url` text,
	`created_at` integer NOT NULL,
	`upload_started_at` integer,
	`uploaded_at` integer,
	`last_polled_at` integer,
	`downloaded_at` integer,
	`applied_at` integer,
	`next_check_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_detail` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "x_compliance_jobs_status_check" CHECK("x_compliance_jobs"."status" IN ('created', 'uploading', 'uploaded', 'pending', 'complete', 'applied', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `x_compliance_jobs_provider_job_id_unique` ON `x_compliance_jobs` (`provider_job_id`);--> statement-breakpoint
CREATE INDEX `idx_x_compliance_jobs_due` ON `x_compliance_jobs` (`status`,`next_check_at`);--> statement-breakpoint
CREATE INDEX `idx_x_compliance_jobs_created` ON `x_compliance_jobs` (`created_at`);--> statement-breakpoint
CREATE TABLE `x_member_daily_metrics` (
	`kst_date` text NOT NULL,
	`member_uid` integer NOT NULL,
	`post_count` integer DEFAULT 0 NOT NULL,
	`reply_count` integer DEFAULT 0 NOT NULL,
	`quote_count` integer DEFAULT 0 NOT NULL,
	`media_post_count` integer DEFAULT 0 NOT NULL,
	`link_post_count` integer DEFAULT 0 NOT NULL,
	`initial_like_count` integer DEFAULT 0 NOT NULL,
	`initial_reply_count` integer DEFAULT 0 NOT NULL,
	`initial_repost_count` integer DEFAULT 0 NOT NULL,
	`initial_quote_count` integer DEFAULT 0 NOT NULL,
	`after_24h_like_count` integer DEFAULT 0 NOT NULL,
	`after_24h_reply_count` integer DEFAULT 0 NOT NULL,
	`after_24h_repost_count` integer DEFAULT 0 NOT NULL,
	`after_24h_quote_count` integer DEFAULT 0 NOT NULL,
	`snapshot_covered_count` integer DEFAULT 0 NOT NULL,
	`deleted_count` integer DEFAULT 0 NOT NULL,
	`recalculated_at` integer NOT NULL,
	PRIMARY KEY(`kst_date`, `member_uid`)
);
--> statement-breakpoint
CREATE INDEX `idx_x_member_daily_metrics_member_date` ON `x_member_daily_metrics` (`member_uid`,`kst_date`);--> statement-breakpoint
CREATE TABLE `x_post_facts` (
	`post_id` text PRIMARY KEY NOT NULL,
	`member_uid` integer NOT NULL,
	`member_name_snapshot` text NOT NULL,
	`post_type` text NOT NULL,
	`created_at` integer NOT NULL,
	`first_seen_at` integer NOT NULL,
	`media_count` integer DEFAULT 0 NOT NULL,
	`link_count` integer DEFAULT 0 NOT NULL,
	`edit_root_post_id` text,
	`superseded_by_post_id` text,
	`hidden_at` integer,
	`hidden_reason` text,
	`initial_snapshot_completed_at` integer,
	`after_24h_snapshot_completed_at` integer,
	`next_metrics_at` integer,
	`last_metrics_error` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "x_post_facts_type_check" CHECK("x_post_facts"."post_type" IN ('post', 'reply', 'quote'))
);
--> statement-breakpoint
CREATE INDEX `idx_x_post_facts_member_created` ON `x_post_facts` (`member_uid`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_x_post_facts_metrics_due` ON `x_post_facts` (`next_metrics_at`);--> statement-breakpoint
CREATE INDEX `idx_x_post_facts_visible_created` ON `x_post_facts` (`hidden_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `x_post_metric_snapshots` (
	`post_id` text NOT NULL,
	`snapshot_kind` text NOT NULL,
	`captured_at` integer NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`reply_count` integer DEFAULT 0 NOT NULL,
	`repost_count` integer DEFAULT 0 NOT NULL,
	`quote_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`post_id`, `snapshot_kind`),
	CONSTRAINT "x_post_metric_snapshots_kind_check" CHECK("x_post_metric_snapshots"."snapshot_kind" IN ('initial', 'after_24h'))
);
--> statement-breakpoint
CREATE INDEX `idx_x_post_metric_snapshots_captured` ON `x_post_metric_snapshots` (`captured_at`);