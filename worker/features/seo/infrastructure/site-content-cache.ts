import type { SiteDefinition } from "@contracts/site-definition";
import type { SitePublicContent } from "@contracts/site-public-content";
import type { SiteContentCache } from "../application/ports/site-content-cache";
import { getHiddenMemberCodes } from "@contracts/site-publication";

export class CloudflareSiteContentCache implements SiteContentCache {
  private readonly site: SiteDefinition;
  constructor(site: SiteDefinition) { this.site = site; }
  private key(path: string, date: string, accessRevision: number) { return `https://${this.site.id}.internal/site-content/v3/${Number(getHiddenMemberCodes(this.site.id, Date.now()).length > 0)}/${accessRevision}?${new URLSearchParams({ path, date })}`; }
  async get(path: string, date: string, accessRevision: number): Promise<SitePublicContent | null> {
    try {
      const response = await caches.default.match(this.key(path, date, accessRevision));
      if (!response) return null;
      const content = await response.json<SitePublicContent>();
      return content.path === path && content.date === date && Date.parse(content.expiresAt) > Date.now() ? content : null;
    } catch { return null; }
  }
  async put(content: SitePublicContent, accessRevision: number): Promise<void> {
    const ttl = Math.floor((Date.parse(content.expiresAt) - Date.now()) / 1000);
    if (!content.date || ttl <= 0) return;
    try {
      await caches.default.put(this.key(content.path, content.date, accessRevision), Response.json(content, { headers: { "Cache-Control": `public, max-age=${ttl}` } }));
    } catch (error) { console.warn("[site-content] cache unavailable", error); }
  }
}
