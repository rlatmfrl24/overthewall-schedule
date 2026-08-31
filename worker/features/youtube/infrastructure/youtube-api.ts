import type {
  CachedYouTubeVideos,
  YouTubeApiOperation,
  YouTubeCacheStatus,
  YouTubeCacheStatusResponse,
  YouTubeCacheType,
  YouTubeVideoItem,
} from "../../../platform/types";
import type { YouTubeUsageRequestOrigin } from "@contracts/youtube";
import { parseISO8601Duration } from "../../../platform/http-helpers";
import { WORKER_CACHE_POLICY } from "../../../platform/cache-policy";
import {
  reserveYouTubeQuota,
  YouTubeQuotaAdmissionError,
  type YouTubeQuotaPriority,
} from "./youtube-quota";

type YouTubeChannelDetailsResponse = {
  items?: Array<{
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
};

type YouTubePlaylistItemsResponse = {
  items?: Array<{
    contentDetails?: {
      videoId?: string;
    };
  }>;
};

type YouTubeVideosResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      publishedAt?: string;
      thumbnails?: {
        high?: { url?: string };
        default?: { url?: string };
      };
      channelId?: string;
      channelTitle?: string;
    };
    contentDetails?: {
      duration?: string;
    };
    statistics?: {
      viewCount?: string;
    };
  }>;
};

type YouTubeCacheDb = Pick<D1Database, "prepare">;

type YouTubeApiCacheRow = {
  key: string;
  type: YouTubeCacheType;
  value: string;
  fetched_at: number | string;
  expires_at: number | string;
  stale_until: number | string;
  refresh_after: number | string;
  last_status: number | string | null;
  last_error: string | null;
};

type YouTubeApiUsageRow = {
  operation: YouTubeApiOperation;
  request_origin: YouTubeUsageRequestOrigin;
  api_calls: number | string;
  quota_units: number | string;
  success_count: number | string;
  failure_count: number | string;
  rate_limit_count: number | string;
  quota_error_count: number | string;
};

type CachedPlaylistValue = { playlistId: string | null };
type CachedVideosValue = CachedYouTubeVideos["content"];
type CacheReadResult<T> = {
  row: YouTubeApiCacheRow;
  value: T;
  status: YouTubeCacheStatus;
};
type YouTubeRequestContext = {
  cacheDb?: YouTubeCacheDb;
  channelId: string;
  cacheKey: string;
  quotaPriority: YouTubeQuotaPriority;
  requestOrigin: YouTubeUsageRequestOrigin;
  signal?: AbortSignal;
  onFailure?: (failure: YouTubeRefreshFailure) => void;
};

export type YouTubeRefreshFailure = {
  status: number;
  error: string | null;
  retryAfterMs: number | null;
  quotaRejected: boolean;
};

const YOUTUBE_VIDEOS_CACHE = new Map<string, CachedYouTubeVideos>();
const YOUTUBE_VIDEOS_CACHE_POLICY =
  WORKER_CACHE_POLICY.youtube.officialChannelVideos;

const YOUTUBE_PLAYLIST_ID_CACHE = new Map<
  string,
  { fetchedAt: number; playlistId: string | null }
>();
const YOUTUBE_PLAYLIST_ID_CACHE_POLICY =
  WORKER_CACHE_POLICY.youtube.uploadsPlaylist;

const YOUTUBE_API_QUOTA_UNITS = 1;
const YOUTUBE_ERROR_DETAIL_MAX_LENGTH = 500;
const YOUTUBE_STATUS_OPERATIONS: YouTubeApiOperation[] = [
  "channels.list",
  "playlistItems.list",
  "videos.list",
];
const YOUTUBE_STATUS_TYPES: YouTubeCacheType[] = [
  "uploads_playlist",
  "channel_videos",
];
const YOUTUBE_USAGE_ORIGINS: YouTubeUsageRequestOrigin[] = [
  "demand",
  "manual",
  "scheduled",
  "legacy_unknown",
];

const now = () => Date.now();

const getPlaylistCacheKey = (channelId: string) => `playlist:${channelId}`;
export const getYouTubeVideosCacheKey = (
  channelId: string,
  maxResults: number,
) =>
  `videos:${channelId}:${maxResults}`;

const truncateError = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > YOUTUBE_ERROR_DETAIL_MAX_LENGTH
    ? `${normalized.slice(0, YOUTUBE_ERROR_DETAIL_MAX_LENGTH)}...`
    : normalized;
};

const getErrorText = (error: unknown) =>
  truncateError(error instanceof Error ? error.message : String(error));

const getResponseErrorText = async (response: Response) => {
  try {
    const text = await response.text();
    return truncateError(text || response.statusText);
  } catch {
    return truncateError(response.statusText);
  }
};

const getRetryAfterMs = (response: Response) => {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now()) : null;
};

const reportRefreshFailure = (
  context: YouTubeRequestContext | undefined,
  failure: YouTubeRefreshFailure,
) => context?.onFailure?.(failure);

const getCaughtFailure = (error: unknown): YouTubeRefreshFailure => ({
  status: error instanceof YouTubeQuotaAdmissionError ? 403 : 0,
  error: getErrorText(error),
  retryAfterMs: null,
  quotaRejected: error instanceof YouTubeQuotaAdmissionError,
});

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

const getCacheStatus = (
  row: Pick<YouTubeApiCacheRow, "expires_at" | "stale_until">,
  timestamp = now(),
): YouTubeCacheStatus => {
  if (timestamp <= toNumber(row.expires_at)) return "fresh";
  if (timestamp <= toNumber(row.stale_until)) return "stale";
  return "expired";
};

const readCacheRow = async (
  cacheDb: YouTubeCacheDb | undefined,
  key: string,
  type: YouTubeCacheType,
) => {
  if (!cacheDb) return null;

  try {
    const row = await cacheDb
      .prepare(
        `SELECT key, type, value, fetched_at, expires_at, stale_until,
                refresh_after, last_status, last_error
         FROM youtube_api_cache
         WHERE key = ? AND type = ?`,
      )
      .bind(key, type)
      .first<YouTubeApiCacheRow>();
    return row ?? null;
  } catch (error) {
    console.warn("Failed to read YouTube API cache", error);
    return null;
  }
};

const readTypedCache = async <T>(
  cacheDb: YouTubeCacheDb | undefined,
  key: string,
  type: YouTubeCacheType,
): Promise<CacheReadResult<T> | null> => {
  const row = await readCacheRow(cacheDb, key, type);
  if (!row) return null;

  try {
    return {
      row,
      value: JSON.parse(row.value) as T,
      status: getCacheStatus(row),
    };
  } catch (error) {
    console.warn("Failed to parse YouTube API cache value", key, error);
    return null;
  }
};

const writeCacheRow = async (
  cacheDb: YouTubeCacheDb | undefined,
  {
    key,
    type,
    value,
    fetchedAt,
    expiresAt,
    staleUntil,
    lastStatus,
    lastError,
  }: {
    key: string;
    type: YouTubeCacheType;
    value: unknown;
    fetchedAt: number;
    expiresAt: number;
    staleUntil: number;
    lastStatus: number | null;
    lastError: string | null;
  },
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
         `INSERT INTO youtube_api_cache (
           key, type, value, fetched_at, expires_at, stale_until,
           refresh_after, last_status, last_error
         )
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           type = excluded.type,
           value = excluded.value,
           fetched_at = excluded.fetched_at,
           expires_at = excluded.expires_at,
           stale_until = excluded.stale_until,
           refresh_after = 0,
           last_status = excluded.last_status,
           last_error = excluded.last_error`,
      )
      .bind(
        key,
        type,
        JSON.stringify(value),
        fetchedAt,
        expiresAt,
        staleUntil,
        lastStatus,
        truncateError(lastError),
      )
      .run();
  } catch (error) {
    console.warn("Failed to write YouTube API cache", error);
  }
};

const updateCacheError = async (
  cacheDb: YouTubeCacheDb | undefined,
  key: string,
  status: number,
  error: string | null,
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
        `UPDATE youtube_api_cache
         SET last_status = ?, last_error = ?
         WHERE key = ?`,
      )
      .bind(status, truncateError(error), key)
      .run();
  } catch (updateError) {
    console.warn("Failed to update YouTube API cache error", updateError);
  }
};

const writeUsageEvent = async (
  cacheDb: YouTubeCacheDb | undefined,
  {
    operation,
    channelId,
    cacheKey,
    status,
    durationMs,
    error,
    requestOrigin,
    quotaUnits = YOUTUBE_API_QUOTA_UNITS,
  }: {
    operation: YouTubeApiOperation;
    channelId: string | null;
    cacheKey: string | null;
    status: number;
    durationMs: number;
    error: string | null;
    requestOrigin: YouTubeUsageRequestOrigin;
    quotaUnits?: number;
  },
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
        `INSERT INTO youtube_api_usage_events (
           operation, channel_id, cache_key, quota_units, status,
           duration_ms, created_at, error, request_origin
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        operation,
        channelId,
        cacheKey,
        quotaUnits,
        status,
        durationMs,
        now(),
        truncateError(error),
        requestOrigin,
      )
      .run();
  } catch (insertError) {
    console.warn("Failed to write YouTube API usage event", insertError);
  }
};

const recordFetchResult = async (
  context: YouTubeRequestContext | undefined,
  operation: YouTubeApiOperation,
  startedAt: number,
  status: number,
  error: string | null,
  quotaUnits = YOUTUBE_API_QUOTA_UNITS,
) => {
  if (!context) return;
  await writeUsageEvent(context.cacheDb, {
    operation,
    channelId: context.channelId,
    cacheKey: context.cacheKey,
    status,
    durationMs: Math.max(0, now() - startedAt),
    error,
    requestOrigin: context.requestOrigin,
    quotaUnits,
  });
};

const readCachedPlaylistId = async (
  cacheDb: YouTubeCacheDb | undefined,
  cacheKey: string,
) => readTypedCache<CachedPlaylistValue>(cacheDb, cacheKey, "uploads_playlist");

const readCachedVideos = async (
  cacheDb: YouTubeCacheDb | undefined,
  cacheKey: string,
) => readTypedCache<CachedVideosValue>(cacheDb, cacheKey, "channel_videos");

const fetchYouTubeUploadsPlaylistId = async (
  channelId: string,
  apiKey: string,
  context: Omit<YouTubeRequestContext, "cacheKey">,
): Promise<string | null> => {
  const cached = YOUTUBE_PLAYLIST_ID_CACHE.get(channelId);
  const timestamp = now();

  if (
    cached &&
    timestamp - cached.fetchedAt < YOUTUBE_PLAYLIST_ID_CACHE_POLICY.freshTtlMs
  ) {
    return cached.playlistId;
  }

  const cacheKey = getPlaylistCacheKey(channelId);
  const d1Cached = await readCachedPlaylistId(context.cacheDb, cacheKey);
  if (d1Cached?.status === "fresh") {
    YOUTUBE_PLAYLIST_ID_CACHE.set(channelId, {
      fetchedAt: toNumber(d1Cached.row.fetched_at, timestamp),
      playlistId: d1Cached.value.playlistId,
    });
    return d1Cached.value.playlistId;
  }
  const stalePlaylistId =
    d1Cached?.status === "stale" ? d1Cached.value.playlistId : null;

  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
  const startedAt = now();
  const requestContext: YouTubeRequestContext = { ...context, cacheKey };
  try {
    await reserveYouTubeQuota(context.cacheDb, context.quotaPriority);
    const res = await fetch(url, { signal: context.signal });
    if (!res.ok) {
      const error = await getResponseErrorText(res);
      await recordFetchResult(
        requestContext,
        "channels.list",
        startedAt,
        res.status,
        error,
      );
      await updateCacheError(context.cacheDb, cacheKey, res.status, error);
      reportRefreshFailure(requestContext, {
        status: res.status,
        error,
        retryAfterMs: getRetryAfterMs(res),
        quotaRejected: false,
      });
      console.error(
        "Failed to fetch YouTube channel details",
        channelId,
        res.status,
      );
      return stalePlaylistId;
    }

    await recordFetchResult(
      requestContext,
      "channels.list",
      startedAt,
      res.status,
      null,
    );
    const data = (await res.json()) as YouTubeChannelDetailsResponse;
    const playlistId =
      data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
    const fetchedAt = now();

    YOUTUBE_PLAYLIST_ID_CACHE.set(channelId, {
      fetchedAt,
      playlistId,
    });
    await writeCacheRow(context.cacheDb, {
      key: cacheKey,
      type: "uploads_playlist",
      value: { playlistId },
      fetchedAt,
      expiresAt: fetchedAt + YOUTUBE_PLAYLIST_ID_CACHE_POLICY.freshTtlMs,
      staleUntil: fetchedAt + YOUTUBE_PLAYLIST_ID_CACHE_POLICY.staleTtlMs,
      lastStatus: res.status,
      lastError: null,
    });
    return playlistId;
  } catch (error) {
    const errorText = getErrorText(error);
    const failure = getCaughtFailure(error);
    await recordFetchResult(
      requestContext,
      "channels.list",
      startedAt,
      failure.status,
      errorText,
      failure.quotaRejected ? 0 : YOUTUBE_API_QUOTA_UNITS,
    );
    await updateCacheError(context.cacheDb, cacheKey, failure.status, errorText);
    reportRefreshFailure(requestContext, failure);
    console.error("Failed to fetch YouTube channel details", channelId, error);
    return stalePlaylistId;
  }
};

const fetchYouTubePlaylistItems = async (
  playlistId: string,
  apiKey: string,
  maxResults: number,
  context: YouTubeRequestContext,
): Promise<string[]> => {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=${maxResults}&key=${apiKey}`;
  const startedAt = now();

  try {
    await reserveYouTubeQuota(context.cacheDb, context.quotaPriority);
    const res = await fetch(url, { signal: context.signal });
    if (!res.ok) {
      const error = await getResponseErrorText(res);
      await recordFetchResult(
        context,
        "playlistItems.list",
        startedAt,
        res.status,
        error,
      );
      await updateCacheError(context.cacheDb, context.cacheKey, res.status, error);
      reportRefreshFailure(context, {
        status: res.status,
        error,
        retryAfterMs: getRetryAfterMs(res),
        quotaRejected: false,
      });
      console.error(
        "Failed to fetch YouTube playlist items",
        playlistId,
        res.status,
      );
      return [];
    }

    await recordFetchResult(
      context,
      "playlistItems.list",
      startedAt,
      res.status,
      null,
    );
    const data = (await res.json()) as YouTubePlaylistItemsResponse;
    return (
      data.items
        ?.map((item) => item.contentDetails?.videoId)
        .filter((videoId): videoId is string => Boolean(videoId)) ?? []
    );
  } catch (error) {
    const errorText = getErrorText(error);
    const failure = getCaughtFailure(error);
    await recordFetchResult(
      context,
      "playlistItems.list",
      startedAt,
      failure.status,
      errorText,
      failure.quotaRejected ? 0 : YOUTUBE_API_QUOTA_UNITS,
    );
    await updateCacheError(
      context.cacheDb,
      context.cacheKey,
      failure.status,
      errorText,
    );
    reportRefreshFailure(context, failure);
    console.error("Failed to fetch YouTube playlist items", playlistId, error);
    return [];
  }
};

const fetchYouTubeVideoDetails = async (
  videoIds: string[],
  apiKey: string,
  context: YouTubeRequestContext,
): Promise<{ items: YouTubeVideoItem[]; hadFailure: boolean }> => {
  if (videoIds.length === 0) return { items: [], hadFailure: false };

  const chunks = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  const allVideos: YouTubeVideoItem[] = [];
  let hadFailure = false;

  for (const chunk of chunks) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${chunk.join(
      ",",
    )}&key=${apiKey}`;
    const startedAt = now();

    try {
      await reserveYouTubeQuota(context.cacheDb, context.quotaPriority);
      const res = await fetch(url, { signal: context.signal });
      if (!res.ok) {
        hadFailure = true;
        const error = await getResponseErrorText(res);
        await recordFetchResult(
          context,
          "videos.list",
          startedAt,
          res.status,
          error,
        );
        await updateCacheError(
          context.cacheDb,
          context.cacheKey,
          res.status,
          error,
        );
        reportRefreshFailure(context, {
          status: res.status,
          error,
          retryAfterMs: getRetryAfterMs(res),
          quotaRejected: false,
        });
        console.error("Failed to fetch YouTube video details", res.status);
        continue;
      }

      await recordFetchResult(context, "videos.list", startedAt, res.status, null);
      const data = (await res.json()) as YouTubeVideosResponse;

      const videos =
        data.items?.map((item) => {
          const duration = parseISO8601Duration(
            item.contentDetails?.duration ?? "PT0S",
          );
          const isShort = duration <= 60;

          return {
            videoId: item.id,
            title: item.snippet?.title ?? "",
            publishedAt: item.snippet?.publishedAt ?? new Date(0).toISOString(),
            thumbnailUrl:
              item.snippet?.thumbnails?.high?.url ||
              item.snippet?.thumbnails?.default?.url ||
              "",
            duration,
            viewCount: parseInt(item.statistics?.viewCount ?? "0", 10),
            channelId: item.snippet?.channelId ?? "",
            channelTitle: item.snippet?.channelTitle ?? "",
            isShort,
          } satisfies YouTubeVideoItem;
        }) || [];

      allVideos.push(...videos);
    } catch (error) {
      hadFailure = true;
      const errorText = getErrorText(error);
      const failure = getCaughtFailure(error);
      await recordFetchResult(
        context,
        "videos.list",
        startedAt,
        failure.status,
        errorText,
        failure.quotaRejected ? 0 : YOUTUBE_API_QUOTA_UNITS,
      );
      await updateCacheError(
        context.cacheDb,
        context.cacheKey,
        failure.status,
        errorText,
      );
      reportRefreshFailure(context, failure);
      console.error("Failed to fetch YouTube video details", error);
    }
  }

  return { items: allVideos, hadFailure };
};

export type FetchYouTubeVideosOptions = {
  forceRefresh?: boolean;
  quotaPriority?: YouTubeQuotaPriority;
  requestOrigin?: YouTubeUsageRequestOrigin;
  freshTtlMs?: number;
  staleTtlMs?: number;
  signal?: AbortSignal;
  onFailure?: (failure: YouTubeRefreshFailure) => void;
};

export const fetchYouTubeVideosForChannel = async (
  channelId: string,
  apiKey: string,
  maxResults = 20,
  cacheDb?: YouTubeCacheDb,
  options: FetchYouTubeVideosOptions = {},
): Promise<CachedYouTubeVideos["content"]> => {
  const cachePolicy = {
    freshTtlMs:
      options.freshTtlMs ?? YOUTUBE_VIDEOS_CACHE_POLICY.freshTtlMs,
    staleTtlMs:
      options.staleTtlMs ?? YOUTUBE_VIDEOS_CACHE_POLICY.staleTtlMs,
  };
  const cacheKey = getYouTubeVideosCacheKey(channelId, maxResults);
  const cached = YOUTUBE_VIDEOS_CACHE.get(cacheKey);
  const timestamp = now();

  if (
    !options.forceRefresh &&
    cached &&
    timestamp - cached.fetchedAt < cachePolicy.freshTtlMs
  ) {
    return cached.content;
  }

  const d1Cached = await readCachedVideos(cacheDb, cacheKey);
  if (!options.forceRefresh && d1Cached?.status === "fresh") {
    const content = d1Cached.value;
    YOUTUBE_VIDEOS_CACHE.set(cacheKey, {
      fetchedAt: toNumber(d1Cached.row.fetched_at, timestamp),
      content,
    });
    return content;
  }
  const storedContent = d1Cached?.value ?? null;
  const quotaPriority = options.quotaPriority ?? "core";
  let hadRequestFailure = false;
  const context: YouTubeRequestContext = {
    cacheDb,
    channelId,
    cacheKey,
    quotaPriority,
    requestOrigin: options.requestOrigin ?? "legacy_unknown",
    signal: options.signal,
    onFailure: (failure) => {
      hadRequestFailure = true;
      options.onFailure?.(failure);
    },
  };

  try {
    const playlistId = await fetchYouTubeUploadsPlaylistId(
      channelId,
      apiKey,
      context,
    );
    if (!playlistId) return storedContent;

    const videoIds = await fetchYouTubePlaylistItems(
      playlistId,
      apiKey,
      maxResults,
      context,
    );
    if (videoIds.length === 0) {
      if (hadRequestFailure) return storedContent;
      const empty = { videos: [], shorts: [] };
      const fetchedAt = now();
      await writeCacheRow(cacheDb, {
        key: cacheKey,
        type: "channel_videos",
        value: empty,
        fetchedAt,
        expiresAt: fetchedAt + cachePolicy.freshTtlMs,
        staleUntil: fetchedAt + cachePolicy.staleTtlMs,
        lastStatus: 200,
        lastError: null,
      });
      return empty;
    }

    const details = await fetchYouTubeVideoDetails(videoIds, apiKey, context);
    if (details.hadFailure && storedContent) {
      return storedContent;
    }
    if (details.hadFailure && details.items.length === 0) {
      return null;
    }

    const result = {
      videos: details.items.filter((v) => !v.isShort),
      shorts: details.items.filter((v) => v.isShort),
    };
    const fetchedAt = now();

    YOUTUBE_VIDEOS_CACHE.set(cacheKey, {
      fetchedAt,
      content: result,
    });
    await writeCacheRow(cacheDb, {
      key: cacheKey,
      type: "channel_videos",
      value: result,
      fetchedAt,
      expiresAt: fetchedAt + cachePolicy.freshTtlMs,
      staleUntil: fetchedAt + cachePolicy.staleTtlMs,
      lastStatus: 200,
      lastError: null,
    });
    return result;
  } catch (error) {
    console.error(
      "Failed to fetch YouTube videos for channel",
      channelId,
      error,
    );
    reportRefreshFailure(context, getCaughtFailure(error));
    return storedContent;
  }
};

const getChannelStateFromCacheKey = (
  key: string,
  type: YouTubeCacheType,
): { channelId: string; maxResults: number | null } => {
  if (type === "uploads_playlist") {
    return {
      channelId: key.startsWith("playlist:") ? key.slice("playlist:".length) : key,
      maxResults: null,
    };
  }

  const parts = key.split(":");
  const maxResults = Number(parts.at(-1));
  return {
    channelId:
      parts.length >= 3 ? parts.slice(1, -1).join(":") : key.replace(/^videos:/, ""),
    maxResults: Number.isFinite(maxResults) ? maxResults : null,
  };
};

export const getYouTubeCacheStatus = async (
  cacheDb: YouTubeCacheDb,
  windowHours: number,
  usageEndAt = now(),
): Promise<YouTubeCacheStatusResponse> => {
  const timestamp = now();
  const usageUntil = Number.isFinite(usageEndAt) ? usageEndAt : timestamp;
  const since = usageUntil - windowHours * 60 * 60_000;
  const [cacheResult, usageResult] = await Promise.all([
    cacheDb
      .prepare(
        `SELECT key, type, value, fetched_at, expires_at, stale_until,
                refresh_after, last_status, last_error
         FROM youtube_api_cache
         ORDER BY type, key`,
      )
      .all<YouTubeApiCacheRow>(),
    cacheDb
      .prepare(
        `SELECT operation, request_origin,
                COALESCE(SUM(CASE WHEN quota_units > 0 THEN 1 ELSE 0 END), 0)
                  AS api_calls,
                COALESCE(SUM(quota_units), 0) AS quota_units,
                COALESCE(SUM(CASE WHEN status >= 200 AND status < 300
                  THEN 1 ELSE 0 END), 0) AS success_count,
                COALESCE(SUM(CASE WHEN status < 200 OR status >= 300
                  THEN 1 ELSE 0 END), 0) AS failure_count,
                COALESCE(SUM(CASE WHEN status = 429 THEN 1 ELSE 0 END), 0)
                  AS rate_limit_count,
                COALESCE(SUM(CASE WHEN status = 403
                  AND LOWER(COALESCE(error, '')) LIKE '%quota%'
                  THEN 1 ELSE 0 END), 0) AS quota_error_count
         FROM youtube_api_usage_events
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY operation, request_origin`,
      )
      .bind(since, usageUntil)
      .all<YouTubeApiUsageRow>(),
  ]);
  // Lease-only null sentinels are not cache content. Keeping them out of the
  // cache detail prevents a missing target from being reported as expired.
  const cacheRows = getD1Results<YouTubeApiCacheRow>(cacheResult).filter(
    (row) => toNumber(row.fetched_at) > 0 && row.value !== "null",
  );
  const usageRows = getD1Results<YouTubeApiUsageRow>(usageResult);
  const cacheByType = new Map(
    YOUTUBE_STATUS_TYPES.map((type) => [
      type,
      { type, total: 0, fresh: 0, stale: 0, expired: 0 },
    ]),
  );
  const cacheTotals = { total: 0, fresh: 0, stale: 0, expired: 0 };

  const channels = cacheRows.map((row) => {
    const status = getCacheStatus(row, timestamp);
    const type = row.type;
    const byType = cacheByType.get(type);
    cacheTotals.total += 1;
    cacheTotals[status] += 1;
    if (byType) {
      byType.total += 1;
      byType[status] += 1;
    }

    const channelState = getChannelStateFromCacheKey(row.key, type);
    return {
      channelId: channelState.channelId,
      cacheKey: row.key,
      maxResults: channelState.maxResults,
      type,
      status,
      fetchedAt: toNumber(row.fetched_at),
      expiresAt: toNumber(row.expires_at),
      staleUntil: toNumber(row.stale_until),
      lastStatus:
        row.last_status === null || row.last_status === undefined
          ? null
          : toNumber(row.last_status),
      lastError: row.last_error,
    };
  });

  const usageByOperation = new Map(
    YOUTUBE_STATUS_OPERATIONS.map((operation) => [
      operation,
      { operation, apiCalls: 0, quotaUnits: 0, failureCount: 0 },
    ]),
  );
  const usageByOrigin = new Map(
    YOUTUBE_USAGE_ORIGINS.map((origin) => [
      origin,
      { origin, apiCalls: 0, quotaUnits: 0, failureCount: 0 },
    ]),
  );
  const usage = {
    apiCalls: 0,
    quotaUnits: 0,
    successCount: 0,
    failureCount: 0,
    rateLimitCount: 0,
    quotaErrorCount: 0,
  };

  for (const row of usageRows) {
    const apiCalls = toNumber(row.api_calls);
    const quotaUnits = toNumber(row.quota_units);
    const successCount = toNumber(row.success_count);
    const failureCount = toNumber(row.failure_count);
    const rateLimitCount = toNumber(row.rate_limit_count);
    const quotaErrorCount = toNumber(row.quota_error_count);
    const operation = row.operation;
    const byOperation = usageByOperation.get(operation);
    const byOrigin = usageByOrigin.get(row.request_origin ?? "legacy_unknown");

    usage.apiCalls += apiCalls;
    usage.quotaUnits += quotaUnits;
    usage.successCount += successCount;
    usage.failureCount += failureCount;
    usage.rateLimitCount += rateLimitCount;
    usage.quotaErrorCount += quotaErrorCount;

    if (byOperation) {
      byOperation.apiCalls += apiCalls;
      byOperation.quotaUnits += quotaUnits;
      byOperation.failureCount += failureCount;
    }
    if (byOrigin) {
      byOrigin.apiCalls += apiCalls;
      byOrigin.quotaUnits += quotaUnits;
      byOrigin.failureCount += failureCount;
    }
  }

  return {
    updatedAt: new Date(timestamp).toISOString(),
    window: { hours: windowHours, since, until: usageUntil },
    cache: {
      ...cacheTotals,
      byType: Array.from(cacheByType.values()),
    },
    usage: {
      ...usage,
      byOperation: Array.from(usageByOperation.values()),
      byOrigin: Array.from(usageByOrigin.values()),
    },
    channels,
    analytics: {
      status: "unconfigured",
      generatedAt: new Date(timestamp).toISOString(),
      windowHours,
      observedSince: null,
      coverageHours: null,
      schemaVersion: "v2",
      sampled: true,
      summary: {
        requestCount: 0,
        nonBlockingServeCount: 0,
        requestedTargetCount: 0,
        immediateAvailableCount: 0,
        refreshCount: 0,
        baselineCount: 0,
        changedCount: 0,
        unchangedCount: 0,
      },
      bySource: [],
      byOrigin: [],
      reasonCode: "analytics_unconfigured",
    },
    effectiveness: {
      requestCount: null,
      nonBlockingServeCount: null,
      nonBlockingServeRate: null,
      externalApiCalls: usage.apiCalls,
      activeQuotaUnits: usage.quotaUnits,
      baselineCount: null,
      changedCount: null,
      unchangedCount: null,
      changeRate: null,
      quotaPerChange: null,
    },
    targetStates: {
      official: { total: 0, fresh: 0, stale: 0, expired: 0, missing: 0 },
      kirinuki: { total: 0, fresh: 0, stale: 0, expired: 0, missing: 0 },
    },
    legacyScheduledRuns: [],
  };
};

export const clearYouTubeServiceCachesForTests = () => {
  YOUTUBE_VIDEOS_CACHE.clear();
  YOUTUBE_PLAYLIST_ID_CACHE.clear();
};
