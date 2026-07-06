ALTER TABLE `notices` ADD `publisher_type` text DEFAULT 'otw' NOT NULL;--> statement-breakpoint
ALTER TABLE `notices` ADD `publisher_member_uid` integer;