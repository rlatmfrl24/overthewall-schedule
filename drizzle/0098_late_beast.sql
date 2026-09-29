CREATE TABLE `music_ai_review_batch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`candidate_version` integer NOT NULL,
	`candidate_kind` text NOT NULL,
	`title` text,
	`auto_apply` integer NOT NULL,
	`dispatch_until` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`review_id` text,
	`generation` integer DEFAULT 0 NOT NULL,
	`result_json` text,
	`error_message` text,
	`lease_token` text,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `music_ai_review_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_batch_item_status" CHECK("music_ai_review_batch_items"."status" IN ('queued','analyzing','saving','saved','needs_selection','failed','changed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_ai_batch_candidate` ON `music_ai_review_batch_items` (`batch_id`,`candidate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_ai_batch_active_candidate` ON `music_ai_review_batch_items` (`candidate_id`) WHERE "music_ai_review_batch_items"."status" IN ('queued','analyzing','saving');--> statement-breakpoint
CREATE INDEX `idx_ai_batch_draft` ON `music_ai_review_batch_items` (`candidate_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_batch_pending` ON `music_ai_review_batch_items` (`status`,`lease_until`);--> statement-breakpoint
CREATE TABLE `music_ai_review_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`request_key` text NOT NULL,
	`selection_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_ai_review_batches_request_key_unique` ON `music_ai_review_batches` (`request_key`);