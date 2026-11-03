import type { FxRssContinuation, FxRssStepResult } from "@contracts/x-collection";
import { createFxRssCollection, D1FxRssCollectionAdapter } from "../features/x-posts";
import type { D1ScheduledJobRepository, ScheduledJobItemRecord } from "../platform/scheduled-jobs";
import type { Env } from "../platform/types";

export async function runFxRssCollectionItem(env: Env, item: ScheduledJobItemRecord, state: FxRssContinuation, repository: D1ScheduledJobRepository): Promise<FxRssStepResult> {
  const adapter = new D1FxRssCollectionAdapter(env, item, (snapshot, stats) => repository.checkpointItemContinuation(item, snapshot, stats));
  try {
    if (!await adapter.start(state)) return { state, status: "blocked", error: "rss_obsolete_or_ineligible", nextAttemptAt: state.nextAttemptAt,
      stats: { rawCount: 0, candidatesFound: 0, resolved: 0, postsReturned: 0, postsStored: 0, pending: state.candidates.length, freeApiCalls: 0, paidApiCalls: 0, estimatedCostMicros: 0 } };
    return await createFxRssCollection(adapter).run(state);
  } finally { await adapter.release(); }
}
