import type { YouTubeVideoDto } from "@contracts/youtube";
import type { Env } from "../../../platform/types";
import { reserveYouTubeQuota } from "./youtube-quota";

const RETENTION_MS = 30 * 24 * 60 * 60_000;
const MAX_PAGES_PER_RUN = 3;
const PAGE_SIZE = 50;

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
};

type PlaylistItem = {
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    channelTitle?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
    resourceId?: { videoId?: string };
  };
};

type VideoDetail = {
  id?: string;
  snippet?: PlaylistItem["snippet"];
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
};

const parseDuration = (value: string | undefined) => {
  const match = value?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return match
    ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
    : 0;
};

const request = async <T>(
  env: Env,
  operation: "channels.list" | "playlistItems.list" | "videos.list",
  url: URL,
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
    return await response.json() as T;
  } catch (caught) {
    error ??= caught instanceof Error ? caught.message : "youtube_request_failed";
    throw caught;
  } finally {
    await env.otw_db.prepare(
      `INSERT INTO youtube_api_usage_events
       (operation, channel_id, cache_key, quota_units, status, duration_ms,
        created_at, error, request_origin)
       VALUES (?, NULL, NULL, 1, ?, ?, ?, ?, 'scheduled')`,
    ).bind(operation, status, Date.now() - startedAt, Date.now(), error).run();
  }
};

const apiUrl = (env: Env, resource: string, params: Record<string, string>) => {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", env.YOUTUBE_API_KEY?.trim() ?? "");
  return url;
};

const syncSourceRegistry = async (env: Env, timestamp: number) => {
  await env.otw_db.prepare(
    `DELETE FROM youtube_feed_sources
     WHERE source_kind = 'official' AND NOT EXISTS (
       SELECT 1 FROM members member WHERE member.uid = youtube_feed_sources.member_uid
         AND member.youtube_channel_id = youtube_feed_sources.youtube_channel_id
         AND (member.is_deprecated IS NULL OR member.is_deprecated != 1)
     )`,
  ).run();
  await env.otw_db.prepare(
    `DELETE FROM youtube_feed_sources
     WHERE source_kind = 'kirinuki' AND NOT EXISTS (
       SELECT 1 FROM kirinuki_channels channel
       WHERE channel.id = youtube_feed_sources.kirinuki_channel_id
         AND channel.youtube_channel_id = youtube_feed_sources.youtube_channel_id
     )`,
  ).run();
  await env.otw_db.prepare(
    `INSERT INTO youtube_feed_sources
      (source_kind, member_uid, youtube_channel_id, enabled,
       collection_started_at, next_check_at, created_at, updated_at)
     SELECT 'official', uid, youtube_channel_id, 1, ?, ?, ?, ? FROM members
     WHERE youtube_channel_id IS NOT NULL AND length(trim(youtube_channel_id)) > 0
       AND (is_deprecated IS NULL OR is_deprecated != 1)
     ON CONFLICT(youtube_channel_id, source_kind) DO UPDATE SET
       member_uid = excluded.member_uid, updated_at = excluded.updated_at`,
  ).bind(timestamp, timestamp, timestamp, timestamp).run();
  await env.otw_db.prepare(
    `INSERT INTO youtube_feed_sources
      (source_kind, kirinuki_channel_id, youtube_channel_id, enabled,
       collection_started_at, next_check_at, created_at, updated_at)
     SELECT 'kirinuki', id, youtube_channel_id, 1, ?, ?, ?, ? FROM kirinuki_channels
     WHERE 1 = 1
     ON CONFLICT(youtube_channel_id, source_kind) DO UPDATE SET
       kirinuki_channel_id = excluded.kirinuki_channel_id,
       updated_at = excluded.updated_at`,
  ).bind(timestamp, timestamp, timestamp, timestamp).run();
};

const initializeSource = async (env: Env, source: FeedSource, timestamp: number) => {
  const channels = await request<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>(
    env,
    "channels.list",
    apiUrl(env, "channels", { part: "contentDetails", id: source.youtube_channel_id }),
  );
  const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("uploads_playlist_missing");
  const page = await request<{ items?: PlaylistItem[] }>(
    env,
    "playlistItems.list",
    apiUrl(env, "playlistItems", { part: "snippet", playlistId: uploads, maxResults: "50" }),
  );
  const newest = page.items?.[0]?.snippet?.resourceId?.videoId ?? null;
  await env.otw_db.prepare(
    `UPDATE youtube_feed_sources SET uploads_playlist_id = ?,
       initialization_completed_at = ?, last_seen_video_id = ?,
       last_attempt_at = ?, last_success_at = ?, next_check_at = ?,
       consecutive_failures = 0, last_error_code = NULL, updated_at = ?
     WHERE id = ?`,
  ).bind(uploads, timestamp, newest, timestamp, timestamp, timestamp + 6 * 60 * 60_000, timestamp, source.id).run();
  return 0;
};

const collectSource = async (env: Env, source: FeedSource, timestamp: number) => {
  if (!source.initialization_completed_at || !source.uploads_playlist_id) {
    return initializeSource(env, source, timestamp);
  }
  const base = source.sync_base_video_id ?? source.last_seen_video_id;
  let pageToken = source.sync_page_token;
  let newest = source.sync_newest_video_id;
  let complete = false;
  const discovered: PlaylistItem[] = [];
  for (let page = 0; page < MAX_PAGES_PER_RUN; page += 1) {
    const params: Record<string, string> = {
      part: "snippet",
      playlistId: source.uploads_playlist_id,
      maxResults: String(PAGE_SIZE),
    };
    if (pageToken) params.pageToken = pageToken;
    const response = await request<{ items?: PlaylistItem[]; nextPageToken?: string }>(
      env,
      "playlistItems.list",
      apiUrl(env, "playlistItems", params),
    );
    const items = response.items ?? [];
    newest ??= items[0]?.snippet?.resourceId?.videoId ?? null;
    for (const item of items) {
      const id = item.snippet?.resourceId?.videoId;
      if (id && base && id === base) {
        complete = true;
        break;
      }
      const publishedAt = Date.parse(item.snippet?.publishedAt ?? "");
      if (!Number.isFinite(publishedAt) || publishedAt < timestamp - RETENTION_MS) {
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
  const details: { items?: VideoDetail[] } = ids.length === 0 ? { items: [] } :
    await request<{ items?: VideoDetail[] }>(env, "videos.list", apiUrl(env, "videos", {
      part: "snippet,contentDetails,statistics",
      id: ids.join(","),
    }));
  for (const item of details.items ?? []) {
    if (!item.id || !item.snippet?.publishedAt) continue;
    const duration = parseDuration(item.contentDetails?.duration);
    await env.otw_db.prepare(
      `INSERT INTO youtube_feed_videos
       (video_id, source_id, title, description, thumbnail_url, channel_title,
        duration_seconds, view_count, is_short, published_at, fetched_at, available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(video_id) DO UPDATE SET title=excluded.title,
        description=excluded.description, thumbnail_url=excluded.thumbnail_url,
        channel_title=excluded.channel_title, duration_seconds=excluded.duration_seconds,
        view_count=excluded.view_count, is_short=excluded.is_short,
        fetched_at=excluded.fetched_at, available=1`,
    ).bind(
      item.id, source.id, item.snippet.title ?? "", item.snippet.description ?? "",
      item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.medium?.url ??
        item.snippet.thumbnails?.default?.url ?? null,
      item.snippet.channelTitle ?? "", duration,
      Number.parseInt(item.statistics?.viewCount ?? "0", 10) || 0,
      duration > 0 && duration <= 60 ? 1 : 0,
      Date.parse(item.snippet.publishedAt), timestamp,
    ).run();
  }
  await env.otw_db.prepare(
    `UPDATE youtube_feed_sources SET last_seen_video_id = ?, sync_page_token = ?,
       sync_base_video_id = ?, sync_newest_video_id = ?, last_attempt_at = ?,
       last_success_at = ?, next_check_at = ?, consecutive_failures = 0,
       last_error_code = NULL, updated_at = ? WHERE id = ?`,
  ).bind(
    complete ? newest : source.last_seen_video_id,
    complete ? null : pageToken,
    complete ? null : base,
    complete ? null : newest,
    timestamp, timestamp, timestamp + 6 * 60 * 60_000, timestamp, source.id,
  ).run();
  return ids.length;
};

export const runScheduledYouTubeFeedCollection = async (env: Env) => {
  const setting = await env.otw_db.prepare(
    `SELECT value FROM settings WHERE key = 'youtube_feed_enabled'`,
  ).first<{ value: string | null }>();
  if (setting?.value !== "true" || !env.YOUTUBE_API_KEY?.trim()) {
    return { status: "skipped" as const, attempted: 0, succeeded: 0, failed: 0 };
  }
  const timestamp = Date.now();
  await syncSourceRegistry(env, timestamp);
  const rows = await env.otw_db.prepare(
    `SELECT id, source_kind, youtube_channel_id, uploads_playlist_id,
       initialization_completed_at, last_seen_video_id, sync_page_token,
       sync_base_video_id, sync_newest_video_id
     FROM youtube_feed_sources WHERE enabled = 1 AND (next_check_at IS NULL OR next_check_at <= ?)
     ORDER BY next_check_at, id LIMIT 8`,
  ).bind(timestamp).all<FeedSource>();
  let succeeded = 0;
  let failed = 0;
  for (const source of rows.results ?? []) {
    try {
      await collectSource(env, source, timestamp);
      succeeded += 1;
    } catch (error) {
      failed += 1;
      await env.otw_db.prepare(
        `UPDATE youtube_feed_sources SET last_attempt_at=?, next_check_at=?,
         consecutive_failures=consecutive_failures+1, last_error_code=?, updated_at=? WHERE id=?`,
      ).bind(timestamp, timestamp + 60 * 60_000,
        error instanceof Error ? error.message.slice(0, 120) : "collection_failed",
        timestamp, source.id).run();
    }
  }
  return {
    status: failed === 0 ? "succeeded" as const : succeeded === 0 ? "failed" as const : "partial" as const,
    attempted: succeeded + failed,
    succeeded,
    failed,
  };
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
  // Lightweight route tests and pre-migration compatibility adapters may not
  // expose D1 first(). In that state the storage-only feature stays disabled.
  if (typeof settingStatement.first !== "function") return null;
  const enabled = await settingStatement.first<{ value: string | null }>();
  if (enabled?.value !== "true") return null;
  if (channelIds.length === 0) return { videos: [], shorts: [], oldestRetainedAt: null };
  const placeholders = channelIds.map(() => "?").join(",");
  const rows = await env.otw_db.prepare(
    `SELECT video.video_id, video.title, video.thumbnail_url, video.channel_title,
       video.duration_seconds, video.view_count, video.is_short, video.published_at,
       source.youtube_channel_id
     FROM youtube_feed_videos video JOIN youtube_feed_sources source ON source.id=video.source_id
     WHERE source.source_kind=? AND source.enabled=1 AND video.available=1
       AND video.published_at >= ? AND source.youtube_channel_id IN (${placeholders})
     ORDER BY video.published_at DESC LIMIT ?`,
  ).bind(sourceKind, Date.now() - RETENTION_MS, ...channelIds, maxResults * 2)
    .all<Record<string, unknown>>();
  const mapped = (rows.results ?? []).map((row): YouTubeVideoDto => ({
    videoId: String(row.video_id),
    title: String(row.title),
    publishedAt: new Date(Number(row.published_at)).toISOString(),
    thumbnailUrl: String(row.thumbnail_url ?? ""),
    duration: Number(row.duration_seconds),
    viewCount: Number(row.view_count),
    channelId: String(row.youtube_channel_id),
    channelTitle: String(row.channel_title),
    isShort: Number(row.is_short) === 1,
  }));
  return {
    videos: mapped.filter((item) => !item.isShort).slice(0, maxResults),
    shorts: mapped.filter((item) => item.isShort).slice(0, maxResults),
    oldestRetainedAt: mapped.length === 0
      ? null
      : mapped.reduce((oldest, item) => item.publishedAt < oldest ? item.publishedAt : oldest, mapped[0]!.publishedAt),
  };
};
