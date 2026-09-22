import type { ChzzkVideoDto, ChzzkClipDto } from "@contracts/chzzk";
import type { SiteContentItem, SiteContentSection } from "@contracts/site-public-content";

export async function readSiteContentChzzk(db: D1Database): Promise<SiteContentSection[]> {
  const members = (await db.prepare("SELECT name, url_chzzk FROM members WHERE is_deprecated IS NULL OR is_deprecated = 0").all<{ name: string; url_chzzk: string | null }>()).results;
  const channels = members.flatMap(m => {
    try { const id = new URL(m.url_chzzk ?? "").pathname.split("/").filter(Boolean).pop(); return id ? [{ id, name: m.name }] : []; } catch { return []; }
  });
  return Promise.all((["vods", "clips"] as const).map(async type => {
    const title = type === "vods" ? "치지직 다시보기" : "치지직 클립";
    try {
      const keys = channels.flatMap(c => type === "vods"
        ? ["0:1", "0:5", "1:5", "2:5", "0:10"].map(profile => `vods:v1:${c.id}:${profile}`)
        : [`clips:v1:${c.id}:10`]);
      const rows = (await db.prepare("SELECT key, value, fetched_at, expires_at FROM chzzk_api_cache WHERE key IN (SELECT value FROM json_each(?)) ORDER BY fetched_at ASC").bind(JSON.stringify(keys)).all<{ key: string; value: string; fetched_at: number; expires_at: number }>()).results;
      const items: SiteContentItem[] = [];
      let stale = channels.some(c => !rows.some(row => row.key.includes(`:${c.id}:`)));
      for (const row of rows) {
        const content = JSON.parse(row.value) as { data?: (ChzzkVideoDto | ChzzkClipDto)[] } | null;
        if (!content || !Array.isArray(content.data)) { stale = true; continue; }
        stale ||= row.expires_at < Date.now();
        for (const item of content.data) {
          if ("videoTitle" in item) items.push({ title: item.videoTitle, text: item.channel?.channelName, url: `https://chzzk.naver.com/video/${item.videoNo}`, publishedAt: item.publishDate });
          else if (!item.blindType || item.blindType === "NONE") items.push({ title: item.clipTitle, text: channels.find(c => c.id === item.ownerChannelId)?.name, url: `https://chzzk.naver.com/clips/${encodeURIComponent(item.clipUID)}`, publishedAt: item.createdDate });
        }
      }
      const unique = [...new Map(items.map(item => [item.url, item])).values()].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).slice(0, 5);
      return { id: `chzzk-${type}`, title: `${title} · 전체 멤버`, status: !rows.length ? "empty" : stale ? "stale" : unique.length ? "available" : "empty",
        updatedAt: rows.length ? new Date(Math.min(...rows.map(r => r.fetched_at))).toISOString() : null, items: unique } satisfies SiteContentSection;
    } catch (error) {
      console.error("[site-content] stored CHZZK read failed", type, error);
      return { id: `chzzk-${type}`, title, status: "unavailable", updatedAt: null, items: [] } satisfies SiteContentSection;
    }
  }));
}
