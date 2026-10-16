import { contentDispositionRegistry } from '../domain/disposition-registry';
import {adoptedAiHeldSql} from './ai-review-adoption';

export class TransitionMaintenanceError extends Error {
  readonly code='CONTENT_MAINTENANCE';
  constructor(){super('사이트 이전 점검 중입니다. 작업이 접수되지 않았습니다. 점검 후 다시 시도해 주세요.');}
}
export interface TransitionMaintenanceGate {
  id:string;
  generation:number;
  state:'draining'|'stopped'|'preparing';
  startedAt:number|null;
}
/** Uses this site's durable control, including direct Queue/Workflow entry.
 * Neither a disabled provider flag nor an empty Queue proves quiescence. */
export async function readTransitionMaintenance(db:D1Database):Promise<TransitionMaintenanceGate|null> {
  const row=await db.prepare(`SELECT id,generation,maintenance_state,maintenance_started_at,
    local_site=target_site target,phase FROM content_transitions
    ORDER BY generation DESC LIMIT 1`).first<{id:string;generation:number;maintenance_state:string;maintenance_started_at:number|null;target:number;phase:string}>();
  if(!row)return null;
  if(row.maintenance_state==='open'&&(!row.target||['target_owned','complete'].includes(row.phase)))return null;
  if(!['open','draining','stopped'].includes(row.maintenance_state)) throw new Error('Invalid durable maintenance state');
  return {id:row.id,generation:row.generation,state:row.target&&!['target_owned','complete'].includes(row.phase)?'preparing':row.maintenance_state as 'draining'|'stopped',startedAt:row.maintenance_started_at};
}
export async function assertTransitionAdmission(db:D1Database) {
  if(await readTransitionMaintenance(db)) throw new TransitionMaintenanceError();
}

export function isTransitionMaintenanceError(error:unknown):boolean {
  return error instanceof TransitionMaintenanceError || error instanceof Error &&
    (error.message.includes('content_transition_maintenance_stopped') ||
      error.message.includes('content_transition_maintenance_admission') ||
      'cause' in error && isTransitionMaintenanceError(error.cause));
}

// These are actual original execution fields, not elapsed-time or Queue-length
// guesses. An expired lease still blocks: expiry does not cancel its holder.
// Legacy pending ingestion has no issuance marker and therefore remains an
// explicit blocker until its original owning flow resolves it.
export const maintenanceBlockerQueries = {
  scheduledRuns:"SELECT 1 FROM scheduled_job_runs WHERE status IN ('queued','running')",
  scheduledItems:"SELECT 1 FROM scheduled_job_items WHERE status='running' OR lease_token IS NOT NULL OR lease_until IS NOT NULL OR (status='queued' AND EXISTS(SELECT 1 FROM scheduled_job_runs r WHERE r.id=run_id AND r.status IN ('queued','running')))",
  scheduledDispatch:"SELECT 1 FROM scheduled_outbox WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL OR (event_type='reconcile' AND reconciled_at IS NULL) OR (status IN ('pending','failed','dispatching') AND (event_type<>'reconcile' OR reconciled_at IS NULL) AND EXISTS(SELECT 1 FROM scheduled_job_runs r WHERE r.id=run_id AND r.status IN ('queued','running')))",
  aiReviews:`SELECT 1 FROM music_ai_reviews held WHERE (status='running' OR lease_token IS NOT NULL OR lease_until IS NOT NULL) AND NOT ${adoptedAiHeldSql('held.id')}`,
  aiBatchItems:"SELECT 1 FROM music_ai_review_batch_items WHERE status IN ('queued','analyzing','saving') OR lease_token IS NOT NULL OR lease_until IS NOT NULL",
  playlistQueues:"SELECT 1 FROM music_playlist_work_queues WHERE status='checking' OR lease_token IS NOT NULL OR lease_until IS NOT NULL",
  playlistBatches:"SELECT 1 FROM music_playlist_work_batches WHERE status IN ('preparing','completing') OR (status='completed' AND start_next=1 AND next_batch_id IS NULL) OR lease_token IS NOT NULL OR lease_until IS NOT NULL",
  channelMonitors:"SELECT 1 FROM music_channel_upload_monitors WHERE lease_until IS NOT NULL",
  xSources:"SELECT 1 FROM x_post_sources WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL",
  xReferences:"SELECT 1 FROM x_post_references WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL",
  youtubeBackfill:"SELECT 1 FROM youtube_feed_sources WHERE backfill_lease_until IS NOT NULL",
  ingestionIssuanceUnknown:"SELECT 1 FROM music_ingestion_messages WHERE status='pending'",
  fileEffects:"SELECT 1 FROM asset_file_versions WHERE attempted_at IS NOT NULL AND verified_at IS NULL AND released_at IS NULL",
  fileCleanup:"SELECT 1 FROM asset_file_cleanup WHERE deleted_at IS NULL",
} as const;
export const maintenanceBlockersSql = `json_object(${Object.entries(maintenanceBlockerQueries)
  .map(([key,sql])=>`'${key}',(SELECT count(*) FROM (${sql}))`).join(',')})`;
export const maintenanceQuiescentSql = Object.values(maintenanceBlockerQueries)
  .map(sql=>`NOT EXISTS(${sql})`).join(' AND ');

// Fixed reviewed schema inventory. Control/evidence is retained independently
// of business writes; asset bytes still require their existing version guard.
export const maintenanceBusinessTables=Object.keys(contentDispositionRegistry).filter(table=>
  table!=='content_transitions'&&!table.startsWith('content_transition_')&&table!=='asset_file_versions');
export function maintenanceGuardStatements():string[] {
  const stopped=maintenanceBusinessTables.flatMap(table=>(['INSERT','UPDATE','DELETE'] as const).map(action=>
    `CREATE TRIGGER maintenance_${table}_${action.toLowerCase()} BEFORE ${action} ON "${table}"
      WHEN EXISTS(SELECT 1 FROM content_transitions t WHERE t.generation=(SELECT max(generation) FROM content_transitions) AND t.maintenance_state='stopped'
        AND NOT EXISTS(SELECT 1 FROM content_transition_permits p WHERE p.transition_id=t.id
          AND ((p.mode='baseline' AND t.local_site=t.target_site AND t.phase IN ('prepared','target_ingress_ready','source_fenced'))
            OR (p.mode='archive' AND t.local_site=t.source_site AND t.phase='source_fenced'))))
      BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_stopped'); END`.replace(/\s+/g,' ')));
  const closed="EXISTS(SELECT 1 FROM content_transitions WHERE generation=(SELECT max(generation) FROM content_transitions) AND (maintenance_state<>'open' OR (local_site=target_site AND phase NOT IN ('target_owned','complete'))))";
  // Issuance and stop race in D1 before R2: either the original attempted row
  // blocks stop until verified, or the closed gate prevents the actual put.
  const fileAdmission=[
    `CREATE TRIGGER maintenance_file_admission BEFORE INSERT ON asset_file_versions WHEN ${closed} BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END`,
    `CREATE TRIGGER maintenance_file_issuance BEFORE UPDATE OF attempted_at ON asset_file_versions WHEN ${closed} BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END`,
    `CREATE TRIGGER maintenance_file_cleanup_admission BEFORE INSERT ON asset_file_cleanup WHEN ${closed} BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END`,
    `CREATE TRIGGER maintenance_ai_claim BEFORE UPDATE OF lease_token ON music_ai_reviews WHEN NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND ${closed} BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END`,
    `CREATE TRIGGER maintenance_scheduled_admission BEFORE INSERT ON scheduled_job_runs WHEN ${closed} BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END`,
    `CREATE TRIGGER maintenance_scheduled_retry BEFORE UPDATE OF status ON scheduled_job_runs WHEN NEW.status='queued' AND NEW.status IS NOT OLD.status AND ${closed} BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END`,
    ...['scheduled_job_items','scheduled_outbox'].map(table=>`CREATE TRIGGER maintenance_${table}_claim BEFORE UPDATE OF lease_token ON ${table} WHEN NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND ${closed} BEGIN SELECT RAISE(ABORT,'content_transition_maintenance_admission'); END`),
  ];
  return [...stopped,...fileAdmission];
}
