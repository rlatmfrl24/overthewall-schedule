CREATE TABLE `update_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer,
	`member_uid` integer,
	`member_name` text,
	`schedule_date` text NOT NULL,
	`action` text NOT NULL,
	`title` text,
	`previous_status` text,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
DROP TABLE `auto_update_logs`;