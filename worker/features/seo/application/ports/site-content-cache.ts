import type { SitePublicContent } from "@contracts/site-public-content";
export interface SiteContentCache {
  get(path: string, date: string, accessRevision: number): Promise<SitePublicContent | null>;
  put(content: SitePublicContent, accessRevision: number): Promise<void>;
}
