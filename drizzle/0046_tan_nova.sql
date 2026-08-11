CREATE TABLE `music_channel_entities` (
	`channel_id` text NOT NULL,
	`entity_id` text NOT NULL,
	PRIMARY KEY(`channel_id`, `entity_id`),
	FOREIGN KEY (`channel_id`) REFERENCES `music_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `music_entities`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_music_channel_entities_entity_channel` ON `music_channel_entities` (`entity_id`,`channel_id`);--> statement-breakpoint
CREATE TABLE `music_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_channel_id` text NOT NULL,
	`display_name` text NOT NULL,
	`channel_role` text NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "music_channels_provider_check" CHECK("music_channels"."provider" = 'youtube'),
	CONSTRAINT "music_channels_external_id_check" CHECK(length("music_channels"."external_channel_id") = 24 AND substr("music_channels"."external_channel_id", 1, 2) = 'UC' AND substr("music_channels"."external_channel_id", 3) NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "music_channels_role_check" CHECK("music_channels"."channel_role" IN ('otw_official', 'unit_official', 'member_music', 'member_main', 'project_official', 'approved_kirinuki', 'other')),
	CONSTRAINT "music_channels_verification_check" CHECK("music_channels"."verification_status" IN ('pending', 'approved', 'revoked')),
	CONSTRAINT "music_channels_active_check" CHECK("music_channels"."active" IN (0, 1)),
	CONSTRAINT "music_channels_active_approval_check" CHECK("music_channels"."active" = 0 OR "music_channels"."verification_status" = 'approved'),
	CONSTRAINT "music_channels_required_text_check" CHECK(length(trim("music_channels"."id")) > 0 AND length(trim("music_channels"."display_name")) > 0),
	CONSTRAINT "music_channels_version_check" CHECK(typeof("music_channels"."version") = 'integer' AND "music_channels"."version" >= 0),
	CONSTRAINT "music_channels_time_check" CHECK(typeof("music_channels"."created_at") = 'integer' AND "music_channels"."created_at" >= 0
        AND typeof("music_channels"."updated_at") = 'integer' AND "music_channels"."updated_at" >= "music_channels"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channels_provider_external` ON `music_channels` (`provider`,`external_channel_id`);--> statement-breakpoint
CREATE INDEX `idx_music_channels_verification_active_role` ON `music_channels` (`verification_status`,`active`,`channel_role`);--> statement-breakpoint
CREATE TABLE `music_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`member_uid` integer,
	`entity_kind` text NOT NULL,
	`display_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`slug` text NOT NULL,
	`archived_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`member_uid`) REFERENCES `members`(`uid`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "music_entities_kind_check" CHECK("music_entities"."entity_kind" IN ('person', 'group', 'organization')),
	CONSTRAINT "music_entities_member_kind_check" CHECK("music_entities"."member_uid" IS NULL OR "music_entities"."entity_kind" = 'person'),
	CONSTRAINT "music_entities_required_text_check" CHECK(length(trim("music_entities"."id")) > 0 AND length(trim("music_entities"."display_name")) > 0 AND length(trim("music_entities"."normalized_name")) > 0 AND length(trim("music_entities"."slug")) > 0),
	CONSTRAINT "music_entities_version_check" CHECK(typeof("music_entities"."version") = 'integer' AND "music_entities"."version" >= 0),
	CONSTRAINT "music_entities_time_check" CHECK(typeof("music_entities"."created_at") = 'integer' AND "music_entities"."created_at" >= 0
        AND typeof("music_entities"."updated_at") = 'integer' AND "music_entities"."updated_at" >= "music_entities"."created_at"
        AND ("music_entities"."archived_at" IS NULL OR (typeof("music_entities"."archived_at") = 'integer' AND "music_entities"."archived_at" >= 0)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_entities_slug` ON `music_entities` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_entities_member_uid` ON `music_entities` (`member_uid`) WHERE "music_entities"."member_uid" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_music_entities_normalized_name_id` ON `music_entities` (`normalized_name`,`id`);--> statement-breakpoint
CREATE TABLE `music_entity_aliases` (
	`entity_id` text NOT NULL,
	`alias` text NOT NULL,
	`normalized_alias` text NOT NULL,
	`locale` text,
	`alias_kind` text,
	PRIMARY KEY(`entity_id`, `normalized_alias`),
	FOREIGN KEY (`entity_id`) REFERENCES `music_entities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_entity_aliases_required_text_check" CHECK(length(trim("music_entity_aliases"."alias")) > 0 AND length(trim("music_entity_aliases"."normalized_alias")) > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_music_entity_aliases_normalized_alias_entity` ON `music_entity_aliases` (`normalized_alias`,`entity_id`);--> statement-breakpoint
CREATE TABLE `music_media_source_relations` (
	`source_id` text NOT NULL,
	`related_source_id` text NOT NULL,
	`relation_type` text NOT NULL,
	PRIMARY KEY(`source_id`, `related_source_id`, `relation_type`),
	FOREIGN KEY (`source_id`) REFERENCES `music_media_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`related_source_id`) REFERENCES `music_media_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_media_source_relations_type_check" CHECK("music_media_source_relations"."relation_type" IN ('excerpt_of', 'alternate_of')),
	CONSTRAINT "music_media_source_relations_self_check" CHECK("music_media_source_relations"."source_id" <> "music_media_source_relations"."related_source_id")
);
--> statement-breakpoint
CREATE INDEX `idx_music_media_source_relations_related_type` ON `music_media_source_relations` (`related_source_id`,`relation_type`);--> statement-breakpoint
CREATE TABLE `music_media_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`title` text,
	`thumbnail_url` text,
	`duration_seconds` integer,
	`provider_published_at` integer,
	`availability_status` text DEFAULT 'unknown' NOT NULL,
	`last_checked_at` integer,
	`next_check_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `music_channels`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_media_sources_provider_check" CHECK("music_media_sources"."provider" = 'youtube'),
	CONSTRAINT "music_media_sources_external_id_check" CHECK(length("music_media_sources"."external_id") = 11 AND "music_media_sources"."external_id" NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "music_media_sources_availability_check" CHECK("music_media_sources"."availability_status" IN ('unknown', 'playable', 'private', 'embed_disabled', 'deleted', 'region_blocked', 'unavailable')),
	CONSTRAINT "music_media_sources_duration_check" CHECK("music_media_sources"."duration_seconds" IS NULL OR (typeof("music_media_sources"."duration_seconds") = 'integer' AND "music_media_sources"."duration_seconds" >= 0)),
	CONSTRAINT "music_media_sources_check_times_check" CHECK(("music_media_sources"."last_checked_at" IS NULL OR (typeof("music_media_sources"."last_checked_at") = 'integer' AND "music_media_sources"."last_checked_at" >= 0))
        AND ("music_media_sources"."next_check_at" IS NULL OR (typeof("music_media_sources"."next_check_at") = 'integer' AND "music_media_sources"."next_check_at" >= 0))
        AND ("music_media_sources"."provider_published_at" IS NULL OR (typeof("music_media_sources"."provider_published_at") = 'integer' AND "music_media_sources"."provider_published_at" >= 0))),
	CONSTRAINT "music_media_sources_required_text_check" CHECK(length(trim("music_media_sources"."id")) > 0),
	CONSTRAINT "music_media_sources_version_check" CHECK(typeof("music_media_sources"."version") = 'integer' AND "music_media_sources"."version" >= 0),
	CONSTRAINT "music_media_sources_time_check" CHECK(typeof("music_media_sources"."created_at") = 'integer' AND "music_media_sources"."created_at" >= 0
        AND typeof("music_media_sources"."updated_at") = 'integer' AND "music_media_sources"."updated_at" >= "music_media_sources"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_media_sources_provider_external` ON `music_media_sources` (`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_music_media_sources_channel_published_id` ON `music_media_sources` (`channel_id`,"provider_published_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_media_sources_availability_checked` ON `music_media_sources` (`availability_status`,`last_checked_at`);--> statement-breakpoint
CREATE TABLE `music_performance_participants` (
	`performance_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`participant_role` text NOT NULL,
	`credit_order` integer DEFAULT 0 NOT NULL,
	`credit_name_snapshot` text NOT NULL,
	PRIMARY KEY(`performance_id`, `entity_id`),
	FOREIGN KEY (`performance_id`) REFERENCES `music_performances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `music_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_performance_participants_role_check" CHECK("music_performance_participants"."participant_role" IN ('vocal', 'featured_vocal', 'chorus', 'other')),
	CONSTRAINT "music_performance_participants_credit_order_check" CHECK(typeof("music_performance_participants"."credit_order") = 'integer' AND "music_performance_participants"."credit_order" >= 0),
	CONSTRAINT "music_performance_participants_snapshot_check" CHECK(length(trim("music_performance_participants"."credit_name_snapshot")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_performance_participants_credit_order` ON `music_performance_participants` (`performance_id`,`credit_order`);--> statement-breakpoint
CREATE INDEX `idx_music_performance_participants_entity_performance` ON `music_performance_participants` (`entity_id`,`performance_id`);--> statement-breakpoint
CREATE TABLE `music_performance_sources` (
	`performance_id` text NOT NULL,
	`source_id` text NOT NULL,
	`start_seconds` integer DEFAULT 0 NOT NULL,
	`end_seconds` integer,
	`source_role` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`performance_id`, `source_id`, `start_seconds`),
	FOREIGN KEY (`performance_id`) REFERENCES `music_performances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `music_media_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_performance_sources_range_check" CHECK(typeof("music_performance_sources"."start_seconds") = 'integer' AND "music_performance_sources"."start_seconds" >= 0
        AND ("music_performance_sources"."end_seconds" IS NULL OR (typeof("music_performance_sources"."end_seconds") = 'integer' AND "music_performance_sources"."end_seconds" > "music_performance_sources"."start_seconds"))),
	CONSTRAINT "music_performance_sources_role_check" CHECK("music_performance_sources"."source_role" IN ('official', 'kirinuki', 'broadcast_original', 'alternate')),
	CONSTRAINT "music_performance_sources_priority_check" CHECK(typeof("music_performance_sources"."priority") = 'integer' AND "music_performance_sources"."priority" >= 0),
	CONSTRAINT "music_performance_sources_primary_check" CHECK("music_performance_sources"."is_primary" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_performance_sources_source_start` ON `music_performance_sources` (`source_id`,`start_seconds`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_performance_sources_primary` ON `music_performance_sources` (`performance_id`) WHERE "music_performance_sources"."is_primary" = 1;--> statement-breakpoint
CREATE INDEX `idx_music_performance_sources_performance_priority_source` ON `music_performance_sources` (`performance_id`,`priority`,`source_id`);--> statement-breakpoint
CREATE TABLE `music_performances` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`relation_type` text NOT NULL,
	`release_type` text NOT NULL,
	`participation_type` text NOT NULL,
	`publication_status` text DEFAULT 'draft' NOT NULL,
	`quality_status` text DEFAULT 'ok' NOT NULL,
	`released_at` integer,
	`internal_note` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_performances_relation_type_check" CHECK("music_performances"."relation_type" IN ('original', 'cover')),
	CONSTRAINT "music_performances_release_type_check" CHECK("music_performances"."release_type" IN ('official_mv', 'official_video', 'broadcast', 'live', 'shorts')),
	CONSTRAINT "music_performances_participation_type_check" CHECK("music_performances"."participation_type" IN ('solo', 'duet', 'unit', 'group', 'external_collab')),
	CONSTRAINT "music_performances_publication_status_check" CHECK("music_performances"."publication_status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "music_performances_quality_status_check" CHECK("music_performances"."quality_status" IN ('ok', 'needs_update')),
	CONSTRAINT "music_performances_required_text_check" CHECK(length(trim("music_performances"."id")) > 0 AND length(trim("music_performances"."dedupe_key")) > 0),
	CONSTRAINT "music_performances_release_time_check" CHECK("music_performances"."released_at" IS NULL OR (typeof("music_performances"."released_at") = 'integer' AND "music_performances"."released_at" >= 0)),
	CONSTRAINT "music_performances_version_check" CHECK(typeof("music_performances"."version") = 'integer' AND "music_performances"."version" >= 0),
	CONSTRAINT "music_performances_time_check" CHECK(typeof("music_performances"."created_at") = 'integer' AND "music_performances"."created_at" >= 0
        AND typeof("music_performances"."updated_at") = 'integer' AND "music_performances"."updated_at" >= "music_performances"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_performances_dedupe_key` ON `music_performances` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_music_performances_song_id` ON `music_performances` (`song_id`);--> statement-breakpoint
CREATE TABLE `music_song_aliases` (
	`song_id` text NOT NULL,
	`alias` text NOT NULL,
	`normalized_alias` text NOT NULL,
	`locale` text,
	`alias_kind` text,
	PRIMARY KEY(`song_id`, `normalized_alias`),
	FOREIGN KEY (`song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_song_aliases_required_text_check" CHECK(length(trim("music_song_aliases"."alias")) > 0 AND length(trim("music_song_aliases"."normalized_alias")) > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_music_song_aliases_normalized_alias_song` ON `music_song_aliases` (`normalized_alias`,`song_id`);--> statement-breakpoint
CREATE TABLE `music_song_original_artists` (
	`song_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`credit_order` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`song_id`, `entity_id`),
	FOREIGN KEY (`song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `music_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_song_original_artists_credit_order_check" CHECK(typeof("music_song_original_artists"."credit_order") = 'integer' AND "music_song_original_artists"."credit_order" >= 0),
	CONSTRAINT "music_song_original_artists_primary_check" CHECK("music_song_original_artists"."is_primary" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_song_original_artists_credit_order` ON `music_song_original_artists` (`song_id`,`credit_order`);--> statement-breakpoint
CREATE INDEX `idx_music_song_original_artists_entity_song` ON `music_song_original_artists` (`entity_id`,`song_id`);--> statement-breakpoint
CREATE TABLE `music_songs` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`is_otw_original` integer NOT NULL,
	`original_release_date` text,
	`original_release_precision` text DEFAULT 'unknown' NOT NULL,
	`merged_into_song_id` text,
	`archived_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`merged_into_song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_songs_required_text_check" CHECK(length(trim("music_songs"."id")) > 0 AND length(trim("music_songs"."slug")) > 0 AND length(trim("music_songs"."title")) > 0 AND length(trim("music_songs"."normalized_title")) > 0 AND length(trim("music_songs"."dedupe_key")) > 0),
	CONSTRAINT "music_songs_otw_original_check" CHECK("music_songs"."is_otw_original" IN (0, 1)),
	CONSTRAINT "music_songs_release_precision_check" CHECK("music_songs"."original_release_precision" IN ('year', 'month', 'day', 'unknown')),
	CONSTRAINT "music_songs_release_date_check" CHECK(("music_songs"."original_release_precision" = 'unknown' AND "music_songs"."original_release_date" IS NULL)
        OR ("music_songs"."original_release_precision" = 'year'
          AND "music_songs"."original_release_date" IS NOT NULL
          AND "music_songs"."original_release_date" GLOB '[0-9][0-9][0-9][0-9]')
        OR ("music_songs"."original_release_precision" = 'month'
          AND "music_songs"."original_release_date" IS NOT NULL
          AND "music_songs"."original_release_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
          AND substr("music_songs"."original_release_date", 6, 2) BETWEEN '01' AND '12')
        OR ("music_songs"."original_release_precision" = 'day'
          AND "music_songs"."original_release_date" IS NOT NULL
          AND "music_songs"."original_release_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND date("music_songs"."original_release_date", '+0 days') IS NOT NULL
          AND date("music_songs"."original_release_date", '+0 days') = "music_songs"."original_release_date")),
	CONSTRAINT "music_songs_merge_target_check" CHECK("music_songs"."merged_into_song_id" IS NULL OR "music_songs"."merged_into_song_id" <> "music_songs"."id"),
	CONSTRAINT "music_songs_version_check" CHECK(typeof("music_songs"."version") = 'integer' AND "music_songs"."version" >= 0),
	CONSTRAINT "music_songs_time_check" CHECK(typeof("music_songs"."created_at") = 'integer' AND "music_songs"."created_at" >= 0
        AND typeof("music_songs"."updated_at") = 'integer' AND "music_songs"."updated_at" >= "music_songs"."created_at"
        AND ("music_songs"."archived_at" IS NULL OR (typeof("music_songs"."archived_at") = 'integer' AND "music_songs"."archived_at" >= 0)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_songs_slug` ON `music_songs` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_songs_dedupe_key` ON `music_songs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_music_songs_merged_into_song_id` ON `music_songs` (`merged_into_song_id`);--> statement-breakpoint
CREATE INDEX `idx_music_songs_normalized_title_id` ON `music_songs` (`normalized_title`,`id`);