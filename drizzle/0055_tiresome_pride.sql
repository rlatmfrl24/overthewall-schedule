ALTER TABLE `music_cover_proposal_original_artists` ADD `submitted_member_uid` integer REFERENCES members(uid);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposal_original_artists_member_proposal` ON `music_cover_proposal_original_artists` (`submitted_member_uid`,`proposal_id`);--> statement-breakpoint
ALTER TABLE `music_cover_proposal_participants` ADD `submitted_member_uid` integer REFERENCES members(uid);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposal_participants_member_proposal` ON `music_cover_proposal_participants` (`submitted_member_uid`,`proposal_id`);