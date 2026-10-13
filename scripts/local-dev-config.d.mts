export const LOCAL_DEV_HOST: "localhost";
import type { SiteId } from "../contracts/site-definition.ts";
export const DEFAULT_LOCAL_DEV_PORT: 5173;

export function parseLocalDevPort(value: unknown, source?: string): number;
export function resolveLocalDevPort(
  environment?: Record<string, string | undefined>,
  siteId?: SiteId,
): number;
export function getLocalDevServerConfig(
  environment?: Record<string, string | undefined>,
  siteId?: SiteId,
): {
  host: typeof LOCAL_DEV_HOST;
  port: number;
  strictPort: true;
};
export function getLocalDevOrigin(
  environment?: Record<string, string | undefined>,
  siteId?: SiteId,
): string;
export function resolveLocalD1PersistState(
  environment?: Record<string, string | undefined>,
  siteId?: SiteId,
): { path: string };
export function rewriteLocalSpaRequest(request: {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers: { accept?: string };
}): boolean;
