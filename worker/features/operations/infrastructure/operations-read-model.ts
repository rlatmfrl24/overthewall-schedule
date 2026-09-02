export type SettingRow = {
  key: string;
  value: string | null;
};

export type AutoUpdateRunRow = {
  id: number;
  source: "scheduled" | "manual";
  status: "success" | "failed";
  started_at: number;
  finished_at: number;
  range_days: number;
  checked_count: number;
  segment_count: number;
  session_count: number;
  resume_merged_count: number;
  updated_count: number;
  created_count: number;
  existing_count: number;
  pending_created_count: number;
  rejected_suppressed_count: number;
  duplicate_pending_count: number;
  short_suppressed_count: number;
  holiday_suppressed_count: number;
  ambiguous_count: number;
  obsolete_pending_count: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_ip: string | null;
  error: string | null;
};

export type XCollectionRunRow = {
  id: number;
  source: string;
  started_at: number;
  finished_at: number | null;
  checked_handles: number;
  refreshed_handles: number;
  posts_returned: number;
  posts_stored: number;
  api_calls: number;
  estimated_cost_micros: number;
  status: "success" | "skipped" | "failed";
  error: string | null;
};

export type XUsageSummaryRow = {
  operation: string;
  endpoint: string;
  resource_count: number | string;
  estimated_cost_micros: number | string;
  status: number | string;
  created_at: number | string;
  detail: string | null;
};

export type NaverCafeSourceRow = {
  id: number;
  name: string;
  cafe_id: string;
  menu_id: string;
  cafe_url: string;
  member_uid: number | null;
  enabled: number | boolean | null;
  sort_order: number;
};

export type NaverCafeSourceCheckRow = {
  id: number;
  source_id: number;
  source_name: string;
  cafe_id: string;
  menu_id: string;
  trigger: "manual" | "scheduled";
  status:
    | "ok"
    | "stale"
    | "error"
    | "private"
    | "invalid_response"
    | "disabled";
  checked_at: number;
  duration_ms: number;
  post_count: number;
  error: string | null;
};

const getResults = <T>(result: D1Result<T>) => result.results ?? [];

export const readOperationsStatusRows = async (
  db: D1Database,
  since: number,
) => {
  const [
    settingsResult,
    autoRunsResult,
    xRunsResult,
    xUsageEventsResult,
    naverSourcesResult,
    naverChecksResult,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT key, value
         FROM settings
         WHERE key IN (
           'auto_update_enabled',
           'auto_update_interval_hours',
           'auto_update_last_run',
           'auto_update_range_days',
           'x_collection_enabled',
           'x_collection_daily_budget_cents',
           'x_collection_interval_hours',
           'x_collection_last_run',
           'x_posts_visibility',
           'naver_cafe_posts_enabled',
           'naver_cafe_posts_visibility',
           'naver_cafe_collection_last_run',
           'scheduled_v2_x_collection_enabled',
           'scheduled_v2_naver_cafe_collection_enabled',
           'scheduled_v2_youtube_feed_collection_enabled',
           'scheduled_v2_schedule_auto_update_enabled',
           'scheduled_v2_ingestion_recovery_enabled',
           'scheduled_v2_channel_reconcile_enabled',
           'scheduled_v2_recent_reconcile_enabled',
           'scheduled_v2_websub_maintenance_enabled',
           'scheduled_v2_source_health_enabled',
           'scheduled_v2_retention_prune_enabled'
         )`,
      )
      .all<SettingRow>(),
    db
      .prepare(
        `SELECT id, source, status, started_at, finished_at, range_days,
                checked_count, segment_count, session_count,
                resume_merged_count, updated_count, created_count, existing_count,
                pending_created_count, rejected_suppressed_count,
                duplicate_pending_count, short_suppressed_count,
                holiday_suppressed_count, ambiguous_count,
                obsolete_pending_count, actor_id, actor_name, actor_ip, error
         FROM auto_update_runs
         ORDER BY started_at DESC
         LIMIT 50`,
      )
      .all<AutoUpdateRunRow>(),
    db
      .prepare(
        `SELECT id, source, started_at, finished_at, checked_handles,
                refreshed_handles, posts_returned, posts_stored, api_calls,
                estimated_cost_micros, status, error
         FROM x_collection_runs
         ORDER BY started_at DESC
         LIMIT 50`,
      )
      .all<XCollectionRunRow>(),
    db
      .prepare(
        `SELECT operation, endpoint, resource_count, estimated_cost_micros,
                status, created_at, detail
         FROM x_api_usage_events
         WHERE created_at >= ?
         ORDER BY created_at DESC`,
      )
      .bind(since)
      .all<XUsageSummaryRow>(),
    db
      .prepare(
        `SELECT id, name, cafe_id, menu_id, cafe_url, member_uid, enabled, sort_order
         FROM naver_cafe_sources
         WHERE archived_at IS NULL
         ORDER BY sort_order, name`,
      )
      .all<NaverCafeSourceRow>(),
    db
      .prepare(
        `SELECT id, source_id, source_name, cafe_id, menu_id, trigger, status,
                checked_at, duration_ms, post_count, error
         FROM naver_cafe_source_checks
         ORDER BY checked_at DESC
         LIMIT 200`,
      )
      .all<NaverCafeSourceCheckRow>(),
  ]);

  return {
    settings: getResults(settingsResult),
    autoRuns: getResults(autoRunsResult),
    xRuns: getResults(xRunsResult),
    xUsageEvents: getResults(xUsageEventsResult),
    naverSources: getResults(naverSourcesResult),
    naverChecks: getResults(naverChecksResult),
  };
};
