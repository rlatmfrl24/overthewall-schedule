CREATE TABLE `content_transition_file_inventories` (
	`transition_id` text NOT NULL,
	`inventory_id` text NOT NULL,
	`plan_json` text NOT NULL,
	`manifest_revision` integer NOT NULL,
	`state` text DEFAULT 'armed' NOT NULL,
	`coverage_json` text,
	`source_boundary` integer,
	`expected_rows` integer,
	`expected_digest` text,
	`staged_rows` integer DEFAULT 0 NOT NULL,
	`staged_digest` text DEFAULT '0' NOT NULL,
	PRIMARY KEY(`transition_id`, `inventory_id`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_file_inventory_state" CHECK("content_transition_file_inventories"."state" IN ('armed','observed','sealed','receiving','received') AND json_valid("content_transition_file_inventories"."plan_json") AND "content_transition_file_inventories"."manifest_revision">=0 AND "content_transition_file_inventories"."staged_rows">=0)
);
--> statement-breakpoint
CREATE TABLE `content_transition_file_inventory_rows` (
	`transition_id` text NOT NULL,
	`inventory_id` text NOT NULL,
	`kind` text NOT NULL,
	`identity` text NOT NULL,
	`value_json` text NOT NULL,
	PRIMARY KEY(`transition_id`, `inventory_id`, `kind`, `identity`),
	FOREIGN KEY (`transition_id`,`inventory_id`) REFERENCES `content_transition_file_inventories`(`transition_id`,`inventory_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_file_inventory_row" CHECK("content_transition_file_inventory_rows"."kind" IN ('reference','object') AND json_valid("content_transition_file_inventory_rows"."value_json"))
);
