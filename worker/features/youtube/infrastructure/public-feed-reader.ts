import type { SiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-access";

/** Source-first seeks keep ownership checks outside the video history scan. */
export async function readPublicFeedRows<T>(db: D1Database, siteId: SiteId, input: {
  sourceWhere: string;
  bindings?: unknown[];
  short?: boolean;
  limit: number;
  cursor?: { publishedAt: number; videoId: string } | null;
}): Promise<T[]> {
  const cursor = input.cursor;
  return (await db.prepare(`SELECT video.video_id, video.title, video.thumbnail_url,
      video.channel_title, video.duration_seconds, video.view_count,
      video.is_short, video.published_at, video.fetched_at, source.youtube_channel_id
    FROM (SELECT * FROM youtube_feed_sources source
      WHERE source.enabled = 1 AND (${input.sourceWhere})
        AND NOT (${publicationHiddenSql("youtube_feed_sources", "source", siteId)})) source
    CROSS JOIN json_each((SELECT json_group_array(row_key) FROM (
        SELECT candidate.rowid AS row_key FROM youtube_feed_videos candidate
          INDEXED BY ${input.short === undefined ? "idx_youtube_feed_videos_public_published" : "idx_youtube_feed_videos_public_kind_published"}
        WHERE candidate.source_id = source.id AND candidate.content_access = 'normal'
          AND candidate.available = 1 ${input.short === undefined ? "" : "AND candidate.is_short = ?"}
          ${cursor ? "AND (candidate.published_at < ? OR (candidate.published_at = ? AND candidate.video_id > ?))" : ""}
        ORDER BY candidate.published_at DESC, candidate.video_id ASC LIMIT ?
      ))) selected
    CROSS JOIN youtube_feed_videos video
    WHERE video.rowid = selected.value
    ORDER BY video.published_at DESC, video.video_id ASC LIMIT ?`)
    .bind(...(input.bindings ?? []), ...(input.short === undefined ? [] : [input.short ? 1 : 0]),
      ...(cursor ? [cursor.publishedAt, cursor.publishedAt, cursor.videoId] : []), input.limit, input.limit)
    .all<T>()).results;
}
