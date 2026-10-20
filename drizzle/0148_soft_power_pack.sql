CREATE TABLE `music_admin_command_results` (
	`site_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`http_status` integer NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`site_id`, `actor_user_id`, `request_key`),
	CONSTRAINT "music_admin_command_result_site" CHECK("music_admin_command_results"."site_id" IN ('otw','luvdia')),
	CONSTRAINT "music_admin_command_result_identity" CHECK(length("music_admin_command_results"."request_key") BETWEEN 16 AND 100 AND length("music_admin_command_results"."actor_user_id")>0 AND length("music_admin_command_results"."request_hash")=64),
	CONSTRAINT "music_admin_command_result_response" CHECK("music_admin_command_results"."http_status" IN (200,201) AND json_valid("music_admin_command_results"."result_json") AND json_type("music_admin_command_results"."result_json")='object')
);
