CREATE TABLE `content_transition_chzzk_attempts` (
	`transition_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`request_key` text NOT NULL,
	`attempt` integer NOT NULL,
	`claim` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`state` text DEFAULT 'started' NOT NULL,
	`response_hash` text,
	PRIMARY KEY(`transition_id`, `operation_id`, `request_key`, `attempt`),
	FOREIGN KEY (`transition_id`,`operation_id`,`request_key`) REFERENCES `content_transition_chzzk_requests`(`transition_id`,`operation_id`,`request_key`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_transition_chzzk_attempt_state" CHECK("content_transition_chzzk_attempts"."attempt">0 AND length("content_transition_chzzk_attempts"."claim")>0 AND "content_transition_chzzk_attempts"."started_at">=0 AND "content_transition_chzzk_attempts"."state" IN ('started','uncertain','response_committed','superseded','failed') AND ("content_transition_chzzk_attempts"."response_hash" IS NULL OR length("content_transition_chzzk_attempts"."response_hash")=64))
);
--> statement-breakpoint
CREATE TABLE `content_transition_chzzk_requests` (
	`transition_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`request_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`request_json` text NOT NULL,
	`response_hash` text,
	`response_json` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`claim` text,
	`retry_at` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`transition_id`, `operation_id`, `request_key`),
	FOREIGN KEY (`transition_id`,`operation_id`) REFERENCES `content_transition_operations`(`transition_id`,`operation_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_transition_chzzk_request_state" CHECK(length("content_transition_chzzk_requests"."request_hash")=64 AND json_valid("content_transition_chzzk_requests"."request_json") AND "content_transition_chzzk_requests"."attempt">=0 AND "content_transition_chzzk_requests"."retry_at">=0 AND ("content_transition_chzzk_requests"."response_hash" IS NULL)=("content_transition_chzzk_requests"."response_json" IS NULL) AND ("content_transition_chzzk_requests"."response_hash" IS NULL OR (length("content_transition_chzzk_requests"."response_hash")=64 AND json_valid("content_transition_chzzk_requests"."response_json"))))
);
