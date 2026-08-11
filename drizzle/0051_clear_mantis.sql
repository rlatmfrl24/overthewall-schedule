CREATE TABLE `music_public_performance_sort_keys` (
	`performance_id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`representative_participant_entity_id` text,
	`normalized_participant` text,
	FOREIGN KEY (`representative_participant_entity_id`) REFERENCES `music_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`performance_id`,`song_id`) REFERENCES `music_performances`(`id`,`song_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_public_performance_sort_keys_participant_pair_check" CHECK(("music_public_performance_sort_keys"."representative_participant_entity_id" IS NULL AND "music_public_performance_sort_keys"."normalized_participant" IS NULL)
        OR ("music_public_performance_sort_keys"."representative_participant_entity_id" IS NOT NULL
          AND "music_public_performance_sort_keys"."normalized_participant" IS NOT NULL
          AND length(trim("music_public_performance_sort_keys"."normalized_participant")) > 0))
);
--> statement-breakpoint
CREATE INDEX `idx_music_public_performance_sort_keys_participant_song_performance` ON `music_public_performance_sort_keys` (`normalized_participant`,`song_id`,`performance_id`) WHERE "music_public_performance_sort_keys"."normalized_participant" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_music_public_performance_sort_keys_missing_song_performance` ON `music_public_performance_sort_keys` (`song_id`,`performance_id`) WHERE "music_public_performance_sort_keys"."normalized_participant" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_music_public_performance_sort_keys_entity_performance` ON `music_public_performance_sort_keys` (`representative_participant_entity_id`,`performance_id`);--> statement-breakpoint
CREATE TABLE `music_public_read_model_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "music_public_read_model_meta_singleton_check" CHECK(typeof("music_public_read_model_meta"."id") = 'integer' AND "music_public_read_model_meta"."id" = 1),
	CONSTRAINT "music_public_read_model_meta_revision_check" CHECK(typeof("music_public_read_model_meta"."revision") = 'integer' AND "music_public_read_model_meta"."revision" >= 0),
	CONSTRAINT "music_public_read_model_meta_time_check" CHECK(typeof("music_public_read_model_meta"."updated_at") = 'integer' AND "music_public_read_model_meta"."updated_at" >= 0)
);
--> statement-breakpoint
CREATE TABLE `music_search_gram_stats` (
	`gram_size` integer NOT NULL,
	`normalized_gram` text NOT NULL,
	`song_count` integer NOT NULL,
	PRIMARY KEY(`gram_size`, `normalized_gram`),
	CONSTRAINT "music_search_gram_stats_size_check" CHECK(typeof("music_search_gram_stats"."gram_size") = 'integer'
        AND "music_search_gram_stats"."gram_size" IN (2, 3)),
	CONSTRAINT "music_search_gram_stats_value_check" CHECK(typeof("music_search_gram_stats"."normalized_gram") = 'text'
        AND length("music_search_gram_stats"."normalized_gram") = "music_search_gram_stats"."gram_size"),
	CONSTRAINT "music_search_gram_stats_count_check" CHECK(typeof("music_search_gram_stats"."song_count") = 'integer'
        AND "music_search_gram_stats"."song_count" > 0)
);
--> statement-breakpoint
CREATE TABLE `music_search_grams` (
	`song_id` text NOT NULL,
	`gram_size` integer NOT NULL,
	`normalized_gram` text NOT NULL,
	PRIMARY KEY(`song_id`, `gram_size`, `normalized_gram`),
	FOREIGN KEY (`song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_search_grams_size_check" CHECK(typeof("music_search_grams"."gram_size") = 'integer'
        AND "music_search_grams"."gram_size" IN (2, 3)),
	CONSTRAINT "music_search_grams_value_check" CHECK(typeof("music_search_grams"."normalized_gram") = 'text'
        AND length("music_search_grams"."normalized_gram") = "music_search_grams"."gram_size")
);
--> statement-breakpoint
CREATE INDEX `idx_music_search_grams_size_normalized_song` ON `music_search_grams` (`gram_size`,`normalized_gram`,`song_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_performances_id_song_id` ON `music_performances` (`id`,`song_id`);