import type { SitePublicContent } from "@contracts/site-public-content";
import type { SiteContentCache } from "../application/ports/site-content-cache";

const key = (path: string, date: string) => `https://otw.internal/site-content/v1?${new URLSearchParams({ path, date })}`;
export class CloudflareSiteContentCache implements SiteContentCache {
  async get(path: string, date: string): Promise<SitePublicContent | null> {
    try {
      const response = await caches.default.match(key(path, date));
      if (!response) return null;
      const content = await response.json<SitePublicContent>();
      return content.path === path && content.date === date && Date.parse(content.expiresAt) > Date.now() ? content : null;
    } catch { return null; }
  }
  async put(content: SitePublicContent): Promise<void> {
    const ttl = Math.floor((Date.parse(content.expiresAt) - Date.now()) / 1000);
    if (!content.date || ttl <= 0) return;
    try {
      await caches.default.put(key(content.path, content.date), Response.json(content, { headers: { "Cache-Control": `public, max-age=${ttl}` } }));
    } catch (error) { console.warn("[site-content] cache unavailable", error); }
  }
}
