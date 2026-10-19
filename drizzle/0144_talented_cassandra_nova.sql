CREATE INDEX `idx_scheduled_job_items_run_status_updated` ON `scheduled_job_items` (`run_id`,`status`,"updated_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_runs_accepted` ON `scheduled_job_runs` ("accepted_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX `idx_scheduled_job_runs_job_accepted` ON `scheduled_job_runs` (`job_type`,"accepted_at" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX `idx_update_logs_datetime` ON `update_logs` (datetime("created_at"));--> statement-breakpoint
CREATE INDEX `idx_x_post_references_lease_token` ON `x_post_references` (`lease_token`) WHERE lease_token IS NOT NULL;