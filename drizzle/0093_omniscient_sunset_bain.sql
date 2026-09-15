ALTER TABLE `music_cover_proposals` ADD `submission_kind` text DEFAULT 'official_cover' NOT NULL;--> statement-breakpoint
ALTER TABLE `music_cover_proposals` ADD `submitted_broadcast_json` text;