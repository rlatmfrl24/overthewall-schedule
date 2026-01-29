CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` numeric DEFAULT CURRENT_TIMESTAMP
);
