import { publicationHiddenSql, publicationChannelHiddenSql } from "./publication-access";
import type { SiteId } from "@contracts/site-definition";
/** A known archived video cannot be re-exposed through an arbitrary-ID metadata read or curated artwork.
 * A separate normal performance/feed row remains a legitimate shared-content reference. */
export async function isArchivedYouTubeVideo(db: Pick<D1Database, "prepare">, videoId: string, siteId: SiteId = "luvdia", channelId: string | null = null): Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 WHERE ${archivedYouTubeVideoSql("?1",siteId,"?2")}`)
    .bind(...(siteId === "otw" ? [videoId, channelId] : [videoId])).first());
}

export function archivedYouTubeVideoSql(videoSql: string, siteId: SiteId, channelSql = "NULL"): string {
  return `(
    ${publicationChannelHiddenSql("?2",siteId)} OR EXISTS (SELECT 1 FROM music_cover_proposals WHERE youtube_video_id=?1 AND (content_access='admin_archive' OR ${publicationHiddenSql("music_cover_proposals","music_cover_proposals",siteId)}))
    OR EXISTS (SELECT 1 FROM music_ingestion_candidates WHERE provider='youtube' AND external_video_id=?1 AND (content_access='admin_archive' OR ${publicationHiddenSql("music_ingestion_candidates","music_ingestion_candidates",siteId)}))
    OR EXISTS (SELECT 1 FROM youtube_feed_videos WHERE video_id=?1 AND (content_access='admin_archive' OR ${publicationHiddenSql("youtube_feed_videos","youtube_feed_videos",siteId)}))
    OR EXISTS (SELECT 1 FROM music_media_sources source JOIN music_performance_sources link ON link.source_id=source.id
      JOIN music_performances performance ON performance.id=link.performance_id
      WHERE source.provider='youtube' AND source.external_id=?1 AND (performance.content_access='admin_archive' OR ${publicationHiddenSql("music_performances","performance",siteId)})))
    AND NOT EXISTS (SELECT 1 FROM music_media_sources source JOIN music_performance_sources link ON link.source_id=source.id
      JOIN music_performances performance ON performance.id=link.performance_id
      WHERE source.provider='youtube' AND source.external_id=?1 AND performance.content_access='normal' AND NOT (${publicationHiddenSql("music_performances","performance",siteId)}))
    AND NOT EXISTS (SELECT 1 FROM youtube_feed_videos WHERE video_id=?1 AND content_access='normal' AND NOT (${publicationHiddenSql("youtube_feed_videos","youtube_feed_videos",siteId)}))`
    .replaceAll("?1",videoSql).replaceAll("?2",channelSql);
}
