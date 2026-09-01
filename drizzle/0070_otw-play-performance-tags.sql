CREATE TABLE `music_performance_tags` (
	`performance_id` text NOT NULL,
	`tag_key` text NOT NULL,
	`display_name` text NOT NULL,
	PRIMARY KEY(`performance_id`, `tag_key`),
	FOREIGN KEY (`performance_id`) REFERENCES `music_performances`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_performance_tags_required_text_check" CHECK(length(trim("music_performance_tags"."tag_key")) BETWEEN 1 AND 80 AND length(trim("music_performance_tags"."display_name")) BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE INDEX `idx_music_performance_tags_key_performance` ON `music_performance_tags` (`tag_key`,`performance_id`);