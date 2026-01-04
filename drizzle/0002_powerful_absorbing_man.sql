CREATE TABLE IF NOT EXISTS `notices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`url` text,
	`is_active` numeric DEFAULT '1',
	`started_at` text,
	`ended_at` text,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP
);
