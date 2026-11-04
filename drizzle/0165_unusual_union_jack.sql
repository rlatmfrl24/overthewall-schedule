ALTER TABLE `x_fx_sources` ADD `window_until_at` integer;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `pages_completed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `last_window_until_at` integer;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `last_window_limited` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `x_fx_sources` ADD `retired_progress` text;