import type { SiteDefinition } from "@contracts/site-definition";
import type { SitePublicContent } from "@contracts/site-public-content";
import type { SiteContentCache } from "../application/ports/site-content-cache";

export class CloudflareSiteContentCache implements SiteContentCache {
  private readonly site: SiteDefinition;
  constructor(site: SiteDefinition) { this.site = site; }
  private key(path: string, date: string) { return `https://${this.site.id}.internal/site-content/v1?${new URLSearchParams({ path, date })}`; }
  async get(path: string, date: string): Promise<SitePublicContent | null> {
    try {
      const response = await caches.default.match(this.key(path, date));
      if (!response) return null;
      const content = await response.json<SitePublicContent>();
      return content.path === path && content.date === date && Date.parse(content.expiresAt) > Date.now() ? content : null;
    } catch { return null; }
  }
  async put(content: SitePublicContent): Promise<void> {
    const ttl = Math.floor((Date.parse(content.expiresAt) - Date.now()) / 1000);
    if (!content.date || ttl <= 0) return;
    try {
      await caches.default.put(this.key(content.path, content.date), Response.json(content, { headers: { "Cache-Control": `public, max-age=${ttl}` } }));
    } catch (error) { console.warn("[site-content] cache unavailable", error); }
  }
}
