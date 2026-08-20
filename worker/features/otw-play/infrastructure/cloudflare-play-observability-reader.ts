import type {
  OtwPlayAdminObservabilityDto,
  OtwPlayAdminObservabilityRouteDto,
  OtwPlayAdminObservabilitySummaryDto,
} from "@contracts/otw-play";
import type { PlayObservabilityReader } from "../application/ports/play-observability-reader";

const WINDOW_HOURS = 24 as const;
const REQUEST_TIMEOUT_MS = 5_000;

export const OTW_PLAY_OBSERVABILITY_SQL = {
  summary: `SELECT
    'summary' AS row_kind,
    '' AS row_key,
    sum(_sample_interval) AS request_count,
    sumIf(_sample_interval, double1 >= 400) AS error_count,
    sumIf(_sample_interval, blob4 = 'hit') AS cache_hit,
    sumIf(_sample_interval, blob4 = 'miss') AS cache_miss,
    sumIf(_sample_interval, blob4 = 'bypass') AS cache_bypass,
    quantileExactWeighted(0.95)(double2, _sample_interval) AS p95_duration_ms,
    sumIf(double3 * _sample_interval, double3 >= 0) AS d1_rows_read,
    countIf(double3 >= 0) AS d1_rows_read_known,
    sumIf(double4 * _sample_interval, double4 >= 0) AS d1_rows_written,
    countIf(double4 >= 0) AS d1_rows_written_known,
    0 AS event_count
  FROM otw_play_events
  WHERE timestamp >= NOW() - INTERVAL '24' HOUR AND blob3 != 'scheduled'
  FORMAT JSON`,
  routes: `SELECT
    'route' AS row_kind,
    blob2 AS row_key,
    sum(_sample_interval) AS request_count,
    sumIf(_sample_interval, double1 >= 400) AS error_count,
    sumIf(_sample_interval, blob4 = 'hit') AS cache_hit,
    sumIf(_sample_interval, blob4 = 'miss') AS cache_miss,
    sumIf(_sample_interval, blob4 = 'bypass') AS cache_bypass,
    quantileExactWeighted(0.95)(double2, _sample_interval) AS p95_duration_ms,
    sumIf(double3 * _sample_interval, double3 >= 0) AS d1_rows_read,
    countIf(double3 >= 0) AS d1_rows_read_known,
    sumIf(double4 * _sample_interval, double4 >= 0) AS d1_rows_written,
    countIf(double4 >= 0) AS d1_rows_written_known,
    0 AS event_count
  FROM otw_play_events
  WHERE timestamp >= NOW() - INTERVAL '24' HOUR AND blob3 != 'scheduled'
  GROUP BY blob2
  FORMAT JSON`,
  events: `SELECT
    'event' AS row_kind,
    blob1 AS row_key,
    0 AS request_count,
    0 AS error_count,
    0 AS cache_hit,
    0 AS cache_miss,
    0 AS cache_bypass,
    0 AS p95_duration_ms,
    0 AS d1_rows_read,
    0 AS d1_rows_read_known,
    0 AS d1_rows_written,
    0 AS d1_rows_written_known,
    sum(_sample_interval) AS event_count
  FROM otw_play_events
  WHERE timestamp >= NOW() - INTERVAL '24' HOUR AND blob11 != 'request'
  GROUP BY blob1
  FORMAT JSON`,
} as const;

type AnalyticsRow = {
  row_kind: "summary" | "route" | "event";
  row_key: string;
  request_count: number;
  error_count: number;
  cache_hit: number;
  cache_miss: number;
  cache_bypass: number;
  p95_duration_ms: number;
  d1_rows_read: number;
  d1_rows_read_known: number;
  d1_rows_written: number;
  d1_rows_written_known: number;
  event_count: number;
};

const emptySummary = (): OtwPlayAdminObservabilitySummaryDto => ({
  requestCount: 0,
  errorCount: 0,
  errorRate: 0,
  cacheHit: 0,
  cacheMiss: 0,
  cacheBypass: 0,
  p95DurationMs: null,
  d1RowsRead: null,
  d1RowsWritten: null,
});

const partial = (
  status: "unconfigured" | "unavailable",
  generatedAt: string,
): OtwPlayAdminObservabilityDto => ({
  status,
  generatedAt,
  windowHours: WINDOW_HOURS,
  summary: emptySummary(),
  routes: [],
  events: [],
  reasonCode:
    status === "unconfigured"
      ? "analytics_unconfigured"
      : "analytics_unavailable",
});

const finiteNonNegative = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0
    ? number
    : null;
};

const parseRow = (value: unknown): AnalyticsRow | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    (row.row_kind !== "summary" &&
      row.row_kind !== "route" &&
      row.row_kind !== "event") ||
    typeof row.row_key !== "string"
  ) {
    return null;
  }
  const numericKeys = [
    "request_count",
    "error_count",
    "cache_hit",
    "cache_miss",
    "cache_bypass",
    "p95_duration_ms",
    "d1_rows_read",
    "d1_rows_read_known",
    "d1_rows_written",
    "d1_rows_written_known",
    "event_count",
  ] as const;
  const numbers = Object.fromEntries(
    numericKeys.map((key) => [key, finiteNonNegative(row[key])]),
  ) as Record<(typeof numericKeys)[number], number | null>;
  if (numericKeys.some((key) => numbers[key] === null)) return null;
  return {
    row_kind: row.row_kind,
    row_key: row.row_key,
    ...numbers,
  } as AnalyticsRow;
};

const toSummary = (row: AnalyticsRow): OtwPlayAdminObservabilitySummaryDto => ({
  requestCount: row.request_count,
  errorCount: row.error_count,
  errorRate:
    row.request_count > 0 ? row.error_count / row.request_count : 0,
  cacheHit: row.cache_hit,
  cacheMiss: row.cache_miss,
  cacheBypass: row.cache_bypass,
  p95DurationMs: row.request_count > 0 ? row.p95_duration_ms : null,
  d1RowsRead: row.d1_rows_read_known > 0 ? row.d1_rows_read : null,
  d1RowsWritten:
    row.d1_rows_written_known > 0 ? row.d1_rows_written : null,
});

export class CloudflarePlayObservabilityReader
  implements PlayObservabilityReader
{
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

  async read24Hours(): Promise<OtwPlayAdminObservabilityDto> {
    const generatedAt = new Date(this.now()).toISOString();
    const accountId = this.accountId?.trim();
    const token = this.token?.trim();
    if (!accountId || !token) return partial("unconfigured", generatedAt);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`;
      const responses = await Promise.all(
        Object.values(OTW_PLAY_OBSERVABILITY_SQL).map((body) =>
          this.fetcher(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain; charset=utf-8",
          },
            body,
          signal: controller.signal,
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        return partial("unavailable", generatedAt);
      }
      const payloads = (await Promise.all(
        responses.map((response) => response.json()),
      )) as Array<{ data?: unknown }>;
      if (payloads.some((payload) => !Array.isArray(payload.data))) {
        return partial("unavailable", generatedAt);
      }
      const rows = payloads.flatMap((payload) =>
        (payload.data as unknown[]).map(parseRow),
      );
      if (rows.some((row) => row === null)) {
        return partial("unavailable", generatedAt);
      }
      const parsed = rows as AnalyticsRow[];
      const summaryRow = parsed.find(({ row_kind }) => row_kind === "summary");
      if (!summaryRow) return partial("unavailable", generatedAt);
      const routes: OtwPlayAdminObservabilityRouteDto[] = parsed
        .filter(
          (row): row is AnalyticsRow =>
            row.row_kind === "route" && row.row_key.length > 0,
        )
        .map((row) => ({ routeId: row.row_key, ...toSummary(row) }))
        .sort((left, right) => left.routeId.localeCompare(right.routeId));
      const events = parsed
        .filter(
          (row): row is AnalyticsRow =>
            row.row_kind === "event" && row.row_key.length > 0,
        )
        .map((row) => ({ event: row.row_key, count: row.event_count }))
        .sort((left, right) => left.event.localeCompare(right.event));
      return {
        status: "available",
        generatedAt,
        windowHours: WINDOW_HOURS,
        summary: toSummary(summaryRow),
        routes,
        events,
      };
    } catch {
      return partial("unavailable", generatedAt);
    } finally {
      clearTimeout(timeout);
    }
  }
}
