import type { SiteId } from "../contracts/site-definition.ts";
export interface SiteTarget { siteId: SiteId; configPath: string; outputRoot: string; localPersistTo: string }
export function getSiteTarget(siteId: SiteId): SiteTarget;
export function parseSiteArgument(args?: string[]): SiteId;
export function getSiteEnvDirectory(siteId: SiteId): string;
export function loadSiteEnvironment(siteId: SiteId, mode: string, environment?: Record<string, string | undefined>, root?: string): Record<string, string>;
export function resolveSiteOrigin(siteId: SiteId, environment: Record<string, string | undefined>): string;
export function getSiteLocalEnvironment(siteId: SiteId, environment?: Record<string, string | undefined>, root?: string): Record<string, string | undefined>;
