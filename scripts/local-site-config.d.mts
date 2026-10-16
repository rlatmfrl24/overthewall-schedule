import type { SiteId } from "../contracts/site-definition.ts";
interface LocalConfig {
  main: string;
  assets: { directory: string; [key: string]: unknown };
  vars?: Record<string, string>;
  d1_databases: { migrations_dir: string; remote?: boolean; [key: string]: unknown }[];
  r2_buckets: { remote?: boolean; [key: string]: unknown }[];
  [key: string]: unknown;
}
export function createLocalSiteConfig(source: LocalConfig, siteId: SiteId, root?: string): LocalConfig & { vars: Record<string, string> };
export function writeLocalSiteConfig(siteId: SiteId, environment: Record<string, string>, root?: string): string;
