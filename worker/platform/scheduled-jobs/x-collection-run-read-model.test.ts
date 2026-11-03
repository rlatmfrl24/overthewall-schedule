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
  expect(result.collection).not.toHaveProperty("newlyStoredPosts");
});
it.each([{ newlyStoredPosts: [] }, { newlyStoredPosts: [{ id: "201", createdAt: "2026-11-03T00:00:00.000Z", storedAt: 1793664000000 }] }])("preserves validated INSERT evidence including known empty %j", ({ newlyStoredPosts }) => {
  const result = toXCollectionOperationItem({ ...row, result_json: JSON.stringify({ status: "success", mode: "rss_candidates", checkedHandles: 1, refreshedHandles: 1, postsReturned: 1, postsStored: 1, newlyStoredPosts }) });
  expect(result.collection).toHaveProperty("newlyStoredPosts", newlyStoredPosts);
});
it.each([{ newlyStoredPosts: [{ id: "x", createdAt: "invalid", storedAt: -1 }] }, { newlyStoredPosts: Array.from({ length: 101 }, (_, i) => ({ id: String(i), createdAt: "2026-11-03T00:00:00.000Z", storedAt: 1 })) }])("keeps malformed or oversized RSS INSERT evidence unknown", ({ newlyStoredPosts }) => {
  const result = toXCollectionOperationItem({ ...row, result_json: JSON.stringify({ status: "success", mode: "rss_candidates", checkedHandles: 1, refreshedHandles: 1, postsReturned: 101, postsStored: 101, newlyStoredPosts }) });
  expect(result.collection).not.toHaveProperty("newlyStoredPosts");
});
