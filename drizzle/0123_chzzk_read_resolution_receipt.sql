ALTER TABLE `content_transition_chzzk_attempts` ADD `superseded_by_response_hash` text;--> statement-breakpoint
ALTER TABLE `content_transition_chzzk_attempts` ADD `resolved_at` integer;--> statement-breakpoint
ALTER TABLE `content_transition_chzzk_requests` ADD `disposition` text;--> statement-breakpoint
ALTER TABLE `content_transition_chzzk_requests` ADD `settled_outcome_digest` text;--> statement-breakpoint
ALTER TABLE `content_transition_chzzk_requests` ADD `settled_at` integer;