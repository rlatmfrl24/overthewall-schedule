import {
  normalizeYouTubeWarmupDailyQuotaUnits,
  normalizeYouTubeWarmupSettings,
  YOUTUBE_WARMUP_SETTINGS_KEYS,
  type YouTubeWarmupSettingKey,
} from "../../src/lib/youtube-warmup-settings";
import { parseYouTubeWarmupIntervalHours } from "../../src/lib/auto-update-interval";
import { fetchYouTubeVideosForChannel } from "./youtube";
import { pMap } from "../utils/helpers";
import type {
  Env,
  YouTubeCacheStatus,
  YouTubeWarmupRunSummary,
  YouTubeWarmupSource,
  YouTubeWarmupStatusSummary,
  YouTubeWarmupTargetSource,
} from "../types";

type YouTubeWarmupDb = Pick<D1Database, "prepare">;

type SettingRow = {
  key: YouTubeWarmupSettingKey;
  value: string | null;
};

type WarmupTarget = {
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
};

type UsageSummary = {
  apiCalls: number;
  quotaUnits: number;
};

type WarmupRunRow = {
  id: number | string;
  source: YouTubeWarmupSource;
  status: "success" | "skipped" | "partial" | "failed";
  target_count: number | string;
  skipped_fresh_count: number | string;
  refreshed_count: number | string;
  failed_count: number | string;
  stale_fallback_count: number | string;
  api_calls: number | string;
  quota_units: number | string;
  duration_ms: number | string;
  started_at: number | string;
  finished_at: number | string;
  error: string | null;
};

const OFFICIAL_MAX_RESULTS = 20;
const KIRINUKI_MAX_RESULTS = 40;
const WARMUP_CONCURRENCY = 2;
const WARMUP_REFRESH_AHEAD_MS = 60_000;
const WARMUP_QUOTA_WINDOW_HOURS = 24;
const WARMUP_QUOTA_ESTIMATE_PER_TARGET = 3;

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

const getVideosCacheKey = (channelId: string, maxResults: number) =>
  `videos:${channelId}:${maxResults}`;

const getCacheStatus = (
  row: Pick<CacheState, "expiresAt" | "staleUntil">,
  timestamp = Date.now(),
): YouTubeCacheStatus => {
  if (timestamp <= row.expiresAt) return "fresh";
  if (timestamp <= row.staleUntil) return "stale";
  return "expired";
};

const toRunSummary = (row: WarmupRunRow): YouTubeWarmupRunSummary => ({
  id: toNumber(row.id),
  source: row.source,
  status: row.status,
  targetCount: toNumber(row.target_count),
  skippedFreshCount: toNumber(row.skipped_fresh_count),
  refreshedCount: toNumber(row.refreshed_count),
  failedCount: toNumber(row.failed_count),
  staleFallbackCount: toNumber(row.stale_fallback_count),
  apiCalls: toNumber(row.api_calls),
  quotaUnits: toNumber(row.quota_units),
  durationMs: toNumber(row.duration_ms),
  startedAt: toNumber(row.started_at),
  finishedAt: toNumber(row.finished_at),
  error: row.error,
});

const readSettingMap = async (db: YouTubeWarmupDb) => {
  const placeholders = YOUTUBE_WARMUP_SETTINGS_KEYS.map(() => "?").join(", ");
  const result = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
    .bind(...YOUTUBE_WARMUP_SETTINGS_KEYS)
    .all<SettingRow>();
  return new Map(
    getD1Results<SettingRow>(result).map((row) => [row.key, row.value]),
  );
};

const writeSetting = async (
  db: YouTubeWarmupDb,
  key: YouTubeWarmupSettingKey,
  value: string,
) => {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .bind(key, value, String(Date.now()))
    .run();
};

export const readYouTubeWarmupSettings = async (db: YouTubeWarmupDb) => {
  const settingsMap = await readSettingMap(db);
  const normalized = normalizeYouTubeWarmupSettings(
    Object.fromEntries(settingsMap) as Partial<
      Record<YouTubeWarmupSettingKey, string | null>
    >,
  );

  const writableKeys = YOUTUBE_WARMUP_SETTINGS_KEYS.filter(
    (key) => key !== "youtube_warmup_last_run",
  );
  await Promise.all(
    writableKeys.map(async (key) => {
      if (settingsMap.get(key) !== normalized[key]) {
        await writeSetting(db, key, normalized[key]);
      }
    }),
  );

  return {
    enabled: normalized.youtube_warmup_enabled !== "false",
    intervalHours: parseYouTubeWarmupIntervalHours(
      normalized.youtube_warmup_interval_hours,
    ),
    dailyQuotaUnits: Number.parseInt(
      normalizeYouTubeWarmupDailyQuotaUnits(
        normalized.youtube_warmup_daily_quota_units,
      ),
      10,
    ),
    officialEnabled: normalized.youtube_warmup_official_enabled !== "false",
    kirinukiEnabled: normalized.youtube_warmup_kirinuki_enabled !== "false",
    lastRun:
      normalized.youtube_warmup_last_run === null
        ? null
        : toNumber(normalized.youtube_warmup_last_run, 0) || null,
  };
};

const readOfficialTargets = async (db: YouTubeWarmupDb): Promise<WarmupTarget[]> => {
  const result = await db
    .prepare(
      `SELECT youtube_channel_id AS channelId
       FROM members
       WHERE youtube_channel_id IS NOT NULL
         AND TRIM(youtube_channel_id) <> ''
         AND (is_deprecated IS NULL OR is_deprecated = 0)`,
    )
    .all<{ channelId: string }>();
  return getD1Results<{ channelId: string }>(result).map((row) => ({
    source: "official",
    channelId: row.channelId,
    maxResults: OFFICIAL_MAX_RESULTS,
    cacheKey: getVideosCacheKey(row.channelId, OFFICIAL_MAX_RESULTS),
  }));
};

const readKirinukiTargets = async (
  db: YouTubeWarmupDb,
): Promise<WarmupTarget[]> => {
  const result = await db
    .prepare(
      `SELECT youtube_channel_id AS channelId
       FROM kirinuki_channels
       WHERE youtube_channel_id IS NOT NULL
         AND TRIM(youtube_channel_id) <> ''`,
    )
    .all<{ channelId: string }>();
  return getD1Results<{ channelId: string }>(result).map((row) => ({
    source: "kirinuki",
    channelId: row.channelId,
    maxResults: KIRINUKI_MAX_RESULTS,
    cacheKey: getVideosCacheKey(row.channelId, KIRINUKI_MAX_RESULTS),
  }));
};

export const readYouTubeWarmupTargets = async (
  db: YouTubeWarmupDb,
  options: { officialEnabled: boolean; kirinukiEnabled: boolean },
) => {
  const [officialTargets, kirinukiTargets] = await Promise.all([
    options.officialEnabled ? readOfficialTargets(db) : Promise.resolve([]),
    options.kirinukiEnabled ? readKirinukiTargets(db) : Promise.resolve([]),
  ]);
  const byCacheKey = new Map<string, WarmupTarget>();
  for (const target of [...officialTargets, ...kirinukiTargets]) {
    byCacheKey.set(target.cacheKey, target);
  }
  return Array.from(byCacheKey.values());
};

const readVideoCacheState = async (
  db: YouTubeWarmupDb,
  cacheKey: string,
): Promise<CacheState | null> => {
  const row = await db
    .prepare(
      `SELECT fetched_at, expires_at, stale_until
       FROM youtube_api_cache
       WHERE key = ? AND type = 'channel_videos'`,
    )
    .bind(cacheKey)
    .first<{
      fetched_at: number | string;
      expires_at: number | string;
      stale_until: number | string;
    }>();
  if (!row) return null;
  const state = {
    fetchedAt: toNumber(row.fetched_at),
    expiresAt: toNumber(row.expires_at),
    staleUntil: toNumber(row.stale_until),
  };
  return {
    ...state,
    status: getCacheStatus(state),
  };
};

const readUsageSummary = async (
  db: YouTubeWarmupDb,
  since: number,
): Promise<UsageSummary> => {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS apiCalls,
              COALESCE(SUM(quota_units), 0) AS quotaUnits
       FROM youtube_api_usage_events
       WHERE created_at >= ?`,
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
    console.warn("Failed to read YouTube warmup runs", error);
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
           api_calls, quota_units, duration_ms, started_at,
           finished_at, error
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.source,
        run.status,
        run.targetCount,
        run.skippedFreshCount,
        run.refreshedCount,
        run.failedCount,
        run.staleFallbackCount,
        run.apiCalls,
        run.quotaUnits,
        run.durationMs,
        run.startedAt,
        run.finishedAt,
        run.error,
      )
      .run();
    const id = toNumber(
      (result as { meta?: { last_row_id?: number } })?.meta?.last_row_id,
      0,
    );
    return { ...run, id: id || null };
  } catch (error) {
    console.warn("Failed to write YouTube warmup run", error);
    return { ...run, id: null };
  }
};

const makeSkippedRun = (
  source: YouTubeWarmupSource,
  startedAt: number,
  error: string,
  targetCount = 0,
): Omit<YouTubeWarmupRunSummary, "id"> => {
  const finishedAt = Date.now();
  return {
    source,
    status: "skipped" as const,
    targetCount,
    skippedFreshCount: 0,
    refreshedCount: 0,
    failedCount: 0,
    staleFallbackCount: 0,
    apiCalls: 0,
    quotaUnits: 0,
    durationMs: Math.max(0, finishedAt - startedAt),
    startedAt,
    finishedAt,
    error,
  };
};

const shouldSkipFreshTarget = (cache: CacheState | null, timestamp: number) =>
  cache?.status === "fresh" &&
  cache.expiresAt - timestamp > WARMUP_REFRESH_AHEAD_MS;

export const runYouTubeWarmup = async (
  env: Env,
  source: YouTubeWarmupSource,
): Promise<YouTubeWarmupRunSummary> => {
  const startedAt = Date.now();
  const db = env.otw_db;
  const settings = await readYouTubeWarmupSettings(db);

  if (!settings.enabled) {
    return {
      ...makeSkippedRun(source, startedAt, "youtube_warmup_disabled"),
      id: null,
    };
  }

  if (
    source === "scheduled" &&
    settings.lastRun &&
    startedAt - settings.lastRun < settings.intervalHours * 60 * 60_000
  ) {
    return {
      ...makeSkippedRun(source, startedAt, "interval_not_elapsed"),
      id: null,
    };
  }

  const apiKey = env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    const run = await writeWarmupRun(
      db,
      makeSkippedRun(source, startedAt, "youtube_api_key_missing"),
    );
    await writeSetting(db, "youtube_warmup_last_run", String(run.finishedAt));
    return run;
  }

  const targets = await readYouTubeWarmupTargets(db, settings);
  if (targets.length === 0) {
    const run = await writeWarmupRun(
      db,
      makeSkippedRun(source, startedAt, "no_warmup_targets"),
    );
    await writeSetting(db, "youtube_warmup_last_run", String(run.finishedAt));
    return run;
  }

  const quotaSince = startedAt - WARMUP_QUOTA_WINDOW_HOURS * 60 * 60_000;
  const startingUsage = await readUsageSummary(db, quotaSince);
  if (startingUsage.quotaUnits >= settings.dailyQuotaUnits) {
    const run = await writeWarmupRun(
      db,
      makeSkippedRun(source, startedAt, "daily_quota_limit_reached", targets.length),
    );
    await writeSetting(db, "youtube_warmup_last_run", String(run.finishedAt));
    return run;
  }

  let skippedFreshCount = 0;
  let refreshedCount = 0;
  let failedCount = 0;
  let staleFallbackCount = 0;
  let projectedQuotaUnits = 0;

  await pMap(
    targets,
    async (target) => {
      const before = await readVideoCacheState(db, target.cacheKey);
      const timestamp = Date.now();
      if (shouldSkipFreshTarget(before, timestamp)) {
        skippedFreshCount += 1;
        return;
      }

      if (
        startingUsage.quotaUnits +
          projectedQuotaUnits +
          WARMUP_QUOTA_ESTIMATE_PER_TARGET >
        settings.dailyQuotaUnits
      ) {
        failedCount += 1;
        return;
      }
      projectedQuotaUnits += WARMUP_QUOTA_ESTIMATE_PER_TARGET;

      const beforeUsage = await readUsageSummary(db, startedAt);
      const content = await fetchYouTubeVideosForChannel(
        target.channelId,
        apiKey,
        target.maxResults,
        db,
        { forceRefresh: true },
      );
      const afterUsage = await readUsageSummary(db, startedAt);
      const actualQuotaDelta = Math.max(
        0,
        afterUsage.quotaUnits - beforeUsage.quotaUnits,
      );
      projectedQuotaUnits +=
        actualQuotaDelta - WARMUP_QUOTA_ESTIMATE_PER_TARGET;

      const after = await readVideoCacheState(db, target.cacheKey);
      if (
        after &&
        after.status === "fresh" &&
        after.fetchedAt !== before?.fetchedAt
      ) {
        refreshedCount += 1;
        return;
      }
      if (content && before?.status === "stale") {
        staleFallbackCount += 1;
        return;
      }
      failedCount += 1;
    },
    WARMUP_CONCURRENCY,
  );

  const finishedAt = Date.now();
  const usage = await readUsageSummary(db, startedAt);
  const status =
    failedCount > 0
      ? refreshedCount > 0 || skippedFreshCount > 0 || staleFallbackCount > 0
        ? "partial"
        : "failed"
      : refreshedCount > 0 || skippedFreshCount > 0 || staleFallbackCount > 0
        ? "success"
        : "skipped";
  const run = await writeWarmupRun(db, {
    source,
    status,
    targetCount: targets.length,
    skippedFreshCount,
    refreshedCount,
    failedCount,
    staleFallbackCount,
    apiCalls: usage.apiCalls,
    quotaUnits: usage.quotaUnits,
    durationMs: Math.max(0, finishedAt - startedAt),
    startedAt,
    finishedAt,
    error: status === "failed" ? "all_targets_failed" : null,
  });
  await writeSetting(db, "youtube_warmup_last_run", String(run.finishedAt));
  return run;
};

export const runScheduledYouTubeWarmup = (env: Env) =>
  runYouTubeWarmup(env, "scheduled");

export const getYouTubeWarmupStatus = async (
  db: YouTubeWarmupDb,
  windowHours: number,
): Promise<YouTubeWarmupStatusSummary> => {
  const timestamp = Date.now();
  const settings = await readYouTubeWarmupSettings(db);
  const targets = await readYouTubeWarmupTargets(db, settings);
  const quotaSince = timestamp - WARMUP_QUOTA_WINDOW_HOURS * 60 * 60_000;
  const [usage, recentRuns] = await Promise.all([
    readUsageSummary(db, quotaSince),
    readWarmupRuns(db, timestamp - windowHours * 60 * 60_000, 20),
  ]);
  const official = targets.filter((target) => target.source === "official").length;
  const kirinuki = targets.filter((target) => target.source === "kirinuki").length;

  return {
    settings,
    quota: {
      limit: settings.dailyQuotaUnits,
      used: usage.quotaUnits,
      remaining: Math.max(0, settings.dailyQuotaUnits - usage.quotaUnits),
      windowHours: WARMUP_QUOTA_WINDOW_HOURS,
      since: quotaSince,
    },
    targets: {
      total: targets.length,
      official,
      kirinuki,
    },
    latestRun: recentRuns[0] ?? null,
    recentRuns,
  };
};
