CREATE TABLE `music_channel_automation_approvals` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`operator_reference` text NOT NULL,
	`approval_reference` text NOT NULL,
	`revocation_procedure` text NOT NULL,
	`approved_by_user_id` text NOT NULL,
	`approved_at` integer NOT NULL,
	`revoked_by_user_id` text,
	`revoked_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `music_channels`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_channel_automation_approvals_required_check" CHECK("music_channel_automation_approvals"."scope" = 'candidate_collection'
        AND "music_channel_automation_approvals"."status" IN ('approved', 'revoked')
        AND length(trim("music_channel_automation_approvals"."operator_reference")) > 0
        AND length(trim("music_channel_automation_approvals"."approval_reference")) > 0
        AND length(trim("music_channel_automation_approvals"."revocation_procedure")) > 0
        AND length(trim("music_channel_automation_approvals"."approved_by_user_id")) > 0),
	CONSTRAINT "music_channel_automation_approvals_revocation_check" CHECK(("music_channel_automation_approvals"."status" = 'approved'
          AND "music_channel_automation_approvals"."revoked_by_user_id" IS NULL
          AND "music_channel_automation_approvals"."revoked_at" IS NULL)
        OR ("music_channel_automation_approvals"."status" = 'revoked'
          AND length(trim("music_channel_automation_approvals"."revoked_by_user_id")) > 0
          AND typeof("music_channel_automation_approvals"."revoked_at") = 'integer'
          AND "music_channel_automation_approvals"."revoked_at" >= "music_channel_automation_approvals"."approved_at")),
	CONSTRAINT "music_channel_automation_approvals_version_time_check" CHECK(typeof("music_channel_automation_approvals"."version") = 'integer' AND "music_channel_automation_approvals"."version" >= 0
        AND typeof("music_channel_automation_approvals"."approved_at") = 'integer' AND "music_channel_automation_approvals"."approved_at" >= 0
        AND typeof("music_channel_automation_approvals"."created_at") = 'integer' AND "music_channel_automation_approvals"."created_at" >= 0
        AND typeof("music_channel_automation_approvals"."updated_at") = 'integer' AND "music_channel_automation_approvals"."updated_at" >= "music_channel_automation_approvals"."created_at")
);
--> statement-breakpoint
CREATE INDEX `idx_music_channel_automation_approvals_status_channel` ON `music_channel_automation_approvals` (`status`,`channel_id`);--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_websub_deliveries_event` ON `music_channel_websub_deliveries` (`subscription_id`,`external_video_id`,`provider_updated_at`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_websub_deliveries_status_received` ON `music_channel_websub_deliveries` (`status`,`received_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_websub_deliveries_monitor_received` ON `music_channel_websub_deliveries` (`monitor_id`,"received_at" DESC,`id`);--> statement-breakpoint
CREATE TABLE `music_channel_websub_subscriptions` (
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
	CONSTRAINT "music_channel_websub_subscriptions_identity_check" CHECK(length(trim("music_channel_websub_subscriptions"."id")) > 0
        AND "music_channel_websub_subscriptions"."monitor_generation" >= 0
        AND length("music_channel_websub_subscriptions"."topic_url") = 80
        AND substr("music_channel_websub_subscriptions"."topic_url", 1, 56) = 'https://www.youtube.com/xml/feeds/videos.xml?channel_id='
        AND length("music_channel_websub_subscriptions"."callback_token_hash") = 64
        AND "music_channel_websub_subscriptions"."callback_token_hash" NOT GLOB '*[^a-f0-9]*'
        AND typeof("music_channel_websub_subscriptions"."secret_version") = 'integer'
        AND "music_channel_websub_subscriptions"."secret_version" >= 1),
	CONSTRAINT "music_channel_websub_subscriptions_status_check" CHECK("music_channel_websub_subscriptions"."status" IN ('pending', 'active', 'renewing', 'unsubscribing',
        'unsubscribed', 'denied', 'failed')
        AND ("music_channel_websub_subscriptions"."pending_mode" IS NULL
          OR "music_channel_websub_subscriptions"."pending_mode" IN ('subscribe', 'unsubscribe'))
        AND (("music_channel_websub_subscriptions"."status" IN ('pending', 'renewing') AND "music_channel_websub_subscriptions"."pending_mode" = 'subscribe')
          OR ("music_channel_websub_subscriptions"."status" = 'unsubscribing' AND "music_channel_websub_subscriptions"."pending_mode" = 'unsubscribe')
          OR ("music_channel_websub_subscriptions"."status" IN ('active', 'unsubscribed', 'denied', 'failed')
            AND "music_channel_websub_subscriptions"."pending_mode" IS NULL))),
	CONSTRAINT "music_channel_websub_subscriptions_time_check" CHECK(typeof("music_channel_websub_subscriptions"."version") = 'integer' AND "music_channel_websub_subscriptions"."version" >= 0
        AND typeof("music_channel_websub_subscriptions"."requested_at") = 'integer' AND "music_channel_websub_subscriptions"."requested_at" >= 0
        AND ("music_channel_websub_subscriptions"."verified_at" IS NULL
          OR (typeof("music_channel_websub_subscriptions"."verified_at") = 'integer' AND "music_channel_websub_subscriptions"."verified_at" >= 0))
        AND ("music_channel_websub_subscriptions"."lease_expires_at" IS NULL
          OR (typeof("music_channel_websub_subscriptions"."lease_expires_at") = 'integer'
            AND "music_channel_websub_subscriptions"."lease_expires_at" >= "music_channel_websub_subscriptions"."requested_at"))
        AND ("music_channel_websub_subscriptions"."last_notification_at" IS NULL
          OR (typeof("music_channel_websub_subscriptions"."last_notification_at") = 'integer'
            AND "music_channel_websub_subscriptions"."last_notification_at" >= 0))
        AND ("music_channel_websub_subscriptions"."last_error_code" IS NULL OR length(trim("music_channel_websub_subscriptions"."last_error_code")) > 0)
        AND typeof("music_channel_websub_subscriptions"."created_at") = 'integer' AND "music_channel_websub_subscriptions"."created_at" >= 0
        AND typeof("music_channel_websub_subscriptions"."updated_at") = 'integer' AND "music_channel_websub_subscriptions"."updated_at" >= "music_channel_websub_subscriptions"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_websub_subscriptions_monitor_generation` ON `music_channel_websub_subscriptions` (`monitor_id`,`monitor_generation`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_channel_websub_subscriptions_callback_hash` ON `music_channel_websub_subscriptions` (`callback_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_music_channel_websub_subscriptions_lease` ON `music_channel_websub_subscriptions` (`status`,`lease_expires_at`,`id`);--> statement-breakpoint
ALTER TABLE `music_channel_upload_monitors` ADD `last_recent_reconciled_at` integer;