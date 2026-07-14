CREATE TABLE `chzzk_api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`stale_until` integer NOT NULL,
	`last_status` integer,
	`last_error` text,
	CONSTRAINT "chzzk_api_cache_type_check" CHECK(type IN ('vods', 'clips'))
);
