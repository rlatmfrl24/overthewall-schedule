CREATE INDEX `idx_pending_schedules_date_created_at` ON `pending_schedules` (`date`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_schedules_date_member_time` ON `schedules` (`date`,`member_uid`,`start_time`);--> statement-breakpoint
CREATE INDEX `idx_update_logs_member_created_at` ON `update_logs` (`member_uid`,`created_at`);