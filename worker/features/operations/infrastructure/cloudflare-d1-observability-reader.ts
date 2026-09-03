import type {
  D1ObservabilityDailyMetricDto,
  D1ObservabilityReasonCode,
  D1ObservabilityResponseDto,
  D1ObservabilityWriteWorkloadDto,
} from "@contracts/operations";

const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_SECONDS = 5 * 60;
const WINDOW_DAYS = 7 as const;
const DAY_MS = 24 * 60 * 60_000;
const FREE_ROWS_READ_LIMIT = 5_000_000;
const FREE_ROWS_WRITTEN_LIMIT = 100_000;

export const D1_OBSERVABILITY_GRAPHQL = `query D1OperationsObservability(
  $accountTag: string,
  $dailyFilter: ZoneWorkersRequestsFilter_InputObject,
  $queryFilter: ZoneWorkersRequestsFilter_InputObject
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      daily: d1AnalyticsAdaptiveGroups(
        limit: 10000
        filter: $dailyFilter
      ) {
        sum {
          readQueries
          writeQueries
          rowsRead
          rowsWritten
        }
        dimensions {
          datetimeHour
          databaseId
        }
      }
      queries: d1QueriesAdaptiveGroups(
        limit: 50
        filter: $queryFilter
        orderBy: [sum_rowsWritten_DESC]
      ) {
        sum {
          rowsWritten
        }
        count
        dimensions {
          query
        }
      }
    }
  }
}`;

type CacheLike = Pick<Cache, "match" | "put">;

type GraphqlDailyRow = {
  sum?: Record<string, unknown>;
  dimensions?: Record<string, unknown>;
};

type GraphqlQueryRow = {
  sum?: Record<string, unknown>;
  count?: unknown;
  dimensions?: Record<string, unknown>;
};

type WorkloadKey = D1ObservabilityWriteWorkloadDto["key"];

const workloadLabels: Record<WorkloadKey, string> = {
  search_index: "검색 인덱스 재구축",
  scheduled_operations: "예약 작업 실행 기록",
  youtube_usage: "YouTube 사용 로그",
  x_collection: "X 수집·캐시",
  naver_collection: "네이버 수집·검사",
  retention: "보존 기간 정리",
  maintenance: "마이그레이션·관리 작업",
  other: "기타 D1 쿼리",
};

const getDefaultCache = (): CacheLike | null => {
  if (typeof caches === "undefined" || !caches.default) return null;
  return caches.default;
};

const toNonNegativeNumber = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0
    ? number
    : null;
};

const roundPercent = (value: number, limit: number) =>
  limit > 0 ? Math.round((value / limit) * 1_000) / 10 : 0;

const utcDay = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

const getWindowDays = (now: number) =>
  Array.from(
    { length: WINDOW_DAYS },
    (_, index) => utcDay(now - (WINDOW_DAYS - 1 - index) * DAY_MS),
  );

const emptyResponse = (
  status: "unconfigured" | "unavailable",
  generatedAt: string,
  reasonCode: D1ObservabilityReasonCode,
): D1ObservabilityResponseDto => ({
  status,
  generatedAt,
  cacheAgeSeconds: null,
  timezone: "UTC",
  windowDays: WINDOW_DAYS,
  currentDay: null,
  daily: [],
  topWriteWorkloads: [],
  reasonCode,
});

const classifyWriteQuery = (query: string): WorkloadKey => {
  const normalized = query.toLowerCase().replaceAll("`", "").replace(/\s+/g, " ");
  if (
    /\b(create|alter|drop)\s+(table|index)\b/.test(normalized) ||
    normalized.includes("d1_migrations")
  ) {
    return "maintenance";
  }
  if (
    normalized.includes("music_search_grams") ||
    normalized.includes("music_search_gram_stats") ||
    normalized.includes("music_search_documents")
  ) {
    return "search_index";
  }
  if (
    /\b(vacuum|pragma optimize)\b/.test(normalized) ||
    (/\bdelete from\b/.test(normalized) &&
      /\b(created_at|finished_at|checked_at|updated_at)\s*</.test(normalized))
  ) {
    return "retention";
  }
  if (
    normalized.includes("youtube_api_usage_events") ||
    normalized.includes("youtube_api_usage_contexts") ||
    normalized.includes("youtube_warmup_runs")
  ) {
    return "youtube_usage";
  }
  if (
    normalized.includes("x_posts") ||
    normalized.includes("x_post_facts") ||
    normalized.includes("x_api_") ||
    normalized.includes("x_collection_runs") ||
    normalized.includes("x_post_sources")
  ) {
    return "x_collection";
  }
  if (
    normalized.includes("naver_cafe_posts") ||
    normalized.includes("naver_cafe_source_checks") ||
    normalized.includes("naver_cafe_usage_daily")
  ) {
    return "naver_collection";
  }
  if (
    normalized.includes("scheduled_job_runs") ||
    normalized.includes("scheduled_job_items") ||
    normalized.includes("scheduled_outbox") ||
    normalized.includes("scheduled_usage_daily")
  ) {
    return "scheduled_operations";
  }
  return "other";
};

const parseDailyRows = (
  rows: unknown,
  now: number,
): D1ObservabilityDailyMetricDto[] | null => {
  if (!Array.isArray(rows)) return null;
  const parsed = new Map<string, D1ObservabilityDailyMetricDto>();
  for (const value of rows) {
    if (!value || typeof value !== "object") return null;
    const row = value as GraphqlDailyRow;
    const datetimeHour = row.dimensions?.datetimeHour;
    const readQueries = toNonNegativeNumber(row.sum?.readQueries);
    const writeQueries = toNonNegativeNumber(row.sum?.writeQueries);
    const rowsRead = toNonNegativeNumber(row.sum?.rowsRead);
    const rowsWritten = toNonNegativeNumber(row.sum?.rowsWritten);
    if (
      typeof datetimeHour !== "string" || !Number.isFinite(Date.parse(datetimeHour)) ||
      readQueries === null || writeQueries === null || rowsRead === null ||
      rowsWritten === null
    ) {
      return null;
    }
    const day = utcDay(Date.parse(datetimeHour));
    const current = parsed.get(day) ?? {
      day,
      readQueries: 0,
      writeQueries: 0,
      rowsRead: 0,
      rowsWritten: 0,
    };
    current.readQueries += readQueries;
    current.writeQueries += writeQueries;
    current.rowsRead += rowsRead;
    current.rowsWritten += rowsWritten;
    parsed.set(day, current);
  }
  return getWindowDays(now).map((day) =>
    parsed.get(day) ?? {
      day,
      readQueries: 0,
      writeQueries: 0,
      rowsRead: 0,
      rowsWritten: 0,
    }
  );
};

const parseWorkloads = (rows: unknown): D1ObservabilityWriteWorkloadDto[] | null => {
  if (!Array.isArray(rows)) return null;
  const aggregates = new Map<WorkloadKey, { rowsWritten: number; queryCount: number }>();
  for (const value of rows) {
    if (!value || typeof value !== "object") return null;
    const row = value as GraphqlQueryRow;
    const query = row.dimensions?.query;
    const rowsWritten = toNonNegativeNumber(row.sum?.rowsWritten);
    const queryCount = toNonNegativeNumber(row.count);
    if (typeof query !== "string" || rowsWritten === null || queryCount === null) {
      return null;
    }
    if (rowsWritten === 0) continue;
    const key = classifyWriteQuery(query);
    const current = aggregates.get(key) ?? { rowsWritten: 0, queryCount: 0 };
    current.rowsWritten += rowsWritten;
    current.queryCount += queryCount;
    aggregates.set(key, current);
  }
  const totalRows = Array.from(aggregates.values()).reduce(
    (sum, item) => sum + item.rowsWritten,
    0,
  );
  return Array.from(aggregates.entries())
    .map(([key, value]) => ({
      key,
      label: workloadLabels[key],
      ...value,
      sharePercent: totalRows > 0
        ? Math.round((value.rowsWritten / totalRows) * 1_000) / 10
        : 0,
    }))
    .sort((left, right) => right.rowsWritten - left.rowsWritten)
    .slice(0, 5);
};

const parsePayload = (
  payload: unknown,
  now: number,
): D1ObservabilityResponseDto | null => {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const data = body.data;
  if (!data || typeof data !== "object") return null;
  const viewer = (data as Record<string, unknown>).viewer;
  if (!viewer || typeof viewer !== "object") return null;
  const accounts = (viewer as Record<string, unknown>).accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) return null;
  const account = accounts[0];
  if (!account || typeof account !== "object") return null;
  const daily = parseDailyRows((account as Record<string, unknown>).daily, now);
  const topWriteWorkloads = parseWorkloads(
    (account as Record<string, unknown>).queries,
  );
  if (!daily || !topWriteWorkloads) return null;
  const today = daily.at(-1);
  if (!today) return null;
  return {
    status: "available",
    generatedAt: new Date(now).toISOString(),
    cacheAgeSeconds: 0,
    timezone: "UTC",
    windowDays: WINDOW_DAYS,
    currentDay: {
      ...today,
      rowsReadLimit: FREE_ROWS_READ_LIMIT,
      rowsWrittenLimit: FREE_ROWS_WRITTEN_LIMIT,
      rowsReadPercent: roundPercent(today.rowsRead, FREE_ROWS_READ_LIMIT),
      rowsWrittenPercent: roundPercent(
        today.rowsWritten,
        FREE_ROWS_WRITTEN_LIMIT,
      ),
    },
    daily,
    topWriteWorkloads,
  };
};

const hasPermissionError = (payload: unknown) => {
  if (!payload || typeof payload !== "object") return false;
  const errors = (payload as Record<string, unknown>).errors;
  return Array.isArray(errors) && errors.some((error) =>
    error && typeof error === "object" &&
    /auth|permission|access denied|unauthorized|forbidden/i.test(
      String((error as Record<string, unknown>).message ?? ""),
    )
  );
};

const sanitizeRuntimeErrorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : "unknown")
    .replace(/[A-Za-z0-9._~-]{20,}/g, "[redacted]")
    .slice(0, 160);

export class CloudflareD1ObservabilityReader {
  private readonly accountId: string | undefined;
  private readonly databaseId: string | undefined;
  private readonly token: string | undefined;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly cache: CacheLike | null;

  constructor(
    accountId: string | undefined,
    databaseId: string | undefined,
    token: string | undefined,
    fetcher: typeof fetch = fetch,
    now: () => number = Date.now,
    cache: CacheLike | null = getDefaultCache(),
  ) {
    this.accountId = accountId;
    this.databaseId = databaseId;
    this.token = token;
    this.fetcher = fetcher;
    this.now = now;
    this.cache = cache;
  }

  async read7Days(): Promise<D1ObservabilityResponseDto> {
    const now = this.now();
    const generatedAt = new Date(now).toISOString();
    const accountId = this.accountId?.trim();
    const databaseId = this.databaseId?.trim();
    const token = this.token?.trim();
    if (!accountId || !databaseId || !token) {
      return emptyResponse("unconfigured", generatedAt, "token_unconfigured");
    }

    const cacheKey = new Request(
      `https://operations-cache.internal/d1-observability/${encodeURIComponent(databaseId)}?window=7d`,
    );
    if (this.cache) {
      try {
        const cached = await this.cache.match(cacheKey);
        if (cached) {
          const value = await cached.json() as D1ObservabilityResponseDto;
          if (value.status === "available") {
            const cachedAt = Date.parse(value.generatedAt);
            return {
              ...value,
              cacheAgeSeconds: Number.isFinite(cachedAt)
                ? Math.max(0, Math.floor((now - cachedAt) / 1_000))
                : null,
            };
          }
        }
      } catch {
        // Cache failure must not hide live Cloudflare telemetry.
      }
    }

    const startDay = utcDay(now - (WINDOW_DAYS - 1) * DAY_MS);
    const startAt = `${startDay}T00:00:00.000Z`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher.call(
        globalThis,
        "https://api.cloudflare.com/client/v4/graphql",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operationName: "D1OperationsObservability",
            query: D1_OBSERVABILITY_GRAPHQL,
            variables: {
              accountTag: accountId,
              dailyFilter: {
                AND: [{
                  datetimeHour_geq: startAt,
                  datetimeHour_leq: new Date(now).toISOString(),
                  databaseId,
                }],
              },
              queryFilter: {
                AND: [{
                  datetimeHour_geq: new Date(now - DAY_MS).toISOString(),
                  datetimeHour_leq: new Date(now).toISOString(),
                  databaseId,
                }],
              },
            },
          }),
          signal: controller.signal,
        },
      );
      if (response.status === 401 || response.status === 403) {
        return emptyResponse(
          "unavailable",
          generatedAt,
          "permission_denied",
        );
      }
      if (!response.ok) {
        console.warn("cloudflare_d1_observability_upstream_response", {
          status: response.status,
        });
        return emptyResponse("unavailable", generatedAt, "upstream_error");
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return emptyResponse("unavailable", generatedAt, "invalid_response");
      }
      if (hasPermissionError(payload)) {
        return emptyResponse(
          "unavailable",
          generatedAt,
          "permission_denied",
        );
      }
      const parsed = parsePayload(payload, now);
      if (!parsed) {
        return emptyResponse("unavailable", generatedAt, "invalid_response");
      }
      if (this.cache) {
        try {
          await this.cache.put(
            cacheKey,
            Response.json(parsed, {
              headers: { "Cache-Control": `max-age=${CACHE_TTL_SECONDS}` },
            }),
          );
        } catch {
          // The live response remains authoritative when cache storage fails.
        }
      }
      return parsed;
    } catch (error) {
      console.warn("cloudflare_d1_observability_fetch_error", {
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage: sanitizeRuntimeErrorMessage(error),
      });
      return emptyResponse(
        "unavailable",
        generatedAt,
        error instanceof Error && error.name === "AbortError"
          ? "upstream_timeout"
          : "upstream_error",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const classifyD1WriteQueryForTest = classifyWriteQuery;
