-- Generated from the canonical schema; corrected before first apply to preserve D1 FK children.
CREATE TABLE `content_historical_links` (
	`source_site` text NOT NULL,
	`source_table` text NOT NULL,
	`source_key` text NOT NULL,
	`subject_table` text NOT NULL,
	`subject_key` text NOT NULL,
	PRIMARY KEY(`source_site`, `source_table`, `source_key`, `subject_table`, `subject_key`),
	FOREIGN KEY (`source_site`,`source_table`,`source_key`) REFERENCES `content_historical_records`(`source_site`,`source_table`,`source_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_content_historical_subject` ON `content_historical_links` (`subject_table`,`subject_key`);--> statement-breakpoint
CREATE TABLE `content_historical_records` (
	`source_site` text NOT NULL,
	`source_table` text NOT NULL,
	`source_key` text NOT NULL,
	`record_json` text NOT NULL,
	`protocol` integer NOT NULL,
	PRIMARY KEY(`source_site`, `source_table`, `source_key`),
	CONSTRAINT "content_historical_record" CHECK("content_historical_records"."source_site" IN ('otw','luvdia') AND "content_historical_records"."protocol"=1 AND json_valid("content_historical_records"."record_json") AND json_type("content_historical_records"."record_json")='object')
);
--> statement-breakpoint
CREATE TABLE `content_historical_relations` (
	`source_site` text NOT NULL,
	`from_table` text NOT NULL,
	`from_key` text NOT NULL,
	`to_table` text NOT NULL,
	`to_key` text NOT NULL,
	PRIMARY KEY(`source_site`, `from_table`, `from_key`, `to_table`, `to_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_content_history_relation_target` ON `content_historical_relations` (`source_site`,`to_table`,`to_key`);--> statement-breakpoint
CREATE TABLE `content_transition_baseline_rows` (
	`transition_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`row_table` text NOT NULL,
	`row_key` text NOT NULL,
	`row_digest` text NOT NULL,
	`record_json` text NOT NULL,
	`dependency_rank` integer NOT NULL,
	`installed` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`transition_id`, `ordinal`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transition_baselines`(`transition_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_baseline_record" CHECK("content_transition_baseline_rows"."ordinal">=0 AND json_valid("content_transition_baseline_rows"."record_json") AND json_type("content_transition_baseline_rows"."record_json")='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_baseline_row` ON `content_transition_baseline_rows` (`transition_id`,`row_table`,`row_key`);--> statement-breakpoint
CREATE INDEX `idx_content_baseline_pending` ON `content_transition_baseline_rows` (`transition_id`,`installed`,`dependency_rank`,`ordinal`);--> statement-breakpoint
CREATE TABLE `content_transition_baselines` (
	`transition_id` text PRIMARY KEY NOT NULL,
	`manifest_digest` text NOT NULL,
	`source_boundary` integer NOT NULL,
	`expected_rows` integer NOT NULL,
	`expected_digest` text NOT NULL,
	`staged_rows` integer DEFAULT 0 NOT NULL,
	`staged_digest` text DEFAULT '0' NOT NULL,
	`receipt_json` text,
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_baseline_counts" CHECK("content_transition_baselines"."expected_rows">=0 AND "content_transition_baselines"."staged_rows">=0 AND "content_transition_baselines"."staged_rows"<="content_transition_baselines"."expected_rows")
);
--> statement-breakpoint
CREATE TABLE `content_transition_commits` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transition_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`sealed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_transition_commit` ON `content_transition_commits` (`transition_id`,`operation_id`);--> statement-breakpoint
CREATE TABLE `content_transition_dirty_roots` (
	`transition_id` text NOT NULL,
	`root_table` text NOT NULL,
	`root_key` text NOT NULL,
	PRIMARY KEY(`transition_id`, `root_table`, `root_key`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `content_transition_dirty_rows` (
	`transition_id` text NOT NULL,
	`row_table` text NOT NULL,
	`row_key` text NOT NULL,
	`structural` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`transition_id`, `row_table`, `row_key`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `content_transition_evidence` (
	`transition_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`attempt_identity` text NOT NULL,
	`evidence_json` text NOT NULL,
	PRIMARY KEY(`transition_id`, `operation_id`, `evidence_id`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transition_id`,`operation_id`) REFERENCES `content_transition_operations`(`transition_id`,`operation_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "content_transition_evidence_json" CHECK(json_valid("content_transition_evidence"."evidence_json") AND json_type("content_transition_evidence"."evidence_json")='object')
);
--> statement-breakpoint
CREATE TABLE `content_transition_file_evidence` (
	`transition_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`observation_json` text NOT NULL,
	PRIMARY KEY(`transition_id`, `intent_id`, `evidence_id`),
	FOREIGN KEY (`transition_id`,`intent_id`) REFERENCES `content_transition_file_intents`(`transition_id`,`intent_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_file_evidence_json" CHECK(json_valid("content_transition_file_evidence"."observation_json") AND json_type("content_transition_file_evidence"."observation_json")='object')
);
--> statement-breakpoint
CREATE TABLE `content_transition_file_intents` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transition_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`generation` integer NOT NULL,
	`source_seq` integer,
	`version_key` text NOT NULL,
	`envelope_json` text NOT NULL,
	`outcome_json` text,
	`transferred` integer DEFAULT false NOT NULL,
	`outcome_acknowledged` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transition_id`,`operation_id`) REFERENCES `content_transition_operations`(`transition_id`,`operation_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "content_transition_file_envelope" CHECK(json_valid("content_transition_file_intents"."envelope_json") AND json_type("content_transition_file_intents"."envelope_json")='object' AND length("content_transition_file_intents"."intent_id")>0 AND length("content_transition_file_intents"."version_key")>0 AND "content_transition_file_intents"."generation">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_transition_file_intent` ON `content_transition_file_intents` (`transition_id`,`intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_transition_source_file` ON `content_transition_file_intents` (`transition_id`,`source_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_transition_file_version` ON `content_transition_file_intents` (`version_key`);--> statement-breakpoint
CREATE TABLE `content_transition_identity_proofs` (
	`transition_id` text NOT NULL,
	`member_uid` integer NOT NULL,
	`first_commit` integer NOT NULL,
	`target_entity_id` text NOT NULL,
	`source_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`protocol` integer NOT NULL,
	`manifest_digest` text NOT NULL,
	`manifest_revision` integer NOT NULL,
	`generation` integer NOT NULL,
	PRIMARY KEY(`transition_id`, `member_uid`, `source_name`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_identity_proof_shape" CHECK("content_transition_identity_proofs"."protocol"=1 AND "content_transition_identity_proofs"."first_commit">0 AND length("content_transition_identity_proofs"."target_entity_id")>0 AND length("content_transition_identity_proofs"."normalized_name")>0)
);
--> statement-breakpoint
CREATE TABLE `content_transition_images` (
	`transition_id` text NOT NULL,
	`row_table` text NOT NULL,
	`row_key` text NOT NULL,
	`image_json` text NOT NULL,
	`root_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`transition_id`, `row_table`, `row_key`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_transition_image_json" CHECK(json_valid("content_transition_images"."image_json") AND json_type("content_transition_images"."image_json")='object')
);
--> statement-breakpoint
CREATE INDEX `idx_content_transition_images_orphan` ON `content_transition_images` (`transition_id`,`root_count`);--> statement-breakpoint
CREATE TABLE `content_transition_journal` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transition_id` text NOT NULL,
	`commit_seq` integer NOT NULL,
	`row_table` text NOT NULL,
	`row_key` text NOT NULL,
	`before_json` text,
	`after_json` text,
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`commit_seq`) REFERENCES `content_transition_commits`(`seq`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_transition_journal_image" CHECK("content_transition_journal"."before_json" IS NOT NULL OR "content_transition_journal"."after_json" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `idx_content_transition_journal_commit` ON `content_transition_journal` (`transition_id`,`commit_seq`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_content_transition_journal_row` ON `content_transition_journal` (`transition_id`,`row_table`,`row_key`,`commit_seq`,`seq`);--> statement-breakpoint
CREATE TABLE `content_transition_manifest_revisions` (
	`transition_id` text NOT NULL,
	`revision` integer NOT NULL,
	`parent_digest` text NOT NULL,
	`manifest_digest` text NOT NULL,
	`receipt_json` text NOT NULL,
	PRIMARY KEY(`transition_id`, `revision`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_manifest_revision" CHECK("content_transition_manifest_revisions"."revision">0 AND json_valid("content_transition_manifest_revisions"."receipt_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_manifest_parent` ON `content_transition_manifest_revisions` (`transition_id`,`parent_digest`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_manifest_digest` ON `content_transition_manifest_revisions` (`transition_id`,`manifest_digest`);--> statement-breakpoint
CREATE TABLE `content_transition_materialized_rows` (
	`transition_id` text NOT NULL,
	`row_table` text NOT NULL,
	`row_key` text NOT NULL,
	PRIMARY KEY(`transition_id`, `row_table`, `row_key`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `content_transition_membership` (
	`transition_id` text NOT NULL,
	`root_table` text NOT NULL,
	`root_key` text NOT NULL,
	`row_table` text NOT NULL,
	`row_key` text NOT NULL,
	PRIMARY KEY(`transition_id`, `root_table`, `root_key`, `row_table`, `row_key`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_content_transition_membership_row` ON `content_transition_membership` (`transition_id`,`row_table`,`row_key`);--> statement-breakpoint
CREATE TABLE `content_transition_operations` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transition_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`source_seq` integer,
	`generation` integer NOT NULL,
	`admitted_at` integer NOT NULL,
	`envelope_json` text NOT NULL,
	`attempt_json` text,
	`outcome_json` text,
	`transferred` integer DEFAULT false NOT NULL,
	`outcome_acknowledged` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_transition_operation_envelope" CHECK(length("content_transition_operations"."operation_id")>0 AND length("content_transition_operations"."payload_hash")>0 AND length("content_transition_operations"."idempotency_key")>0 AND "content_transition_operations"."generation">0 AND json_valid("content_transition_operations"."envelope_json") AND json_type("content_transition_operations"."envelope_json")='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_transition_operation` ON `content_transition_operations` (`transition_id`,`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_transition_idempotency` ON `content_transition_operations` (`transition_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_transition_source_operation` ON `content_transition_operations` (`transition_id`,`source_seq`);--> statement-breakpoint
CREATE TABLE `content_transition_permits` (
	`id` integer PRIMARY KEY NOT NULL,
	`transition_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`generation` integer NOT NULL,
	`mode` text DEFAULT 'business' NOT NULL,
	`version_matches` integer DEFAULT 1 NOT NULL,
	`commit_seq` integer NOT NULL,
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`commit_seq`) REFERENCES `content_transition_commits`(`seq`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_transition_single_permit" CHECK("content_transition_permits"."id"=1 AND "content_transition_permits"."generation">0 AND "content_transition_permits"."mode" IN ('business','baseline','archive','identity')),
	CONSTRAINT "content_transition_version_conflict" CHECK("content_transition_permits"."version_matches"=1)
);
--> statement-breakpoint
CREATE TABLE `content_transition_replay` (
	`transition_id` text NOT NULL,
	`commit_seq` integer NOT NULL,
	`previous_commit` integer NOT NULL,
	`digest` text NOT NULL,
	`projected_json` text NOT NULL,
	PRIMARY KEY(`transition_id`, `commit_seq`),
	FOREIGN KEY (`transition_id`) REFERENCES `content_transitions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "content_transition_replay_json" CHECK(json_valid("content_transition_replay"."projected_json") AND json_type("content_transition_replay"."projected_json")='array' AND "content_transition_replay"."commit_seq">"content_transition_replay"."previous_commit")
);
--> statement-breakpoint
CREATE TABLE `content_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_site` text NOT NULL,
	`target_site` text NOT NULL,
	`source_resource` text NOT NULL,
	`target_resource` text NOT NULL,
	`local_site` text NOT NULL,
	`local_resource` text NOT NULL,
	`generation` integer NOT NULL,
	`protocol` integer NOT NULL,
	`manifest_digest` text NOT NULL,
	`manifest_revision` integer DEFAULT 0 NOT NULL,
	`plan_json` text NOT NULL,
	`phase` text DEFAULT 'prepared' NOT NULL,
	`protection_receipt_json` text,
	`readiness_json` text,
	`readiness_expires_at` integer,
	`fence_json` text,
	`installation_json` text,
	`archive_receipt_json` text,
	`checkpoint_revision` integer DEFAULT 0 NOT NULL,
	`checkpoints_json` text DEFAULT '[]' NOT NULL,
	CONSTRAINT "content_transition_sites" CHECK("content_transitions"."source_site" IN ('otw','luvdia') AND "content_transitions"."target_site" IN ('otw','luvdia') AND "content_transitions"."source_site" <> "content_transitions"."target_site"
    AND (("content_transitions"."local_site" = "content_transitions"."source_site" AND "content_transitions"."local_resource" = "content_transitions"."source_resource") OR ("content_transitions"."local_site" = "content_transitions"."target_site" AND "content_transitions"."local_resource" = "content_transitions"."target_resource"))
    AND length("content_transitions"."source_resource") > 0 AND length("content_transitions"."target_resource") > 0 AND "content_transitions"."source_resource" <> "content_transitions"."target_resource"),
	CONSTRAINT "content_transition_protocol" CHECK("content_transitions"."protocol" = 1 AND "content_transitions"."generation" >= 2 AND "content_transitions"."checkpoint_revision" >= 0),
	CONSTRAINT "content_transition_phase" CHECK("content_transitions"."phase" IN ('prepared','protected','copying','replaying','target_ingress_ready','source_fenced','target_owned','complete')),
	CONSTRAINT "content_transition_json" CHECK(json_valid("content_transitions"."plan_json") AND json_type("content_transitions"."plan_json")='object' AND json_valid("content_transitions"."checkpoints_json") AND json_type("content_transitions"."checkpoints_json")='array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_content_transition_active` ON `content_transitions` ((1)) WHERE "content_transitions"."phase" <> 'complete';--> statement-breakpoint
ALTER TABLE `ddays` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "ddays_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `members` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "members_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `music_ingestion_candidates` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "music_ingestion_candidates_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `music_performances` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "music_performances_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `naver_cafe_posts` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "naver_cafe_posts_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `notices` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "notices_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `pending_schedules` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "pending_schedules_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `schedule_broadcast_observations` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "schedule_broadcast_observations_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `schedule_candidate_rejections` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "schedule_candidate_rejections_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `schedule_day_assessments` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "schedule_day_assessments_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `schedules` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "schedules_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `x_post_facts` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "x_post_facts_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `x_posts` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "x_posts_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `youtube_feed_videos` ADD COLUMN `content_access` text DEFAULT 'normal' NOT NULL CONSTRAINT "youtube_feed_videos_content_access_check" CHECK(content_access IN ('normal', 'admin_archive'));
--> statement-breakpoint
ALTER TABLE `notices` ADD COLUMN `historical_related_people` text DEFAULT '[]' NOT NULL CONSTRAINT "notices_historical_people_check" CHECK(json_valid(historical_related_people) AND json_type(historical_related_people) = 'array');
--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE `__ct_backup_music_cover_proposal_participants` AS SELECT * FROM `music_cover_proposal_participants`;
--> statement-breakpoint
CREATE TABLE `__ct_backup_music_cover_proposal_original_artists` AS SELECT * FROM `music_cover_proposal_original_artists`;
--> statement-breakpoint
CREATE TABLE `__new_music_cover_proposals` (
	`content_access` text DEFAULT 'normal' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`submitted_by_user_id` text,
	`historical_source_site` text,
	`historical_source_record_id` text,
	`historical_review` integer DEFAULT false NOT NULL,
	`idempotency_key` text NOT NULL,
	`submitted_url` text NOT NULL,
	`youtube_video_id` text NOT NULL,
	`segment_start_seconds` integer DEFAULT 0 NOT NULL,
	`submission_kind` text DEFAULT 'official_cover' NOT NULL,
	`submitted_broadcast_json` text,
	`submitted_title` text NOT NULL,
	`submitted_tags_json` text DEFAULT '[]' NOT NULL,
	`suggested_song_id` text,
	`submitted_note` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`review_lock_token` text,
	`review_lock_expires_at` integer,
	`reviewed_by_user_id` text,
	`reviewed_at` integer,
	`review_result_code` text,
	`review_note` text,
	`approved_performance_id` text,
	`approved_performance_snapshot_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`suggested_song_id`) REFERENCES `music_songs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_performance_id`) REFERENCES `music_performances`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "music_cover_proposals_content_access_check" CHECK(content_access IN ('normal', 'admin_archive')),
	CONSTRAINT "music_cover_proposals_required_text_check" CHECK(length(trim("__new_music_cover_proposals"."id")) > 0
        AND length(trim("__new_music_cover_proposals"."idempotency_key")) > 0
        AND length(trim("__new_music_cover_proposals"."submitted_url")) > 0
        AND length(trim("__new_music_cover_proposals"."submitted_title")) > 0),
	CONSTRAINT "music_cover_proposals_video_id_check" CHECK(length("__new_music_cover_proposals"."youtube_video_id") = 11 AND "__new_music_cover_proposals"."youtube_video_id" NOT GLOB '*[^A-Za-z0-9_-]*'),
	CONSTRAINT "music_cover_proposals_segment_check" CHECK(typeof("__new_music_cover_proposals"."segment_start_seconds") = 'integer' AND "__new_music_cover_proposals"."segment_start_seconds" >= 0),
	CONSTRAINT "music_cover_proposals_tags_json_check" CHECK(CASE
        WHEN typeof("__new_music_cover_proposals"."submitted_tags_json") <> 'text' THEN 0
        WHEN json_valid("__new_music_cover_proposals"."submitted_tags_json") = 0 THEN 0
        ELSE json_type("__new_music_cover_proposals"."submitted_tags_json") = 'array'
      END),
	CONSTRAINT "music_cover_proposals_status_check" CHECK("__new_music_cover_proposals"."status" IN ('pending_review', 'approved', 'rejected', 'withdrawn')),
	CONSTRAINT "music_cover_proposals_version_check" CHECK(typeof("__new_music_cover_proposals"."version") = 'integer' AND "__new_music_cover_proposals"."version" >= 0),
	CONSTRAINT "music_cover_proposals_lock_pair_check" CHECK(("__new_music_cover_proposals"."review_lock_token" IS NULL AND "__new_music_cover_proposals"."review_lock_expires_at" IS NULL)
        OR ("__new_music_cover_proposals"."review_lock_token" IS NOT NULL
          AND length(trim("__new_music_cover_proposals"."review_lock_token")) > 0
          AND typeof("__new_music_cover_proposals"."review_lock_expires_at") = 'integer'
          AND "__new_music_cover_proposals"."review_lock_expires_at" >= 0)),
	CONSTRAINT "music_cover_proposals_provenance_check" CHECK(("__new_music_cover_proposals"."historical_source_site" IS NULL AND "__new_music_cover_proposals"."historical_source_record_id" IS NULL
          AND "__new_music_cover_proposals"."submitted_by_user_id" IS NOT NULL AND length(trim("__new_music_cover_proposals"."submitted_by_user_id")) > 0
          AND "__new_music_cover_proposals"."historical_review" = 0)
        OR ("__new_music_cover_proposals"."historical_source_site" IS NOT NULL AND "__new_music_cover_proposals"."historical_source_site" IN ('otw', 'luvdia')
          AND "__new_music_cover_proposals"."historical_source_record_id" IS NOT NULL AND length(trim("__new_music_cover_proposals"."historical_source_record_id")) > 0
          AND "__new_music_cover_proposals"."submitted_by_user_id" IS NULL AND "__new_music_cover_proposals"."historical_review" IN (0, 1))),
	CONSTRAINT "music_cover_proposals_review_pair_check" CHECK(("__new_music_cover_proposals"."historical_review" = 0 AND "__new_music_cover_proposals"."reviewed_by_user_id" IS NULL AND "__new_music_cover_proposals"."reviewed_at" IS NULL)
        OR ("__new_music_cover_proposals"."historical_review" = 0 AND "__new_music_cover_proposals"."reviewed_by_user_id" IS NOT NULL
          AND length(trim("__new_music_cover_proposals"."reviewed_by_user_id")) > 0
          AND typeof("__new_music_cover_proposals"."reviewed_at") = 'integer'
          AND "__new_music_cover_proposals"."reviewed_at" >= "__new_music_cover_proposals"."created_at")
        OR ("__new_music_cover_proposals"."historical_review" = 1 AND "__new_music_cover_proposals"."historical_source_site" IS NOT NULL
          AND "__new_music_cover_proposals"."reviewed_by_user_id" IS NULL AND "__new_music_cover_proposals"."status" IN ('approved', 'rejected')
          AND typeof("__new_music_cover_proposals"."reviewed_at") = 'integer' AND "__new_music_cover_proposals"."reviewed_at" >= "__new_music_cover_proposals"."created_at")),
	CONSTRAINT "music_cover_proposals_status_outcome_check" CHECK(("__new_music_cover_proposals"."status" = 'pending_review'
          AND "__new_music_cover_proposals"."reviewed_by_user_id" IS NULL
          AND "__new_music_cover_proposals"."reviewed_at" IS NULL
          AND "__new_music_cover_proposals"."review_result_code" IS NULL
          AND "__new_music_cover_proposals"."review_note" IS NULL
          AND "__new_music_cover_proposals"."approved_performance_id" IS NULL)
        OR ("__new_music_cover_proposals"."status" = 'approved'
          AND ("__new_music_cover_proposals"."reviewed_by_user_id" IS NOT NULL OR "__new_music_cover_proposals"."historical_review" = 1)
          AND "__new_music_cover_proposals"."reviewed_at" IS NOT NULL
          AND ("__new_music_cover_proposals"."approved_performance_id" IS NOT NULL
            OR "__new_music_cover_proposals"."approved_performance_snapshot_json" IS NOT NULL))
        OR ("__new_music_cover_proposals"."status" = 'rejected'
          AND ("__new_music_cover_proposals"."reviewed_by_user_id" IS NOT NULL OR "__new_music_cover_proposals"."historical_review" = 1)
          AND "__new_music_cover_proposals"."reviewed_at" IS NOT NULL
          AND "__new_music_cover_proposals"."approved_performance_id" IS NULL)
        OR ("__new_music_cover_proposals"."status" = 'withdrawn'
          AND "__new_music_cover_proposals"."reviewed_by_user_id" IS NULL
          AND "__new_music_cover_proposals"."reviewed_at" IS NULL
          AND "__new_music_cover_proposals"."review_result_code" IS NULL
          AND "__new_music_cover_proposals"."review_note" IS NULL
          AND "__new_music_cover_proposals"."approved_performance_id" IS NULL)),
	CONSTRAINT "music_cover_proposals_deleted_approval_check" CHECK("__new_music_cover_proposals"."approved_performance_snapshot_json" IS NULL OR CASE
        WHEN json_valid("__new_music_cover_proposals"."approved_performance_snapshot_json") = 0 THEN 0
        ELSE coalesce("__new_music_cover_proposals"."status" = 'approved'
          AND "__new_music_cover_proposals"."approved_performance_id" IS NULL
          AND json_type("__new_music_cover_proposals"."approved_performance_snapshot_json") = 'object'
          AND json_type("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.performanceId') = 'text'
          AND length(trim(json_extract("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.performanceId'))) > 0
          AND json_type("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.songId') = 'text'
          AND json_type("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.deletedAt') = 'integer'
          AND json_extract("__new_music_cover_proposals"."approved_performance_snapshot_json", '$.deletedAt') >= "__new_music_cover_proposals"."reviewed_at", 0)
        END),
	CONSTRAINT "music_cover_proposals_terminal_lock_check" CHECK("__new_music_cover_proposals"."status" = 'pending_review'
        OR ("__new_music_cover_proposals"."review_lock_token" IS NULL AND "__new_music_cover_proposals"."review_lock_expires_at" IS NULL)),
	CONSTRAINT "music_cover_proposals_optional_text_check" CHECK(("__new_music_cover_proposals"."submitted_note" IS NULL OR length(trim("__new_music_cover_proposals"."submitted_note")) > 0)
        AND ("__new_music_cover_proposals"."review_result_code" IS NULL OR length(trim("__new_music_cover_proposals"."review_result_code")) > 0)
        AND ("__new_music_cover_proposals"."review_note" IS NULL OR length(trim("__new_music_cover_proposals"."review_note")) > 0)),
	CONSTRAINT "music_cover_proposals_time_check" CHECK(typeof("__new_music_cover_proposals"."created_at") = 'integer' AND "__new_music_cover_proposals"."created_at" >= 0
        AND typeof("__new_music_cover_proposals"."updated_at") = 'integer' AND "__new_music_cover_proposals"."updated_at" >= "__new_music_cover_proposals"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_music_cover_proposals`("id", "submitted_by_user_id", "idempotency_key", "submitted_url", "youtube_video_id", "segment_start_seconds", "submission_kind", "submitted_broadcast_json", "submitted_title", "submitted_tags_json", "suggested_song_id", "submitted_note", "status", "version", "review_lock_token", "review_lock_expires_at", "reviewed_by_user_id", "reviewed_at", "review_result_code", "review_note", "approved_performance_id", "approved_performance_snapshot_json", "created_at", "updated_at") SELECT "id", "submitted_by_user_id", "idempotency_key", "submitted_url", "youtube_video_id", "segment_start_seconds", "submission_kind", "submitted_broadcast_json", "submitted_title", "submitted_tags_json", "suggested_song_id", "submitted_note", "status", "version", "review_lock_token", "review_lock_expires_at", "reviewed_by_user_id", "reviewed_at", "review_result_code", "review_note", "approved_performance_id", "approved_performance_snapshot_json", "created_at", "updated_at" FROM `music_cover_proposals`;--> statement-breakpoint
DROP TABLE `music_cover_proposals`;--> statement-breakpoint
ALTER TABLE `__new_music_cover_proposals` RENAME TO `music_cover_proposals`;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_submitter_idempotency` ON `music_cover_proposals` (`submitted_by_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_pending_video_segment` ON `music_cover_proposals` (`youtube_video_id`,`segment_start_seconds`) WHERE "music_cover_proposals"."status" = 'pending_review';--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_approved_performance` ON `music_cover_proposals` (`approved_performance_id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_status_created_id` ON `music_cover_proposals` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_submitter_created_id` ON `music_cover_proposals` (`submitted_by_user_id`,"created_at" DESC,`id`);--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_reviewer_reviewed_id` ON `music_cover_proposals` (`reviewed_by_user_id`,"reviewed_at" DESC,`id`) WHERE "music_cover_proposals"."reviewed_by_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_music_cover_proposals_suggested_song_id` ON `music_cover_proposals` (`suggested_song_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_music_cover_proposals_historical_origin` ON `music_cover_proposals` (`historical_source_site`,`historical_source_record_id`);--> statement-breakpoint
INSERT INTO `music_cover_proposal_participants` SELECT * FROM `__ct_backup_music_cover_proposal_participants`;
--> statement-breakpoint
DROP TABLE `__ct_backup_music_cover_proposal_participants`;
--> statement-breakpoint
INSERT INTO `music_cover_proposal_original_artists` SELECT * FROM `__ct_backup_music_cover_proposal_original_artists`;
--> statement-breakpoint
DROP TABLE `__ct_backup_music_cover_proposal_original_artists`;
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
