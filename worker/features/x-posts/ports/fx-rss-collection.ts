import type { FxRssCandidate, FxRssContinuation, FxRssPaidBatch, FxRssStats, XHybridPolicy, XNewlyStoredPost } from "@contracts/x-collection";
import type { XPostDto } from "@contracts/x-posts";

export type FxRssEntry = { id: string; handle: string; createdAtHint: number };
export type FxRssPage = { entries: FxRssEntry[]; rawCount: number };
export type OfficialRssHydrationResult = { resolvedIds: string[]; remaining: FxRssCandidate[]; postsReturned: number; postsStored: number; paidApiCalls: number; estimatedCostMicros: number; error: string | null; newlyStoredPosts?: XNewlyStoredPost[] };

export interface FxRssCollectionPorts {
  now(): number;
  readContext(handle: string): Promise<{ allowed: boolean; policy: XHybridPolicy; collectionStartedAt: number; trustedUserId: string | null; pendingItemId: string | null }>;
  fetchFeed(handle: string): Promise<FxRssPage>;
  fetchStatus(postId: string, handle: string, trustedUserId: string): Promise<XPostDto>;
  readStoredIds(ids: string[]): Promise<string[]>;
  store(post: XPostDto, origin: "fxembed" | "x_api"): Promise<{ ok: boolean; postsStored: number }>;
  prepareOfficialBatch(candidates: FxRssCandidate[], batch: FxRssPaidBatch | null): Promise<{ batch: FxRssPaidBatch | null; error: string | null }>;
  hydrateOfficial(candidates: FxRssCandidate[]): Promise<OfficialRssHydrationResult>;
  checkpoint(state: FxRssContinuation, stats: FxRssStats): Promise<boolean>;
}

export class FxCandidateExcludedError extends Error {
  readonly code = "fx_candidate_excluded";
  constructor() { super("fx_candidate_excluded"); }
}
