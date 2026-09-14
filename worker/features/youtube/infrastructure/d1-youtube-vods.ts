import type { YouTubeVodChannelStatusDto, YouTubeVodsRequest, YouTubeVodsResponseDto } from "@contracts/youtube";
import type { Env } from "../../../platform/types";
import { YOUTUBE_CHANNEL_ID_PATTERN } from "../domain/channel-targets";
import { decodeVodCursor, encodeVodCursor } from "../domain/vod-cursor";

type LinkRow = { member_uid: number; name: string; label: string; youtube_channel_id: string | null; initialization_completed_at: number | null; last_success_at: number | null; last_error_code: string | null; source_id: number | null };
const readLinks = async (db: D1Database) => (await db.prepare(`
  SELECT member.uid AS member_uid, member.name, link.label, link.youtube_channel_id,
    source.id AS source_id, source.initialization_completed_at, source.last_success_at, source.last_error_code
  FROM member_links link JOIN members member ON member.uid = link.member_uid
  LEFT JOIN youtube_feed_sources source ON source.youtube_channel_id = link.youtube_channel_id
    AND source.source_kind = 'official' AND source.enabled = 1
  WHERE link.type = 'youtube_vod' AND link.enabled = 1
    AND (member.is_deprecated IS NULL OR member.is_deprecated != 1)
  ORDER BY member.uid, link.sort_order, link.id
`).all<LinkRow>()).results ?? [];

export const readYouTubeVodChannelStatus = async (db: D1Database): Promise<YouTubeVodChannelStatusDto[]> =>
  (await readLinks(db)).map((link) => ({
    memberUid: link.member_uid, memberName: link.name, label: link.label, channelId: link.youtube_channel_id,
    issue: !link.youtube_channel_id ? "missing_channel_id" : !YOUTUBE_CHANNEL_ID_PATTERN.test(link.youtube_channel_id) ? "invalid_channel_id" : link.last_error_code ? "collection_failed" : !link.initialization_completed_at ? "initializing" : null,
  }));

export const readYouTubeVods = async (env: Env, input: YouTubeVodsRequest): Promise<YouTubeVodsResponseDto> => {
  const filter = [...new Set(input.memberUids)].sort((a, b) => a - b);
  const cursor = decodeVodCursor(input.cursor, filter);
  const links = (await readLinks(env.otw_db)).filter((link) => link.youtube_channel_id && YOUTUBE_CHANNEL_ID_PATTERN.test(link.youtube_channel_id));
  const availableMemberUids = [...new Set(links.map((link) => link.member_uid))];
  const selected = links.filter((link) => !filter.length || filter.includes(link.member_uid));
  const channels = [...new Set(selected.map((link) => link.youtube_channel_id!))];
  const empty = { items: [], availableMemberUids, nextCursor: null, hasMore: false, updatedAt: null };
  if (!channels.length) return { ...empty, collection: { state: links.length ? "ready" : "unregistered" } };
  const settings = (await env.otw_db.prepare("SELECT key, value FROM settings WHERE key IN ('youtube_feed_enabled', 'scheduled_v2_youtube_feed_collection_enabled')").all<{ key: string; value: string }>()).results ?? [];
  const enabled = ["youtube_feed_enabled", "scheduled_v2_youtube_feed_collection_enabled"].every((key) => settings.some((setting) => setting.key === key && setting.value === "true"));
  const initialized = selected.filter((link) => link.initialization_completed_at);
  const failed = selected.filter((link) => link.last_error_code);
  const state = !enabled || !env.YOUTUBE_API_KEY?.trim() ? "disabled" :
    failed.length === selected.length ? "error" : failed.length || (initialized.length && initialized.length < selected.length) ? "partial" :
    !initialized.length ? "initializing" : "ready";
  const rows = (await env.otw_db.prepare(`
    SELECT video.*, source.youtube_channel_id FROM youtube_feed_videos video
    JOIN youtube_feed_sources source ON source.id = video.source_id
    WHERE source.source_kind = 'official' AND source.enabled = 1
      AND source.youtube_channel_id IN (SELECT value FROM json_each(?))
      AND video.available = 1 AND video.is_short = 0
      ${cursor ? "AND (video.published_at < ? OR (video.published_at = ? AND video.video_id > ?))" : ""}
    ORDER BY video.published_at DESC, video.video_id ASC LIMIT ?
  `).bind(JSON.stringify(channels), ...(cursor ? [cursor.publishedAt, cursor.publishedAt, cursor.videoId] : []), input.limit + 1).all<{
    video_id: string; title: string; published_at: number; thumbnail_url: string; duration_seconds: number; view_count: number; youtube_channel_id: string; channel_title: string;
  }>()).results ?? [];
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  const latest = Math.max(0, ...selected.map((link) => link.last_success_at ?? 0));
  return {
    items: page.map((row) => ({ videoId: row.video_id, title: row.title, publishedAt: new Date(row.published_at).toISOString(), thumbnailUrl: row.thumbnail_url,
      duration: row.duration_seconds, viewCount: row.view_count, channelId: row.youtube_channel_id, channelTitle: row.channel_title, isShort: false,
      memberUids: [...new Set(links.filter((link) => link.youtube_channel_id === row.youtube_channel_id).map((link) => link.member_uid))],
    })), availableMemberUids,
    nextCursor: rows.length > input.limit && last ? encodeVodCursor(last.published_at, last.video_id, filter) : null,
    hasMore: rows.length > input.limit, updatedAt: latest ? new Date(latest).toISOString() : null, collection: { state },
  };
};
