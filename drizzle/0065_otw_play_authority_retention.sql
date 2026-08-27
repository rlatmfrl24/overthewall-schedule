PRAGMA foreign_keys=OFF;--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__backup_music_channel_websub_deliveries` AS
SELECT * FROM `music_channel_websub_deliveries`;--> statement-breakpoint
DROP TABLE `music_channel_websub_deliveries`;--> statement-breakpoint
CREATE TABLE `__new_music_channel_websub_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text NOT NULL,
	`monitor_generation` integer NOT NULL,
	`topic_url` text NOT NULL,
	`callback_token_hash` text NOT NULL,
	`secret_version` integer NOT NULL,
	`status` text NOT NULL,
	`pending_mode` text,
	`requested_at` integer NOT NULL,
	`verified_at` integer,
	`lease_expires_at` integer,
	`last_notification_at` integer,
	`last_error_code` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `music_channel_upload_monitors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_channel_websub_subscriptions_identity_check" CHECK(length(trim("__new_music_channel_websub_subscriptions"."id")) > 0
        AND typeof("__new_music_channel_websub_subscriptions"."monitor_generation") = 'integer'
        AND "__new_music_channel_websub_subscriptions"."monitor_generation" >= 0
        AND length("__new_music_channel_websub_subscriptions"."topic_url") = 80
        AND substr("__new_music_channel_websub_subscriptions"."topic_url", 1, 56) = 'https://www.youtube.com/xml/feeds/videos.xml?channel_id='
        AND length("__new_music_channel_websub_subscriptions"."callback_token_hash") = 64
        AND "__new_music_channel_websub_subscriptions"."callback_token_hash" NOT GLOB '*[^a-f0-9]*'
        AND typeof("__new_music_channel_websub_subscriptions"."secret_version") = 'integer'
        AND "__new_music_channel_websub_subscriptions"."secret_version" >= 1),
	CONSTRAINT "music_channel_websub_subscriptions_status_check" CHECK("__new_music_channel_websub_subscriptions"."status" IN ('pending', 'active', 'renewing', 'unsubscribing',
        'unsubscribed', 'denied', 'failed')
        AND ("__new_music_channel_websub_subscriptions"."pending_mode" IS NULL
          OR "__new_music_channel_websub_subscriptions"."pending_mode" IN ('subscribe', 'unsubscribe'))
        AND (("__new_music_channel_websub_subscriptions"."status" IN ('pending', 'renewing') AND "__new_music_channel_websub_subscriptions"."pending_mode" = 'subscribe')
          OR ("__new_music_channel_websub_subscriptions"."status" = 'unsubscribing' AND "__new_music_channel_websub_subscriptions"."pending_mode" = 'unsubscribe')
          OR ("__new_music_channel_websub_subscriptions"."status" IN ('active', 'unsubscribed', 'denied', 'failed')
            AND "__new_music_channel_websub_subscriptions"."pending_mode" IS NULL))
        AND ("__new_music_channel_websub_subscriptions"."status" <> 'active'
          OR ("__new_music_channel_websub_subscriptions"."verified_at" IS NOT NULL
            AND "__new_music_channel_websub_subscriptions"."lease_expires_at" IS NOT NULL))),
	CONSTRAINT "music_channel_websub_subscriptions_time_check" CHECK(typeof("__new_music_channel_websub_subscriptions"."version") = 'integer' AND "__new_music_channel_websub_subscriptions"."version" >= 0
        AND typeof("__new_music_channel_websub_subscriptions"."requested_at") = 'integer' AND "__new_music_channel_websub_subscriptions"."requested_at" >= 0
        AND ("__new_music_channel_websub_subscriptions"."verified_at" IS NULL
          OR (typeof("__new_music_channel_websub_subscriptions"."verified_at") = 'integer' AND "__new_music_channel_websub_subscriptions"."verified_at" >= 0))
        AND ("__new_music_channel_websub_subscriptions"."lease_expires_at" IS NULL
          OR (typeof("__new_music_channel_websub_subscriptions"."lease_expires_at") = 'integer'
            AND "__new_music_channel_websub_subscriptions"."lease_expires_at" >= "__new_music_channel_websub_subscriptions"."requested_at"))
        AND ("__new_music_channel_websub_subscriptions"."last_notification_at" IS NULL
          OR (typeof("__new_music_channel_websub_subscriptions"."last_notification_at") = 'integer'
            AND "__new_music_channel_websub_subscriptions"."last_notification_at" >= 0))
        AND ("__new_music_channel_websub_subscriptions"."last_error_code" IS NULL OR length(trim("__new_music_channel_websub_subscriptions"."last_error_code")) > 0)
        AND typeof("__new_music_channel_websub_subscriptions"."created_at") = 'integer' AND "__new_music_channel_websub_subscriptions"."created_at" >= 0
        AND typeof("__new_music_channel_websub_subscriptions"."updated_at") = 'integer' AND "__new_music_channel_websub_subscriptions"."updated_at" >= "__new_music_channel_websub_subscriptions"."created_at")
);--> statement-breakpoint
INSERT INTO `__new_music_channel_websub_subscriptions` (
  `id`, `monitor_id`, `monitor_generation`, `topic_url`, `callback_token_hash`,
  `secret_version`, `status`, `pending_mode`, `requested_at`, `verified_at`,
  `lease_expires_at`, `last_notification_at`, `last_error_code`, `version`,
  `created_at`, `updated_at`
)
SELECT
  `id`, `monitor_id`, `monitor_generation`, `topic_url`, `callback_token_hash`,
  `secret_version`,
  CASE
    WHEN `status` = 'active' AND (
      `verified_at` IS NULL OR `lease_expires_at` IS NULL
      OR `lease_expires_at` <= unixepoch() * 1000
    ) THEN 'failed'
    ELSE `status`
  END,
  CASE
    WHEN `status` = 'active' AND (
      `verified_at` IS NULL OR `lease_expires_at` IS NULL
      OR `lease_expires_at` <= unixepoch() * 1000
    ) THEN NULL
    ELSE `pending_mode`
  END,
  `requested_at`, `verified_at`, `lease_expires_at`, `last_notification_at`,
  CASE
    WHEN `status` = 'active' AND (
      `verified_at` IS NULL OR `lease_expires_at` IS NULL
      OR `lease_expires_at` <= unixepoch() * 1000
    ) THEN 'migration_invalid_active_subscription'
    ELSE `last_error_code`
  END,
  `version`, `created_at`,
  CASE
    WHEN `status` = 'active' AND (
      `verified_at` IS NULL OR `lease_expires_at` IS NULL
      OR `lease_expires_at` <= unixepoch() * 1000
    ) THEN MAX(`updated_at`, unixepoch() * 1000)
    ELSE `updated_at`
  END
FROM `music_channel_websub_subscriptions`;--> statement-breakpoint
DROP TABLE `music_channel_websub_subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_music_channel_websub_subscriptions` RENAME TO `music_channel_websub_subscriptions`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_websub_subscriptions_monitor_generation` ON `music_channel_websub_subscriptions` (`monitor_id`,`monitor_generation`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_websub_subscriptions_callback_hash` ON `music_channel_websub_subscriptions` (`callback_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_websub_subscriptions_lease` ON `music_channel_websub_subscriptions` (`status`,`lease_expires_at`,`id`);--> statement-breakpoint

CREATE TABLE `music_channel_websub_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`monitor_id` text NOT NULL,
	`monitor_generation` integer NOT NULL,
	`external_channel_id` text NOT NULL,
	`external_video_id` text NOT NULL,
	`provider_updated_at` integer NOT NULL,
	`status` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`received_at` integer NOT NULL,
	`enqueued_at` integer,
	`processed_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `music_channel_websub_subscriptions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`monitor_id`) REFERENCES `music_channel_upload_monitors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_channel_websub_deliveries_identity_check" CHECK(length(trim("music_channel_websub_deliveries"."id")) > 0
        AND typeof("music_channel_websub_deliveries"."monitor_generation") = 'integer'
        AND "music_channel_websub_deliveries"."monitor_generation" >= 0
        AND length("music_channel_websub_deliveries"."external_channel_id") = 24
        AND substr("music_channel_websub_deliveries"."external_channel_id", 1, 2) = 'UC'
        AND substr("music_channel_websub_deliveries"."external_channel_id", 3) NOT GLOB '*[^A-Za-z0-9_-]*'
        AND length("music_channel_websub_deliveries"."external_video_id") = 11
        AND "music_channel_websub_deliveries"."external_video_id" NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "music_channel_websub_deliveries_status_check" CHECK("music_channel_websub_deliveries"."status" IN ('pending', 'enqueued', 'processing', 'completed',
        'rejected', 'failed', 'dead_letter')
        AND typeof("music_channel_websub_deliveries"."attempt_count") = 'integer'
        AND "music_channel_websub_deliveries"."attempt_count" >= 0
        AND ("music_channel_websub_deliveries"."last_error_code" IS NULL OR length(trim("music_channel_websub_deliveries"."last_error_code")) > 0)),
	CONSTRAINT "music_channel_websub_deliveries_time_check" CHECK(typeof("music_channel_websub_deliveries"."provider_updated_at") = 'integer' AND "music_channel_websub_deliveries"."provider_updated_at" >= 0
        AND typeof("music_channel_websub_deliveries"."received_at") = 'integer' AND "music_channel_websub_deliveries"."received_at" >= 0
        AND ("music_channel_websub_deliveries"."enqueued_at" IS NULL
          OR (typeof("music_channel_websub_deliveries"."enqueued_at") = 'integer' AND "music_channel_websub_deliveries"."enqueued_at" >= "music_channel_websub_deliveries"."received_at"))
        AND ("music_channel_websub_deliveries"."processed_at" IS NULL
          OR (typeof("music_channel_websub_deliveries"."processed_at") = 'integer' AND "music_channel_websub_deliveries"."processed_at" >= "music_channel_websub_deliveries"."received_at"))
        AND typeof("music_channel_websub_deliveries"."updated_at") = 'integer' AND "music_channel_websub_deliveries"."updated_at" >= "music_channel_websub_deliveries"."received_at")
);--> statement-breakpoint
INSERT INTO `music_channel_websub_deliveries`
SELECT * FROM `__backup_music_channel_websub_deliveries`;--> statement-breakpoint
DROP TABLE `__backup_music_channel_websub_deliveries`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_websub_deliveries_event` ON `music_channel_websub_deliveries` (`subscription_id`,`external_video_id`,`provider_updated_at`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_websub_deliveries_status_received` ON `music_channel_websub_deliveries` (`status`,`received_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_websub_deliveries_monitor_received` ON `music_channel_websub_deliveries` (`monitor_id`,"received_at" DESC,`id`);--> statement-breakpoint

CREATE TABLE `__backup_music_ingestion_candidate_origins` AS
SELECT * FROM `music_ingestion_candidate_origins`;--> statement-breakpoint
CREATE TABLE `__backup_music_ingestion_events` AS
SELECT * FROM `music_ingestion_events`;--> statement-breakpoint
DROP TABLE `music_ingestion_candidate_origins`;--> statement-breakpoint
DROP TABLE `music_ingestion_events`;--> statement-breakpoint

CREATE TABLE `__new_music_ingestion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_kind` text DEFAULT 'playlist_import' NOT NULL,
	`source_external_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source_title` text,
	`owner_channel_id` text NOT NULL,
	`owner_channel_title` text,
	`source_metadata_checked_at` integer,
	`import_mode` text NOT NULL,
	`range_start_position` integer DEFAULT 0 NOT NULL,
	`requested_item_count` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`actor_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`last_error_code` text,
	`next_retry_at` integer,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "music_ingestion_jobs_required_text_check" CHECK(length(trim("__new_music_ingestion_jobs"."id")) > 0
        AND "__new_music_ingestion_jobs"."source_kind" = 'playlist_import'
        AND length(trim("__new_music_ingestion_jobs"."source_external_id")) > 0
        AND length(trim("__new_music_ingestion_jobs"."source_url")) > 0
        AND ("__new_music_ingestion_jobs"."source_title" IS NULL OR length(trim("__new_music_ingestion_jobs"."source_title")) > 0)
        AND length(trim("__new_music_ingestion_jobs"."owner_channel_id")) > 0
        AND ("__new_music_ingestion_jobs"."owner_channel_title" IS NULL OR length(trim("__new_music_ingestion_jobs"."owner_channel_title")) > 0)
        AND length(trim("__new_music_ingestion_jobs"."actor_user_id")) > 0
        AND length(trim("__new_music_ingestion_jobs"."idempotency_key")) > 0),
	CONSTRAINT "music_ingestion_jobs_mode_count_check" CHECK("__new_music_ingestion_jobs"."import_mode" IN ('all_new', 'recent')
        AND typeof("__new_music_ingestion_jobs"."range_start_position") = 'integer'
        AND "__new_music_ingestion_jobs"."range_start_position" >= 0
        AND typeof("__new_music_ingestion_jobs"."requested_item_count") = 'integer'
        AND "__new_music_ingestion_jobs"."requested_item_count" >= 0
        AND "__new_music_ingestion_jobs"."requested_item_count" <= 5000),
	CONSTRAINT "music_ingestion_jobs_status_check" CHECK("__new_music_ingestion_jobs"."status" IN ('queued', 'collecting', 'completed', 'partial', 'failed')),
	CONSTRAINT "music_ingestion_jobs_error_check" CHECK(("__new_music_ingestion_jobs"."last_error_code" IS NULL OR length(trim("__new_music_ingestion_jobs"."last_error_code")) > 0)
        AND ("__new_music_ingestion_jobs"."next_retry_at" IS NULL
          OR (typeof("__new_music_ingestion_jobs"."next_retry_at") = 'integer' AND "__new_music_ingestion_jobs"."next_retry_at" >= 0))),
	CONSTRAINT "music_ingestion_jobs_time_check" CHECK(typeof("__new_music_ingestion_jobs"."created_at") = 'integer' AND "__new_music_ingestion_jobs"."created_at" >= 0
        AND typeof("__new_music_ingestion_jobs"."updated_at") = 'integer' AND "__new_music_ingestion_jobs"."updated_at" >= "__new_music_ingestion_jobs"."created_at"
        AND ("__new_music_ingestion_jobs"."started_at" IS NULL
          OR (typeof("__new_music_ingestion_jobs"."started_at") = 'integer' AND "__new_music_ingestion_jobs"."started_at" >= "__new_music_ingestion_jobs"."created_at"))
        AND ("__new_music_ingestion_jobs"."completed_at" IS NULL
          OR (typeof("__new_music_ingestion_jobs"."completed_at") = 'integer' AND "__new_music_ingestion_jobs"."completed_at" >= "__new_music_ingestion_jobs"."created_at"))
        AND ("__new_music_ingestion_jobs"."source_metadata_checked_at" IS NULL
          OR (typeof("__new_music_ingestion_jobs"."source_metadata_checked_at") = 'integer'
            AND "__new_music_ingestion_jobs"."source_metadata_checked_at" >= "__new_music_ingestion_jobs"."created_at")))
);--> statement-breakpoint
INSERT INTO `__new_music_ingestion_jobs` (
  `id`, `source_kind`, `source_external_id`, `source_url`, `source_title`,
  `owner_channel_id`, `owner_channel_title`, `source_metadata_checked_at`,
  `import_mode`, `range_start_position`, `requested_item_count`, `status`,
  `actor_user_id`, `idempotency_key`, `last_error_code`, `next_retry_at`,
  `created_at`, `started_at`, `completed_at`, `updated_at`
)
SELECT
  `id`, `source_kind`, `source_external_id`, `source_url`, `source_title`,
  `owner_channel_id`, `owner_channel_title`, `updated_at`, `import_mode`,
  `range_start_position`, `requested_item_count`, `status`, `actor_user_id`,
  `idempotency_key`, `last_error_code`, `next_retry_at`, `created_at`,
  `started_at`, `completed_at`, `updated_at`
FROM `music_ingestion_jobs`;--> statement-breakpoint
DROP TABLE `music_ingestion_jobs`;--> statement-breakpoint
ALTER TABLE `__new_music_ingestion_jobs` RENAME TO `music_ingestion_jobs`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_ingestion_jobs_actor_idempotency` ON `music_ingestion_jobs` (`actor_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_jobs_source_updated_id` ON `music_ingestion_jobs` (`source_kind`,`source_external_id`,`updated_at` DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_jobs_status_retry_id` ON `music_ingestion_jobs` (`status`,`next_retry_at`,`id`);--> statement-breakpoint

CREATE TABLE `music_ingestion_candidate_origins` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`job_id` text NOT NULL,
	`origin_kind` text DEFAULT 'playlist_import' NOT NULL,
	`playlist_id` text NOT NULL,
	`playlist_item_id` text NOT NULL,
	`playlist_position` integer NOT NULL,
	`is_playlist_duplicate` integer DEFAULT false NOT NULL,
	`discovered_at` integer NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `music_ingestion_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `music_ingestion_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "music_ingestion_origins_required_check" CHECK("music_ingestion_candidate_origins"."origin_kind" = 'playlist_import'
        AND length(trim("music_ingestion_candidate_origins"."id")) > 0
        AND length(trim("music_ingestion_candidate_origins"."playlist_id")) > 0
        AND length(trim("music_ingestion_candidate_origins"."playlist_item_id")) > 0
        AND typeof("music_ingestion_candidate_origins"."playlist_position") = 'integer'
        AND "music_ingestion_candidate_origins"."playlist_position" >= 0
        AND typeof("music_ingestion_candidate_origins"."is_playlist_duplicate") = 'integer'
        AND "music_ingestion_candidate_origins"."is_playlist_duplicate" IN (0, 1)
        AND typeof("music_ingestion_candidate_origins"."discovered_at") = 'integer'
        AND "music_ingestion_candidate_origins"."discovered_at" >= 0)
);--> statement-breakpoint
INSERT INTO `music_ingestion_candidate_origins`
SELECT * FROM `__backup_music_ingestion_candidate_origins`;--> statement-breakpoint
DROP TABLE `__backup_music_ingestion_candidate_origins`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_ingestion_origins_job_item` ON `music_ingestion_candidate_origins` (`job_id`,`playlist_item_id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_origins_job_position_id` ON `music_ingestion_candidate_origins` (`job_id`,`playlist_position`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_origins_candidate_discovered_id` ON `music_ingestion_candidate_origins` (`candidate_id`,"discovered_at" DESC,`id`);--> statement-breakpoint

CREATE TABLE `music_ingestion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`candidate_id` text,
	`event_type` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `music_ingestion_jobs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`candidate_id`) REFERENCES `music_ingestion_candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_ingestion_events_required_check" CHECK(length(trim("music_ingestion_events"."id")) > 0
        AND ("music_ingestion_events"."job_id" IS NOT NULL OR "music_ingestion_events"."candidate_id" IS NOT NULL)
        AND length(trim("music_ingestion_events"."event_type")) > 0
        AND length(trim("music_ingestion_events"."actor_user_id")) > 0
        AND json_valid("music_ingestion_events"."detail_json") = 1
        AND json_type("music_ingestion_events"."detail_json") = 'object'
        AND typeof("music_ingestion_events"."created_at") = 'integer'
        AND "music_ingestion_events"."created_at" >= 0)
);--> statement-breakpoint
INSERT INTO `music_ingestion_events`
SELECT * FROM `__backup_music_ingestion_events`;--> statement-breakpoint
DROP TABLE `__backup_music_ingestion_events`;--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_events_job_created_id` ON `music_ingestion_events` (`job_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_ingestion_events_candidate_created_id` ON `music_ingestion_events` (`candidate_id`,`created_at`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
