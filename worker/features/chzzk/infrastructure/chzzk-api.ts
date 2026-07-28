import type {
  CachedChzzkClips,
  CachedChzzkVideos,
  CachedLiveStatus,
  LiveStatusDebug,
} from "../../../platform/types";
import { WORKER_CACHE_POLICY } from "../../../platform/cache-policy";
import { pMap } from "../../../platform/http-helpers";

const LIVE_STATUS_CACHE = new Map<string, CachedLiveStatus>();
const LIVE_STATUS_TTL_MS = 60_000;

const CHZZK_VIDEOS_CACHE = new Map<string, CachedChzzkVideos>();
const CHZZK_CLIPS_CACHE = new Map<string, CachedChzzkClips>();
const CHZZK_VIDEOS_IN_FLIGHT = new Map<
  string,
  Promise<OriginResult<ChzzkVideosContent>>
>();
const CHZZK_CLIPS_IN_FLIGHT = new Map<
  string,
  Promise<OriginResult<ChzzkClipsContent>>
>();

const CHZZK_BATCH_CONCURRENCY = 6;
const CHZZK_CACHE_READ_CHUNK_SIZE = 50;
const CHZZK_CACHE_WRITE_CHUNK_SIZE = 10;
const CHZZK_CACHE_VALUE_MAX_BYTES = 512_000;
const CHZZK_ERROR_DETAIL_MAX_LENGTH = 500;

type ChzzkCacheDb = Pick<D1Database, "prepare">;
type ChzzkCacheType = "vods" | "clips";
type ChzzkCacheStatus = "fresh" | "stale" | "expired";
type ChzzkVideosContent = NonNullable<CachedChzzkVideos["content"]>;
type ChzzkClipsContent = NonNullable<CachedChzzkClips["content"]>;

type ChzzkCacheRow = {
  key: string;
  type: ChzzkCacheType;
  value: string;
  fetched_at: number | string;
  expires_at: number | string;
  stale_until: number | string;
  last_status: number | string | null;
  last_error: string | null;
};

type CacheWriteRow = {
  key: string;
  type: ChzzkCacheType;
  value: string;
  fetchedAt: number;
  expiresAt: number;
  staleUntil: number;
  lastStatus: number | null;
  lastError: string | null;
};

type CacheCandidate<T> = {
  content: T;
  fetchedAt: number;
};

type OriginResult<T> = {
  content: T | null;
  status: number;
  error: string | null;
};

export type ChzzkVideoFetchRequest = {
  channelId: string;
  page: number;
  size: number;
  cacheable?: boolean;
};

export type ChzzkClipFetchRequest = {
  channelId: string;
  size: number;
  cacheable?: boolean;
};

export type ChzzkFetchOptions = {
  forceRefresh?: boolean;
};

const now = () => Date.now();

const toNumber = (value: number | string | null | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const truncateError = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > CHZZK_ERROR_DETAIL_MAX_LENGTH
    ? `${normalized.slice(0, CHZZK_ERROR_DETAIL_MAX_LENGTH)}...`
    : normalized;
};

const getErrorText = (error: unknown) =>
  truncateError(error instanceof Error ? error.message : String(error));

const getResponseErrorText = async (response: Response) => {
  try {
    return truncateError((await response.text()) || response.statusText);
  } catch {
    return truncateError(response.statusText);
  }
};

const getD1Results = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const results = (value as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const getVideosCacheKey = (channelId: string, page: number, size: number) =>
  `vods:${WORKER_CACHE_POLICY.chzzk.vods.version}:${channelId}:${page}:${size}`;

const getClipsCacheKey = (channelId: string, size: number) =>
  `clips:${WORKER_CACHE_POLICY.chzzk.clips.version}:${channelId}:${size}`;

const getCacheStatus = (
  row: Pick<ChzzkCacheRow, "expires_at" | "stale_until">,
  timestamp: number,
): ChzzkCacheStatus => {
  if (timestamp <= toNumber(row.expires_at)) return "fresh";
  if (timestamp <= toNumber(row.stale_until)) return "stale";
  return "expired";
};

const isChzzkVideosContent = (value: unknown): value is ChzzkVideosContent =>
  Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as { data?: unknown }).data),
  );

const isChzzkClipsContent = (value: unknown): value is ChzzkClipsContent =>
  Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as { data?: unknown }).data),
  );

export const isChzzkVideoD1CacheProfile = (page: number, size: number) =>
  (page === 0 && (size === 1 || size === 10)) ||
  (page >= 0 && page <= 2 && size === 5);

export const isChzzkClipD1CacheProfile = (size: number) => size === 10;

const readCacheRows = async (
  cacheDb: ChzzkCacheDb | undefined,
  keys: string[],
) => {
  const rows = new Map<string, ChzzkCacheRow>();
  if (!cacheDb || keys.length === 0) return rows;

  for (let offset = 0; offset < keys.length; offset += CHZZK_CACHE_READ_CHUNK_SIZE) {
    const chunk = keys.slice(offset, offset + CHZZK_CACHE_READ_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    try {
      const result = await cacheDb
        .prepare(
          `SELECT key, type, value, fetched_at, expires_at, stale_until,
                  last_status, last_error
           FROM chzzk_api_cache
           WHERE key IN (${placeholders})`,
        )
        .bind(...chunk)
        .all<ChzzkCacheRow>();
      for (const row of getD1Results<ChzzkCacheRow>(result)) {
        rows.set(row.key, row);
      }
    } catch (error) {
      console.warn("Failed to read CHZZK API cache", error);
    }
  }

  return rows;
};

const writeCacheRows = async (
  cacheDb: ChzzkCacheDb | undefined,
  rows: CacheWriteRow[],
) => {
  if (!cacheDb || rows.length === 0) return;

  for (let offset = 0; offset < rows.length; offset += CHZZK_CACHE_WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(offset, offset + CHZZK_CACHE_WRITE_CHUNK_SIZE);
    const valuesSql = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const bindings = chunk.flatMap((row) => [
      row.key,
      row.type,
      row.value,
      row.fetchedAt,
      row.expiresAt,
      row.staleUntil,
      row.lastStatus,
      truncateError(row.lastError),
    ]);

    try {
      await cacheDb
        .prepare(
          `INSERT INTO chzzk_api_cache (
             key, type, value, fetched_at, expires_at, stale_until,
             last_status, last_error
           )
           VALUES ${valuesSql}
           ON CONFLICT(key) DO UPDATE SET
             type = excluded.type,
             value = excluded.value,
             fetched_at = excluded.fetched_at,
             expires_at = excluded.expires_at,
             stale_until = excluded.stale_until,
             last_status = excluded.last_status,
             last_error = excluded.last_error`,
        )
        .bind(...bindings)
        .run();
    } catch (error) {
      console.warn("Failed to write CHZZK API cache", error);
    }
  }
};

const pickNewerCandidate = <T>(
  current: CacheCandidate<T> | undefined,
  candidate: CacheCandidate<T>,
) => (!current || candidate.fetchedAt > current.fetchedAt ? candidate : current);

const getOrCreateInFlight = async <T>(
  map: Map<string, Promise<T>>,
  key: string,
  fetcher: () => Promise<T>,
) => {
  const existing = map.get(key);
  if (existing) return existing;

  const request = fetcher();
  map.set(key, request);
  try {
    return await request;
  } finally {
    map.delete(key);
  }
};

export const fetchChzzkLiveStatusWithDebug = async (channelId: string) => {
  const cached = LIVE_STATUS_CACHE.get(channelId);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < LIVE_STATUS_TTL_MS) {
    return {
      content: cached.content,
      debug: {
        cacheHit: true,
        cacheAgeMs: now - cached.fetchedAt,
        fetchedAt: cached.fetchedAt,
        httpStatus: null,
        error: null,
        staleCacheUsed: false,
      } satisfies LiveStatusDebug,
    };
  }

  const url = `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`;
  const retryDelays = [0, 500];
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  let lastErrorBody: string | null = null;

  for (const delayMs of retryDelays) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://chzzk.naver.com/",
          Origin: "https://chzzk.naver.com",
        },
      });
      lastStatus = res.status;

      if (!res.ok) {
        lastError = "http_error";
        const errorBody = await res.text().catch(() => "");
        lastErrorBody = errorBody.slice(0, 1000);
        console.error(
          "Failed to fetch chzzk live status",
          channelId,
          res.status,
          errorBody.slice(0, 500),
        );
        if ([500, 502, 503, 504].includes(res.status)) {
          continue;
        }
        break;
      }

      const data = (await res.json()) as {
        code: number;
        content: CachedLiveStatus["content"];
      };

      const content = data?.content ?? null;
      LIVE_STATUS_CACHE.set(channelId, {
        fetchedAt: Date.now(),
        content,
      });
      return {
        content,
        debug: {
          cacheHit: false,
          cacheAgeMs: null,
          fetchedAt: Date.now(),
          httpStatus: res.status,
          error: null,
          staleCacheUsed: false,
        } satisfies LiveStatusDebug,
      };
    } catch (error) {
      lastError = "network_error";
      console.error("Failed to fetch chzzk live status", channelId, error);
    }
  }

  return {
    content: cached?.content ?? null,
    debug: {
      cacheHit: false,
      cacheAgeMs: null,
      fetchedAt: cached?.fetchedAt ?? null,
      httpStatus: lastStatus,
      error: lastError,
      staleCacheUsed: Boolean(cached),
      errorBody: lastErrorBody,
    } as LiveStatusDebug & { errorBody?: string | null },
  };
};

export const fetchChzzkLiveStatus = async (channelId: string) => {
  const result = await fetchChzzkLiveStatusWithDebug(channelId);
  return result.content;
};

type CachedBatchRequest = {
  channelId: string;
  cacheKey: string;
  cacheable: boolean;
};

type FetchCachedBatchParams<T> = {
  requests: CachedBatchRequest[];
  cacheDb?: ChzzkCacheDb;
  cacheType: ChzzkCacheType;
  cache: Map<string, { fetchedAt: number; content: T | null }>;
  freshTtlMs: number;
  staleTtlMs: number;
  forceRefresh: boolean;
  isContent: (value: unknown) => value is T;
  fetchOrigin: (request: CachedBatchRequest) => Promise<OriginResult<T>>;
};

const fetchCachedBatch = async <T>({
  requests,
  cacheDb,
  cacheType,
  cache,
  freshTtlMs,
  staleTtlMs,
  forceRefresh,
  isContent,
  fetchOrigin,
}: FetchCachedBatchParams<T>) => {
  const uniqueRequests = Array.from(
    new Map(requests.map((request) => [request.cacheKey, request])).values(),
  );
  const timestamp = now();
  const resolved = new Map<string, T | null>();
  const candidates = new Map<string, CacheCandidate<T>>();

  for (const request of uniqueRequests) {
    const cached = cache.get(request.cacheKey);
    if (!cached?.content) continue;

    const ageMs = timestamp - cached.fetchedAt;
    if (ageMs <= staleTtlMs) {
      candidates.set(request.cacheKey, {
        content: cached.content,
        fetchedAt: cached.fetchedAt,
      });
    }
    if (!forceRefresh && ageMs <= freshTtlMs) {
      resolved.set(request.cacheKey, cached.content);
    }
  }

  const d1Targets = uniqueRequests.filter(
    (request) => request.cacheable && !resolved.has(request.cacheKey),
  );
  const cacheRows = await readCacheRows(
    cacheDb,
    d1Targets.map((request) => request.cacheKey),
  );

  for (const request of d1Targets) {
    const row = cacheRows.get(request.cacheKey);
    if (!row || row.type !== cacheType) continue;

    try {
      const content = JSON.parse(row.value) as unknown;
      if (!isContent(content)) {
        console.warn("Invalid CHZZK API cache value", request.cacheKey);
        continue;
      }

      const status = getCacheStatus(row, timestamp);
      if (status !== "expired") {
        const candidate = {
          content,
          fetchedAt: toNumber(row.fetched_at, timestamp),
        };
        candidates.set(
          request.cacheKey,
          pickNewerCandidate(candidates.get(request.cacheKey), candidate),
        );
      }
      if (!forceRefresh && status === "fresh") {
        cache.set(request.cacheKey, {
          fetchedAt: toNumber(row.fetched_at, timestamp),
          content,
        });
        resolved.set(request.cacheKey, content);
      }
    } catch (error) {
      console.warn("Failed to parse CHZZK API cache value", request.cacheKey, error);
    }
  }

  const originTargets = uniqueRequests.filter(
    (request) => !resolved.has(request.cacheKey),
  );
  const writes = await pMap(
    originTargets,
    async (request): Promise<CacheWriteRow | null> => {
      const result = await fetchOrigin(request);
      if (result.content) {
        const fetchedAt = now();
        cache.set(request.cacheKey, {
          fetchedAt,
          content: result.content,
        });
        resolved.set(request.cacheKey, result.content);

        if (!request.cacheable) return null;
        const value = JSON.stringify(result.content);
        const valueBytes = new TextEncoder().encode(value).byteLength;
        if (valueBytes > CHZZK_CACHE_VALUE_MAX_BYTES) {
          console.warn("Skipped oversized CHZZK API cache value", {
            key: request.cacheKey,
            bytes: valueBytes,
          });
          return null;
        }
        return {
          key: request.cacheKey,
          type: cacheType,
          value,
          fetchedAt,
          expiresAt: fetchedAt + freshTtlMs,
          staleUntil: fetchedAt + staleTtlMs,
          lastStatus: result.status,
          lastError: null,
        };
      }

      const fallback = candidates.get(request.cacheKey);
      resolved.set(request.cacheKey, fallback?.content ?? null);
      if (fallback) {
        console.warn("Using stale CHZZK API cache after origin failure", {
          key: request.cacheKey,
          status: result.status,
          error: result.error,
        });
      }

      const existing = cacheRows.get(request.cacheKey);
      if (!request.cacheable || !existing || existing.type !== cacheType) {
        return null;
      }
      return {
        key: existing.key,
        type: existing.type,
        value: existing.value,
        fetchedAt: toNumber(existing.fetched_at),
        expiresAt: toNumber(existing.expires_at),
        staleUntil: toNumber(existing.stale_until),
        lastStatus: result.status,
        lastError: result.error,
      };
    },
    CHZZK_BATCH_CONCURRENCY,
  );

  await writeCacheRows(
    cacheDb,
    writes.filter((row): row is CacheWriteRow => row !== null),
  );

  return requests.map((request) => ({
    channelId: request.channelId,
    content: resolved.get(request.cacheKey) ?? null,
  }));
};

const fetchChzzkVideosOrigin = async (
  request: CachedBatchRequest & { page: number; size: number },
): Promise<OriginResult<ChzzkVideosContent>> => {
  const url = `https://api.chzzk.naver.com/service/v1/channels/${request.channelId}/videos?sortType=LATEST&pagingType=PAGE&page=${request.page}&size=${request.size}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const error = await getResponseErrorText(res);
      console.error("Failed to fetch chzzk videos", request.channelId, res.status);
      return { content: null, status: res.status, error };
    }

    const data = (await res.json()) as { content?: unknown };
    if (!isChzzkVideosContent(data?.content)) {
      return { content: null, status: 0, error: "invalid_content" };
    }
    return { content: data.content, status: res.status, error: null };
  } catch (error) {
    console.error("Failed to fetch chzzk videos", request.channelId, error);
    return { content: null, status: 0, error: getErrorText(error) };
  }
};

const fetchChzzkClipsOrigin = async (
  request: CachedBatchRequest & { size: number },
): Promise<OriginResult<ChzzkClipsContent>> => {
  const url = `https://api.chzzk.naver.com/service/v1/channels/${request.channelId}/clips?size=${request.size}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const error = await getResponseErrorText(res);
      console.error("Failed to fetch chzzk clips", request.channelId, res.status);
      return { content: null, status: res.status, error };
    }

    const data = (await res.json()) as { content?: unknown };
    if (!isChzzkClipsContent(data?.content)) {
      return { content: null, status: 0, error: "invalid_content" };
    }
    return { content: data.content, status: res.status, error: null };
  } catch (error) {
    console.error("Failed to fetch chzzk clips", request.channelId, error);
    return { content: null, status: 0, error: getErrorText(error) };
  }
};

export const fetchChzzkVideosBatch = async (
  requests: ChzzkVideoFetchRequest[],
  cacheDb?: ChzzkCacheDb,
  options: ChzzkFetchOptions = {},
) => {
  const normalized = requests.map((request) => ({
    ...request,
    cacheKey: getVideosCacheKey(request.channelId, request.page, request.size),
    cacheable: Boolean(cacheDb && request.cacheable),
  }));
  const originRequests = new Map(normalized.map((request) => [request.cacheKey, request]));

  return fetchCachedBatch<ChzzkVideosContent>({
    requests: normalized,
    cacheDb,
    cacheType: "vods",
    cache: CHZZK_VIDEOS_CACHE,
    freshTtlMs: WORKER_CACHE_POLICY.chzzk.vods.freshTtlMs,
    staleTtlMs: WORKER_CACHE_POLICY.chzzk.vods.staleTtlMs,
    forceRefresh: options.forceRefresh === true,
    isContent: isChzzkVideosContent,
    fetchOrigin: (request) => {
      const originRequest = originRequests.get(request.cacheKey)!;
      return getOrCreateInFlight(
        CHZZK_VIDEOS_IN_FLIGHT,
        request.cacheKey,
        () => fetchChzzkVideosOrigin(originRequest),
      );
    },
  });
};

export const fetchChzzkClipsBatch = async (
  requests: ChzzkClipFetchRequest[],
  cacheDb?: ChzzkCacheDb,
  options: ChzzkFetchOptions = {},
) => {
  const normalized = requests.map((request) => ({
    ...request,
    cacheKey: getClipsCacheKey(request.channelId, request.size),
    cacheable: Boolean(cacheDb && request.cacheable),
  }));
  const originRequests = new Map(normalized.map((request) => [request.cacheKey, request]));

  return fetchCachedBatch<ChzzkClipsContent>({
    requests: normalized,
    cacheDb,
    cacheType: "clips",
    cache: CHZZK_CLIPS_CACHE,
    freshTtlMs: WORKER_CACHE_POLICY.chzzk.clips.freshTtlMs,
    staleTtlMs: WORKER_CACHE_POLICY.chzzk.clips.staleTtlMs,
    forceRefresh: options.forceRefresh === true,
    isContent: isChzzkClipsContent,
    fetchOrigin: (request) => {
      const originRequest = originRequests.get(request.cacheKey)!;
      return getOrCreateInFlight(
        CHZZK_CLIPS_IN_FLIGHT,
        request.cacheKey,
        () => fetchChzzkClipsOrigin(originRequest),
      );
    },
  });
};

export const fetchChzzkVideos = async (
  channelId: string,
  page = 0,
  size = 24,
  cacheDb?: ChzzkCacheDb,
  options: ChzzkFetchOptions = {},
): Promise<CachedChzzkVideos["content"]> => {
  const [result] = await fetchChzzkVideosBatch(
    [
      {
        channelId,
        page,
        size,
        cacheable: isChzzkVideoD1CacheProfile(page, size),
      },
    ],
    cacheDb,
    options,
  );
  return result?.content ?? null;
};

export const fetchChzzkClips = async (
  channelId: string,
  size = 30,
  cacheDb?: ChzzkCacheDb,
  options: ChzzkFetchOptions = {},
): Promise<CachedChzzkClips["content"]> => {
  const [result] = await fetchChzzkClipsBatch(
    [
      {
        channelId,
        size,
        cacheable: isChzzkClipD1CacheProfile(size),
      },
    ],
    cacheDb,
    options,
  );
  return result?.content ?? null;
};

export const clearChzzkServiceCachesForTests = () => {
  CHZZK_VIDEOS_CACHE.clear();
  CHZZK_CLIPS_CACHE.clear();
  CHZZK_VIDEOS_IN_FLIGHT.clear();
  CHZZK_CLIPS_IN_FLIGHT.clear();
};
