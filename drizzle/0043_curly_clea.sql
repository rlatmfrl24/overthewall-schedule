CREATE TABLE `schedule_candidate_rejections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vod_id` text NOT NULL,
	`member_uid` integer NOT NULL,
	`member_name` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`title` text,
	`status` text NOT NULL,
	`action_type` text NOT NULL,
	`existing_schedule_id` integer,
	`previous_status` text,
	`previous_title` text,
	`vod_started_at` text,
	`vod_duration_seconds` integer,
	`vod_thumbnail_url` text,
	`reason_code` text,
	`reason_note` text,
	`actor_id` text,
	`actor_name` text,
	`actor_ip` text,
	`rejected_at` numeric DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "schedule_candidate_rejections_reason_check" CHECK("schedule_candidate_rejections"."reason_code" IS NULL OR "schedule_candidate_rejections"."reason_code" IN ('not_needed', 'already_reflected', 'wrong_match', 'duplicate', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_schedule_candidate_rejections_vod_id` ON `schedule_candidate_rejections` (`vod_id`);--> statement-breakpoint
CREATE INDEX `idx_schedule_candidate_rejections_rejected_at` ON `schedule_candidate_rejections` (`rejected_at`);--> statement-breakpoint
CREATE INDEX `idx_schedule_candidate_rejections_member_date` ON `schedule_candidate_rejections` (`member_uid`,`date`);--> statement-breakpoint
CREATE INDEX `idx_schedule_candidate_rejections_reason_rejected` ON `schedule_candidate_rejections` (`reason_code`,`rejected_at`);--> statement-breakpoint
ALTER TABLE `auto_update_runs` ADD `rejected_suppressed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_update_runs` ADD `duplicate_pending_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `update_logs` ADD `vod_id` text;--> statement-breakpoint
ALTER TABLE `update_logs` ADD `reason_code` text;--> statement-breakpoint
ALTER TABLE `update_logs` ADD `reason_note` text;