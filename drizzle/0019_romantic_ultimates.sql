CREATE INDEX `idx_pending_schedules_vod_id` ON `pending_schedules` (`vod_id`);--> statement-breakpoint
CREATE INDEX `idx_pending_schedules_member_date_time` ON `pending_schedules` (`member_uid`,`date`,`start_time`);--> statement-breakpoint
CREATE INDEX `idx_pending_schedules_created_at` ON `pending_schedules` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_schedules_member_date_time` ON `schedules` (`member_uid`,`date`,`start_time`);--> statement-breakpoint
CREATE INDEX `idx_update_logs_created_at` ON `update_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_update_logs_action_created_at` ON `update_logs` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_update_logs_schedule_date_created_at` ON `update_logs` (`schedule_date`,`created_at`);
