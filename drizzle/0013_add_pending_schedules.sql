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
