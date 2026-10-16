CREATE TABLE `x_post_repair_work` (
	`post_id` text PRIMARY KEY NOT NULL,
	`facts_pending` integer DEFAULT 1 NOT NULL,
	`references_pending` integer DEFAULT 1 NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `x_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_x_post_repair_facts` ON `x_post_repair_work` (`checked_at`,`post_id`) WHERE "x_post_repair_work"."facts_pending"=1;--> statement-breakpoint
CREATE INDEX `idx_x_post_repair_references` ON `x_post_repair_work` (`checked_at`,`post_id`) WHERE "x_post_repair_work"."references_pending"=1;--> statement-breakpoint
CREATE TABLE `x_quote_body_work` (
	`source_post_id` text PRIMARY KEY NOT NULL,
	`due_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_post_id`) REFERENCES `x_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_x_quote_body_work_due` ON `x_quote_body_work` (`due_at`,`created_at`,`source_post_id`);