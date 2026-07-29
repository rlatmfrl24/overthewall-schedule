CREATE TABLE `schedule_broadcast_observations` (
	`vod_id` text PRIMARY KEY NOT NULL,
	`member_uid` integer NOT NULL,
	`channel_id` text NOT NULL,
	`title` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`thumbnail_url` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	CONSTRAINT "schedule_broadcast_observations_timing_check" CHECK("schedule_broadcast_observations"."ended_at" >= "schedule_broadcast_observations"."started_at"),
	CONSTRAINT "schedule_broadcast_observations_duration_check" CHECK("schedule_broadcast_observations"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_schedule_broadcast_observations_member_started` ON `schedule_broadcast_observations` (`member_uid`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_schedule_broadcast_observations_last_seen` ON `schedule_broadcast_observations` (`last_seen_at`);--> statement-breakpoint
ALTER TABLE `auto_update_runs` ADD `segment_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_update_runs` ADD `session_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_update_runs` ADD `resume_merged_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_update_runs` ADD `short_suppressed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_update_runs` ADD `holiday_suppressed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_update_runs` ADD `ambiguous_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_update_runs` ADD `obsolete_pending_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD `previous_start_time` text;--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD `candidate_kind` text;--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD `match_reason` text;--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD `match_confidence` text;--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD `ranked_schedule_ids` text;--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD `source_vod_ids` text;--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD `session_started_at` text;--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD `session_ended_at` text;--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD `vod_segment_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD `previous_start_time` text;--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD `candidate_kind` text;--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD `match_reason` text;--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD `match_confidence` text;--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD `ranked_schedule_ids` text;--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD `source_vod_ids` text;--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD `session_started_at` text;--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD `session_ended_at` text;--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD `vod_segment_count` integer DEFAULT 1 NOT NULL;