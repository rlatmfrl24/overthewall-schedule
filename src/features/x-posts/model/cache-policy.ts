const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const X_POSTS_CLIENT_CACHE_POLICY = {
  freshTtlMs: 30 * MINUTE_MS,
  staleTtlMs: 2 * HOUR_MS,
  version: "v4",
} as const;
