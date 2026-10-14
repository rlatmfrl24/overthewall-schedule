import type { SiteId } from "../contracts/site-definition.ts";
export interface SiteResourceConfig {
  vars?: Record<string, string>;
  queues?: { producers?: { binding: string; queue: string }[]; consumers?: { queue: string; dead_letter_queue?: string }[] };
  analytics_engine_datasets?: { binding: string; dataset: string }[];
}
export function assertSiteResourceConfig(config: SiteResourceConfig, siteId: SiteId): void;
