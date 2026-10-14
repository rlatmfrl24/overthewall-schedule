/** A known archived video cannot be re-exposed through an arbitrary-ID metadata read or curated artwork.
 * A separate normal performance/feed row remains a legitimate shared-content reference. */
export async function isArchivedYouTubeVideo(db: Pick<D1Database, "prepare">, videoId: string): Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 WHERE (
    EXISTS (SELECT 1 FROM music_cover_proposals WHERE youtube_video_id=?1 AND content_access='admin_archive')
    OR EXISTS (SELECT 1 FROM music_ingestion_candidates WHERE provider='youtube' AND external_video_id=?1 AND content_access='admin_archive')
    OR EXISTS (SELECT 1 FROM youtube_feed_videos WHERE video_id=?1 AND content_access='admin_archive')
    OR EXISTS (SELECT 1 FROM music_media_sources source JOIN music_performance_sources link ON link.source_id=source.id
      JOIN music_performances performance ON performance.id=link.performance_id
      WHERE source.provider='youtube' AND source.external_id=?1 AND performance.content_access='admin_archive'))
    AND NOT EXISTS (SELECT 1 FROM music_media_sources source JOIN music_performance_sources link ON link.source_id=source.id
      JOIN music_performances performance ON performance.id=link.performance_id
      WHERE source.provider='youtube' AND source.external_id=?1 AND performance.content_access='normal')
    AND NOT EXISTS (SELECT 1 FROM youtube_feed_videos WHERE video_id=?1 AND content_access='normal')`)
    .bind(videoId).first());
}
