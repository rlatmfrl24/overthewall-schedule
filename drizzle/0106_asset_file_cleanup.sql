CREATE TABLE `asset_file_cleanup` (
	`object_key` text PRIMARY KEY NOT NULL,
	`logical_key` text NOT NULL,
	`site_id` text NOT NULL,
	`resource` text NOT NULL,
	`object_version` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	`claimed_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "asset_cleanup_identity" CHECK("asset_file_cleanup"."site_id" IN ('otw','luvdia') AND length("asset_file_cleanup"."resource")>0 AND length("asset_file_cleanup"."object_version")>0 AND length("asset_file_cleanup"."hash")=64 AND "asset_file_cleanup"."size">=0 AND "asset_file_cleanup"."claimed_at">=0 AND ("asset_file_cleanup"."deleted_at" IS NULL OR "asset_file_cleanup"."deleted_at">="asset_file_cleanup"."claimed_at"))
);
--> statement-breakpoint
CREATE INDEX `idx_asset_file_cleanup_logical` ON `asset_file_cleanup` (`logical_key`);