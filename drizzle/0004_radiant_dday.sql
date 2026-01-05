CREATE TABLE `ddays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`color` text,
	`is_annual` numeric DEFAULT '1' NOT NULL,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ddays_is_annual_check` CHECK(is_annual IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `idx_ddays_date` ON `ddays` (`date`);

