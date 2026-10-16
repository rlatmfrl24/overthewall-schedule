import type { YouTubeHistoryRequest, YouTubeHistoryDto } from "@contracts/youtube";
import type { AdminYouTubeHistoryReader } from "../application/history-reader";
import { decodeYouTubeShortsCursor, encodeYouTubeShortsCursor } from "../domain/shorts-cursor";

/** Retained metadata, including inactive sources/unavailable videos. No collection side effects. */
export class D1AdminYouTubeHistoryReader implements AdminYouTubeHistoryReader {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async read(input: YouTubeHistoryRequest): Promise<YouTubeHistoryDto> {
    const channels = (await this.db.prepare(`SELECT source.youtube_channel_id AS channelId,
      COALESCE(member.name, kirinuki.channel_name, source.youtube_channel_id) AS name,
      source.source_kind AS sourceKind, COALESCE(member.content_access, 'normal') AS contentAccess
      FROM youtube_feed_sources source LEFT JOIN members member ON member.uid = source.member_uid
      LEFT JOIN kirinuki_channels kirinuki ON kirinuki.id = source.kirinuki_channel_id
      ORDER BY name, channelId`).all<YouTubeHistoryDto["channels"][number]>()).results;
    const ids = input.channelId ? [input.channelId] : [];
    const cursor = decodeYouTubeShortsCursor(input.cursor, ids);
    const rows = (await this.db.prepare(`SELECT video.*, source.youtube_channel_id, source.source_kind
      FROM youtube_feed_videos video JOIN youtube_feed_sources source ON source.id = video.source_id
      WHERE (? IS NULL OR source.youtube_channel_id = ?)
      ${cursor ? "AND (video.published_at < ? OR (video.published_at = ? AND video.video_id > ?))" : ""}
      ORDER BY video.published_at DESC, video.video_id ASC LIMIT ?`)
      .bind(input.channelId, input.channelId, ...(cursor ? [cursor.publishedAt, cursor.publishedAt, cursor.videoId] : []), input.limit + 1).all<{
        video_id: string; title: string; description: string; thumbnail_url: string | null; channel_title: string;
        duration_seconds: number; view_count: number; is_short: number; published_at: number; fetched_at: number;
        available: number; content_access: "normal" | "admin_archive"; youtube_channel_id: string; source_kind: "official" | "kirinuki";
      }>()).results;
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return { channels, items: page.map(row => ({ videoId: row.video_id, title: row.title, description: row.description,
      thumbnailUrl: row.thumbnail_url ?? "", channelTitle: row.channel_title, channelId: row.youtube_channel_id,
      duration: row.duration_seconds, viewCount: row.view_count, isShort: Boolean(row.is_short), publishedAt: new Date(row.published_at).toISOString(),
      storedAt: new Date(row.fetched_at).toISOString(), available: Boolean(row.available), contentAccess: row.content_access, sourceKind: row.source_kind })),
      nextCursor: rows.length > input.limit && last ? encodeYouTubeShortsCursor({ publishedAt: last.published_at, videoId: last.video_id }, ids) : null };
  }
}
