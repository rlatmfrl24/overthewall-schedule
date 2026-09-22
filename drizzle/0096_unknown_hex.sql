CREATE TABLE `schedule_day_assessments` (
	`member_uid` integer NOT NULL,
	`date` text NOT NULL,
	`channel_id` text NOT NULL,
	`checked_at` integer NOT NULL,
	`range_start` integer NOT NULL,
	`range_end` integer NOT NULL,
	`scan_status` text NOT NULL,
	`broadcast_seen` integer DEFAULT 0 NOT NULL,
	`decision` text DEFAULT 'none' NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	`rejection_reason` text,
	PRIMARY KEY(`member_uid`, `date`),
	FOREIGN KEY (`member_uid`) REFERENCES `members`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_pending_holiday_member_date` ON `pending_schedules` (`member_uid`,`date`) WHERE "pending_schedules"."candidate_kind" = 'holiday_suggestion';