CREATE TABLE `kirinuki_channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_name` text NOT NULL,
	`channel_url` text NOT NULL,
	`youtube_channel_id` text NOT NULL,
	`created_at` numeric DEFAULT CURRENT_TIMESTAMP
);
