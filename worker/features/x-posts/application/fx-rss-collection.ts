import type { FxRssContinuation, FxRssStats, FxRssStepResult } from "@contracts/x-collection";
import { FxCandidateExcludedError, type FxRssCollectionPorts } from "../ports/fx-rss-collection";

const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
export function parseFxRssContinuation(value: Record<string, unknown>): FxRssContinuation {
  if (value.provider !== "fxembed" || value.mode !== "rss_candidates" || !["regular", "pending"].includes(String(value.scope)) ||
    !Array.isArray(value.handles) || value.handles.length !== 1 || typeof value.handles[0] !== "string" || !/^[a-z0-9_]{1,15}$/.test(value.handles[0]) ||
    !["fetch", "hydrate"].includes(String(value.phase)) || !Array.isArray(value.candidates) || value.candidates.length > 100 ||
    !(value.nextAttemptAt === null || nonnegative(value.nextAttemptAt)) ||
    !(value.resumeFromItemId == null || typeof value.resumeFromItemId === "string") ||
    value.candidates.some(c => typeof c !== "object" || c === null || typeof c.id !== "string" || !/^\d{1,25}$/.test(c.id) || !nonnegative(c.firstSeenAt) || !nonnegative(c.createdAtHint) || !Number.isSafeInteger(c.attempts) || c.attempts < 0 || !nonnegative(c.nextAttemptAt) || !(c.error === null || typeof c.error === "string") || !["free", "official"].includes(c.stage)) ||
    new Set(value.candidates.map(c => c.id)).size !== value.candidates.length || value.phase === "fetch" && value.candidates.length > 0) throw new Error("invalid_x_rss_continuation");
  return value as FxRssContinuation;
}

// Match the existing half-hour Cron rather than drifting past it by execution time.
const nextTick = (now: number) => Math.floor((now - 23 * 60_000) / (30 * 60_000) + 1) * 30 * 60_000 + 23 * 60_000;
export const createFxRssCollection = (ports: FxRssCollectionPorts) => ({
  async run(input: FxRssContinuation): Promise<FxRssStepResult> {
    let state = structuredClone(parseFxRssContinuation(input));
    let durable = structuredClone(state);
    const stats: FxRssStats = { rawCount: 0, candidatesFound: 0, resolved: 0, postsReturned: 0, postsStored: 0, pending: state.candidates.length, freeApiCalls: 0, paidApiCalls: 0, estimatedCostMicros: 0 };
    const result = (status: FxRssStepResult["status"], error: string | null): FxRssStepResult => ({ state, stats: { ...stats, pending: state.candidates.length }, status, error, nextAttemptAt: state.nextAttemptAt });
    const checkpoint = async () => {
      stats.pending = state.candidates.length;
      if (!await ports.checkpoint(state, stats)) { state = structuredClone(durable); return false; }
      durable = structuredClone(state);
      return true;
    };
    const handle = state.handles[0], context = await ports.readContext(handle);
    if (!context.allowed || context.policy !== "rss_v1") return result("blocked", "rss_policy_inactive");
    if (!context.trustedUserId) return result("blocked", "rss_identity_pending");
    if (state.nextAttemptAt !== null && state.nextAttemptAt > ports.now()) return result("pending", "rss_retry_pending");
    if (state.phase === "fetch") {
      try {
        const feed = await ports.fetchFeed(handle);
        stats.rawCount = feed.rawCount;
        const entries = [...new Map(feed.entries.filter(entry => entry.handle === handle && entry.createdAtHint >= context.collectionStartedAt).map(entry => [entry.id, entry])).values()];
        const stored = new Set(await ports.readStoredIds(entries.map(entry => entry.id)));
        state.candidates = entries.filter(entry => !stored.has(entry.id)).map(entry => ({ id: entry.id, createdAtHint: entry.createdAtHint, firstSeenAt: ports.now(), attempts: 0, nextAttemptAt: ports.now(), error: null, stage: "free" }));
        stats.candidatesFound = state.candidates.length;
        state.phase = "hydrate";
      } catch (error) {
        state.nextAttemptAt = nextTick(ports.now());
        const message = error instanceof Error ? error.message : "rss_feed_failed";
        return await checkpoint() ? result("pending", message) : result("blocked", "rss_checkpoint_lost");
      }
    }
    // Discovery is durable before any lookup; replay consults storage before writing.
    if (!await checkpoint()) return result("blocked", "rss_checkpoint_lost");
    if (!state.candidates.length) return result("complete", null);
    const stored = new Set(await ports.readStoredIds(state.candidates.map(candidate => candidate.id)));
    const pendingBeforeReadback = state.candidates.length;
    state.candidates = state.candidates.filter(candidate => candidate.createdAtHint >= context.collectionStartedAt && !stored.has(candidate.id));
    stats.resolved += pendingBeforeReadback - state.candidates.length;
    for (const candidate of [...state.candidates]) {
      if (candidate.stage === "official" || candidate.nextAttemptAt > ports.now() || stats.freeApiCalls >= 5) continue;
      try {
        stats.freeApiCalls++;
        const post = await ports.fetchStatus(candidate.id, handle, context.trustedUserId);
        if (Date.parse(post.createdAt) >= context.collectionStartedAt) {
          stats.postsReturned++;
          const storedPost = await ports.store(post, "fxembed").catch(() => ({ ok: false, postsStored: 0 }));
          if (!storedPost.ok) return result("blocked", "rss_storage_failed");
          stats.postsStored += storedPost.postsStored;
        }
        state.candidates = state.candidates.filter(entry => entry.id !== candidate.id);
        stats.resolved++;
      } catch (error) {
        if (error instanceof FxCandidateExcludedError) {
          state.candidates = state.candidates.filter(entry => entry.id !== candidate.id);
          stats.resolved++;
        } else {
          candidate.attempts++;
          candidate.error = error instanceof Error ? error.message : "rss_lookup_failed";
          candidate.stage = candidate.attempts >= 2 ? "official" : "free";
          candidate.nextAttemptAt = nextTick(ports.now());
        }
      }
      state.nextAttemptAt = state.candidates.length ? nextTick(ports.now()) : null;
      if (!await checkpoint()) return result("blocked", "rss_checkpoint_lost");
      if (!state.candidates.length) return result("complete", null);
    }
    state.nextAttemptAt = state.candidates.length ? nextTick(ports.now()) : null;
    if (JSON.stringify(state) !== JSON.stringify(durable) && !await checkpoint()) return result("blocked", "rss_checkpoint_lost");
    return result(state.candidates.length ? "pending" : "complete", state.candidates.length ? "rss_candidates_pending" : null);
  },
});
