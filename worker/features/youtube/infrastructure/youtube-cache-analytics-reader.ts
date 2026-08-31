import type {
  YouTubeCacheActiveOrigin,
  YouTubeCacheAnalyticsDto,
  YouTubeCacheAnalyticsSliceDto,
} from "@contracts/youtube";

const DATASET = "otw_youtube_cache_events";
const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
const HOUR_MS = 60 * 60_000;
const MAX_OBSERVED_CLOCK_SKEW_MS = 60_000;
const SOURCES = ["official", "kirinuki"] as const;
const ORIGINS = ["demand", "manual"] as const;

type AnalyticsSource = (typeof SOURCES)[number];
type AnalyticsEvent = "youtube.cache.request" | "youtube.cache.refresh";
type AnalyticsOutcome =
  | "served_non_blocking"
  | "served_after_refresh"
  | "empty"
  | "baseline"
  | "changed"
  | "unchanged"
  | string;

type AnalyticsRow = {
  event: AnalyticsEvent;
  source: AnalyticsSource;
  origin: YouTubeCacheActiveOrigin;
  outcome: AnalyticsOutcome;
  event_count: number;
  target_count: number;
  available_count: number;
  refresh_count: number;
  observed_since_unix: number;
};

type CacheEntry = {
  expiresAt: number;
  value: YouTubeCacheAnalyticsDto;
};

const analyticsCache = new Map<string, CacheEntry>();

const emptySlice = (): YouTubeCacheAnalyticsSliceDto => ({
  requestCount: 0,
  nonBlockingServeCount: 0,
  requestedTargetCount: 0,
  immediateAvailableCount: 0,
  refreshCount: 0,
  baselineCount: 0,
  changedCount: 0,
  unchangedCount: 0,
});

const partial = (
  status: "unconfigured" | "unavailable",
  generatedAt: string,
  windowHours: number,
): YouTubeCacheAnalyticsDto => ({
  status,
  generatedAt,
  windowHours,
  observedSince: null,
  coverageHours: null,
  schemaVersion: "v2",
  sampled: true,
  summary: emptySlice(),
  bySource: SOURCES.map((source) => ({ source, ...emptySlice() })),
  byOrigin: ORIGINS.map((origin) => ({ origin, ...emptySlice() })),
  reasonCode:
    status === "unconfigured"
      ? "analytics_unconfigured"
      : "analytics_unavailable",
});

const finiteNonNegative = (value: unknown) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : null;
};

const parseRow = (value: unknown): AnalyticsRow | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    (row.event !== "youtube.cache.request" &&
      row.event !== "youtube.cache.refresh") ||
    (row.source !== "official" && row.source !== "kirinuki") ||
    (row.origin !== "demand" && row.origin !== "manual") ||
    typeof row.outcome !== "string"
  ) {
    return null;
  }
  const eventCount = finiteNonNegative(row.event_count);
  const targetCount = finiteNonNegative(row.target_count);
  const availableCount = finiteNonNegative(row.available_count);
  const refreshCount = finiteNonNegative(row.refresh_count);
  const observedSinceUnix = finiteNonNegative(row.observed_since_unix);
  if (
    eventCount === null ||
    targetCount === null ||
    availableCount === null ||
    refreshCount === null ||
    observedSinceUnix === null
  ) {
    return null;
  }
  return {
    event: row.event,
    source: row.source,
    origin: row.origin,
    outcome: row.outcome,
    event_count: eventCount,
    target_count: targetCount,
    available_count: availableCount,
    refresh_count: refreshCount,
    observed_since_unix: observedSinceUnix,
  };
};

const addRow = (slice: YouTubeCacheAnalyticsSliceDto, row: AnalyticsRow) => {
  if (row.event === "youtube.cache.request") {
    slice.requestCount += row.event_count;
    slice.requestedTargetCount += row.target_count;
    slice.immediateAvailableCount += row.available_count;
    if (row.outcome === "served_non_blocking") {
      slice.nonBlockingServeCount += row.event_count;
    }
    return;
  }
  slice.refreshCount += row.refresh_count;
  if (row.outcome === "baseline") slice.baselineCount += row.event_count;
  if (row.outcome === "changed") slice.changedCount += row.event_count;
  if (row.outcome === "unchanged") slice.unchangedCount += row.event_count;
};

const aggregate = (
  rows: readonly AnalyticsRow[],
  generatedAt: string,
  windowHours: number,
): YouTubeCacheAnalyticsDto => {
  const summary = emptySlice();
  const bySource = new Map(
    SOURCES.map((source) => [source, { source, ...emptySlice() }] as const),
  );
  const byOrigin = new Map(
    ORIGINS.map((origin) => [origin, { origin, ...emptySlice() }] as const),
  );
  for (const row of rows) {
    addRow(summary, row);
    addRow(bySource.get(row.source)!, row);
    addRow(byOrigin.get(row.origin)!, row);
  }
  const generatedAtMs = Date.parse(generatedAt);
  const rawObservedSinceMs = rows.length
    ? Math.min(...rows.map((row) => row.observed_since_unix * 1000))
    : null;
  if (
    !Number.isFinite(generatedAtMs) ||
    (rawObservedSinceMs !== null &&
      rawObservedSinceMs > generatedAtMs + MAX_OBSERVED_CLOCK_SKEW_MS)
  ) {
    return partial("unavailable", generatedAt, windowHours);
  }
  // Analytics Engine and the Worker can differ slightly in clock time. Keep a
  // tolerated future event from producing a future-facing observation window.
  const observedSinceMs =
    rawObservedSinceMs === null
      ? null
      : Math.min(rawObservedSinceMs, generatedAtMs);
  const observedSince =
    observedSinceMs === null
      ? null
      : new Date(observedSinceMs).toISOString();
  const coverageHours =
    observedSinceMs === null
      ? 0
      : Math.min(
          windowHours,
          Math.max(0, (generatedAtMs - observedSinceMs) / HOUR_MS),
        );
  return {
    status: "available",
    generatedAt,
    windowHours,
    observedSince,
    coverageHours,
    schemaVersion: "v2",
    sampled: true,
    summary,
    bySource: Array.from(bySource.values()),
    byOrigin: Array.from(byOrigin.values()),
    reasonCode: null,
  };
};

export const buildYouTubeCacheAnalyticsSql = (windowHours: number) => {
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > 168) {
    throw new Error("windowHours must be an integer between 1 and 168");
  }
  return `SELECT
    blob1 AS event,
    blob2 AS source,
    blob3 AS origin,
    blob5 AS outcome,
    toUnixTimestamp(min(timestamp)) AS observed_since_unix,
    sum(_sample_interval) AS event_count,
    sum(double3 * _sample_interval) AS target_count,
    sum(double4 * _sample_interval) AS available_count,
    sum(double5 * _sample_interval) AS refresh_count
  FROM ${DATASET}
  WHERE timestamp >= NOW() - INTERVAL '${windowHours}' HOUR
    AND blob6 = 'v2'
    AND blob1 IN ('youtube.cache.request', 'youtube.cache.refresh')
    AND blob3 IN ('demand', 'manual')
  GROUP BY blob1, blob2, blob3, blob5
  FORMAT JSON`;
};

export class CloudflareYouTubeCacheAnalyticsReader {
  private readonly accountId: string | undefined;
  private readonly token: string | undefined;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;

  constructor(
    accountId: string | undefined,
    token: string | undefined,
    fetcher: typeof fetch = fetch,
    now: () => number = Date.now,
  ) {
    this.accountId = accountId;
    this.token = token;
    this.fetcher = fetcher;
    this.now = now;
  }

  async read(windowHours: number): Promise<YouTubeCacheAnalyticsDto> {
    const generatedAt = new Date(this.now()).toISOString();
    const accountId = this.accountId?.trim();
    const token = this.token?.trim();
    if (!accountId || !token) {
      return partial("unconfigured", generatedAt, windowHours);
    }

    let sql: string;
    try {
      sql = buildYouTubeCacheAnalyticsSql(windowHours);
    } catch {
      return partial("unavailable", generatedAt, windowHours);
    }
    const cacheKey = `${accountId}:${windowHours}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.value;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`;
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: sql,
        signal: controller.signal,
      });
      if (!response.ok) {
        return partial("unavailable", generatedAt, windowHours);
      }
      const payload = (await response.json()) as { data?: unknown };
      if (!Array.isArray(payload.data)) {
        return partial("unavailable", generatedAt, windowHours);
      }
      const rows = payload.data.map(parseRow);
      if (rows.some((row) => row === null)) {
        return partial("unavailable", generatedAt, windowHours);
      }
      const value = aggregate(
        rows as AnalyticsRow[],
        new Date(this.now()).toISOString(),
        windowHours,
      );
      analyticsCache.set(cacheKey, {
        expiresAt: this.now() + CACHE_TTL_MS,
        value,
      });
      return value;
    } catch {
      return partial("unavailable", generatedAt, windowHours);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const clearYouTubeCacheAnalyticsReaderCacheForTests = () => {
  analyticsCache.clear();
};
