CREATE TABLE `music_catalog_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`public_read_enabled` integer DEFAULT false NOT NULL,
	`navigation_visible` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "music_catalog_meta_singleton_check" CHECK(typeof("music_catalog_meta"."id") = 'integer' AND "music_catalog_meta"."id" = 1),
	CONSTRAINT "music_catalog_meta_revision_check" CHECK(typeof("music_catalog_meta"."revision") = 'integer' AND "music_catalog_meta"."revision" >= 0),
	CONSTRAINT "music_catalog_meta_flags_check" CHECK(typeof("music_catalog_meta"."public_read_enabled") = 'integer'
        AND "music_catalog_meta"."public_read_enabled" IN (0, 1)
        AND typeof("music_catalog_meta"."navigation_visible") = 'integer'
        AND "music_catalog_meta"."navigation_visible" IN (0, 1)),
	CONSTRAINT "music_catalog_meta_navigation_check" CHECK("music_catalog_meta"."navigation_visible" = 0 OR "music_catalog_meta"."public_read_enabled" = 1),
	CONSTRAINT "music_catalog_meta_time_check" CHECK(typeof("music_catalog_meta"."updated_at") = 'integer' AND "music_catalog_meta"."updated_at" >= 0)
);
--> statement-breakpoint
CREATE TABLE `music_search_terms` (
	`song_id` text NOT NULL,
	`term_kind` text NOT NULL,
	`display_value` text NOT NULL,
	`normalized_term` text NOT NULL,
	PRIMARY KEY(`song_id`, `term_kind`, `normalized_term`),
	FOREIGN KEY (`song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_search_terms_kind_check" CHECK("music_search_terms"."term_kind" IN ('title', 'title_alias', 'original_artist', 'participant')),
	CONSTRAINT "music_search_terms_required_text_check" CHECK(length(trim("music_search_terms"."display_value")) > 0 AND length(trim("music_search_terms"."normalized_term")) > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_music_search_terms_normalized_kind_song` ON `music_search_terms` (`normalized_term`,`term_kind`,`song_id`);--> statement-breakpoint
CREATE INDEX `idx_music_performances_published_released_id` ON `music_performances` ("released_at" DESC,`id`) WHERE "music_performances"."publication_status" = 'published';--> statement-breakpoint
CREATE INDEX `idx_music_performances_published_song_released_id` ON `music_performances` (`song_id`,"released_at" DESC,`id`) WHERE "music_performances"."publication_status" = 'published';--> statement-breakpoint
CREATE INDEX `idx_music_performances_published_relation_released_id` ON `music_performances` (`relation_type`,"released_at" DESC,`id`) WHERE "music_performances"."publication_status" = 'published';