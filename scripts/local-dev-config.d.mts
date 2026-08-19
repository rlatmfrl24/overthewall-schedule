export const LOCAL_DEV_HOST: "localhost";
export const DEFAULT_LOCAL_DEV_PORT: 5173;

export function parseLocalDevPort(value: unknown, source?: string): number;
export function resolveLocalDevPort(
  environment?: Record<string, string | undefined>,
): number;
export function getLocalDevServerConfig(
  environment?: Record<string, string | undefined>,
): {
  host: typeof LOCAL_DEV_HOST;
  port: number;
  strictPort: true;
};
export function getLocalDevOrigin(
  environment?: Record<string, string | undefined>,
): string;
export function resolveLocalD1PersistState(
  environment?: Record<string, string | undefined>,
): true | { path: string };
export function rewriteLocalSpaRequest(request: {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers: { accept?: string };
}): boolean;
