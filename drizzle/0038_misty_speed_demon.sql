CREATE TABLE `admin_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`actor_ip` text,
	`target_count` integer,
	`success_count` integer,
	`failure_count` integer,
	`detail` text,
	`error` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "admin_audit_logs_status_check" CHECK("admin_audit_logs"."status" IN ('success', 'partial', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_logs_created_at` ON `admin_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_admin_audit_logs_event_created_at` ON `admin_audit_logs` (`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_admin_audit_logs_actor_created_at` ON `admin_audit_logs` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_admin_audit_logs_resource_created_at` ON `admin_audit_logs` (`resource_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_admin_audit_logs_status_created_at` ON `admin_audit_logs` (`status`,`created_at`);