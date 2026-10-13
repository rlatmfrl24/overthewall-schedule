PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_music_playlist_work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`candidate_id` text,
	`playlist_item_id` text NOT NULL,
	`playlist_position` integer,
	`disposition` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`error_message` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `music_playlist_work_batches`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "playlist_work_item_disposition" CHECK("__new_music_playlist_work_items"."disposition" IN ('pending','deferred','excluded','duplicate'))
);
--> statement-breakpoint
INSERT INTO `__new_music_playlist_work_items`("id", "batch_id", "candidate_id", "playlist_item_id", "playlist_position", "disposition", "reason", "error_message", "version", "created_at", "updated_at") SELECT i."id", i."batch_id", i."candidate_id", i."playlist_item_id", (SELECT o.playlist_position FROM music_ingestion_candidate_origins o WHERE o.id=i.id), i."disposition", i."reason", i."error_message", i."version", i."created_at", i."updated_at" FROM `music_playlist_work_items` i;--> statement-breakpoint
DROP TABLE `music_playlist_work_items`;--> statement-breakpoint
ALTER TABLE `__new_music_playlist_work_items` RENAME TO `music_playlist_work_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_playlist_work_batch_item` ON `music_playlist_work_items` (`batch_id`,`playlist_item_id`);--> statement-breakpoint
CREATE INDEX `idx_playlist_work_items_candidate` ON `music_playlist_work_items` (`candidate_id`,`disposition`);--> statement-breakpoint
CREATE INDEX `idx_playlist_work_items_deferred` ON `music_playlist_work_items` (`disposition`,`id`);--> statement-breakpoint
ALTER TABLE `music_playlist_work_batches` ADD `scan_generation` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `music_playlist_work_queues` ADD `scan_generation` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `music_playlist_work_queues` ADD `scan_item_count` integer;--> statement-breakpoint
ALTER TABLE `music_playlist_work_queues` ADD `scan_checked_at` integer;--> statement-breakpoint
ALTER TABLE `music_playlist_work_queues` ADD `progress_uncertain` integer DEFAULT 1 NOT NULL;
