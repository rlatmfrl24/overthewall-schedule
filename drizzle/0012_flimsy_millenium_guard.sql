CREATE TABLE `auto_update_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schedule_id` integer,
	`member_uid` integer NOT NULL,
	`member_name` text NOT NULL,
	`schedule_date` text NOT NULL,
	`action` text NOT NULL,
	`title` text,
	`previous_status` text,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP
);
