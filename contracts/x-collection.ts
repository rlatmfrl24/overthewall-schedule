export type XCollectionProvider = "fxembed" | "x_api";
export type XCollectionScope = "regular" | "pending" | "fallback";
export type XCollectionMode = "timeline" | "rss_candidates";
export type XHybridPolicy = "legacy" | "rss_v1";
export const FX_COLLECTION_INTERVAL_MS = 30 * 60_000;
export const FX_RSS_INTERVAL_MS = 6 * 3_600_000;
export const X_HYBRID_REGULAR_INTERVAL_MS = 12 * 3_600_000;
export const X_REGULAR_INTERVAL_MS = 24 * 60 * 60_000;
export const X_FALLBACK_INTERVAL_MS = 2 * 60 * 60_000;

export interface XCollectionAccountStatus {
  handle: string;
  fxLastSuccessAt: number | null;
  fxLastCompletedAt: number | null;
  fxPending: boolean;
  fxError: string | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  fallbackActive: boolean;
  officialLastCompletedAt: number | null;
  officialRegularCompletedAt: number | null;
  officialPending: boolean;
  officialError: string | null;
  officialNextEligibleAt: number | null;
}
export interface XCollectionStatusDto {
  primarySource: XCollectionProvider;
  observedAt: number;
  fxembed: { intervalMinutes: number; lastSuccessAt: number | null; lastCompletedAt: number | null; pendingSources: number; failedSources: number };
  xApi: { intervalHours: number; lastRegularCompletedAt: number | null; nextRegularEligibleAt: number; pendingSources: number; failedSources: number; budgetReady: boolean | null };
  accounts: XCollectionAccountStatus[];
  webhook: { state: "enabled" | "disabled" | "unavailable"; siteActiveCount: number | null; reason: string | null; error: string | null };
}
