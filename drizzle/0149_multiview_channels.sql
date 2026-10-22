CREATE TABLE `multiview_channels` (
	`owner_user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text NOT NULL,
	`channel_image_url` text,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`owner_user_id`, `channel_id`),
	CONSTRAINT "multiview_channel_identity" CHECK(length(trim("multiview_channels"."owner_user_id"))>0 AND length("multiview_channels"."channel_id")=32 AND "multiview_channels"."channel_id" NOT GLOB '*[^0-9a-f]*' AND length(trim("multiview_channels"."channel_name"))>0)
);
--> statement-breakpoint
CREATE INDEX `idx_multiview_channels_owner_added` ON `multiview_channels` (`owner_user_id`,`added_at`,`channel_id`);