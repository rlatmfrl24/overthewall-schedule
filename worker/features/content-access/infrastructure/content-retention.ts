// Retained archive evidence is read-only and grants no execution authority.
const retainedRows = {
  "notices": {
    "key": "id",
    "archived": true
  },
  "ddays": {
    "key": "id",
    "archived": true
  },
  "music_ai_reviews": {
    "key": "id",
    "archived": false
  },
  "music_ingestion_candidates": {
    "key": "id",
    "archived": true
  },
  "music_ingestion_jobs": {
    "key": "id",
    "archived": false
  },
  "youtube_feed_sources": {
    "key": "id",
    "archived": false
  },
  "youtube_feed_videos": {
    "key": "video_id",
    "archived": true
  },
  "x_api_cache": {
    "key": "key",
    "archived": false
  },
  "update_logs": {
    "key": "id",
    "archived": false
  },
  "members": {
    "key": "uid",
    "archived": true
  },
  "schedules": {
    "key": "id",
    "archived": true
  },
  "pending_schedules": {
    "key": "id",
    "archived": true
  },
  "schedule_candidate_rejections": {
    "key": "id",
    "archived": true
  },
  "schedule_broadcast_observations": {
    "key": "vod_id",
    "archived": true
  },
  "schedule_day_assessments": {
    "key": "member_uid",
    "archived": true
  }
} as const;
type RetainedTable = keyof typeof retainedRows;
const keySql = (table: RetainedTable, alias: string) => `json_array(${alias}."${retainedRows[table].key}")`;


/** Operational expiry only. Intentional removal/redaction keeps its owning write contract. */
export function contentRowHeldSql(table: RetainedTable, alias: string = table): string {
  const archived = retainedRows[table].archived
    ? `${alias}.content_access='admin_archive' OR ` : "";
  return `(${archived}EXISTS(SELECT 1 FROM content_transition_membership held
    JOIN content_transitions transition ON transition.id=held.transition_id
    WHERE transition.aborted_at IS NULL AND transition.local_site=transition.source_site AND transition.phase<>'prepared'
      AND held.row_table='${table}' AND held.row_key=${keySql(table, alias)}))`;
}

export function contentRowMovedSql(table: RetainedTable, alias: string = table): string {
  return `EXISTS(SELECT 1 FROM content_transition_membership held
    JOIN content_transitions transition ON transition.id=held.transition_id
    WHERE transition.aborted_at IS NULL AND transition.local_site=transition.source_site AND transition.phase IN ('source_fenced','target_owned','complete')
      AND held.row_table='${table}' AND held.row_key=${keySql(table, alias)})`;
}
