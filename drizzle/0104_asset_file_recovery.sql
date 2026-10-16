CREATE TABLE `asset_file_references` (
	`logical_key` text PRIMARY KEY NOT NULL,
	`version_key` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "asset_reference_bytes" CHECK(length("asset_file_references"."hash")=64 AND "asset_file_references"."size">=0 AND length("asset_file_references"."version_key")>0)
);
--> statement-breakpoint
CREATE TABLE `asset_file_versions` (
	`version_key` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`logical_key` text NOT NULL,
	`site_id` text NOT NULL,
	`generation` integer NOT NULL,
	`resource` text NOT NULL,
	`previous_version` text,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text NOT NULL,
	`transition_id` text,
	`transition_operation_id` text,
	`created_at` integer NOT NULL,
	`attempted_at` integer,
	`object_version` text,
	`verified_at` integer,
	`reference_committed_at` integer,
	`acknowledged_at` integer,
	`released_at` integer,
	CONSTRAINT "asset_file_identity" CHECK("asset_file_versions"."site_id" IN ('otw','luvdia') AND "asset_file_versions"."generation">0 AND length("asset_file_versions"."hash")=64 AND "asset_file_versions"."size">=0 AND length("asset_file_versions"."logical_key")>0 AND length("asset_file_versions"."operation_id")>0 AND length("asset_file_versions"."resource")>0),
	CONSTRAINT "asset_file_progress" CHECK(("asset_file_versions"."object_version" IS NULL)=("asset_file_versions"."verified_at" IS NULL) AND ("asset_file_versions"."reference_committed_at" IS NULL OR "asset_file_versions"."verified_at" IS NOT NULL) AND ("asset_file_versions"."acknowledged_at" IS NULL OR "asset_file_versions"."reference_committed_at" IS NOT NULL) AND ("asset_file_versions"."transition_id" IS NULL)=("asset_file_versions"."transition_operation_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_file_versions_operation_id_unique` ON `asset_file_versions` (`operation_id`);--> statement-breakpoint
CREATE INDEX `idx_asset_file_logical` ON `asset_file_versions` (`logical_key`);