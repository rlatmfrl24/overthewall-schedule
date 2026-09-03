import { asc, eq } from "drizzle-orm";
import { naverCafeSources } from "@db/schema";
import {
  normalizeAutoUpdateIntervalHours,
  normalizeXCollectionIntervalHours,
  parseAutoUpdateIntervalHours,
  parseXCollectionIntervalHours,
} from "@contracts/configuration";
import { getDb } from "../../../platform/db";
import { insertAdminAuditLog } from "../../../platform/http-helpers";
import {
  getDataRetentionStatus,
  runDataRetentionPrune,
} from "./data-retention";
import {
  readOperationsStatusRows,
  type AutoUpdateRunRow,
  type NaverCafeSourceCheckRow,
  type NaverCafeSourceRow,
  type SettingRow,
  type XCollectionRunRow,
  type XUsageSummaryRow,
} from "./operations-read-model";
import type { Env } from "../../../platform/types";
import {
  scheduledJobTypes,
  type OperationJobHealth,
  type OperationRunDto,
  type ScheduledJobStatus,
  type ScheduledJobType,
} from "@contracts/scheduled-operations";
import {
  SCHEDULED_D1_WRITE_DAILY_TARGET,
} from "../../../platform/scheduled-jobs/job-policy";
import { ScheduledRunClient } from "../../../platform/scheduled-jobs";
import type {
  OperationsActor,
  OperationsApplication,
} from "../application/operations-application";
import { CloudflareD1ObservabilityReader } from "./cloudflare-d1-observability-reader";

const MEMBER_POSTS_PUBLIC_PATH = "/feed";
const MEMBER_POSTS_MONITOR_PATH = "/admin/member-posts";
const NaverCafeCheckSize = 5;
const NaverCafeStaleThresholdMs = 24 * 60 * 60_000;
const NaverCafeCollectionIntervalHours = 1;

const normalSkipReasons = new Set([
  "no_targets",
  "no_eligible_targets",
  "all_handles_cooldown",
  "coalesced",
  "not_due",
]);

const skipReasonLabels: Record<string, string> = {
  no_targets: "처리할 대상 없음",
  no_eligible_targets: "현재 점검 대상 없음",
  all_handles_cooldown: "모든 X 소스가 다음 점검 대기 중",
  coalesced: "동일 작업과 병합됨",
  not_due: "아직 실행 시각이 아님",
  v2_rollout_disabled: "예약 작업 비활성",
  budget_exceeded: "일일 예산 초과",
  daily_background_budget_exhausted: "정기 작업 일일 예산 초과",
};

type StatusLevel = "ok" | "warning" | "critical";
type FeedVisibility = "public" | "members" | "private";
type Issue = {
  severity: Exclude<StatusLevel, "ok">;
  code: string;
  message: string;
};

type PendingSummaryRow = {
  total: number;
  create_count: number;
  update_count: number;
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

const getLatestHealthyXCollectionAt = (
  rows: Array<{
    status: string;
    error: string | null;
    finished_at: number | null;
    refreshed_handles: number;
  }>,
) =>
  rows.find(
    (row) =>
      row.status === "success" ||
      (row.status === "skipped" && (
        row.error === "all_handles_cooldown" || row.refreshed_handles > 0
      )),
  )?.finished_at ?? null;

const getVisiblePendingSummary = async (
  db: D1Database,
): Promise<PendingSummaryRow> => {
  const result = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN action_type = 'create' THEN 1 ELSE 0 END) AS create_count,
         SUM(CASE WHEN action_type = 'update' THEN 1 ELSE 0 END) AS update_count
       FROM pending_schedules`,
    )
    .all<PendingSummaryRow>();
  return result.results[0] ?? {
    total: 0,
    create_count: 0,
    update_count: 0,
  };
};

const getRejectionCount = async (db: D1Database) => {
  const result = await db
    .prepare(
      "SELECT COUNT(*) AS total FROM schedule_candidate_rejections",
    )
    .all<{ total: number }>();
  return toNumber(result.results[0]?.total);
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
  segmentCount: row.segment_count,
  sessionCount: row.session_count,
  resumeMergedCount: row.resume_merged_count,
  updatedCount: row.updated_count,
  createdCount: row.created_count,
  existingCount: row.existing_count,
  pendingCreatedCount: row.pending_created_count,
  rejectedSuppressedCount: row.rejected_suppressed_count,
  duplicatePendingCount: row.duplicate_pending_count,
  shortSuppressedCount: row.short_suppressed_count,
  holidaySuppressedCount: row.holiday_suppressed_count,
  ambiguousCount: row.ambiguous_count,
  obsoletePendingCount: row.obsolete_pending_count,
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
) => {
  const latestCheckBySource = new Map<number, NaverCafeSourceCheckRow>();
  const latestSuccessBySource = new Map<number, NaverCafeSourceCheckRow>();
  for (const check of checks) {
    if (!latestCheckBySource.has(check.source_id)) {
      latestCheckBySource.set(check.source_id, check);
    }
    if (
      !latestSuccessBySource.has(check.source_id) &&
      check.status === "ok"
    ) {
      latestSuccessBySource.set(check.source_id, check);
    }
  }

  const items = sources.map((source) => {
    const latestCheck = latestCheckBySource.get(source.id) ?? null;
    const latestSuccess = latestSuccessBySource.get(source.id) ?? null;
    const enabled = isEnabledSource(source);
    const disabledReason = !enabled
      ? "소스가 비활성화되어 점검 대상에서 제외됩니다."
      : latestCheck?.status === "disabled"
        ? latestCheck.error ?? "최근 점검에서 비활성 상태로 기록되었습니다."
        : null;
    const stale =
      enabled &&
      (!latestCheck || now - latestCheck.checked_at > NaverCafeStaleThresholdMs);
    const failing =
      enabled &&
      latestCheck !== null &&
      !["ok", "stale", "disabled"].includes(latestCheck.status);
    const latestError = latestCheck?.error ??
      (enabled && !latestCheck
        ? "수집 실행 이력이 없습니다."
        : null);

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
      latestError,
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

const readScheduledOperationsStatus = async (db: D1Database, now: number) => {
  const resetAt = Date.parse(
    `${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`,
  ) + 24 * 60 * 60_000;
  const fallback = {
    activeRunCount: 0,
    staleLeaseCount: 0,
    outboxBacklog: 0,
    oldestOutboxAvailableAt: null as number | null,
    queueOperations: { used: 0, limit: 5_000, usedPercent: 0 },
    d1WriteGuard: {
      status: "unavailable" as const,
      measurement: "admission_estimate" as const,
      used: 0,
      reserved: 0,
      limit: SCHEDULED_D1_WRITE_DAILY_TARGET,
      usedPercent: 0,
      blockedJobTypes: [] as ScheduledJobType[],
      resetAt,
    },
    dailyUsage: [] as Array<{
      resource: string;
      reserved: number;
      used: number;
      limit: number;
      usedPercent: number;
    }>,
  };
  try {
    const day = new Date(now).toISOString().slice(0, 10);
    const [stateResult, usageResult, d1WriteGuardResult] = await db.batch([
      db.prepare(
        `SELECT
           (SELECT COUNT(*) FROM scheduled_job_runs
             WHERE status IN ('queued', 'running')) AS activeRunCount,
           (SELECT COUNT(*) FROM scheduled_job_items
             WHERE status = 'running' AND lease_until < ?) AS staleLeaseCount,
           (SELECT COUNT(*) FROM scheduled_outbox
             WHERE status IN ('pending', 'failed')
                OR (status = 'dispatching' AND lease_until < ?)) AS outboxBacklog,
           (SELECT MIN(available_at) FROM scheduled_outbox
             WHERE status IN ('pending', 'failed')
                OR (status = 'dispatching' AND lease_until < ?))
             AS oldestOutboxAvailableAt`,
      ).bind(now, now, now),
      db.prepare(
        `SELECT resource, COALESCE(SUM(used), 0) AS used,
                COALESCE(SUM(reserved), 0) AS reserved,
                MAX(limit_value) AS limitValue
         FROM scheduled_usage_daily
         WHERE day = ? GROUP BY resource ORDER BY resource`,
      ).bind(day),
      db.prepare(
        `SELECT COALESCE(SUM(used), 0) AS used,
                COALESCE(SUM(reserved), 0) AS reserved,
                MAX(limit_value) AS limitValue
         FROM scheduled_usage_daily
         WHERE day = ? AND lane = 'all' AND resource = 'd1_rows_written'`,
      ).bind(day),
    ]);
    const state = stateResult.results[0] as {
      activeRunCount?: number | string;
      staleLeaseCount?: number | string;
      outboxBacklog?: number | string;
      oldestOutboxAvailableAt?: number | string | null;
    } | undefined;
    const dailyUsage = usageResult.results.map((row) => {
      const usage = row as {
        resource?: string;
        used?: number | string;
        reserved?: number | string;
        limitValue?: number | string | null;
      };
      const used = Number(usage.used ?? 0);
      const reserved = Number(usage.reserved ?? 0);
      const limit = Number(usage.limitValue ?? 0);
      return {
        resource: usage.resource ?? "unknown",
        used,
        reserved,
        limit,
        usedPercent: limit > 0
          ? Math.min(
              100,
              Math.round(((used + reserved) / limit) * 1_000) / 10,
            )
          : 0,
      };
    });
    const queueUsage = dailyUsage.find(
      (usage) => usage.resource === "queue_operations",
    );
    const usage = queueUsage ?? {
      used: 0,
      reserved: 0,
      limit: 5_000,
      usedPercent: 0,
    };
    const queueTotal = usage.used + usage.reserved;
    const d1WriteRow = d1WriteGuardResult.results[0] as {
      used?: number | string;
      reserved?: number | string;
      limitValue?: number | string | null;
    } | undefined;
    const d1WriteUsed = Number(d1WriteRow?.used ?? 0);
    const d1WriteReserved = Number(d1WriteRow?.reserved ?? 0);
    const d1WriteLedgerLimit = d1WriteRow?.limitValue == null
      ? null
      : Number(d1WriteRow.limitValue);
    const d1WriteLimit = d1WriteLedgerLimit ??
      SCHEDULED_D1_WRITE_DAILY_TARGET;
    const d1WriteBlocked = d1WriteLedgerLimit !== null &&
      d1WriteUsed + d1WriteReserved >= d1WriteLedgerLimit;
    const d1WriteUsedPercent = d1WriteLimit > 0
      ? Math.min(
        100,
        Math.round(
          ((d1WriteUsed + d1WriteReserved) / d1WriteLimit) * 1_000,
        ) / 10,
      )
      : d1WriteBlocked
        ? 100
        : 0;
    return {
      activeRunCount: Number(state?.activeRunCount ?? 0),
      staleLeaseCount: Number(state?.staleLeaseCount ?? 0),
      outboxBacklog: Number(state?.outboxBacklog ?? 0),
      oldestOutboxAvailableAt: state?.oldestOutboxAvailableAt == null
        ? null
        : Number(state.oldestOutboxAvailableAt),
      queueOperations: {
        used: queueTotal,
        limit: usage.limit || 5_000,
        usedPercent: usage.usedPercent,
      },
      d1WriteGuard: {
        status: d1WriteBlocked ? "blocked" as const : "available" as const,
        measurement: "admission_estimate" as const,
        used: d1WriteUsed,
        reserved: d1WriteReserved,
        limit: d1WriteLimit,
        usedPercent: d1WriteUsedPercent,
        blockedJobTypes: [] as ScheduledJobType[],
        resetAt,
      },
      dailyUsage,
    };
  } catch (error) {
    console.warn("Scheduled operations status unavailable", error);
    return fallback;
  }
};

const getOperationsStatus = async (env: Env, windowHours: number) => {
  const now = Date.now();
  const since = now - windowHours * 60 * 60_000;

  const {
    settings: settingRows,
    autoRuns,
    xRuns,
    xUsageEvents: xUsageRows,
    naverSources,
    naverChecks,
  } = await readOperationsStatusRows(env.otw_db, since);

  const settings = getSettingMap(settingRows);
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
  const xScheduleLastRun = Number.parseInt(
    settings.get("x_collection_last_run") ?? "",
    10,
  );

  const naverEnabled = settings.get("naver_cafe_posts_enabled") !== "false";
  const naverCafeScheduleLastRun = Number.parseInt(
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
    naverChecks,
    now,
  );
  const [pending, rejectionCount] = await Promise.all([
    getVisiblePendingSummary(env.otw_db),
    getRejectionCount(env.otw_db),
  ]);
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
  const scheduledOperations = await readScheduledOperationsStatus(
    env.otw_db,
    now,
  );
  if (scheduledOperations.d1WriteGuard.status === "blocked") {
    scheduledOperations.d1WriteGuard.blockedJobTypes = scheduledJobTypes.filter(
      (jobType) => settings.get(`scheduled_v2_${jobType}_enabled`) === "true",
    );
  }
  const issues: Issue[] = [];

  if (scheduledOperations.d1WriteGuard.status === "blocked") {
    issues.push({
      severity: "critical",
      code: "scheduled_d1_write_guard_blocked",
      message:
        "D1 일일 쓰기 한도에 도달해 cron이 정기 작업 Workflow를 만들지 않고 있습니다.",
    });
  }

  if (scheduledOperations.staleLeaseCount > 0) {
    issues.push({
      severity: "warning",
      code: "scheduled_job_stale_lease",
      message: `복구 대기 중인 정기 작업 lease가 ${scheduledOperations.staleLeaseCount}개 있습니다.`,
    });
  }
  if (scheduledOperations.outboxBacklog > 25) {
    issues.push({
      severity: "warning",
      code: "scheduled_outbox_backlog",
      message: `정기 작업 outbox 대기가 ${scheduledOperations.outboxBacklog}개 누적되었습니다.`,
    });
  }

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
  const latestXCollectionAt = getLatestHealthyXCollectionAt(xRuns);
  const latestNaverCafeCollectionAt = naverStatus.items.reduce<number | null>(
    (latest, source) => {
      if (source.lastSuccessAt === null) return latest;
      return latest === null
        ? source.lastSuccessAt
        : Math.max(latest, source.lastSuccessAt);
    },
    null,
  );
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
      "X 게시글 수집 정상 이력이 오래되었습니다.",
      latestXCollectionAt,
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
          message: `${source.sourceName} 네이버 카페 점검이 실패했습니다.${
            source.latestError ? ` ${source.latestError}` : ""
          }`,
        });
      } else if (source.stale) {
        issues.push({
          severity: "warning",
          code: "naver_cafe_source_stale",
          message: source.latestCheck
            ? `${source.sourceName} 네이버 카페 점검 이력이 오래되었습니다.`
            : `${source.sourceName} 네이버 카페 수집 실행 이력이 없습니다.`,
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
    scheduledOperations,
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
      rejectionCount,
      latestRun: latestAutoRun ? serializeAutoRun(latestAutoRun) : null,
      recentRuns: autoRuns.slice(0, 10).map(serializeAutoRun),
    },
    xCollection: {
      enabled: xEnabled,
      intervalHours: xInterval,
      dailyBudgetCents: xDailyBudgetCents,
      // A successful refresh and an all-handles-cooldown no-op are both healthy
      // persisted collection outcomes. The setting remains scheduling authority.
      lastRun: latestXCollectionAt,
      nextEligibleAt: getNextEligibleAt(
        xEnabled,
        Number.isFinite(xScheduleLastRun) ? xScheduleLastRun : null,
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
        // Source checks are written only by manual/scheduled collection, unlike
        // response timestamps which advance whenever the feed is viewed.
        lastRun: latestNaverCafeCollectionAt,
        nextEligibleAt: getNextEligibleAt(
          naverSources.some(isEnabledSource),
          Number.isFinite(naverCafeScheduleLastRun)
            ? naverCafeScheduleLastRun
            : null,
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

const getRunReasonCode = (run: OperationRunDto | null) => {
  const summaryReason = run?.summary?.reason;
  if (typeof summaryReason === "string" && summaryReason.trim()) {
    return summaryReason.trim();
  }
  return run?.lastError?.trim() || null;
};

export const classifyOperationJobHealth = (
  enabled: boolean,
  run: OperationRunDto | null,
  normalSkip: boolean,
  stale: boolean,
): OperationJobHealth => {
  if (!enabled) return "inactive";
  if (!run) return "attention";
  if (run.status === "failed") return "critical";
  if (run.status === "partial" || run.status === "throttled") {
    return "attention";
  }
  if (run.status === "skipped" && !normalSkip) return "attention";
  if (stale) return "attention";
  return "healthy";
};

const getJobExpectedIntervalMs = (
  jobType: ScheduledJobType,
  settings: Map<string, string | null>,
) => {
  if (jobType === "x_collection") {
    return parseXCollectionIntervalHours(normalizeXCollectionIntervalHours(
      settings.get("x_collection_interval_hours"),
    )) * 60 * 60_000;
  }
  if (jobType === "schedule_auto_update") {
    return parseAutoUpdateIntervalHours(normalizeAutoUpdateIntervalHours(
      settings.get("auto_update_interval_hours"),
    )) * 60 * 60_000;
  }
  return ({
    ingestion_recovery: 60 * 60_000,
    websub_maintenance: 60 * 60_000,
    channel_reconcile: 6 * 60 * 60_000,
    source_health: 24 * 60 * 60_000,
    naver_cafe_collection: 6 * 60 * 60_000,
    youtube_feed_collection: 6 * 60 * 60_000,
    recent_reconcile: 24 * 60 * 60_000,
    retention_prune: 24 * 60 * 60_000,
  } satisfies Partial<Record<ScheduledJobType, number>>)[jobType] ??
    60 * 60_000;
};

const getOperationJobSummaries = async (env: Env, now = Date.now()) => {
  const client = new ScheduledRunClient(env);
  const settingKeys = [...scheduledJobTypes.map(
    (jobType) => `scheduled_v2_${jobType}_enabled`,
  ), "x_collection_interval_hours", "auto_update_interval_hours"];
  const placeholders = settingKeys.map(() => "?").join(", ");
  const [latestRuns, latestSuccessRows, settingRows] = await Promise.all([
    client.listLatestRunsByJobType(),
    client.readLatestSuccessfulRunTimes(),
    env.otw_db.prepare(
      `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
    ).bind(...settingKeys).all<SettingRow>(),
  ]);
  const runByJobType = new Map(latestRuns.map((run) => [run.jobType, run]));
  const successByJobType = new Map(
    latestSuccessRows.map((row) => [row.jobType, row.latestSuccessAt]),
  );
  const settings = getSettingMap(settingRows.results);
  return {
    summaries: scheduledJobTypes.map((jobType) => {
      const latestRun = runByJobType.get(jobType) ?? null;
      const runReasonCode = getRunReasonCode(latestRun);
      const normalSkip = latestRun?.status === "skipped" &&
        runReasonCode !== null && normalSkipReasons.has(runReasonCode);
      const latestCheckAt = latestRun
        ? latestRun.finishedAt ?? latestRun.startedAt ?? latestRun.acceptedAt
        : null;
      const normalizedSuccessAt = latestRun?.status === "succeeded"
        ? latestRun.finishedAt ?? latestRun.startedAt ?? latestRun.acceptedAt
        : null;
      const latestSuccessAt = Math.max(
        successByJobType.get(jobType) ?? 0,
        normalizedSuccessAt ?? 0,
      ) || null;
      const enabled = settings.get(`scheduled_v2_${jobType}_enabled`) === "true";
      const intervalMs = getJobExpectedIntervalMs(jobType, settings);
      const nextExpectedAt = latestCheckAt === null
        ? null
        : latestCheckAt + intervalMs;
      const stale = enabled && nextExpectedAt !== null &&
        now > nextExpectedAt + intervalMs;
      const reasonCode = stale ? "stale_check" : runReasonCode;
      return {
        jobType,
        latestRun,
        latestCheckAt,
        latestSuccessAt,
        nextExpectedAt,
        health: classifyOperationJobHealth(enabled, latestRun, normalSkip, stale),
        normalSkip,
        reasonCode,
        reasonLabel: reasonCode === null
          ? null
          : reasonCode === "stale_check"
            ? "예상 주기보다 최근 점검이 늦습니다. 예약 작업 상태를 확인하세요."
            : skipReasonLabels[reasonCode] ?? "확인이 필요한 실행 결과",
      };
    }),
  };
};

type CollectNaverCafePosts = (
  sources: Array<{
    id: number;
    name: string;
    cafe_id: string;
    menu_id: string;
    cafe_url: string;
    member_uid: number | null;
    enabled: boolean | null;
    sort_order: number;
  }>,
  options: {
    cacheDb: D1Database;
    size: number;
    trigger: "manual";
  },
) => Promise<{
  checkedAt: number;
  sources: Array<{
    id: number;
    name: string;
    cafeId: string;
    menuId: string;
    status: string;
    postCount: number;
    error: string | null;
  }>;
}>;

const runNaverCafeCheck = async (
  env: Env,
  collectNaverCafePostsForSources: CollectNaverCafePosts,
) => {
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

export class D1OperationsApplication implements OperationsApplication {
  private readonly env: Env;
  private readonly collectNaverCafePostsForSources: CollectNaverCafePosts;

  constructor(
    env: Env,
    collectNaverCafePostsForSources: CollectNaverCafePosts,
  ) {
    this.env = env;
    this.collectNaverCafePostsForSources = collectNaverCafePostsForSources;
  }

  getStatus(windowHours: number) {
    return getOperationsStatus(this.env, windowHours);
  }

  getD1Observability() {
    return new CloudflareD1ObservabilityReader(
      this.env.CLOUDFLARE_ACCOUNT_ID,
      this.env.CLOUDFLARE_D1_DATABASE_ID,
      this.env.CLOUDFLARE_D1_TOKEN,
    ).read7Days();
  }

  getJobSummaries() {
    return getOperationJobSummaries(this.env);
  }

  async checkNaverCafe(actor: OperationsActor) {
    const result = await runNaverCafeCheck(
      this.env,
      this.collectNaverCafePostsForSources,
    );
    const failedCount = result.sources.filter(
      (source) => !["ok", "stale", "disabled"].includes(source.status),
    ).length;
    await insertAdminAuditLog(getDb(this.env), {
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

    return result;
  }

  getDataRetentionStatus() {
    return getDataRetentionStatus(this.env);
  }

  createRun(
    jobType: ScheduledJobType,
    actor: OperationsActor,
    idempotencyKey?: string | null,
  ) {
    return new ScheduledRunClient(this.env).createManualRun(
      jobType,
      actor,
      idempotencyKey,
    );
  }

  getRun(runId: string) {
    return new ScheduledRunClient(this.env).getRun(runId);
  }

  listRuns(input: {
    jobType?: ScheduledJobType;
    status?: ScheduledJobStatus;
    limit: number;
  }) {
    return new ScheduledRunClient(this.env).listRuns(input);
  }

  retryRun(runId: string) {
    return new ScheduledRunClient(this.env).retryRun(runId);
  }

  async pruneDataRetention(dryRun: boolean, actor: OperationsActor) {
    const result = await runDataRetentionPrune(this.env, {
      source: "manual",
      dryRun,
    });
    await insertAdminAuditLog(getDb(this.env), {
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

    return result;
  }
}

export const createD1OperationsApplication = (
  env: Env,
  collectNaverCafePostsForSources: CollectNaverCafePosts,
) => new D1OperationsApplication(env, collectNaverCafePostsForSources);
