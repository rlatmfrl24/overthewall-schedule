CREATE TABLE `content_transition_chzzk_batches` (
	`transition_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`child_key` text NOT NULL,
	`batch_key` text NOT NULL,
	`command_json` text NOT NULL,
	`before_json` text NOT NULL,
	`result_json` text,
	PRIMARY KEY(`transition_id`, `operation_id`, `child_key`, `batch_key`),
	FOREIGN KEY (`transition_id`,`operation_id`,`child_key`) REFERENCES `content_transition_chzzk_children`(`transition_id`,`operation_id`,`child_key`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_chzzk_batch_json" CHECK(json_valid("content_transition_chzzk_batches"."command_json") AND json_valid("content_transition_chzzk_batches"."before_json") AND ("content_transition_chzzk_batches"."result_json" IS NULL OR json_valid("content_transition_chzzk_batches"."result_json")))
);
--> statement-breakpoint
ALTER TABLE `content_transition_chzzk_children` ADD `input_json` text;