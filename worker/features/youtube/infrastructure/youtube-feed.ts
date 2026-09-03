import type {
  YouTubeShortsResponseDto,
  YouTubeVideoDto,
} from "@contracts/youtube";
import type { Env } from "../../../platform/types";
import { isYouTubeShort } from "../domain/short-classification";
import { YouTubeShortsUnavailableError } from "../domain/shorts-errors";
import {
  decodeYouTubeShortsCursor,
  encodeYouTubeShortsCursor,
} from "../domain/shorts-cursor";
import {
  reserveYouTubeQuota,
  YouTubeQuotaAdmissionError,
} from "./youtube-quota";

const METADATA_REFRESH_AGE_MS = 25 * 24 * 60 * 60_000;
const MAX_INCREMENTAL_PAGES_PER_RUN = 3;
const SHORTS_SCAN_PAGES_PER_REQUEST = 2;
const SHORTS_SCAN_PAGES_IN_BACKGROUND = 2;
const PAGE_SIZE = 50;
const SHORTS_REVALIDATE_MS = 15_000 as const;
const BACKFILL_LEASE_MS = 60_000;

type YouTubeRequestOrigin = "demand" | "scheduled";

type FeedSource = {
  id: number;
  source_kind: "official" | "kirinuki";
  youtube_channel_id: string;
  uploads_playlist_id: string | null;
  initialization_completed_at: number | null;
  last_seen_video_id: string | null;
  sync_page_token: string | null;
  sync_base_video_id: string | null;
  sync_newest_video_id: string | null;
  backfill_page_token: string | null;
  backfill_frontier_published_at: number | null;
  backfill_exhausted_at: number | null;
  backfill_lease_until: number | null;
  backfill_retry_after: number | null;
  consecutive_failures: number;
};

type PlaylistItem = {
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    channelTitle?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
    resourceId?: { videoId?: string };
  };
};

type PlaylistPage = {
  items?: PlaylistItem[];
  nextPageToken?: string;
};

type VideoDetail = {
  id?: string;
  snippet?: PlaylistItem["snippet"];
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
};

type ShortsRow = Record<string, unknown> & {
  video_id: string;
  published_at: number;
  fetched_at: number;
};

type ScanProgress = {
  scanPages: number;
  shortsStored: number;
  exhaustedSources: number;
  quotaBlocked: boolean;
  failed: number;
  backoffSources: number;
};

const parseDuration = (value: string | undefined) => {
  const match = value?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u);
  return match
    ? Number(match[1] ?? 0) * 3600 +
        Number(match[2] ?? 0) * 60 +
        Number(match[3] ?? 0)
    : 0;
};

const request = async <T>(
  env: Env,
  operation: "channels.list" | "playlistItems.list" | "videos.list",
  url: URL,
  origin: YouTubeRequestOrigin,
  channelId?: string,
) => {
  await reserveYouTubeQuota(env.otw_db, "low");
  const startedAt = Date.now();
  let status = 599;
  let error: string | null = null;
  try {
    const response = await fetch(url);
    status = response.status;
    if (!response.ok) {
      error = `youtube_${response.status}`;
      throw new Error(error);
    }
    return (await response.json()) as T;
  } catch (caught) {
    error ??=
      caught instanceof Error ? caught.message : "youtube_request_failed";
    throw caught;
  } finally {
    await env.otw_db
      .prepare(
        `INSERT INTO youtube_api_usage_events
         (operation, channel_id, cache_key, quota_units, status, duration_ms,
          created_at, error, request_origin)
         VALUES (?, ?, NULL, 1, ?, ?, ?, ?, ?)`,
      )
      .bind(
        operation,
        channelId ?? null,
        status,
        Date.now() - startedAt,
        Date.now(),
        error,
        origin,
      )
      .run();
  }
};

const apiUrl = (env: Env, resource: string, params: Record<string, string>) => {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", env.YOUTUBE_API_KEY?.trim() ?? "");
  return url;
};

const syncSourceRegistry = async (env: Env, timestamp: number) => {
  await env.otw_db
    .prepare(
      `DELETE FROM youtube_feed_sources
       WHERE source_kind = 'official' AND NOT EXISTS (
         SELECT 1 FROM members member
         WHERE member.uid = youtube_feed_sources.member_uid
           AND member.youtube_channel_id = youtube_feed_sources.youtube_channel_id
           AND (member.is_deprecated IS NULL OR member.is_deprecated != 1)
       )`,
    )
    .run();
  await env.otw_db
    .prepare(
      `DELETE FROM youtube_feed_sources
       WHERE source_kind = 'kirinuki' AND NOT EXISTS (
         SELECT 1 FROM kirinuki_channels channel
         WHERE channel.id = youtube_feed_sources.kirinuki_channel_id
           AND channel.youtube_channel_id = youtube_feed_sources.youtube_channel_id
       )`,
    )
    .run();
  await env.otw_db
    .prepare(
      `INSERT INTO youtube_feed_sources
        (source_kind, member_uid, youtube_channel_id, enabled,
         collection_started_at, next_check_at, created_at, updated_at)
       SELECT 'official', uid, youtube_channel_id, 1, ?, ?, ?, ? FROM members
       WHERE youtube_channel_id IS NOT NULL AND length(trim(youtube_channel_id)) > 0
         AND (is_deprecated IS NULL OR is_deprecated != 1)
       ON CONFLICT(youtube_channel_id, source_kind) DO UPDATE SET
         member_uid = excluded.member_uid, enabled = 1, deactivated_at = NULL,
         updated_at = excluded.updated_at
       WHERE youtube_feed_sources.member_uid IS NOT excluded.member_uid
          OR youtube_feed_sources.enabled != 1
          OR youtube_feed_sources.deactivated_at IS NOT NULL`,
    )
    .bind(timestamp, timestamp, timestamp, timestamp)
    .run();
  await env.otw_db
    .prepare(
      `INSERT INTO youtube_feed_sources
        (source_kind, kirinuki_channel_id, youtube_channel_id, enabled,
         collection_started_at, next_check_at, created_at, updated_at)
       SELECT 'kirinuki', id, youtube_channel_id, 1, ?, ?, ?, ?
       FROM kirinuki_channels
       WHERE 1 = 1
       ON CONFLICT(youtube_channel_id, source_kind) DO UPDATE SET
         kirinuki_channel_id = excluded.kirinuki_channel_id,
         updated_at = excluded.updated_at
       WHERE youtube_feed_sources.kirinuki_channel_id IS NOT
         excluded.kirinuki_channel_id`,
    )
    .bind(timestamp, timestamp, timestamp, timestamp)
    .run();
};

const readSources = async (
  env: Env,
  channelIds?: readonly string[],
  sourceKind: "official" | "kirinuki" = "official",
) => {
  const channelClause = channelIds?.length
    ? ` AND youtube_channel_id IN (${channelIds.map(() => "?").join(",")})`
    : "";
  const rows = await env.otw_db
    .prepare(
      `SELECT id, source_kind, youtube_channel_id, uploads_playlist_id,
         initialization_completed_at, last_seen_video_id, sync_page_token,
         sync_base_video_id, sync_newest_video_id, backfill_page_token,
         backfill_frontier_published_at, backfill_exhausted_at,
         backfill_lease_until, backfill_retry_after, consecutive_failures
       FROM youtube_feed_sources
       WHERE source_kind = ? AND enabled = 1${channelClause}
       ORDER BY id`,
    )
    .bind(sourceKind, ...(channelIds ?? []))
    .all<FeedSource>();
  return rows.results ?? [];
};

const fetchPlaylistPage = async (
  env: Env,
  source: FeedSource,
  playlistId: string,
  pageToken: string | null,
  origin: YouTubeRequestOrigin,
) => {
  const params: Record<string, string> = {
    part: "snippet",
    playlistId,
    maxResults: String(PAGE_SIZE),
  };
  if (pageToken) params.pageToken = pageToken;
  return request<PlaylistPage>(
    env,
    "playlistItems.list",
    apiUrl(env, "playlistItems", params),
    origin,
    source.youtube_channel_id,
  );
};

const fetchVideoDetails = async (
  env: Env,
  ids: readonly string[],
  origin: YouTubeRequestOrigin,
  channelId?: string,
) => {
  if (ids.length === 0) return [];
  const response = await request<{ items?: VideoDetail[] }>(
    env,
    "videos.list",
    apiUrl(env, "videos", {
      part: "snippet,contentDetails,statistics",
      id: ids.join(","),
    }),
    origin,
    channelId,
  );
  return response.items ?? [];
};

const persistVideoDetails = async (
  env: Env,
  sourceId: number,
  details: readonly VideoDetail[],
  timestamp: number,
) => {
  let shortsStored = 0;
  for (const item of details) {
    const publishedAt = Date.parse(item.snippet?.publishedAt ?? "");
    if (!item.id || !Number.isFinite(publishedAt)) continue;
    const duration = parseDuration(item.contentDetails?.duration);
    const short = isYouTubeShort({
      durationSeconds: duration,
      publishedAt,
      title: item.snippet?.title,
      description: item.snippet?.description,
    });
    if (short) shortsStored += 1;
    await env.otw_db
      .prepare(
        `INSERT INTO youtube_feed_videos
         (video_id, source_id, title, description, thumbnail_url, channel_title,
          duration_seconds, view_count, is_short, published_at, fetched_at, available)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(video_id) DO UPDATE SET source_id=excluded.source_id,
          title=excluded.title, description=excluded.description,
          thumbnail_url=excluded.thumbnail_url,
          channel_title=excluded.channel_title,
          duration_seconds=excluded.duration_seconds,
          view_count=excluded.view_count, is_short=excluded.is_short,
          published_at=excluded.published_at, fetched_at=excluded.fetched_at,
          available=1`,
      )
      .bind(
        item.id,
        sourceId,
        item.snippet?.title ?? "",
        item.snippet?.description ?? "",
        item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
        item.snippet?.channelTitle ?? "",
        duration,
        Number.parseInt(item.statistics?.viewCount ?? "0", 10) || 0,
        short ? 1 : 0,
        publishedAt,
        timestamp,
      )
      .run();
  }
  return shortsStored;
};

const getPageIds = (page: PlaylistPage) =>
  (page.items ?? []).flatMap((item) => {
    const id = item.snippet?.resourceId?.videoId;
    return id ? [id] : [];
  });

const getPageFrontier = (page: PlaylistPage) => {
  const published = (page.items ?? [])
    .map((item) => Date.parse(item.snippet?.publishedAt ?? ""))
    .filter(Number.isFinite);
  return published.length > 0 ? Math.min(...published) : null;
};

const resolveUploadsPlaylist = async (
  env: Env,
  source: FeedSource,
  origin: YouTubeRequestOrigin,
) => {
  if (source.uploads_playlist_id) return source.uploads_playlist_id;
  const channels = await request<{
    items?: Array<{
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  }>(
    env,
    "channels.list",
    apiUrl(env, "channels", {
      part: "contentDetails",
      id: source.youtube_channel_id,
    }),
    origin,
    source.youtube_channel_id,
  );
  const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("uploads_playlist_missing");
  return uploads;
};

const initializeSource = async (
  env: Env,
  source: FeedSource,
  timestamp: number,
  origin: YouTubeRequestOrigin,
) => {
  const uploads = await resolveUploadsPlaylist(env, source, origin);
  const page = await fetchPlaylistPage(env, source, uploads, null, origin);
  const ids = getPageIds(page);
  const shortsStored = await persistVideoDetails(
    env,
    source.id,
    await fetchVideoDetails(env, ids, origin, source.youtube_channel_id),
    timestamp,
  );
  const newest = ids[0] ?? source.last_seen_video_id;
  const frontier = getPageFrontier(page);
  const nextPageToken = page.nextPageToken ?? null;
  await env.otw_db
    .prepare(
      `UPDATE youtube_feed_sources SET uploads_playlist_id = ?,
         initialization_completed_at = ?, last_seen_video_id = ?,
         backfill_page_token = ?, backfill_frontier_published_at = ?,
         backfill_exhausted_at = ?, backfill_lease_until = NULL,
         backfill_retry_after = NULL, last_attempt_at = ?, last_success_at = ?,
         next_check_at = ?, consecutive_failures = 0,
         last_error_code = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      uploads,
      timestamp,
      newest,
      nextPageToken,
      frontier,
      nextPageToken ? null : timestamp,
      timestamp,
      timestamp,
      timestamp + 6 * 60 * 60_000,
      timestamp,
      source.id,
    )
    .run();
  return { discovered: ids.length, shortsStored, exhausted: !nextPageToken };
};

const collectSource = async (env: Env, source: FeedSource, timestamp: number) => {
  const needsOfficialInitialization =
    source.source_kind === "official" &&
    (!source.initialization_completed_at ||
      !source.uploads_playlist_id ||
      (!source.backfill_page_token && !source.backfill_exhausted_at));
  if (needsOfficialInitialization) {
    if (!(await acquireBackfillLease(env, source, timestamp))) {
      return { discovered: 0, shortsStored: 0, exhausted: false };
    }
    try {
      return await initializeSource(env, source, timestamp, "scheduled");
    } catch (error) {
      await recordBackfillFailure(env, source, timestamp, error);
      throw error;
    }
  }
  if (!source.initialization_completed_at || !source.uploads_playlist_id) {
    return initializeSource(env, source, timestamp, "scheduled");
  }

  const base = source.sync_base_video_id ?? source.last_seen_video_id;
  let pageToken = source.sync_page_token;
  let newest = source.sync_newest_video_id;
  let complete = false;
  const discovered: PlaylistItem[] = [];
  for (
    let pageIndex = 0;
    pageIndex < MAX_INCREMENTAL_PAGES_PER_RUN;
    pageIndex += 1
  ) {
    const response = await fetchPlaylistPage(
      env,
      source,
      source.uploads_playlist_id,
      pageToken,
      "scheduled",
    );
    const items = response.items ?? [];
    newest ??= items[0]?.snippet?.resourceId?.videoId ?? null;
    for (const item of items) {
      const id = item.snippet?.resourceId?.videoId;
      if (id && base && id === base) {
        complete = true;
        break;
      }
      discovered.push(item);
    }
    if (complete || !response.nextPageToken) {
      complete = true;
      pageToken = null;
      break;
    }
    pageToken = response.nextPageToken;
  }

  const ids = discovered.flatMap((item) => {
    const id = item.snippet?.resourceId?.videoId;
    return id ? [id] : [];
  });
  const shortsStored = await persistVideoDetails(
    env,
    source.id,
    await fetchVideoDetails(env, ids, "scheduled", source.youtube_channel_id),
    timestamp,
  );
  await env.otw_db
    .prepare(
      `UPDATE youtube_feed_sources SET last_seen_video_id = ?, sync_page_token = ?,
         sync_base_video_id = ?, sync_newest_video_id = ?, last_attempt_at = ?,
         last_success_at = ?, next_check_at = ?, consecutive_failures = 0,
         last_error_code = NULL, updated_at = ? WHERE id = ?`,
    )
    .bind(
      complete ? newest : source.last_seen_video_id,
      complete ? null : pageToken,
      complete ? null : base,
      complete ? null : newest,
      timestamp,
      timestamp,
      timestamp + 6 * 60 * 60_000,
      timestamp,
      source.id,
    )
    .run();
  return { discovered: ids.length, shortsStored, exhausted: false };
};

export const importLegacyOfficialShorts = async (
  env: Env,
  timestamp: number,
) => {
  const rows = await env.otw_db
    .prepare(
      `SELECT value, fetched_at FROM youtube_api_cache
       WHERE type = 'channel_videos' AND stale_until >= ?`,
    )
    .bind(timestamp)
    .all<{ value: string; fetched_at: number }>();
  const sources = await readSources(env);
  const sourceByChannel = new Map(
    sources.map((source) => [source.youtube_channel_id, source.id]),
  );
  let imported = 0;
  for (const row of rows.results ?? []) {
    let shorts: unknown[] = [];
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (typeof parsed === "object" && parsed !== null) {
        const content = (parsed as { content?: unknown }).content ?? parsed;
        if (typeof content === "object" && content !== null) {
          const candidate = (content as { shorts?: unknown }).shorts;
          if (Array.isArray(candidate)) shorts = candidate;
        }
      }
    } catch {
      continue;
    }
    for (const candidate of shorts) {
      if (typeof candidate !== "object" || candidate === null) continue;
      const video = candidate as Partial<YouTubeVideoDto>;
      const sourceId = video.channelId
        ? sourceByChannel.get(video.channelId)
        : null;
      const publishedAt = Date.parse(video.publishedAt ?? "");
      if (!sourceId || !video.videoId || !Number.isFinite(publishedAt)) {
        continue;
      }
      const result = await env.otw_db
        .prepare(
          `INSERT INTO youtube_feed_videos
           (video_id, source_id, title, description, thumbnail_url,
            channel_title, duration_seconds, view_count, is_short,
            published_at, fetched_at, available)
           VALUES (?, ?, ?, '', ?, ?, ?, ?, 1, ?, ?, 1)
           ON CONFLICT(video_id) DO NOTHING`,
        )
        .bind(
          video.videoId,
          sourceId,
          video.title ?? "",
          video.thumbnailUrl ?? null,
          video.channelTitle ?? "",
          Number(video.duration) || 0,
          Number(video.viewCount) || 0,
          publishedAt,
          row.fetched_at,
        )
        .run();
      imported += Number(result.meta?.changes ?? 0) || 0;
    }
  }
  return imported;
};

const acquireBackfillLease = async (
  env: Env,
  source: FeedSource,
  timestamp: number,
) => {
  const row = await env.otw_db
    .prepare(
      `UPDATE youtube_feed_sources SET backfill_lease_until = ?, updated_at = ?
       WHERE id = ? AND backfill_exhausted_at IS NULL
         AND (backfill_lease_until IS NULL OR backfill_lease_until <= ?)
         AND (backfill_retry_after IS NULL OR backfill_retry_after <= ?)
       RETURNING id`,
    )
    .bind(
      timestamp + BACKFILL_LEASE_MS,
      timestamp,
      source.id,
      timestamp,
      timestamp,
    )
    .first<{ id: number }>();
  return Boolean(row);
};

const recordBackfillFailure = async (
  env: Env,
  source: FeedSource,
  timestamp: number,
  error: unknown,
) => {
  const failures = source.consecutive_failures + 1;
  const retryMs = Math.min(
    6 * 60 * 60_000,
    SHORTS_REVALIDATE_MS * 2 ** Math.min(failures, 8),
  );
  await env.otw_db
    .prepare(
      `UPDATE youtube_feed_sources SET backfill_lease_until = NULL,
         backfill_retry_after = ?, consecutive_failures = ?,
         last_error_code = ?, last_attempt_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      timestamp + retryMs,
      failures,
      error instanceof Error ? error.message.slice(0, 120) : "backfill_failed",
      timestamp,
      timestamp,
      source.id,
    )
    .run();
};

const scanOneBackfillPage = async (
  env: Env,
  source: FeedSource,
  timestamp: number,
  origin: YouTubeRequestOrigin,
) => {
  if (!source.initialization_completed_at || !source.uploads_playlist_id) {
    return initializeSource(env, source, timestamp, origin);
  }
  const page = await fetchPlaylistPage(
    env,
    source,
    source.uploads_playlist_id,
    source.backfill_page_token,
    origin,
  );
  const ids = getPageIds(page);
  const shortsStored = await persistVideoDetails(
    env,
    source.id,
    await fetchVideoDetails(env, ids, origin, source.youtube_channel_id),
    timestamp,
  );
  const nextPageToken = page.nextPageToken ?? null;
  const frontier =
    getPageFrontier(page) ?? source.backfill_frontier_published_at;
  await env.otw_db
    .prepare(
      `UPDATE youtube_feed_sources SET backfill_page_token = ?,
         backfill_frontier_published_at = ?, backfill_exhausted_at = ?,
         backfill_lease_until = NULL, backfill_retry_after = NULL,
         consecutive_failures = 0, last_error_code = NULL,
         last_attempt_at = ?, last_success_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextPageToken,
      frontier,
      nextPageToken ? null : timestamp,
      timestamp,
      timestamp,
      timestamp,
      source.id,
    )
    .run();
  return { discovered: ids.length, shortsStored, exhausted: !nextPageToken };
};

const emptyScanProgress = (): ScanProgress => ({
  scanPages: 0,
  shortsStored: 0,
  exhaustedSources: 0,
  quotaBlocked: false,
  failed: 0,
  backoffSources: 0,
});

const scanOfficialBackfill = async (
  env: Env,
  channelIds: readonly string[],
  maxPages: number,
  origin: YouTubeRequestOrigin,
) => {
  const progress = emptyScanProgress();
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const timestamp = Date.now();
    const sources = (await readSources(env, channelIds))
      .filter((source) => !source.backfill_exhausted_at)
      .sort((a, b) => {
        const aRetry =
          a.backfill_retry_after && a.backfill_retry_after > timestamp;
        const bRetry =
          b.backfill_retry_after && b.backfill_retry_after > timestamp;
        if (aRetry !== bRetry) return aRetry ? 1 : -1;
        return (
          (b.backfill_frontier_published_at ?? Number.MAX_SAFE_INTEGER) -
            (a.backfill_frontier_published_at ?? Number.MAX_SAFE_INTEGER) ||
          a.id - b.id
        );
      });
    if (sources.length === 0) break;
    const source = sources.find(
      (candidate) =>
        (!candidate.backfill_retry_after ||
          candidate.backfill_retry_after <= timestamp) &&
        (!candidate.backfill_lease_until ||
          candidate.backfill_lease_until <= timestamp),
    );
    if (!source) {
      progress.backoffSources = sources.length;
      break;
    }
    if (!(await acquireBackfillLease(env, source, timestamp))) continue;
    try {
      const result = await scanOneBackfillPage(env, source, timestamp, origin);
      progress.scanPages += 1;
      progress.shortsStored += result.shortsStored;
      if (result.exhausted) progress.exhaustedSources += 1;
    } catch (error) {
      progress.failed += 1;
      progress.quotaBlocked ||= error instanceof YouTubeQuotaAdmissionError;
      await recordBackfillFailure(env, source, timestamp, error);
      if (error instanceof YouTubeQuotaAdmissionError) break;
    }
  }
  return progress;
};

const refreshStaleMetadata = async (env: Env, timestamp: number) => {
  const rows = await env.otw_db
    .prepare(
      `SELECT video_id, source_id FROM youtube_feed_videos
       WHERE available = 1 AND fetched_at <= ?
       ORDER BY fetched_at LIMIT 50`,
    )
    .bind(timestamp - METADATA_REFRESH_AGE_MS)
    .all<{ video_id: string; source_id: number }>();
  const candidates = rows.results ?? [];
  if (candidates.length === 0) return { refreshed: 0, unavailable: 0 };
  const details = await fetchVideoDetails(
    env,
    candidates.map((row) => row.video_id),
    "scheduled",
  );
  const sourceByVideo = new Map(
    candidates.map((row) => [row.video_id, row.source_id]),
  );
  const returnedIds = new Set(
    details.flatMap((item) => (item.id ? [item.id] : [])),
  );
  const detailsBySource = new Map<number, VideoDetail[]>();
  for (const detail of details) {
    if (!detail.id) continue;
    const sourceId = sourceByVideo.get(detail.id);
    if (!sourceId) continue;
    const group = detailsBySource.get(sourceId) ?? [];
    group.push(detail);
    detailsBySource.set(sourceId, group);
  }
  for (const [sourceId, sourceDetails] of detailsBySource) {
    await persistVideoDetails(env, sourceId, sourceDetails, timestamp);
  }
  const unavailable = candidates.filter(
    (row) => !returnedIds.has(row.video_id),
  );
  for (const row of unavailable) {
    await env.otw_db
      .prepare(
        `UPDATE youtube_feed_videos SET available = 0, fetched_at = ?
         WHERE video_id = ?`,
      )
      .bind(timestamp, row.video_id)
      .run();
  }
  return { refreshed: returnedIds.size, unavailable: unavailable.length };
};

export const runScheduledYouTubeFeedCollection = async (env: Env) => {
  const setting = await env.otw_db
    .prepare(`SELECT value FROM settings WHERE key = 'youtube_feed_enabled'`)
    .first<{ value: string | null }>();
  if (setting?.value !== "true" || !env.YOUTUBE_API_KEY?.trim()) {
    return {
      status: "skipped" as const,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      legacyImported: 0,
      shortsStored: 0,
      scanPages: 0,
      exhaustedSources: 0,
      quotaBlocked: false,
      backoffSources: 0,
      metadataRefreshed: 0,
      unavailableMarked: 0,
      backfillFailed: 0,
    };
  }
  const timestamp = Date.now();
  await syncSourceRegistry(env, timestamp);
  const legacyImported = await importLegacyOfficialShorts(env, timestamp);
  let metadata = { refreshed: 0, unavailable: 0 };
  let metadataQuotaBlocked = false;
  try {
    metadata = await refreshStaleMetadata(env, timestamp);
  } catch (error) {
    if (!(error instanceof YouTubeQuotaAdmissionError)) throw error;
    metadataQuotaBlocked = true;
  }
  const rows = await env.otw_db
    .prepare(
      `SELECT id, source_kind, youtube_channel_id, uploads_playlist_id,
         initialization_completed_at, last_seen_video_id, sync_page_token,
         sync_base_video_id, sync_newest_video_id, backfill_page_token,
         backfill_frontier_published_at, backfill_exhausted_at,
         backfill_lease_until, backfill_retry_after, consecutive_failures
       FROM youtube_feed_sources
       WHERE enabled = 1 AND (
         next_check_at IS NULL OR next_check_at <= ? OR
         (source_kind = 'official' AND backfill_page_token IS NULL
          AND backfill_exhausted_at IS NULL)
       )
       ORDER BY CASE WHEN source_kind = 'official' AND backfill_page_token IS NULL
         AND backfill_exhausted_at IS NULL THEN 0 ELSE 1 END,
         next_check_at, id LIMIT 8`,
    )
    .bind(timestamp)
    .all<FeedSource>();
  let succeeded = 0;
  let failed = 0;
  let shortsStored = 0;
  let exhaustedSources = 0;
  let quotaBlocked = metadataQuotaBlocked;
  for (const source of rows.results ?? []) {
    try {
      const result = await collectSource(env, source, timestamp);
      shortsStored += result.shortsStored;
      exhaustedSources += result.exhausted ? 1 : 0;
      succeeded += 1;
    } catch (error) {
      failed += 1;
      quotaBlocked ||= error instanceof YouTubeQuotaAdmissionError;
      await env.otw_db
        .prepare(
          `UPDATE youtube_feed_sources SET last_attempt_at=?, next_check_at=?,
           consecutive_failures=consecutive_failures+1, last_error_code=?,
           updated_at=? WHERE id=?`,
        )
        .bind(
          timestamp,
          timestamp + 60 * 60_000,
          error instanceof Error
            ? error.message.slice(0, 120)
            : "collection_failed",
          timestamp,
          source.id,
        )
        .run();
      if (error instanceof YouTubeQuotaAdmissionError) break;
    }
  }
  const sources = await readSources(env);
  const backfill = await scanOfficialBackfill(
    env,
    sources.map((source) => source.youtube_channel_id),
    2,
    "scheduled",
  );
  const backfillIncomplete =
    quotaBlocked ||
    backfill.quotaBlocked ||
    backfill.failed > 0 ||
    backfill.backoffSources > 0;
  return {
    status:
      failed === 0 && !backfillIncomplete
        ? ("succeeded" as const)
        : succeeded === 0 && failed > 0
          ? ("failed" as const)
          : ("partial" as const),
    attempted: succeeded + failed,
    succeeded,
    failed,
    legacyImported,
    shortsStored: shortsStored + backfill.shortsStored,
    scanPages: backfill.scanPages,
    exhaustedSources: exhaustedSources + backfill.exhaustedSources,
    quotaBlocked: quotaBlocked || backfill.quotaBlocked,
    backoffSources: backfill.backoffSources,
    metadataRefreshed: metadata.refreshed,
    unavailableMarked: metadata.unavailable,
    backfillFailed: backfill.failed,
  };
};

const mapVideoRow = (row: Record<string, unknown>): YouTubeVideoDto => ({
  videoId: String(row.video_id),
  title: String(row.title),
  publishedAt: new Date(Number(row.published_at)).toISOString(),
  thumbnailUrl: String(row.thumbnail_url ?? ""),
  duration: Number(row.duration_seconds),
  viewCount: Number(row.view_count),
  channelId: String(row.youtube_channel_id),
  channelTitle: String(row.channel_title),
  isShort: Number(row.is_short) === 1,
});

const readStoredKind = async (
  env: Env,
  channelIds: readonly string[],
  maxResults: number,
  sourceKind: "official" | "kirinuki",
  short: boolean,
) => {
  const placeholders = channelIds.map(() => "?").join(",");
  const rows = await env.otw_db
    .prepare(
      `SELECT video.video_id, video.title, video.thumbnail_url,
         video.channel_title, video.duration_seconds, video.view_count,
         video.is_short, video.published_at, video.fetched_at,
         source.youtube_channel_id
       FROM youtube_feed_videos video
       JOIN youtube_feed_sources source ON source.id = video.source_id
       WHERE source.source_kind = ? AND source.enabled = 1
         AND video.available = 1 AND video.is_short = ?
         AND source.youtube_channel_id IN (${placeholders})
       ORDER BY video.published_at DESC, video.video_id ASC LIMIT ?`,
    )
    .bind(sourceKind, short ? 1 : 0, ...channelIds, maxResults)
    .all<Record<string, unknown>>();
  return rows.results ?? [];
};

export const readStoredYouTubeFeed = async (
  env: Env,
  channelIds: readonly string[],
  maxResults: number,
  sourceKind: "official" | "kirinuki",
) => {
  const settingStatement = env.otw_db.prepare(
    `SELECT value FROM settings WHERE key = 'youtube_feed_enabled'`,
  );
  if (typeof settingStatement.first !== "function") return null;
  const enabled = await settingStatement.first<{ value: string | null }>();
  if (enabled?.value !== "true") return null;
  if (channelIds.length === 0) {
    return { videos: [], shorts: [], oldestRetainedAt: null };
  }
  const [videos, shorts] = await Promise.all([
    readStoredKind(env, channelIds, maxResults, sourceKind, false),
    readStoredKind(env, channelIds, maxResults, sourceKind, true),
  ]);
  const fetched = [...videos, ...shorts].map((row) => Number(row.fetched_at));
  return {
    videos: videos.map(mapVideoRow),
    shorts: shorts.map(mapVideoRow),
    oldestRetainedAt:
      fetched.length === 0
        ? null
        : new Date(Math.min(...fetched)).toISOString(),
  };
};

const readShortsPageRows = async (
  env: Env,
  channelIds: readonly string[],
  limit: number,
  cursor: ReturnType<typeof decodeYouTubeShortsCursor>,
) => {
  const placeholders = channelIds.map(() => "?").join(",");
  const keyset = cursor
    ? ` AND (video.published_at < ? OR
        (video.published_at = ? AND video.video_id > ?))`
    : "";
  const bindings: unknown[] = [...channelIds];
  if (cursor) {
    bindings.push(cursor.publishedAt, cursor.publishedAt, cursor.videoId);
  }
  bindings.push(limit + 1);
  const rows = await env.otw_db
    .prepare(
      `SELECT video.video_id, video.title, video.thumbnail_url,
         video.channel_title, video.duration_seconds, video.view_count,
         video.is_short, video.published_at, video.fetched_at,
         source.youtube_channel_id
       FROM youtube_feed_videos video
       JOIN youtube_feed_sources source ON source.id = video.source_id
       WHERE source.source_kind = 'official' AND source.enabled = 1
         AND video.available = 1 AND video.is_short = 1
         AND source.youtube_channel_id IN (${placeholders})${keyset}
       ORDER BY video.published_at DESC, video.video_id ASC LIMIT ?`,
    )
    .bind(...bindings)
    .all<ShortsRow>();
  return rows.results ?? [];
};

export const isYouTubeShortsPageComplete = (
  sources: readonly Pick<
    FeedSource,
    | "initialization_completed_at"
    | "backfill_frontier_published_at"
    | "backfill_exhausted_at"
  >[],
  candidatePublishedAt: readonly number[],
  limit: number,
) => {
  if (sources.length === 0) return false;
  const allExhausted = sources.every((source) =>
    Boolean(source.backfill_exhausted_at),
  );
  if (candidatePublishedAt.length < limit) return allExhausted;
  const boundary = candidatePublishedAt[limit - 1];
  if (!boundary) return false;
  return sources.every(
    (source) =>
      Boolean(source.initialization_completed_at) &&
      (Boolean(source.backfill_exhausted_at) ||
        (source.backfill_frontier_published_at !== null &&
          source.backfill_frontier_published_at < boundary)),
  );
};

const buildShortsResponse = (
  rows: ShortsRow[],
  sources: FeedSource[],
  channelIds: readonly string[],
  limit: number,
  rawCursor: string | null,
  complete: boolean,
  degraded: boolean,
): YouTubeShortsResponseDto => {
  const allExhausted =
    sources.length > 0 &&
    sources.every((source) => Boolean(source.backfill_exhausted_at));
  const pageRows = rows.slice(0, limit);
  if (!complete) {
    const visibleRows = rawCursor ? [] : pageRows;
    return {
      items: visibleRows.map(mapVideoRow),
      nextCursor: rawCursor,
      hasMore: true,
      updatedAt: new Date(
        visibleRows.length === 0
          ? Date.now()
          : Math.max(...visibleRows.map((row) => Number(row.fetched_at))),
      ).toISOString(),
      collection: {
        state: degraded ? "partial" : "refreshing",
        baselineTarget: 20,
        requested: limit,
        returned: visibleRows.length,
        revalidateAfterMs: SHORTS_REVALIDATE_MS,
      },
    };
  }
  const hasStoredNext = rows.length > limit;
  const exhausted = allExhausted && !hasStoredNext;
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(mapVideoRow),
    nextCursor:
      !exhausted && last
        ? encodeYouTubeShortsCursor(
            {
              publishedAt: Number(last.published_at),
              videoId: last.video_id,
            },
            channelIds,
          )
        : null,
    hasMore: !exhausted,
    updatedAt: new Date(
      pageRows.length === 0
        ? Date.now()
        : Math.max(...pageRows.map((row) => Number(row.fetched_at))),
    ).toISOString(),
    collection: {
      state: exhausted ? "exhausted" : "ready",
      baselineTarget: 20,
      requested: limit,
      returned: pageRows.length,
      revalidateAfterMs: null,
    },
  };
};

export const readOfficialYouTubeShorts = async (
  env: Env,
  channelIds: readonly string[],
  limit: number,
  rawCursor: string | null,
  ctx?: ExecutionContext,
) => {
  const cursor = decodeYouTubeShortsCursor(rawCursor, channelIds);
  const timestamp = Date.now();
  const settingStatement = env.otw_db.prepare(
    `SELECT value FROM settings WHERE key = 'youtube_feed_enabled'`,
  );
  if (typeof settingStatement.first !== "function") {
    throw new YouTubeShortsUnavailableError(
      "YouTube feed storage is unavailable",
    );
  }
  const enabled = await settingStatement.first<{ value: string | null }>();
  if (enabled?.value !== "true") {
    throw new YouTubeShortsUnavailableError("YouTube feed storage is disabled");
  }
  await syncSourceRegistry(env, timestamp);
  await importLegacyOfficialShorts(env, timestamp);

  let sources = await readSources(env, channelIds);
  let rows = await readShortsPageRows(env, channelIds, limit, cursor);
  let complete = isYouTubeShortsPageComplete(
    sources,
    rows.map((row) => Number(row.published_at)),
    limit,
  );
  let progress = emptyScanProgress();
  if (!complete && env.YOUTUBE_API_KEY?.trim()) {
    progress = await scanOfficialBackfill(
      env,
      channelIds,
      SHORTS_SCAN_PAGES_PER_REQUEST,
      "demand",
    );
    sources = await readSources(env, channelIds);
    rows = await readShortsPageRows(env, channelIds, limit, cursor);
    complete = isYouTubeShortsPageComplete(
      sources,
      rows.map((row) => Number(row.published_at)),
      limit,
    );
  }

  const degraded =
    !env.YOUTUBE_API_KEY?.trim() ||
    progress.quotaBlocked ||
    progress.failed > 0 ||
    progress.backoffSources > 0;
  if (!complete && rows.length === 0 && degraded) {
    throw new YouTubeShortsUnavailableError();
  }
  if (!complete && ctx && !degraded) {
    ctx.waitUntil(
      scanOfficialBackfill(
        env,
        channelIds,
        SHORTS_SCAN_PAGES_IN_BACKGROUND,
        "demand",
      ).catch((error) => {
        console.error("Failed to continue YouTube Shorts backfill", error);
      }),
    );
  }
  return buildShortsResponse(
    rows,
    sources,
    channelIds,
    limit,
    rawCursor,
    complete,
    degraded,
  );
};
