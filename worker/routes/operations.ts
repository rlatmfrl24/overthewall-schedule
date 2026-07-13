import { asc, eq } from "drizzle-orm";
import { naverCafeSources } from "../../src/db/schema";
import {
  normalizeAutoUpdateIntervalHours,
  normalizeXCollectionIntervalHours,
  parseAutoUpdateIntervalHours,
  parseXCollectionIntervalHours,
} from "../../src/lib/auto-update-interval";
import { requireAdminUser } from "../auth";
import { getDb } from "../db";
import {
  badRequest,
  getActorInfo,
  insertAdminAuditLog,
  json,
  methodNotAllowed,
} from "../utils/helpers";
import {
  collectNaverCafePostsForSources,
} from "../services/naver-cafe";
import {
  getDataRetentionStatus,
  runDataRetentionPrune,
} from "../services/data-retention";
import type { Env } from "../types";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "Authorization",
};
const MEMBER_POSTS_PUBLIC_PATH = "/feed";
const MEMBER_POSTS_MONITOR_PATH = "/admin/member-posts";
const NaverCafeCheckSize = 5;
const NaverCafeStaleThresholdMs = 24 * 60 * 60_000;
const NaverCafeCollectionIntervalHours = 1;

type StatusLevel = "ok" | "warning" | "critical";
type FeedVisibility = "public" | "members" | "private";
type Issue = {
  severity: Exclude<StatusLevel, "ok">;
  code: string;
  message: string;
};

type SettingRow = {
  key: string;
  value: string | null;
};

type AutoUpdateRunRow = {
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

type PendingSummaryRow = {
  total: number;
  create_count: number;
  update_count: number;
};

type PendingScheduleStatusRow = {
  id: number;
  member_uid: number;
  date: string;
  title: string | null;
  action_type: string;
  existing_schedule_id: number | null;
  processed_reset_at: string | null;
  created_at: string | null;
};

type PendingProcessedLogRow = {
  id: number;
  schedule_id: number | null;
  member_uid: number | null;
  schedule_date: string | null;
  action: string;
  title: string | null;
  previous_status: string | null;
  created_at: string | null;
};

type XCollectionRunRow = {
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

type XUsageSummaryRow = {
  operation: string;
  endpoint: string;
  resource_count: number | string;
  estimated_cost_micros: number | string;
  status: number | string;
  created_at: number | string;
  detail: string | null;
};

type XUsageAggregate = {
  apiCalls: number;
  estimatedCostMicros: number;
  resourceCount: number;
  successCount: number;
  failureCount: number;
  rateLimitCount: number;
};

type XDailyUsageSummary = XUsageAggregate & {
  day: string;
};

type XOperationUsageSummary = Omit<XUsageAggregate, "successCount"> & {
  operation: string;
};

type XForceRefreshPathSummary = {
  path: string;
  label: string;
  apiCalls: number;
  estimatedCostMicros: number;
  rateLimitCount: number;
  failureCount: number;
  runCount: number;
  latestAt: number | null;
};

type NaverCafeSourceRow = {
  id: number;
  name: string;
  cafe_id: string;
  menu_id: string;
  cafe_url: string;
  member_uid: number | null;
  enabled: number | boolean | null;
  sort_order: number;
};

type NaverCafeSourceCheckRow = {
  id: number;
  source_id: number;
  source_name: string;
  cafe_id: string;
  menu_id: string;
  trigger: "manual" | "scheduled";
  status: "ok" | "stale" | "error" | "private" | "invalid_response" | "disabled";
  checked_at: number;
  duration_ms: number;
  post_count: number;
  error: string | null;
};

const getResults = <T>(result: D1Result<T>) => result.results ?? [];

const parseWindowHours = (value: string | null) => {
  if (value === null || value.trim() === "") return 24;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 168
    ? parsed
    : null;
};

const parseDryRun = (value: string | null) => {
  if (value === null || value.trim() === "") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return null;
};

const normalizeFeedVisibility = (
  value: string | null | undefined,
): FeedVisibility =>
  value === "public" || value === "private" ? value : "members";

const toNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number.isFinite(Number(value))
        ? Number(value)
        : fallback
      : fallback;

const getSettingMap = (rows: SettingRow[]) =>
  new Map(rows.map((row) => [row.key, row.value]));

const getLatestSuccessAt = <T extends { status: string; finished_at: number | null }>(
  rows: T[],
) => rows.find((row) => row.status === "success")?.finished_at ?? null;

const normalizeComparableText = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

const normalizePendingProcessedResetAt = (value: unknown) =>
  typeof value === "string" &&
  !["processed_reset_at", "null", "undefined", ""].includes(value)
    ? value
    : null;

const parseTimestampMs = (value: string | number | null | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const sqliteUtcMatch = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
  const normalized = sqliteUtcMatch ? `${value.replace(" ", "T")}Z` : value;
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const compareTimestamps = (
  left: string | number | null | undefined,
  right: string | number | null | undefined,
) => {
  const leftTime = parseTimestampMs(left);
  const rightTime = parseTimestampMs(right);
  if (leftTime !== null && rightTime !== null) {
    return leftTime - rightTime;
  }
  return String(left ?? "").localeCompare(String(right ?? ""));
};

const isLogAfterReset = (logCreatedAt: string | null, resetAt: string | null) => {
  if (!resetAt) return true;
  if (!logCreatedAt) return false;
  return compareTimestamps(logCreatedAt, resetAt) > 0;
};

const getLaterTimestamp = (
  left: string | null,
  right: string | null | undefined,
) => {
  if (!left) return right ?? null;
  if (!right) return left;
  return compareTimestamps(left, right) >= 0 ? left : right;
};

const getProcessedDecision = (action: string) =>
  action === "approve" || action === "reject" ? action : null;

const getPendingScheduleKey = (memberUid: number, date: string) =>
  `${memberUid}:${date}`;

const createSqlPlaceholders = (count: number) =>
  Array.from({ length: count }, () => "?").join(", ");

const isMatchingProcessedLogTitleFallback = (
  item: PendingScheduleStatusRow,
  log: PendingProcessedLogRow,
) => {
  if (
    normalizeComparableText(log.title) === "" ||
    normalizeComparableText(log.title) !== normalizeComparableText(item.title)
  ) {
    return false;
  }

  const logTime = parseTimestampMs(log.created_at);
  const pendingTime = parseTimestampMs(item.created_at);
  return logTime !== null && pendingTime !== null && logTime >= pendingTime;
};

const isMatchingProcessedLog = (
  item: PendingScheduleStatusRow,
  log: PendingProcessedLogRow,
) => {
  if (log.previous_status === `pending:${item.id}`) {
    return true;
  }
  if (item.existing_schedule_id && log.schedule_id === item.existing_schedule_id) {
    return true;
  }
  return isMatchingProcessedLogTitleFallback(item, log);
};

const isProcessedPending = (
  item: PendingScheduleStatusRow,
  logs: PendingProcessedLogRow[],
) => {
  const columnProcessedResetAt = normalizePendingProcessedResetAt(
    item.processed_reset_at,
  );
  const latestResetLogAt =
    logs.find(
      (log) =>
        log.action === "reset_processed" && isMatchingProcessedLog(item, log),
    )?.created_at ?? null;
  const processedResetAt = getLaterTimestamp(
    columnProcessedResetAt,
    latestResetLogAt,
  );

  return logs.some((log) => {
    if (!getProcessedDecision(log.action)) return false;
    if (!isLogAfterReset(log.created_at, processedResetAt)) return false;
    return isMatchingProcessedLog(item, log);
  });
};

const getVisiblePendingSummary = async (
  db: D1Database,
): Promise<PendingSummaryRow> => {
  const pendingRows = getResults(
    await db
      .prepare(
        `SELECT id, member_uid, date, title, action_type,
                existing_schedule_id, processed_reset_at, created_at
         FROM pending_schedules`,
      )
      .all<PendingScheduleStatusRow>(),
  );

  if (pendingRows.length === 0) {
    return { total: 0, create_count: 0, update_count: 0 };
  }

  const memberUids = [...new Set(pendingRows.map((row) => row.member_uid))];
  const dates = [...new Set(pendingRows.map((row) => row.date))];
  const memberPlaceholders = createSqlPlaceholders(memberUids.length);
  const datePlaceholders = createSqlPlaceholders(dates.length);
  const processedLogs = getResults(
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
  const logsByMemberDate = new Map<string, PendingProcessedLogRow[]>();

  for (const log of processedLogs) {
    if (log.member_uid === null || !log.schedule_date) continue;
    const key = getPendingScheduleKey(log.member_uid, log.schedule_date);
    const existing = logsByMemberDate.get(key) ?? [];
    existing.push(log);
    logsByMemberDate.set(key, existing);
  }

  const visibleRows = pendingRows.filter((row) => {
    const logs =
      logsByMemberDate.get(getPendingScheduleKey(row.member_uid, row.date)) ??
      [];
    return !isProcessedPending(row, logs);
  });

  return {
    total: visibleRows.length,
    create_count: visibleRows.filter((row) => row.action_type === "create")
      .length,
    update_count: visibleRows.filter((row) => row.action_type === "update")
      .length,
  };
};

const getNextEligibleAt = (
  enabled: boolean,
  lastRun: number | null,
  intervalHours: number,
  now: number,
) => {
  if (!enabled) return null;
  if (!lastRun) return now;
  return lastRun + intervalHours * 60 * 60_000;
};

const addStaleIssue = (
  issues: Issue[],
  code: string,
  message: string,
  lastSuccessAt: number | null,
  thresholdMs: number,
  now: number,
) => {
  if (!lastSuccessAt) {
    issues.push({ severity: "warning", code, message });
    return;
  }
  if (now - lastSuccessAt > thresholdMs) {
    issues.push({ severity: "warning", code, message });
  }
};

const serializeAutoRun = (row: AutoUpdateRunRow) => ({
  id: row.id,
  source: row.source,
  status: row.status,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  rangeDays: row.range_days,
  checkedCount: row.checked_count,
  updatedCount: row.updated_count,
  createdCount: row.created_count,
  existingCount: row.existing_count,
  pendingCreatedCount: row.pending_created_count,
  actorId: row.actor_id,
  actorName: row.actor_name,
  error: row.error,
});

const serializeXRun = (row: XCollectionRunRow) => ({
  id: row.id,
  source: row.source,
  status: row.status,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  checkedHandles: row.checked_handles,
  refreshedHandles: row.refreshed_handles,
  postsReturned: row.posts_returned,
  postsStored: row.posts_stored,
  apiCalls: row.api_calls,
  estimatedCostMicros: row.estimated_cost_micros,
  error: row.error,
});

const createEmptyXUsageAggregate = (): XUsageAggregate => ({
  apiCalls: 0,
  estimatedCostMicros: 0,
  resourceCount: 0,
  successCount: 0,
  failureCount: 0,
  rateLimitCount: 0,
});

const getUtcDay = (timestamp: number) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? "unknown"
    : date.toISOString().slice(0, 10);
};

const parseXUsageDetail = (detail: string | null) => {
  if (!detail) return {};
  try {
    const parsed = JSON.parse(detail) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const getStringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const getForceRefreshLabel = (path: string) => {
  if (path === "collection:scheduled") return "스케줄 수집";
  if (path === "collection:manual") return "수동 수집";
  if (path === "member-posts:admin") return "관리자 피드 강제 새로고침";
  if (path === "member-posts") return "게시글 피드";
  return path;
};

const addUsageToAggregate = (
  aggregate: XUsageAggregate,
  row: XUsageSummaryRow,
) => {
  const status = toNumber(row.status);
  aggregate.apiCalls += 1;
  aggregate.estimatedCostMicros += toNumber(row.estimated_cost_micros);
  aggregate.resourceCount += toNumber(row.resource_count);
  if (status >= 200 && status < 300) {
    aggregate.successCount += 1;
  } else {
    aggregate.failureCount += 1;
  }
  if (status === 429) {
    aggregate.rateLimitCount += 1;
  }
};

const upsertForceRefreshPath = (
  map: Map<string, XForceRefreshPathSummary>,
  path: string,
) => {
  const existing = map.get(path);
  if (existing) return existing;
  const created: XForceRefreshPathSummary = {
    path,
    label: getForceRefreshLabel(path),
    apiCalls: 0,
    estimatedCostMicros: 0,
    rateLimitCount: 0,
    failureCount: 0,
    runCount: 0,
    latestAt: null,
  };
  map.set(path, created);
  return created;
};

const buildXUsageStatus = (
  rows: XUsageSummaryRow[],
  runs: XCollectionRunRow[],
  since: number,
  now: number,
  dailyBudgetCents: number,
) => {
  const summary = createEmptyXUsageAggregate();
  const daily = new Map<string, XDailyUsageSummary>();
  const byOperation = new Map<string, XOperationUsageSummary>();
  const forceRefreshPaths = new Map<string, XForceRefreshPathSummary>();

  for (const row of rows) {
    const createdAt = toNumber(row.created_at);
    const status = toNumber(row.status);
    addUsageToAggregate(summary, row);

    const day = getUtcDay(createdAt);
    const daySummary = daily.get(day) ?? {
      day,
      ...createEmptyXUsageAggregate(),
    };
    addUsageToAggregate(daySummary, row);
    daily.set(day, daySummary);

    const operation = row.operation || "unknown";
    const operationSummary = byOperation.get(operation) ?? {
      operation,
      apiCalls: 0,
      estimatedCostMicros: 0,
      resourceCount: 0,
      failureCount: 0,
      rateLimitCount: 0,
    };
    operationSummary.apiCalls += 1;
    operationSummary.estimatedCostMicros += toNumber(row.estimated_cost_micros);
    operationSummary.resourceCount += toNumber(row.resource_count);
    if (status < 200 || status >= 300) operationSummary.failureCount += 1;
    if (status === 429) operationSummary.rateLimitCount += 1;
    byOperation.set(operation, operationSummary);

    const detail = parseXUsageDetail(row.detail);
    const forceRefreshPath = getStringValue(detail.forceRefreshPath);
    if (forceRefreshPath && !forceRefreshPath.startsWith("collection:")) {
      const pathSummary = upsertForceRefreshPath(
        forceRefreshPaths,
        forceRefreshPath,
      );
      pathSummary.apiCalls += 1;
      pathSummary.estimatedCostMicros += toNumber(row.estimated_cost_micros);
      if (status === 429) pathSummary.rateLimitCount += 1;
      if (status < 200 || status >= 300) pathSummary.failureCount += 1;
      pathSummary.latestAt = Math.max(pathSummary.latestAt ?? 0, createdAt);
    }
  }

  for (const run of runs) {
    const startedAt = toNumber(run.started_at);
    if (startedAt < since || toNumber(run.api_calls) <= 0) continue;
    const pathSummary = upsertForceRefreshPath(
      forceRefreshPaths,
      `collection:${run.source || "unknown"}`,
    );
    pathSummary.runCount += 1;
    pathSummary.apiCalls += toNumber(run.api_calls);
    pathSummary.estimatedCostMicros += toNumber(run.estimated_cost_micros);
    if (run.status === "failed") pathSummary.failureCount += 1;
    if (/rate.?limit|429/i.test(run.error ?? "")) {
      pathSummary.rateLimitCount += 1;
    }
    pathSummary.latestAt = Math.max(pathSummary.latestAt ?? 0, startedAt);
  }

  const todayDay = getUtcDay(now);
  const today = daily.get(todayDay) ?? {
    day: todayDay,
    ...createEmptyXUsageAggregate(),
  };
  const dailyBudgetMicros = Math.max(0, dailyBudgetCents) * 10_000;
  const todayRemainingMicros =
    dailyBudgetMicros > 0
      ? Math.max(0, dailyBudgetMicros - today.estimatedCostMicros)
      : 0;
  const todayBudgetUsedPercent =
    dailyBudgetMicros > 0
      ? Math.round((today.estimatedCostMicros / dailyBudgetMicros) * 100)
      : 0;

  return {
    ...summary,
    quota: {
      dailyBudgetMicros,
      todayUsedMicros: today.estimatedCostMicros,
      todayRemainingMicros,
      todayBudgetUsedPercent,
    },
    daily: Array.from(daily.values()).sort((a, b) =>
      b.day.localeCompare(a.day),
    ),
    byOperation: Array.from(byOperation.values()).sort(
      (a, b) => b.apiCalls - a.apiCalls,
    ),
    forceRefreshPaths: Array.from(forceRefreshPaths.values()).sort(
      (a, b) => (b.latestAt ?? 0) - (a.latestAt ?? 0),
    ),
  };
};

const isEnabledSource = (source: NaverCafeSourceRow) =>
  source.enabled !== false && source.enabled !== 0;

const buildNaverCafeStatus = (
  sources: NaverCafeSourceRow[],
  checks: NaverCafeSourceCheckRow[],
  now: number,
  postsEnabled: boolean,
) => {
  const latestCheckBySource = new Map<number, NaverCafeSourceCheckRow>();
  const latestSuccessBySource = new Map<number, NaverCafeSourceCheckRow>();
  for (const check of checks) {
    if (!latestCheckBySource.has(check.source_id)) {
      latestCheckBySource.set(check.source_id, check);
    }
    if (
      !latestSuccessBySource.has(check.source_id) &&
      (check.status === "ok" || check.status === "stale")
    ) {
      latestSuccessBySource.set(check.source_id, check);
    }
  }

  const items = sources.map((source) => {
    const latestCheck = latestCheckBySource.get(source.id) ?? null;
    const latestSuccess = latestSuccessBySource.get(source.id) ?? null;
    const enabled = isEnabledSource(source);
    const disabledReason = !postsEnabled
      ? "네이버 카페 게시글 기능이 비활성화되어 있습니다."
      : !enabled
        ? "소스가 비활성화되어 점검 대상에서 제외됩니다."
        : latestCheck?.status === "disabled"
          ? latestCheck.error ?? "최근 점검에서 비활성 상태로 기록되었습니다."
          : null;
    const stale =
      postsEnabled &&
      enabled &&
      (!latestCheck || now - latestCheck.checked_at > NaverCafeStaleThresholdMs);
    const failing =
      postsEnabled &&
      enabled &&
      latestCheck !== null &&
      !["ok", "stale", "disabled"].includes(latestCheck.status);

    return {
      sourceId: source.id,
      sourceName: source.name,
      cafeId: source.cafe_id,
      menuId: source.menu_id,
      enabled,
      latestCheck: latestCheck
        ? {
            id: latestCheck.id,
            trigger: latestCheck.trigger,
            status: latestCheck.status,
            checkedAt: latestCheck.checked_at,
            durationMs: latestCheck.duration_ms,
            postCount: latestCheck.post_count,
            error: latestCheck.error,
          }
        : null,
      lastSuccessAt: latestSuccess?.checked_at ?? null,
      latestError: latestCheck?.error ?? null,
      disabledReason,
      stale,
      failing,
    };
  });

  return {
    items,
    staleCount: items.filter((item) => item.stale).length,
    failingCount: items.filter((item) => item.failing).length,
    disabledCount: items.filter((item) => !item.enabled || item.disabledReason)
      .length,
  };
};

const getOperationsStatus = async (env: Env, windowHours: number) => {
  const now = Date.now();
  const since = now - windowHours * 60 * 60_000;

  const [
    settingsResult,
    autoRunsResult,
    xRunsResult,
    xUsageEventsResult,
    naverSourcesResult,
    naverChecksResult,
  ] = await Promise.all([
    env.otw_db
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
    env.otw_db
      .prepare(
        `SELECT id, source, status, started_at, finished_at, range_days,
                checked_count, updated_count, created_count, existing_count,
                pending_created_count, actor_id, actor_name, actor_ip, error
         FROM auto_update_runs
         ORDER BY started_at DESC
         LIMIT 50`,
      )
      .all<AutoUpdateRunRow>(),
    env.otw_db
      .prepare(
        `SELECT id, source, started_at, finished_at, checked_handles,
                refreshed_handles, posts_returned, posts_stored, api_calls,
                estimated_cost_micros, status, error
         FROM x_collection_runs
         ORDER BY started_at DESC
         LIMIT 50`,
      )
      .all<XCollectionRunRow>(),
    env.otw_db
      .prepare(
        `SELECT operation, endpoint, resource_count, estimated_cost_micros,
                status, created_at, detail
         FROM x_api_usage_events
         WHERE created_at >= ?
         ORDER BY created_at DESC`,
      )
      .bind(since)
      .all<XUsageSummaryRow>(),
    env.otw_db
      .prepare(
        `SELECT id, name, cafe_id, menu_id, cafe_url, member_uid, enabled, sort_order
         FROM naver_cafe_sources
         ORDER BY sort_order, name`,
      )
      .all<NaverCafeSourceRow>(),
    env.otw_db
      .prepare(
        `SELECT id, source_id, source_name, cafe_id, menu_id, trigger, status,
                checked_at, duration_ms, post_count, error
         FROM naver_cafe_source_checks
         ORDER BY checked_at DESC
         LIMIT 1000`,
      )
      .all<NaverCafeSourceCheckRow>(),
  ]);

  const settings = getSettingMap(getResults(settingsResult));
  const autoInterval = parseAutoUpdateIntervalHours(
    normalizeAutoUpdateIntervalHours(settings.get("auto_update_interval_hours")),
  );
  const autoRangeDays = Math.max(
    1,
    Number.parseInt(settings.get("auto_update_range_days") ?? "3", 10) || 3,
  );
  const autoLastRun = Number.parseInt(
    settings.get("auto_update_last_run") ?? "",
    10,
  );
  const xInterval = parseXCollectionIntervalHours(
    normalizeXCollectionIntervalHours(settings.get("x_collection_interval_hours")),
  );
  const xLastRun = Number.parseInt(
    settings.get("x_collection_last_run") ?? "",
    10,
  );

  const autoRuns = getResults(autoRunsResult);
  const xRuns = getResults(xRunsResult);
  const xUsageRows = getResults(xUsageEventsResult);
  const naverSources = getResults(naverSourcesResult);
  const naverEnabled = settings.get("naver_cafe_posts_enabled") !== "false";
  const naverCafeLastRun = Number.parseInt(
    settings.get("naver_cafe_collection_last_run") ?? "",
    10,
  );
  const xPostsVisibility = normalizeFeedVisibility(
    settings.get("x_posts_visibility"),
  );
  const naverCafeVisibility = normalizeFeedVisibility(
    settings.get("naver_cafe_posts_visibility"),
  );
  const naverStatus = buildNaverCafeStatus(
    naverSources,
    getResults(naverChecksResult),
    now,
    naverEnabled,
  );
  const pending = await getVisiblePendingSummary(env.otw_db);
  const autoEnabled = settings.get("auto_update_enabled") === "true";
  const xEnabled = settings.get("x_collection_enabled") !== "false";
  const parsedXDailyBudgetCents = Number.parseInt(
    settings.get("x_collection_daily_budget_cents") ?? "100",
    10,
  );
  const xDailyBudgetCents =
    Number.isFinite(parsedXDailyBudgetCents) && parsedXDailyBudgetCents > 0
      ? parsedXDailyBudgetCents
      : 100;
  const xUsage = buildXUsageStatus(
    xUsageRows,
    xRuns,
    since,
    now,
    xDailyBudgetCents,
  );
  const issues: Issue[] = [];

  const latestAutoRun = autoRuns[0] ?? null;
  if (autoEnabled && latestAutoRun?.status === "failed") {
    issues.push({
      severity: "critical",
      code: "auto_update_latest_failed",
      message: "최근 자동 업데이트 실행이 실패했습니다.",
    });
  }
  if (autoEnabled) {
    addStaleIssue(
      issues,
      "auto_update_stale",
      "자동 업데이트 성공 이력이 오래되었습니다.",
      getLatestSuccessAt(autoRuns),
      autoInterval * 2 * 60 * 60_000,
      now,
    );
  }
  if (toNumber(pending.total) > 0) {
    issues.push({
      severity: "warning",
      code: "pending_schedule_backlog",
      message: "승인 대기 스케줄이 남아 있습니다.",
    });
  }

  const latestXRun = xRuns[0] ?? null;
  if (xEnabled && latestXRun?.status === "failed") {
    issues.push({
      severity: "critical",
      code: "x_collection_latest_failed",
      message: "최근 X 게시글 수집이 실패했습니다.",
    });
  }
  if (xEnabled) {
    addStaleIssue(
      issues,
      "x_collection_stale",
      "X 게시글 수집 성공 이력이 오래되었습니다.",
      getLatestSuccessAt(xRuns),
      xInterval * 2 * 60 * 60_000,
      now,
    );
  }
  if (xEnabled && xUsage.rateLimitCount > 0) {
    issues.push({
      severity: "warning",
      code: "x_api_rate_limited",
      message: `최근 ${windowHours}시간 동안 X API rate-limit이 ${xUsage.rateLimitCount}회 발생했습니다.`,
    });
  }
  if (xEnabled && xUsage.quota.todayBudgetUsedPercent >= 100) {
    issues.push({
      severity: "critical",
      code: "x_api_daily_budget_exhausted",
      message: "오늘 X API 일 예산을 모두 사용했습니다.",
    });
  } else if (xEnabled && xUsage.quota.todayBudgetUsedPercent >= 80) {
    issues.push({
      severity: "warning",
      code: "x_api_daily_budget_high",
      message: `오늘 X API 일 예산의 ${xUsage.quota.todayBudgetUsedPercent}%를 사용했습니다.`,
    });
  }

  if (naverEnabled) {
    for (const source of naverStatus.items) {
      if (!source.enabled) continue;
      if (source.failing) {
        issues.push({
          severity: "critical",
          code: "naver_cafe_source_failed",
          message: `${source.sourceName} 네이버 카페 점검이 실패했습니다.`,
        });
      } else if (source.stale) {
        issues.push({
          severity: "warning",
          code: "naver_cafe_source_stale",
          message: `${source.sourceName} 네이버 카페 점검 이력이 오래되었습니다.`,
        });
      }
    }
  }

  const summaryStatus: StatusLevel = issues.some(
    (issue) => issue.severity === "critical",
  )
    ? "critical"
    : issues.length > 0
      ? "warning"
      : "ok";

  return {
    updatedAt: new Date(now).toISOString(),
    window: { hours: windowHours, since },
    summary: {
      status: summaryStatus,
      issues,
    },
    autoUpdate: {
      enabled: autoEnabled,
      intervalHours: autoInterval,
      rangeDays: autoRangeDays,
      lastRun: Number.isFinite(autoLastRun) ? autoLastRun : null,
      nextEligibleAt: getNextEligibleAt(
        autoEnabled,
        Number.isFinite(autoLastRun) ? autoLastRun : null,
        autoInterval,
        now,
      ),
      pending: {
        total: toNumber(pending.total),
        createCount: toNumber(pending.create_count),
        updateCount: toNumber(pending.update_count),
      },
      latestRun: latestAutoRun ? serializeAutoRun(latestAutoRun) : null,
      recentRuns: autoRuns.slice(0, 10).map(serializeAutoRun),
    },
    xCollection: {
      enabled: xEnabled,
      intervalHours: xInterval,
      dailyBudgetCents: xDailyBudgetCents,
      lastRun: Number.isFinite(xLastRun) ? xLastRun : null,
      nextEligibleAt: getNextEligibleAt(
        xEnabled,
        Number.isFinite(xLastRun) ? xLastRun : null,
        xInterval,
        now,
      ),
      latestRun: latestXRun ? serializeXRun(latestXRun) : null,
      recentRuns: xRuns.slice(0, 10).map(serializeXRun),
      feed: {
        visibility: xPostsVisibility,
        publicPath: MEMBER_POSTS_PUBLIC_PATH,
        monitorPath: MEMBER_POSTS_MONITOR_PATH,
        apiPath: "/api/member-posts?sources=x&admin=1",
      },
      usage: {
        apiCalls: xUsage.apiCalls,
        estimatedCostMicros: xUsage.estimatedCostMicros,
        resourceCount: xUsage.resourceCount,
        successCount: xUsage.successCount,
        failureCount: xUsage.failureCount,
        rateLimitCount: xUsage.rateLimitCount,
        quota: xUsage.quota,
        daily: xUsage.daily,
        byOperation: xUsage.byOperation,
        forceRefreshPaths: xUsage.forceRefreshPaths,
      },
    },
    naverCafe: {
      enabled: naverEnabled,
      visibility: naverCafeVisibility,
      collection: {
        intervalHours: NaverCafeCollectionIntervalHours,
        lastRun: Number.isFinite(naverCafeLastRun) ? naverCafeLastRun : null,
        nextEligibleAt: getNextEligibleAt(
          naverEnabled,
          Number.isFinite(naverCafeLastRun) ? naverCafeLastRun : null,
          NaverCafeCollectionIntervalHours,
          now,
        ),
      },
      publicPath: MEMBER_POSTS_PUBLIC_PATH,
      monitorPath: MEMBER_POSTS_MONITOR_PATH,
      apiPath: "/api/member-posts?sources=naver-cafe&admin=1",
      sourceCount: naverSources.length,
      enabledSourceCount: naverSources.filter(isEnabledSource).length,
      staleSourceCount: naverStatus.staleCount,
      failingSourceCount: naverStatus.failingCount,
      disabledSourceCount: naverStatus.disabledCount,
      sources: naverStatus.items,
    },
  };
};

const runNaverCafeCheck = async (env: Env) => {
  const db = getDb(env);
  const sources = await db
    .select()
    .from(naverCafeSources)
    .where(eq(naverCafeSources.enabled, true))
    .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name));

  if (sources.length === 0) {
    return {
      success: true,
      updatedAt: new Date().toISOString(),
      checkedAt: Date.now(),
      sources: [],
    };
  }

  const startedAt = Date.now();
  const result = await collectNaverCafePostsForSources(sources, {
    cacheDb: env.otw_db,
    size: NaverCafeCheckSize,
    trigger: "manual",
  });
  const checkedAt = result.checkedAt;
  const durationMs = checkedAt - startedAt;
  const responseSources = result.sources.map((source) => ({
    sourceId: source.id,
    sourceName: source.name,
    cafeId: source.cafeId,
    menuId: source.menuId,
    trigger: "manual" as const,
    status: source.status,
    checkedAt,
    durationMs,
    postCount: source.postCount,
    error: source.error,
  }));

  return {
    success: responseSources.every((source) =>
      ["ok", "stale", "disabled"].includes(source.status),
    ),
    updatedAt: new Date(checkedAt).toISOString(),
    checkedAt,
    sources: responseSources,
  };
};

export const handleOperations = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  const url = new URL(request.url);
  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  const actor = getActorInfo(request, admin.user);

  if (url.pathname === "/api/operations/status") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    const windowHours = parseWindowHours(url.searchParams.get("windowHours"));
    if (windowHours === null) {
      return badRequest("windowHours must be an integer between 1 and 168");
    }

    return json(await getOperationsStatus(env, windowHours), 200, {
      headers: NO_STORE_HEADERS,
    });
  }

  if (url.pathname === "/api/operations/naver-cafe/check-now") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    const result = await runNaverCafeCheck(env);
    const failedCount = result.sources.filter(
      (source) => !["ok", "stale", "disabled"].includes(source.status),
    ).length;
    await insertAdminAuditLog(getDb(env), {
      eventType: "manual_collection.naver_cafe_check",
      resourceType: "naver_cafe",
      action: "check_now",
      status: result.success ? "success" : "partial",
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
      targetCount: result.sources.length,
      successCount: result.sources.length - failedCount,
      failureCount: failedCount,
      detail: {
        checkedAt: result.checkedAt,
        sourceIds: result.sources.map((source) => source.sourceId),
      },
    });

    return json(result, 200, {
      headers: NO_STORE_HEADERS,
    });
  }

  if (url.pathname === "/api/operations/data-retention/status") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return json(await getDataRetentionStatus(env), 200, {
      headers: NO_STORE_HEADERS,
    });
  }

  if (url.pathname === "/api/operations/data-retention/prune") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    const dryRun = parseDryRun(url.searchParams.get("dryRun"));
    if (dryRun === null) {
      return badRequest("dryRun must be true or false");
    }

    const result = await runDataRetentionPrune(env, {
      source: "manual",
      dryRun,
    });
    await insertAdminAuditLog(getDb(env), {
      eventType: "data_retention.prune",
      resourceType: "data_retention",
      action: dryRun ? "dry_run" : "prune",
      status: "success",
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
      targetCount: result.totalPrunableRows,
      successCount: result.totalDeletedRows,
      failureCount: dryRun
        ? 0
        : Math.max(0, result.totalPrunableRows - result.totalDeletedRows),
      detail: {
        dryRun,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        policies: result.policies.map((policy) => ({
          id: policy.id,
          table: policy.table,
          retentionDays: policy.retentionDays,
          cutoff: policy.cutoff,
          prunableRows: policy.prunableRows,
          deletedRows: policy.deletedRows,
        })),
      },
    });

    return json(result, 200, {
      headers: NO_STORE_HEADERS,
    });
  }

  return new Response(null, { status: 404 });
};
