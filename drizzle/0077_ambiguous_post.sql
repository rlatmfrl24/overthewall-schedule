DELETE FROM `scheduled_outbox`
WHERE `run_id` IN (
  SELECT `id` FROM `scheduled_job_runs` WHERE `job_type` = 'x_metrics_refresh'
);--> statement-breakpoint
DELETE FROM `scheduled_job_items`
WHERE `run_id` IN (
  SELECT `id` FROM `scheduled_job_runs` WHERE `job_type` = 'x_metrics_refresh'
);--> statement-breakpoint
DELETE FROM `scheduled_job_runs`
WHERE `job_type` = 'x_metrics_refresh';--> statement-breakpoint
DELETE FROM `settings`
WHERE `key` IN (
  'x_metrics_snapshot_enabled',
  'scheduled_v2_x_metrics_refresh_enabled'
);--> statement-breakpoint
DELETE FROM `x_api_usage_events`
WHERE `detail` LIKE '%"source":"metrics:%';--> statement-breakpoint
DROP TABLE `x_member_daily_metrics`;--> statement-breakpoint
DROP TABLE `x_post_metric_snapshots`;--> statement-breakpoint
DROP INDEX `idx_x_post_facts_metrics_due`;--> statement-breakpoint
ALTER TABLE `x_post_facts` DROP COLUMN `initial_snapshot_completed_at`;--> statement-breakpoint
ALTER TABLE `x_post_facts` DROP COLUMN `after_24h_snapshot_completed_at`;--> statement-breakpoint
ALTER TABLE `x_post_facts` DROP COLUMN `next_metrics_at`;--> statement-breakpoint
ALTER TABLE `x_post_facts` DROP COLUMN `last_metrics_error`;
