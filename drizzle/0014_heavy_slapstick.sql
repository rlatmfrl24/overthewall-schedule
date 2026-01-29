CREATE TABLE `pending_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_uid` integer NOT NULL,
	`member_name` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`title` text,
	`status` text DEFAULT '방송' NOT NULL,
	`action_type` text NOT NULL,
	`existing_schedule_id` integer,
	`previous_status` text,
	`previous_title` text,
	`vod_id` text,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
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