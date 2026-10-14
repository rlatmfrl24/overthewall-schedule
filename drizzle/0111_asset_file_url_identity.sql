CREATE TABLE `asset_file_reference_paths` (
	`row_table` text NOT NULL,
	`row_key` text NOT NULL,
	`field` text NOT NULL,
	`raw_url` text NOT NULL,
	`origin` text,
	`path` text NOT NULL,
	PRIMARY KEY(`row_table`, `row_key`, `field`)
);
--> statement-breakpoint
CREATE INDEX `idx_asset_file_reference_path` ON `asset_file_reference_paths` (`path`,`origin`);--> statement-breakpoint
CREATE TABLE `asset_file_retention_releases` (
	`logical_key` text PRIMARY KEY NOT NULL,
	`released_at` integer DEFAULT 0 NOT NULL,
	`held` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "asset_retention_release_state" CHECK("asset_file_retention_releases"."logical_key" LIKE 'notices/thumbnails/%' AND "asset_file_retention_releases"."released_at">=0 AND "asset_file_retention_releases"."held" IN (0,1) AND ("asset_file_retention_releases"."held"=1 OR "asset_file_retention_releases"."released_at">0))
);
