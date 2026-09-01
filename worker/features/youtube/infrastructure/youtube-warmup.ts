import type { YouTubeCacheRefreshRunSummaryDto } from "@contracts/youtube";
import { pMap } from "../../../platform/http-helpers";
import { WORKER_CACHE_POLICY } from "../../../platform/cache-policy";
import type {
  Env,
  YouTubeCacheStatus,
  YouTubeWarmupRunSummary,
  YouTubeWarmupStatusSummary,
  YouTubeWarmupTargetSource,
} from "../../../platform/types";
import {
  fetchYouTubeVideosForChannel,
  getYouTubeVideosCacheKey,
  type YouTubeRefreshFailure,
} from "./youtube-api";
import { getYouTubeQuotaWindow, readYouTubeQuotaLedgerUsage } from "./youtube-quota";
import { createYouTubeCacheTelemetryWriter } from "./youtube-cache-telemetry";
import { YouTubeCacheRefreshInProgressError } from "../application/youtube-service";

type YouTubeWarmupDb = Pick<D1Database, "prepare">;

export type YouTubeWarmupTarget = {
  source: YouTubeWarmupTargetSource;
  channelId: string;
  maxResults: number;
  cacheKey: string;
};

type CacheState = {
  status: YouTubeCacheStatus;
  fetchedAt: number;
  expiresAt: number;
  staleUntil: number;
  content: {
    videos: Array<{ videoId: string }>;
    shorts: Array<{ videoId: string }>;
  } | null;
};

type WarmupRunRow = {
  id: number | string;
  source: "scheduled" | "manual";
  status: "success" | "skipped" | "partial" | "failed";
  target_count: number | string;
  skipped_fresh_count: number | string;
  refreshed_count: number | string;
  failed_count: number | string;
  stale_fallback_count: number | string;
  baseline_count: number | string;
  changed_count: number | string;
  unchanged_count: number | string;
  api_calls: number | string;
  quota_units: number | string;
  duration_ms: number | string;
  started_at: number | string;
  finished_at: number | string;
  error: string | null;
};

const MANUAL_REFRESH_LEASE_KEY = "youtube_cache_manual_refresh_lease_until";
const MANUAL_REFRESH_LEASE_MS = 5 * 60_000;
const TARGET_REFRESH_LEASE_MS = 90_000;
const MANUAL_REFRESH_TIMEOUT_MS = 30_000;
const WARMUP_CONCURRENCY = 2;
const WARMUP_QUOTA_WINDOW_HOURS = 24;

const toNumber = (value: number | string | null | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getD1Results = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const results = (value as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const parseContent = (value: string | null | undefined): CacheState["content"] => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CacheState["content"];
    return parsed && Array.isArray(parsed.videos) && Array.isArray(parsed.shorts)
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const toRunSummary = (row: WarmupRunRow): YouTubeWarmupRunSummary => ({
  id: toNumber(row.id) || null,
  source: row.source,
  status: row.status,
  targetCount: toNumber(row.target_count),
  skippedFreshCount: toNumber(row.skipped_fresh_count),
  refreshedCount: toNumber(row.refreshed_count),
  failedCount: toNumber(row.failed_count),
  staleFallbackCount: toNumber(row.stale_fallback_count),
  baselineCount: toNumber(row.baseline_count),
  changedCount: toNumber(row.changed_count),
  unchangedCount: toNumber(row.unchanged_count),
  apiCalls: toNumber(row.api_calls),
  quotaUnits: toNumber(row.quota_units),
  durationMs: toNumber(row.duration_ms),
  startedAt: toNumber(row.started_at),
  finishedAt: toNumber(row.finished_at),
  error: row.error,
});

const readSetting = async (db: YouTubeWarmupDb, key: string) => {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string | null }>();
  return row?.value ?? null;
};

const readDailyQuota = async (db: YouTubeWarmupDb) => {
  const canonical = await readSetting(db, "youtube_api_daily_quota_units");
  const legacy =
    canonical ?? await readSetting(db, "youtube_warmup_daily_quota_units");
  const parsed = Number.parseInt(legacy ?? "1000", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1000;
};

export const readYouTubeWarmupSettings = async (db: YouTubeWarmupDb) => ({
  enabled: false,
  intervalHours: 0,
  dailyQuotaUnits: await readDailyQuota(db),
  officialEnabled: true,
  kirinukiEnabled: true,
  lastRun: null,
});

const readTargets = async (
  db: YouTubeWarmupDb,
  source: YouTubeWarmupTargetSource,
) => {
  const policy =
    source === "official"
      ? WORKER_CACHE_POLICY.youtube.officialChannelVideos
      : WORKER_CACHE_POLICY.youtube.kirinukiChannelVideos;
  const sql =
    source === "official"
      ? `SELECT youtube_channel_id AS channelId
         FROM members
         WHERE youtube_channel_id IS NOT NULL
           AND TRIM(youtube_channel_id) <> ''
           AND (is_deprecated IS NULL OR is_deprecated = 0)`
      : `SELECT youtube_channel_id AS channelId
         FROM kirinuki_channels
         WHERE youtube_channel_id IS NOT NULL
           AND TRIM(youtube_channel_id) <> ''`;
  const result = await db.prepare(sql).all<{ channelId: string }>();
  return getD1Results<{ channelId: string }>(result).map(
    (row) =>
      ({
        source,
        channelId: row.channelId,
        maxResults: policy.canonicalMaxResults,
        cacheKey: getYouTubeVideosCacheKey(
          row.channelId,
          policy.canonicalMaxResults,
        ),
      }) satisfies YouTubeWarmupTarget,
  );
};

export const readYouTubeWarmupTargets = async (
  db: YouTubeWarmupDb,
  options: { officialEnabled?: boolean; kirinukiEnabled?: boolean } = {},
) => {
  const [official, kirinuki] = await Promise.all([
    options.officialEnabled === false
      ? Promise.resolve([])
      : readTargets(db, "official"),
    options.kirinukiEnabled === false
      ? Promise.resolve([])
      : readTargets(db, "kirinuki"),
  ]);
  return Array.from(
    new Map(
      [...official, ...kirinuki].map((target) => [target.cacheKey, target]),
    ).values(),
  );
};

const getCacheStatus = (
  expiresAt: number,
  staleUntil: number,
  timestamp = Date.now(),
): YouTubeCacheStatus =>
  timestamp <= expiresAt
    ? "fresh"
    : timestamp <= staleUntil
      ? "stale"
      : "expired";

const readVideoCacheState = async (
  db: YouTubeWarmupDb,
  cacheKey: string,
): Promise<CacheState | null> => {
  const row = await db
    .prepare(
      `SELECT value, fetched_at, expires_at, stale_until
       FROM youtube_api_cache
       WHERE key = ? AND type = 'channel_videos'`,
    )
    .bind(cacheKey)
    .first<{
      value: string;
      fetched_at: number | string;
      expires_at: number | string;
      stale_until: number | string;
    }>();
  if (!row) return null;
  const expiresAt = toNumber(row.expires_at);
  const staleUntil = toNumber(row.stale_until);
  return {
    status: getCacheStatus(expiresAt, staleUntil),
    fetchedAt: toNumber(row.fetched_at),
    expiresAt,
    staleUntil,
    content: parseContent(row.value),
  };
};

const readVideoCacheStateMap = async (db: YouTubeWarmupDb) => {
  const result = await db
    .prepare(
      `SELECT key, value, fetched_at, expires_at, stale_until
       FROM youtube_api_cache
       WHERE type = 'channel_videos'`,
    )
    .all<{
      key: string;
      value: string;
      fetched_at: number | string;
      expires_at: number | string;
      stale_until: number | string;
    }>();
  return new Map(
    getD1Results<{
      key: string;
      value: string;
      fetched_at: number | string;
      expires_at: number | string;
      stale_until: number | string;
    }>(result).map((row) => {
      const expiresAt = toNumber(row.expires_at);
      const staleUntil = toNumber(row.stale_until);
      return [
        row.key,
        {
          status: getCacheStatus(expiresAt, staleUntil),
          fetchedAt: toNumber(row.fetched_at),
          expiresAt,
          staleUntil,
          content: parseContent(row.value),
        } satisfies CacheState,
      ];
    }),
  );
};

const readUsageSummary = async (
  db: YouTubeWarmupDb,
  since: number,
  manualOnly = false,
) => {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN quota_units > 0 THEN 1 ELSE 0 END), 0) AS apiCalls,
              COALESCE(SUM(quota_units), 0) AS quotaUnits
       FROM youtube_api_usage_events
       WHERE created_at >= ?${manualOnly ? " AND request_origin = 'manual'" : ""}`,
    )
    .bind(since)
    .first<{ apiCalls: number | string; quotaUnits: number | string }>();
  return {
    apiCalls: toNumber(row?.apiCalls),
    quotaUnits: toNumber(row?.quotaUnits),
  };
};

const readWarmupRuns = async (
  db: YouTubeWarmupDb,
  since: number,
  limit: number,
) => {
  try {
    const result = await db
      .prepare(
        `SELECT id, source, status, target_count, skipped_fresh_count,
                refreshed_count, failed_count, stale_fallback_count,
                baseline_count, changed_count, unchanged_count,
                api_calls, quota_units, duration_ms, started_at,
                finished_at, error
         FROM youtube_warmup_runs
         WHERE started_at >= ?
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .bind(since, limit)
      .all<WarmupRunRow>();
    return getD1Results<WarmupRunRow>(result).map(toRunSummary);
  } catch (error) {
    console.warn("Failed to read YouTube cache refresh runs", error);
    return [];
  }
};

const writeWarmupRun = async (
  db: YouTubeWarmupDb,
  run: Omit<YouTubeWarmupRunSummary, "id">,
): Promise<YouTubeWarmupRunSummary> => {
  try {
    const result = await db
      .prepare(
        `INSERT INTO youtube_warmup_runs (
           source, status, target_count, skipped_fresh_count,
           refreshed_count, failed_count, stale_fallback_count,
           baseline_count, changed_count, unchanged_count,
           api_calls, quota_units, duration_ms, started_at,
           finished_at, error
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.source,
        run.status,
        run.targetCount,
        run.skippedFreshCount,
        run.refreshedCount,
        run.failedCount,
        run.staleFallbackCount,
        run.baselineCount,
        run.changedCount,
        run.unchangedCount,
        run.apiCalls,
        run.quotaUnits,
        run.durationMs,
        run.startedAt,
        run.finishedAt,
        run.error,
      )
      .run();
    const id = toNumber(
      (result as { meta?: { last_row_id?: number } }).meta?.last_row_id,
    );
    return { ...run, id: id || null };
  } catch (error) {
    console.warn("Failed to write YouTube cache refresh run", error);
    return { ...run, id: null };
  }
};

const makeSkippedRun = (
  startedAt: number,
  error: string,
  targetCount = 0,
): Omit<YouTubeWarmupRunSummary, "id"> => {
  const finishedAt = Date.now();
  return {
    source: "manual",
    status: "skipped",
    targetCount,
    skippedFreshCount: 0,
    refreshedCount: 0,
    failedCount: 0,
    staleFallbackCount: 0,
    baselineCount: 0,
    changedCount: 0,
    unchangedCount: 0,
    apiCalls: 0,
    quotaUnits: 0,
    durationMs: Math.max(0, finishedAt - startedAt),
    startedAt,
    finishedAt,
    error,
  };
};

const claimGlobalLease = async (db: YouTubeWarmupDb, timestamp: number) => {
  const leaseUntil = timestamp + MANUAL_REFRESH_LEASE_MS;
  const row = await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at
       WHERE CAST(settings.value AS INTEGER) <= ?
       RETURNING value`,
    )
    .bind(
      MANUAL_REFRESH_LEASE_KEY,
      String(leaseUntil),
      String(timestamp),
      timestamp,
    )
    .first<{ value: string }>();
  if (!row) throw new YouTubeCacheRefreshInProgressError();
  return String(leaseUntil);
};

const releaseGlobalLease = async (db: YouTubeWarmupDb, leaseValue: string) => {
  try {
    await db
      .prepare(
        `UPDATE settings SET value = '0', updated_at = ?
         WHERE key = ? AND value = ?`,
      )
      .bind(String(Date.now()), MANUAL_REFRESH_LEASE_KEY, leaseValue)
      .run();
  } catch (error) {
    console.warn("Failed to release YouTube manual refresh lease", error);
  }
};

const claimTargetLease = async (
  db: YouTubeWarmupDb,
  target: YouTubeWarmupTarget,
  timestamp: number,
) => {
  const row = await db
    .prepare(
      `INSERT INTO youtube_api_cache (
         key, type, value, fetched_at, expires_at, stale_until,
         refresh_after, last_status, last_error
       ) VALUES (?, 'channel_videos', 'null', 0, 0, 0, ?, NULL, NULL)
       ON CONFLICT(key) DO UPDATE SET refresh_after = excluded.refresh_after
       WHERE youtube_api_cache.refresh_after <= ?
       RETURNING key`,
    )
    .bind(target.cacheKey, timestamp + TARGET_REFRESH_LEASE_MS, timestamp)
    .first<{ key: string }>();
  return Boolean(row);
};

const setTargetBackoff = async (
  db: YouTubeWarmupDb,
  target: YouTubeWarmupTarget,
  failure: YouTubeRefreshFailure,
) => {
  const fiveMinutes = 5 * 60_000;
  const delay = failure.quotaRejected
    ? 6 * 60 * 60_000
    : failure.status === 429
      ? Math.min(
          60 * 60_000,
          Math.max(fiveMinutes, failure.retryAfterMs ?? 15 * 60_000),
        )
      : failure.status === 0 || failure.status >= 500
        ? fiveMinutes
        : failure.status >= 400
          ? 24 * 60 * 60_000
          : fiveMinutes;
  await db
    .prepare(
      `UPDATE youtube_api_cache
       SET refresh_after = ?, last_status = ?, last_error = ?
       WHERE key = ?`,
    )
    .bind(Date.now() + delay, failure.status, failure.error, target.cacheKey)
    .run();
};

const videoIdSet = (content: CacheState["content"]) =>
  new Set(
    [...(content?.videos ?? []), ...(content?.shorts ?? [])].map(
      (video) => video.videoId,
    ),
  );

const areSameIds = (left: Set<string>, right: Set<string>) =>
  left.size === right.size && Array.from(left).every((id) => right.has(id));

export const runManualYouTubeCacheRefresh = async (
  env: Env,
): Promise<YouTubeCacheRefreshRunSummaryDto> => {
  const startedAt = Date.now();
  const db = env.otw_db;
  const leaseValue = await claimGlobalLease(db, startedAt);
  const telemetry = createYouTubeCacheTelemetryWriter(
    env.YOUTUBE_CACHE_ANALYTICS,
  );
  try {
    const targets = await readYouTubeWarmupTargets(db);
    const apiKey = env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) {
      return (await writeWarmupRun(
        db,
        makeSkippedRun(startedAt, "youtube_api_key_missing", targets.length),
      )) as YouTubeCacheRefreshRunSummaryDto;
    }
    if (targets.length === 0) {
      return (await writeWarmupRun(
        db,
        makeSkippedRun(startedAt, "no_cache_targets"),
      )) as YouTubeCacheRefreshRunSummaryDto;
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      MANUAL_REFRESH_TIMEOUT_MS,
    );
    let refreshedCount = 0;
    let failedCount = 0;
    let staleFallbackCount = 0;
    let baselineCount = 0;
    let changedCount = 0;
    let unchangedCount = 0;
    let quotaRejectedCount = 0;
    try {
      await pMap(
        targets,
        async (target) => {
          if (controller.signal.aborted) {
            failedCount += 1;
            return;
          }
          const before = await readVideoCacheState(db, target.cacheKey);
          if (!(await claimTargetLease(db, target, Date.now()))) {
            failedCount += 1;
            return;
          }
          const policy =
            target.source === "official"
              ? WORKER_CACHE_POLICY.youtube.officialChannelVideos
              : WORKER_CACHE_POLICY.youtube.kirinukiChannelVideos;
          const failureState: { value: YouTubeRefreshFailure | null } = {
            value: null,
          };
          const targetStartedAt = Date.now();
          const content = await fetchYouTubeVideosForChannel(
            target.channelId,
            apiKey,
            target.maxResults,
            db,
            {
              forceRefresh: true,
              quotaPriority: "critical",
              requestOrigin: "manual",
              freshTtlMs: policy.freshTtlMs,
              staleTtlMs: policy.staleTtlMs,
              signal: controller.signal,
              onFailure: (nextFailure) => {
                failureState.value = nextFailure;
              },
            },
          );
          const failure = failureState.value;
          let change: "baseline" | "changed" | "unchanged" | null = null;
          if (failure) {
            await setTargetBackoff(db, target, failure);
            if (failure.quotaRejected) quotaRejectedCount += 1;
            failedCount += 1;
            if (before?.content && content) staleFallbackCount += 1;
          } else if (content) {
            refreshedCount += 1;
            const beforeIds = videoIdSet(before?.content ?? null);
            const afterIds = videoIdSet(content);
            if (!before?.content) {
              baselineCount += 1;
              change = "baseline";
            } else if (areSameIds(beforeIds, afterIds)) {
              unchangedCount += 1;
              change = "unchanged";
            } else {
              changedCount += 1;
              change = "changed";
            }
          } else {
            failedCount += 1;
          }
          telemetry.write({
            event: "youtube.cache.refresh",
            source: target.source,
            origin: "manual",
            state: content ? "fresh" : before?.status ?? "missing",
            outcome: failure?.quotaRejected
              ? "quota_rejected"
              : failure
                ? controller.signal.aborted
                  ? "timeout"
                  : "failed"
                : content
                  ? change ?? "refreshed"
                  : "failed",
            status: failure?.status ?? (content ? 200 : 502),
            durationMs: Date.now() - targetStartedAt,
            targetCount: 1,
            availableCount: content ? 1 : 0,
            refreshCount: 1,
            pendingCount: content ? 0 : 1,
          });
        },
        WARMUP_CONCURRENCY,
      );
    } finally {
      clearTimeout(timer);
    }
    const finishedAt = Date.now();
    const usage = await readUsageSummary(db, startedAt, true);
    const allQuotaRejected = quotaRejectedCount === targets.length;
    const status = allQuotaRejected
      ? "skipped"
      : failedCount > 0
        ? refreshedCount > 0
          ? "partial"
          : "failed"
        : "success";
    const run = await writeWarmupRun(db, {
      source: "manual",
      status,
      targetCount: targets.length,
      skippedFreshCount: 0,
      refreshedCount,
      failedCount,
      staleFallbackCount,
      baselineCount,
      changedCount,
      unchangedCount,
      apiCalls: usage.apiCalls,
      quotaUnits: usage.quotaUnits,
      durationMs: Math.max(0, finishedAt - startedAt),
      startedAt,
      finishedAt,
      error: allQuotaRejected
        ? "daily_quota_limit_reached"
        : status === "failed"
          ? controller.signal.aborted
            ? "refresh_deadline_exceeded"
            : "all_targets_failed"
          : null,
    });
    return run as YouTubeCacheRefreshRunSummaryDto;
  } finally {
    await releaseGlobalLease(db, leaseValue);
  }
};

export const getYouTubeWarmupStatus = async (
  db: YouTubeWarmupDb,
  windowHours: number,
): Promise<YouTubeWarmupStatusSummary> => {
  const timestamp = Date.now();
  const settings = await readYouTubeWarmupSettings(db);
  const targets = await readYouTubeWarmupTargets(db);
  const [quotaLedger, recentRuns, cacheStatesByKey] = await Promise.all([
    readYouTubeQuotaLedgerUsage(db, timestamp),
    readWarmupRuns(db, timestamp - windowHours * 60 * 60_000, 20),
    readVideoCacheStateMap(db),
  ]);
  const counts = { fresh: 0, stale: 0, expired: 0, missing: 0 };
  for (const target of targets) {
    const state = cacheStatesByKey.get(target.cacheKey);
    if (!state?.content) counts.missing += 1;
    else counts[state.status] += 1;
  }
  return {
    settings,
    quota: {
      limit: settings.dailyQuotaUnits,
      used: quotaLedger.used,
      remaining: Math.max(0, settings.dailyQuotaUnits - quotaLedger.used),
      windowHours: WARMUP_QUOTA_WINDOW_HOURS,
      since: quotaLedger.since,
      nextResetAt: getYouTubeQuotaWindow(timestamp + 36 * 60 * 60_000).since,
    },
    targets: {
      total: targets.length,
      official: targets.filter((target) => target.source === "official").length,
      kirinuki: targets.filter((target) => target.source === "kirinuki").length,
      ...counts,
    },
    latestRun: recentRuns[0] ?? null,
    recentRuns,
  };
};
