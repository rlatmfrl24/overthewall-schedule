CREATE TABLE `content_transition_chzzk_children` (
	`transition_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`child_key` text NOT NULL,
	`member_uid` integer NOT NULL,
	`member_code` text NOT NULL,
	`date` text NOT NULL,
	`result_json` text,
	`accounted_at` integer,
	PRIMARY KEY(`transition_id`, `operation_id`, `child_key`),
	FOREIGN KEY (`transition_id`,`operation_id`) REFERENCES `content_transition_chzzk_stages`(`transition_id`,`operation_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_chzzk_child_result" CHECK("content_transition_chzzk_children"."member_uid">0 AND length("content_transition_chzzk_children"."child_key")>0 AND length("content_transition_chzzk_children"."member_code")>0 AND ("content_transition_chzzk_children"."result_json" IS NULL OR json_valid("content_transition_chzzk_children"."result_json")) AND ("content_transition_chzzk_children"."accounted_at" IS NULL OR "content_transition_chzzk_children"."result_json" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `content_transition_chzzk_stages` (
	`transition_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`parent_json` text NOT NULL,
	`completion_json` text,
	`handover_acknowledged` integer DEFAULT false NOT NULL,
	`finalizer_json` text,
	PRIMARY KEY(`transition_id`, `operation_id`),
	FOREIGN KEY (`transition_id`,`operation_id`) REFERENCES `content_transition_operations`(`transition_id`,`operation_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_chzzk_stage_json" CHECK(json_valid("content_transition_chzzk_stages"."parent_json") AND ("content_transition_chzzk_stages"."completion_json" IS NULL OR json_valid("content_transition_chzzk_stages"."completion_json")) AND ("content_transition_chzzk_stages"."finalizer_json" IS NULL OR json_valid("content_transition_chzzk_stages"."finalizer_json")))
);
