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
  updated_count: number;
  created_count: number;
  existing_count: number;
  pending_created_count: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_ip: string | null;
  error: string | null;
};

export type PendingScheduleStatusRow = {
  id: number;
  member_uid: number;
  date: string;
  title: string | null;
  action_type: string;
  existing_schedule_id: number | null;
  processed_reset_at: string | null;
  created_at: string | null;
};

export type PendingProcessedLogRow = {
  id: number;
  schedule_id: number | null;
  member_uid: number | null;
  schedule_date: string | null;
  action: string;
  title: string | null;
  previous_status: string | null;
  created_at: string | null;
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

const createSqlPlaceholders = (count: number) =>
  Array.from({ length: count }, () => "?").join(", ");

export const readPendingScheduleStatusRows = async (db: D1Database) =>
  getResults(
    await db
      .prepare(
        `SELECT id, member_uid, date, title, action_type,
                existing_schedule_id, processed_reset_at, created_at
         FROM pending_schedules`,
      )
      .all<PendingScheduleStatusRow>(),
  );

export const readPendingProcessedLogRows = async (
  db: D1Database,
  memberUids: readonly number[],
  dates: readonly string[],
) => {
  if (memberUids.length === 0 || dates.length === 0) return [];

  const memberPlaceholders = createSqlPlaceholders(memberUids.length);
  const datePlaceholders = createSqlPlaceholders(dates.length);
  return getResults(
    await db
      .prepare(
        `SELECT id, schedule_id, member_uid, schedule_date, action, title,
                previous_status, created_at
         FROM update_logs
         WHERE action IN ('approve', 'reject', 'reset_processed')
           AND member_uid IN (${memberPlaceholders})
           AND schedule_date IN (${datePlaceholders})
         ORDER BY created_at DESC, id DESC`,
      )
      .bind(...memberUids, ...dates)
      .all<PendingProcessedLogRow>(),
  );
};

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
           'naver_cafe_collection_last_run'
         )`,
      )
      .all<SettingRow>(),
    db
      .prepare(
        `SELECT id, source, status, started_at, finished_at, range_days,
                checked_count, updated_count, created_count, existing_count,
                pending_created_count, actor_id, actor_name, actor_ip, error
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
         ORDER BY sort_order, name`,
      )
      .all<NaverCafeSourceRow>(),
    db
      .prepare(
        `SELECT id, source_id, source_name, cafe_id, menu_id, trigger, status,
                checked_at, duration_ms, post_count, error
         FROM naver_cafe_source_checks
         ORDER BY checked_at DESC
         LIMIT 1000`,
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
