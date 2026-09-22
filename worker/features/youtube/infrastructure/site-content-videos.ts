import type { SiteContentSection } from "@contracts/site-public-content";

/** Saved public video catalog, bounded independently for each existing UI category. */
export async function readSiteContentYouTube(db: D1Database): Promise<SiteContentSection[]> {
  const categories = [
    { id: "official-youtube", title: "공식 유튜브", predicate: `s.source_kind = 'official' AND s.youtube_channel_id IN (SELECT youtube_channel_id FROM members WHERE is_deprecated IS NULL OR is_deprecated = 0)` },
    { id: "youtube-vods", title: "유튜브 다시보기", predicate: `s.source_kind = 'official' AND s.youtube_channel_id IN (SELECT l.youtube_channel_id FROM member_links l JOIN members m ON m.uid = l.member_uid WHERE l.type = 'youtube_vod' AND l.enabled = 1 AND (m.is_deprecated IS NULL OR m.is_deprecated = 0)) AND v.is_short = 0` },
    { id: "kirinuki", title: "키리누키", predicate: `s.source_kind = 'kirinuki' AND s.kirinuki_channel_id IN (SELECT id FROM kirinuki_channels)` },
  ];
  return Promise.all(categories.map(async c => {
    try {
      const rows = (await db.prepare(`SELECT v.video_id, v.title, v.channel_title, v.published_at, v.fetched_at
        FROM youtube_feed_videos v JOIN youtube_feed_sources s ON s.id = v.source_id
        WHERE s.enabled = 1 AND v.available = 1 AND ${c.predicate}
        ORDER BY v.published_at DESC, v.video_id LIMIT 5`).all<{ video_id: string; title: string; channel_title: string; published_at: number; fetched_at: number }>()).results;
      const oldest = rows.length ? Math.min(...rows.map(r => r.fetched_at)) : null;
      return { id: c.id, title: `${c.title} · 전체 멤버`, updatedAt: oldest ? new Date(oldest).toISOString() : null,
        status: rows.length ? (oldest && Date.now() - oldest < 6 * 3_600_000 ? "available" : "stale") : "unavailable",
        items: rows.map(r => ({ title: r.title, text: r.channel_title, url: `https://www.youtube.com/watch?v=${encodeURIComponent(r.video_id)}`, publishedAt: new Date(r.published_at).toISOString() })),
      } satisfies SiteContentSection;
    } catch (error) {
      console.error("[site-content] stored YouTube read failed", c.id, error);
      return { id: c.id, title: c.title, status: "unavailable", updatedAt: null, items: [] } satisfies SiteContentSection;
    }
  }));
}
