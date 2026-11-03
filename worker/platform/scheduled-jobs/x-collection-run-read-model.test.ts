import { expect, it } from "vitest";
import { toXCollectionOperationItem } from "./x-collection-run-read-model";
const row = { id: "i", target_key: "rss:member", status: "partial" as const, attempts: 1, updated_at: 1, last_error_code: null, last_error: null, retry_pending: 0, next_retry_at: null };
it("preserves actual RSS partial evidence and paid lookups", () => {
  const result = toXCollectionOperationItem({ ...row, result_json: JSON.stringify({ provider: "fxembed", mode: "rss_candidates", status: "success", checkedHandles: 1, refreshedHandles: 1, postsReturned: 3, postsStored: 2, pendingSources: 1, paidApiCalls: 1, rss: { rawCount: 7, candidatesFound: 4, pendingCandidates: 1, nextAttemptAt: 123, windowReduced: true } }) });
  expect(result.collection).toMatchObject({ mode: "rss_candidates", paidApiCalls: 1, rss: { rawCount: 7, pendingCandidates: 1, nextAttemptAt: 123, windowReduced: true } });
});
it("keeps absent historical provider and paid evidence unknown", () => {
  const result = toXCollectionOperationItem({ ...row, result_json: JSON.stringify({ status: "success", checkedHandles: 1, refreshedHandles: 1, postsReturned: 0, postsStored: 0 }) });
  expect(result.collection?.provider).toBeUndefined();
  expect(result.collection).not.toHaveProperty("paidApiCalls");
});
