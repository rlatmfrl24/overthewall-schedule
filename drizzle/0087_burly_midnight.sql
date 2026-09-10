CREATE TABLE `music_playlist_items` (
	`playlist_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`playlist_id`, `performance_id`),
	FOREIGN KEY (`playlist_id`) REFERENCES `music_playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_playlist_items_position_check" CHECK("music_playlist_items"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_music_playlist_items_position` ON `music_playlist_items` (`playlist_id`,`position`);--> statement-breakpoint
CREATE TABLE `music_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`origin_default_id` text,
	`create_request_id` text NOT NULL,
	`create_payload` text NOT NULL,
	`write_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "music_playlists_title_check" CHECK(length(trim("music_playlists"."title")) BETWEEN 1 AND 120),
	CONSTRAINT "music_playlists_version_check" CHECK("music_playlists"."version" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_music_playlists_owner_request` ON `music_playlists` (`owner_user_id`,`create_request_id`);--> statement-breakpoint
CREATE INDEX `idx_music_playlists_owner_updated` ON `music_playlists` (`owner_user_id`,`updated_at`);