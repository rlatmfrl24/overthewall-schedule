import type { SiteContentItem, SiteContentSection } from "@contracts/site-public-content";
import type { XPostDto } from "@contracts/x-posts";

type FeedRow = { item: SiteContentItem; fetchedAt: number };

/** Reads already collected, visible content only. Never invokes collection or enrichment. */
export async function readSiteContentFeed(db: D1Database, policy: { xVisibility: string; cafeEnabled: boolean; cafeVisibility: string }): Promise<SiteContentSection[]> {
  const sources: Array<{ id: string; title: string; read: () => Promise<FeedRow[]> }> = [];
  if (policy.xVisibility === "public") sources.push({ id: "x", title: "공개 X 게시글", read: async () => {
    const members = (await db.prepare("SELECT url_twitter FROM members WHERE is_deprecated IS NULL OR is_deprecated = 0").all<{ url_twitter: string | null }>()).results;
    const handles = members.flatMap(m => {
      try { return [new URL(m.url_twitter ?? "").pathname.split("/").filter(Boolean)[0]?.toLowerCase()].filter((v): v is string => Boolean(v)); } catch { return []; }
    });
    if (!handles.length) return [];
    const rows = (await db.prepare(`SELECT value, fetched_at FROM x_posts WHERE hidden_at IS NULL AND content_removed_at IS NULL
      AND lower(handle) IN (SELECT value FROM json_each(?)) ORDER BY created_at DESC, id DESC LIMIT 10`).bind(JSON.stringify(handles)).all<{ value: string; fetched_at: number }>()).results;
    return rows.map(row => { const post = JSON.parse(row.value) as XPostDto; return {
      item: { title: post.text, text: `X · ${post.username}`, url: post.url, publishedAt: post.createdAt }, fetchedAt: row.fetched_at,
    }; });
  } });
  if (policy.cafeEnabled && policy.cafeVisibility === "public") sources.push({ id: "cafe", title: "공개 팬카페 게시글", read: async () => {
    const rows = (await db.prepare(`SELECT p.title, p.summary, p.url, p.created_at, p.fetched_at, p.source_name
      FROM naver_cafe_posts p JOIN naver_cafe_sources s ON s.id = p.source_id
      LEFT JOIN members m ON m.uid = s.member_uid
      WHERE p.hidden_at IS NULL AND p.content_removed_at IS NULL AND s.enabled = 1 AND s.archived_at IS NULL
        AND (s.member_uid IS NULL OR m.is_deprecated IS NULL OR m.is_deprecated = 0)
      ORDER BY p.created_at DESC, p.id DESC LIMIT 10`).all<{ title: string; summary: string; url: string; created_at: string; fetched_at: number; source_name: string }>()).results;
    return rows.map(r => ({ item: { title: r.title, text: `${r.source_name} · ${r.summary}`, url: r.url, publishedAt: r.created_at }, fetchedAt: r.fetched_at }));
  } });
  const results = await Promise.allSettled(sources.map(source => source.read()));
  if (results.length && results.every(result => result.status === "rejected")) {
    throw new Error("All public feed sources are unavailable");
  }
  const rows = results.flatMap(r => r.status === "fulfilled" ? r.value : []).sort((a, b) => Date.parse(b.item.publishedAt ?? "") - Date.parse(a.item.publishedAt ?? "")).slice(0, 10);
  const oldest = rows.length ? Math.min(...rows.map(r => r.fetchedAt)) : null;
  const sections: SiteContentSection[] = sources.length ? [{ id: "feed", title: "전체 공개 소스의 최신 게시글", items: rows.map(r => r.item), updatedAt: oldest ? new Date(oldest).toISOString() : null,
    status: rows.length ? (oldest && Date.now() - oldest < 600_000 ? "available" : "stale") : "empty" }] : [];
  results.forEach((r, i) => { if (r.status === "rejected") sections.push({ id: sources[i].id, title: sources[i].title, status: "unavailable", updatedAt: null, items: [] }); });
  return sections;
}
