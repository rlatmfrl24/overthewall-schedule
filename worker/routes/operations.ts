import { asc, eq } from "drizzle-orm";
import {
  naverCafeSourceChecks,
  naverCafeSources,
} from "../../src/db/schema";
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
  json,
  methodNotAllowed,
} from "../utils/helpers";
import {
  fetchNaverCafePostsForSources,
  NaverCafeApiError,
} from "../services/naver-cafe";
import type { Env } from "../types";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Vary: "Authorization",
};
const NaverCafeCheckSize = 5;
const NaverCafeStaleThresholdMs = 24 * 60 * 60_000;

type StatusLevel = "ok" | "warning" | "critical";
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
  api_calls: number;
  estimated_cost_micros: number;
  success_count: number;
  failure_count: number;
  rate_limit_count: number;
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
  trigger: "manual";
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

const toNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const getSettingMap = (rows: SettingRow[]) =>
  new Map(rows.map((row) => [row.key, row.value]));

const getLatestSuccessAt = <T extends { status: string; finished_at: number | null }>(
  rows: T[],
) => rows.find((row) => row.status === "success")?.finished_at ?? null;

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

const isEnabledSource = (source: NaverCafeSourceRow) =>
  source.enabled !== false && source.enabled !== 0;

const getErrorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const buildNaverCafeStatus = (
  sources: NaverCafeSourceRow[],
  checks: NaverCafeSourceCheckRow[],
  now: number,
) => {
  const latestCheckBySource = new Map<number, NaverCafeSourceCheckRow>();
  for (const check of checks) {
    if (!latestCheckBySource.has(check.source_id)) {
      latestCheckBySource.set(check.source_id, check);
    }
  }

  const items = sources.map((source) => {
    const latestCheck = latestCheckBySource.get(source.id) ?? null;
    const enabled = isEnabledSource(source);
    const stale =
      enabled &&
      (!latestCheck || now - latestCheck.checked_at > NaverCafeStaleThresholdMs);
    const failing =
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
      stale,
      failing,
    };
  });

  return {
    items,
    staleCount: items.filter((item) => item.stale).length,
    failingCount: items.filter((item) => item.failing).length,
  };
};

const getOperationsStatus = async (env: Env, windowHours: number) => {
  const now = Date.now();
  const since = now - windowHours * 60 * 60_000;

  const [
    settingsResult,
    pendingResult,
    autoRunsResult,
    xRunsResult,
    xUsageResult,
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
           'naver_cafe_posts_enabled',
           'naver_cafe_posts_visibility'
         )`,
      )
      .all<SettingRow>(),
    env.otw_db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN action_type = 'create' THEN 1 ELSE 0 END), 0) AS create_count,
           COALESCE(SUM(CASE WHEN action_type = 'update' THEN 1 ELSE 0 END), 0) AS update_count
         FROM pending_schedules`,
      )
      .all<PendingSummaryRow>(),
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
        `SELECT
           COUNT(*) AS api_calls,
           COALESCE(SUM(estimated_cost_micros), 0) AS estimated_cost_micros,
           COALESCE(SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END), 0) AS success_count,
           COALESCE(SUM(CASE WHEN status < 200 OR status >= 300 THEN 1 ELSE 0 END), 0) AS failure_count,
           COALESCE(SUM(CASE WHEN status = 429 THEN 1 ELSE 0 END), 0) AS rate_limit_count
         FROM x_api_usage_events
         WHERE created_at >= ?`,
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
  const naverSources = getResults(naverSourcesResult);
  const naverStatus = buildNaverCafeStatus(
    naverSources,
    getResults(naverChecksResult),
    now,
  );
  const pending =
    getResults(pendingResult)[0] ??
    ({ total: 0, create_count: 0, update_count: 0 } satisfies PendingSummaryRow);
  const xUsage =
    getResults(xUsageResult)[0] ??
    ({
      api_calls: 0,
      estimated_cost_micros: 0,
      success_count: 0,
      failure_count: 0,
      rate_limit_count: 0,
    } satisfies XUsageSummaryRow);

  const autoEnabled = settings.get("auto_update_enabled") === "true";
  const xEnabled = settings.get("x_collection_enabled") !== "false";
  const naverEnabled = settings.get("naver_cafe_posts_enabled") !== "false";
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
      dailyBudgetCents: Number.parseInt(
        settings.get("x_collection_daily_budget_cents") ?? "100",
        10,
      ),
      lastRun: Number.isFinite(xLastRun) ? xLastRun : null,
      nextEligibleAt: getNextEligibleAt(
        xEnabled,
        Number.isFinite(xLastRun) ? xLastRun : null,
        xInterval,
        now,
      ),
      latestRun: latestXRun ? serializeXRun(latestXRun) : null,
      recentRuns: xRuns.slice(0, 10).map(serializeXRun),
      usage: {
        apiCalls: toNumber(xUsage.api_calls),
        estimatedCostMicros: toNumber(xUsage.estimated_cost_micros),
        successCount: toNumber(xUsage.success_count),
        failureCount: toNumber(xUsage.failure_count),
        rateLimitCount: toNumber(xUsage.rate_limit_count),
      },
    },
    naverCafe: {
      enabled: naverEnabled,
      visibility: settings.get("naver_cafe_posts_visibility") ?? "members",
      sourceCount: naverSources.length,
      enabledSourceCount: naverSources.filter(isEnabledSource).length,
      staleSourceCount: naverStatus.staleCount,
      failingSourceCount: naverStatus.failingCount,
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
  const sourceResultById = new Map<
    number,
    {
      status: NaverCafeSourceCheckRow["status"];
      error: string | null;
      postCount: number;
    }
  >();

  try {
    const result = await fetchNaverCafePostsForSources(sources, {
      size: NaverCafeCheckSize,
    });
    for (const source of result.sources) {
      sourceResultById.set(source.id, {
        status: source.status,
        error: source.error,
        postCount: source.postCount,
      });
    }
  } catch (error) {
    if (error instanceof NaverCafeApiError) {
      for (const diagnostic of error.diagnostics) {
        sourceResultById.set(diagnostic.sourceId, {
          status: diagnostic.status,
          error: diagnostic.error ?? error.message,
          postCount: 0,
        });
      }
    } else {
      const message = getErrorText(error);
      for (const source of sources) {
        sourceResultById.set(source.id, {
          status: "error",
          error: message,
          postCount: 0,
        });
      }
    }
  }

  const checkedAt = Date.now();
  const durationMs = checkedAt - startedAt;
  const rows = sources.map((source) => {
    const result = sourceResultById.get(source.id) ?? {
      status: "error" as const,
      error: "No check result",
      postCount: 0,
    };
    return {
      source_id: source.id,
      source_name: source.name,
      cafe_id: source.cafe_id,
      menu_id: source.menu_id,
      trigger: "manual" as const,
      status: result.status,
      checked_at: checkedAt,
      duration_ms: durationMs,
      post_count: result.postCount,
      error: result.error,
    };
  });

  await db.insert(naverCafeSourceChecks).values(rows);

  const responseSources = rows.map((row) => ({
    sourceId: row.source_id,
    sourceName: row.source_name,
    cafeId: row.cafe_id,
    menuId: row.menu_id,
    trigger: row.trigger,
    status: row.status,
    checkedAt: row.checked_at,
    durationMs: row.duration_ms,
    postCount: row.post_count,
    error: row.error,
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

    return json(await runNaverCafeCheck(env), 200, {
      headers: NO_STORE_HEADERS,
    });
  }

  return new Response(null, { status: 404 });
};
