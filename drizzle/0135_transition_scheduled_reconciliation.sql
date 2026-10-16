ALTER TABLE `scheduled_outbox` ADD `reconciled_at` integer;
--> statement-breakpoint
-- Generated scheduled admission guards.
CREATE TRIGGER maintenance_scheduled_admission BEFORE INSERT ON scheduled_job_runs WHEN EXISTS(SELECT 1 FROM content_transitions WHERE generation=(SELECT max(generation) FROM content_transitions) AND (maintenance_state<>'open' OR (local_site=target_site AND phase NOT IN ('target_owned','complete')))) BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END;
--> statement-breakpoint
CREATE TRIGGER maintenance_scheduled_retry BEFORE UPDATE OF status ON scheduled_job_runs WHEN NEW.status='queued' AND NEW.status IS NOT OLD.status AND EXISTS(SELECT 1 FROM content_transitions WHERE generation=(SELECT max(generation) FROM content_transitions) AND (maintenance_state<>'open' OR (local_site=target_site AND phase NOT IN ('target_owned','complete')))) BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END;
--> statement-breakpoint
CREATE TRIGGER maintenance_scheduled_job_items_claim BEFORE UPDATE OF lease_token ON scheduled_job_items WHEN NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND EXISTS(SELECT 1 FROM content_transitions WHERE generation=(SELECT max(generation) FROM content_transitions) AND (maintenance_state<>'open' OR (local_site=target_site AND phase NOT IN ('target_owned','complete')))) BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END;
--> statement-breakpoint
CREATE TRIGGER maintenance_scheduled_outbox_claim BEFORE UPDATE OF lease_token ON scheduled_outbox WHEN NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND EXISTS(SELECT 1 FROM content_transitions WHERE generation=(SELECT max(generation) FROM content_transitions) AND (maintenance_state<>'open' OR (local_site=target_site AND phase NOT IN ('target_owned','complete')))) BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END;
