CREATE TABLE `music_playlist_work_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`queue_id` text NOT NULL,
	`job_id` text NOT NULL,
	`ai_batch_id` text,
	`request_key` text NOT NULL,
	`actor` text NOT NULL,
	`status` text DEFAULT 'preparing' NOT NULL,
	`page_token` text,
	`next_page_token` text,
	`page_recorded` integer DEFAULT 0 NOT NULL,
	`completion_key` text,
	`start_next` integer DEFAULT 0 NOT NULL,
	`next_batch_id` text,
	`error_message` text,
	`version` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`dispatch_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`queue_id`) REFERENCES `music_playlist_work_queues`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "playlist_work_batch_status" CHECK("music_playlist_work_batches"."status" IN ('preparing','review','completing','completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_playlist_work_batches_job_id_unique` ON `music_playlist_work_batches` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `music_playlist_work_batches_request_key_unique` ON `music_playlist_work_batches` (`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_playlist_work_active_batch` ON `music_playlist_work_batches` ((1)) WHERE "music_playlist_work_batches"."status" != 'completed';--> statement-breakpoint
CREATE INDEX `idx_playlist_work_batches_queue` ON `music_playlist_work_batches` (`queue_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_playlist_work_batches_pending` ON `music_playlist_work_batches` (`status`,`dispatch_until`);--> statement-breakpoint
CREATE TABLE `music_playlist_work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`playlist_item_id` text NOT NULL,
	`disposition` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`error_message` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `music_playlist_work_batches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "playlist_work_item_disposition" CHECK("music_playlist_work_items"."disposition" IN ('pending','deferred','excluded','duplicate'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_playlist_work_batch_item` ON `music_playlist_work_items` (`batch_id`,`playlist_item_id`);--> statement-breakpoint
CREATE INDEX `idx_playlist_work_items_candidate` ON `music_playlist_work_items` (`candidate_id`,`disposition`);--> statement-breakpoint
CREATE INDEX `idx_playlist_work_items_deferred` ON `music_playlist_work_items` (`disposition`,`id`);--> statement-breakpoint
CREATE TABLE `music_playlist_work_queues` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`source_url` text NOT NULL,
	`title` text,
	`owner_channel_id` text,
	`owner_channel_title` text,
	`item_count` integer,
	`metadata_checked_at` integer,
	`page_token` text,
	`status` text DEFAULT 'checking' NOT NULL,
	`error_message` text,
	`actor` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`dispatch_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "playlist_work_queue_status" CHECK("music_playlist_work_queues"."status" IN ('checking','waiting','exhausted','failed','archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_playlist_work_queues_playlist_id_unique` ON `music_playlist_work_queues` (`playlist_id`);--> statement-breakpoint
CREATE INDEX `idx_playlist_work_queue_pending` ON `music_playlist_work_queues` (`status`,`dispatch_until`);