CREATE TABLE `music_song_tags` (
	`song_id` text NOT NULL,
	`tag_key` text NOT NULL,
	`display_name` text NOT NULL,
	PRIMARY KEY(`song_id`, `tag_key`),
	FOREIGN KEY (`song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_song_tags_required_text_check" CHECK(length(trim("music_song_tags"."tag_key")) BETWEEN 1 AND 80 AND length(trim("music_song_tags"."display_name")) BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE INDEX `idx_music_song_tags_key_song` ON `music_song_tags` (`tag_key`,`song_id`);