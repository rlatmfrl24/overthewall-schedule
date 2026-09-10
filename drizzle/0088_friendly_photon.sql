CREATE TABLE `music_default_playlist_settings` (
	`playlist_key` text PRIMARY KEY NOT NULL,
	`title` text,
	`description` text,
	`representative_performance_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`write_token` text NOT NULL,
	CONSTRAINT "music_default_playlist_title_check" CHECK("music_default_playlist_settings"."title" IS NULL OR length(trim("music_default_playlist_settings"."title")) BETWEEN 1 AND 120),
	CONSTRAINT "music_default_playlist_description_check" CHECK("music_default_playlist_settings"."description" IS NULL OR length("music_default_playlist_settings"."description") <= 2000),
	CONSTRAINT "music_default_playlist_version_check" CHECK("music_default_playlist_settings"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE `music_playlists` ADD `representative_performance_id` text;