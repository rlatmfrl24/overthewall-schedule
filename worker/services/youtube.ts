import type {
  CachedYouTubeVideos,
  YouTubeApiOperation,
  YouTubeCacheStatus,
  YouTubeCacheStatusResponse,
  YouTubeCacheType,
  YouTubeVideoItem,
} from "../types";
import { parseISO8601Duration } from "../utils/helpers";

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
  last_status: number | string | null;
  last_error: string | null;
};

type YouTubeApiUsageRow = {
  operation: YouTubeApiOperation;
  quota_units: number | string;
  status: number | string;
  created_at: number | string;
  error: string | null;
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
};

const YOUTUBE_VIDEOS_CACHE = new Map<string, CachedYouTubeVideos>();
const YOUTUBE_VIDEOS_TTL_MS = 5 * 60_000;
const YOUTUBE_VIDEOS_STALE_TTL_MS = 6 * 60 * 60_000;

const YOUTUBE_PLAYLIST_ID_CACHE = new Map<
  string,
  { fetchedAt: number; playlistId: string | null }
>();
const YOUTUBE_PLAYLIST_ID_TTL_MS = 24 * 60 * 60_000;
const YOUTUBE_PLAYLIST_ID_STALE_TTL_MS = 7 * 24 * 60 * 60_000;

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

const now = () => Date.now();

const getPlaylistCacheKey = (channelId: string) => `playlist:${channelId}`;
const getVideosCacheKey = (channelId: string, maxResults: number) =>
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
                last_status, last_error
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
           last_status, last_error
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           type = excluded.type,
           value = excluded.value,
           fetched_at = excluded.fetched_at,
           expires_at = excluded.expires_at,
           stale_until = excluded.stale_until,
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
  }: {
    operation: YouTubeApiOperation;
    channelId: string | null;
    cacheKey: string | null;
    status: number;
    durationMs: number;
    error: string | null;
  },
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
        `INSERT INTO youtube_api_usage_events (
           operation, channel_id, cache_key, quota_units, status,
           duration_ms, created_at, error
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        operation,
        channelId,
        cacheKey,
        YOUTUBE_API_QUOTA_UNITS,
        status,
        durationMs,
        now(),
        truncateError(error),
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
) => {
  if (!context) return;
  await writeUsageEvent(context.cacheDb, {
    operation,
    channelId: context.channelId,
    cacheKey: context.cacheKey,
    status,
    durationMs: Math.max(0, now() - startedAt),
    error,
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
  cacheDb?: YouTubeCacheDb,
): Promise<string | null> => {
  const cached = YOUTUBE_PLAYLIST_ID_CACHE.get(channelId);
  const timestamp = now();

  if (cached && timestamp - cached.fetchedAt < YOUTUBE_PLAYLIST_ID_TTL_MS) {
    return cached.playlistId;
  }

  const cacheKey = getPlaylistCacheKey(channelId);
  const d1Cached = await readCachedPlaylistId(cacheDb, cacheKey);
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
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const error = await getResponseErrorText(res);
      await recordFetchResult(
        { cacheDb, channelId, cacheKey },
        "channels.list",
        startedAt,
        res.status,
        error,
      );
      await updateCacheError(cacheDb, cacheKey, res.status, error);
      console.error(
        "Failed to fetch YouTube channel details",
        channelId,
        res.status,
      );
      return stalePlaylistId;
    }

    await recordFetchResult(
      { cacheDb, channelId, cacheKey },
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
    await writeCacheRow(cacheDb, {
      key: cacheKey,
      type: "uploads_playlist",
      value: { playlistId },
      fetchedAt,
      expiresAt: fetchedAt + YOUTUBE_PLAYLIST_ID_TTL_MS,
      staleUntil: fetchedAt + YOUTUBE_PLAYLIST_ID_STALE_TTL_MS,
      lastStatus: res.status,
      lastError: null,
    });
    return playlistId;
  } catch (error) {
    const errorText = getErrorText(error);
    await recordFetchResult(
      { cacheDb, channelId, cacheKey },
      "channels.list",
      startedAt,
      0,
      errorText,
    );
    await updateCacheError(cacheDb, cacheKey, 0, errorText);
    console.error("Failed to fetch YouTube channel details", channelId, error);
    return stalePlaylistId;
  }
};

const fetchYouTubePlaylistItems = async (
  playlistId: string,
  apiKey: string,
  maxResults: number,
  context: YouTubeRequestContext,
  retryCount = 0,
): Promise<string[]> => {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=${maxResults}&key=${apiKey}`;
  const startedAt = now();

  try {
    const res = await fetch(url);
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
      if ((res.status === 429 || res.status >= 500) && retryCount < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return fetchYouTubePlaylistItems(
          playlistId,
          apiKey,
          maxResults,
          context,
          retryCount + 1,
        );
      }
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
    await recordFetchResult(
      context,
      "playlistItems.list",
      startedAt,
      0,
      errorText,
    );
    await updateCacheError(context.cacheDb, context.cacheKey, 0, errorText);
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
      const res = await fetch(url);
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
      await recordFetchResult(
        context,
        "videos.list",
        startedAt,
        0,
        errorText,
      );
      await updateCacheError(context.cacheDb, context.cacheKey, 0, errorText);
      console.error("Failed to fetch YouTube video details", error);
    }
  }

  return { items: allVideos, hadFailure };
};

export const fetchYouTubeVideosForChannel = async (
  channelId: string,
  apiKey: string,
  maxResults = 20,
  cacheDb?: YouTubeCacheDb,
  options: { forceRefresh?: boolean } = {},
): Promise<CachedYouTubeVideos["content"]> => {
  const cacheKey = getVideosCacheKey(channelId, maxResults);
  const cached = YOUTUBE_VIDEOS_CACHE.get(cacheKey);
  const timestamp = now();

  if (
    !options.forceRefresh &&
    cached &&
    timestamp - cached.fetchedAt < YOUTUBE_VIDEOS_TTL_MS
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
  const staleContent = d1Cached?.status === "stale" ? d1Cached.value : null;
  const context = { cacheDb, channelId, cacheKey };

  try {
    const playlistId = await fetchYouTubeUploadsPlaylistId(
      channelId,
      apiKey,
      cacheDb,
    );
    if (!playlistId) return staleContent;

    const videoIds = await fetchYouTubePlaylistItems(
      playlistId,
      apiKey,
      maxResults,
      context,
    );
    if (videoIds.length === 0) return staleContent;

    const details = await fetchYouTubeVideoDetails(videoIds, apiKey, context);
    if (details.hadFailure && staleContent) {
      return staleContent;
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
      expiresAt: fetchedAt + YOUTUBE_VIDEOS_TTL_MS,
      staleUntil: fetchedAt + YOUTUBE_VIDEOS_STALE_TTL_MS,
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
    return staleContent;
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
): Promise<YouTubeCacheStatusResponse> => {
  const timestamp = now();
  const since = timestamp - windowHours * 60 * 60_000;
  const [cacheResult, usageResult] = await Promise.all([
    cacheDb
      .prepare(
        `SELECT key, type, value, fetched_at, expires_at, stale_until,
                last_status, last_error
         FROM youtube_api_cache
         ORDER BY type, key`,
      )
      .all<YouTubeApiCacheRow>(),
    cacheDb
      .prepare(
        `SELECT operation, quota_units, status, created_at, error
         FROM youtube_api_usage_events
         WHERE created_at >= ?
         ORDER BY created_at DESC
         LIMIT 5000`,
      )
      .bind(since)
      .all<YouTubeApiUsageRow>(),
  ]);
  const cacheRows = getD1Results<YouTubeApiCacheRow>(cacheResult);
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
  const usage = {
    apiCalls: 0,
    quotaUnits: 0,
    successCount: 0,
    failureCount: 0,
    rateLimitCount: 0,
    quotaErrorCount: 0,
  };

  for (const row of usageRows) {
    const status = toNumber(row.status);
    const quotaUnits = toNumber(row.quota_units);
    const operation = row.operation;
    const byOperation = usageByOperation.get(operation);

    usage.apiCalls += 1;
    usage.quotaUnits += quotaUnits;
    if (status >= 200 && status < 300) {
      usage.successCount += 1;
    } else {
      usage.failureCount += 1;
      if (byOperation) {
        byOperation.failureCount += 1;
      }
    }
    if (status === 429) {
      usage.rateLimitCount += 1;
    }
    if (status === 403 && /quota/i.test(row.error ?? "")) {
      usage.quotaErrorCount += 1;
    }

    if (byOperation) {
      byOperation.apiCalls += 1;
      byOperation.quotaUnits += quotaUnits;
    }
  }

  return {
    updatedAt: new Date(timestamp).toISOString(),
    window: { hours: windowHours, since },
    cache: {
      ...cacheTotals,
      byType: Array.from(cacheByType.values()),
    },
    usage: {
      ...usage,
      byOperation: Array.from(usageByOperation.values()),
    },
    channels,
  };
};

export const clearYouTubeServiceCachesForTests = () => {
  YOUTUBE_VIDEOS_CACHE.clear();
  YOUTUBE_PLAYLIST_ID_CACHE.clear();
};
