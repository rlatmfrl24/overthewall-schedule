export type XCollectionProvider = "fxembed" | "x_api";
export type XCollectionScope = "regular" | "pending" | "fallback";
export type XCollectionMode = "timeline" | "rss_candidates";
export type XHybridPolicy = "legacy" | "rss_v1";
export type XOfficialHealth = "due" | "attention" | "overdue" | "waiting";
export const FX_COLLECTION_INTERVAL_MS = 30 * 60_000;
export const FX_RSS_INTERVAL_MS = 6 * 3_600_000;
export const X_HYBRID_REGULAR_INTERVAL_MS = 12 * 3_600_000;
export const X_REGULAR_INTERVAL_MS = 24 * 60 * 60_000;
export const X_FALLBACK_INTERVAL_MS = 2 * 60 * 60_000;

export type FxRssCandidate = { id: string; firstSeenAt: number; createdAtHint: number; attempts: number; nextAttemptAt: number; error: string | null; stage: "free" | "official" };
export type XNewlyStoredPost = { id: string; createdAt: string; storedAt: number };
export type FxRssPaidBatch = { day: string; ids: string[]; requestId: string };
export type FxRssContinuation = {
  provider: "fxembed"; mode: "rss_candidates"; scope: "regular" | "pending"; handles: [string];
  phase: "fetch" | "hydrate"; candidates: FxRssCandidate[]; nextAttemptAt: number | null; resumeFromItemId?: string | null; paidBatch?: FxRssPaidBatch | null;
};
export type FxRssStats = { rawCount: number; candidatesFound: number; resolved: number; postsReturned: number; postsStored: number; pending: number; freeApiCalls: number; paidApiCalls: number; estimatedCostMicros: number; newlyStoredPosts?: XNewlyStoredPost[]; windowReduced?: boolean };
export type FxRssStepResult = { state: FxRssContinuation; stats: FxRssStats; status: "complete" | "pending" | "blocked"; error: string | null; nextAttemptAt: number | null };

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
  officialNominalDueAt: number | null;
  officialBlockedReason: string | null;
  officialRegularAgeMs: number | null;
  officialHealth: XOfficialHealth;
  rssLastHttpSuccessAt: number | null;
  rssLastCheckCompletedAt: number | null;
  rssPendingCandidates: number;
  rssWindowReduced: boolean;
  rssError: string | null;
}
export interface XCollectionStatusDto {
  primarySource: XCollectionProvider;
  hybridPolicy: XHybridPolicy | null;
  observedAt: number;
  rss: { enabled: boolean; intervalHours: number; lastHttpSuccessAt: number | null; lastCheckCompletedAt: number | null; pendingSources: number; pendingCandidates: number; windowReduced: boolean; error: string | null };
  fxembed: { intervalMinutes: number; lastSuccessAt: number | null; lastCompletedAt: number | null; pendingSources: number; failedSources: number };
  xApi: { intervalHours: number; lastRegularCompletedAt: number | null; nextRegularEligibleAt: number; pendingSources: number; failedSources: number; budgetReady: boolean | null };
  accounts: XCollectionAccountStatus[];
  webhook: { state: "enabled" | "disabled" | "unavailable"; siteActiveCount: number | null; reason: string | null; error: string | null };
}
