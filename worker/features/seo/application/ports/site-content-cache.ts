import type { SitePublicContent } from "@contracts/site-public-content";
export interface SiteContentCache {
  get(path: string, date: string): Promise<SitePublicContent | null>;
  put(content: SitePublicContent): Promise<void>;
}
