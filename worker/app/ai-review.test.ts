import { afterEach, expect, it, vi } from "vitest";
import { AiReviewService, AiBatchService } from "../features/otw-play";
import { handleAiReviewQueue, isAiBatchMessage } from "./ai-review";
import { siteEnv } from "../test-support/site-env";
import type { Env } from "../platform/types";

afterEach(() => vi.restoreAllMocks());
it.each(["otw", "luvdia"] as const)("keeps %s AI review and batch DLQ semantics", async site => {
  const markDead = vi.spyOn(AiReviewService.prototype, "markDead").mockResolvedValue(undefined);
  const process = vi.spyOn(AiReviewService.prototype, "process").mockResolvedValue(undefined);
  vi.spyOn(AiReviewService.prototype, "get").mockResolvedValue({ id: "review", candidateId: null, videoId: "abc12345678", candidateKind: "official_video", range: null, status: "failed", result: null, model: "model", attempts: 3, errorCode: "queue_retries_exhausted", errorMessage: null, retryable: false, createdAt: 1, updatedAt: 1, expiresAt: 2, nextRetryAt: null, usage: null });
  const deadBatch = vi.spyOn(AiBatchService.prototype, "dead").mockResolvedValue(undefined);
  const processBatch = vi.spyOn(AiBatchService.prototype, "process").mockResolvedValue(60);
  vi.spyOn(AiBatchService.prototype, "recover").mockResolvedValue({ queued: 0, failed: 0 });
  const env = { ...siteEnv(site), otw_db: {prepare:()=>({first:async()=>null})} as unknown as D1Database, YOUTUBE_API_KEY: "", GEMINI_API_KEY: "key", OTW_PLAY_AI_REVIEW_ENABLED: "true", OTW_PLAY_AI_REVIEW_QUEUE: {} } as Env;
  const review = { body: { kind: "otw_play_ai_review", schemaVersion: 1, reviewId: "review" }, ack: vi.fn(), retry: vi.fn() };
  const batch = { body: { kind: "otw_play_ai_batch", schemaVersion: 1, itemId: "batch", generation: 2 }, ack: vi.fn(), retry: vi.fn() };
  await handleAiReviewQueue({ queue: `${site}-dead-letter`, messages: [review, batch] } as unknown as MessageBatch<unknown>, env);
  expect(markDead).toHaveBeenCalledWith("review");
  expect(markDead).toHaveBeenCalledBefore(review.ack);
  expect(deadBatch).toHaveBeenCalledWith("batch", 2);
  expect(deadBatch).toHaveBeenCalledBefore(batch.ack);
  expect(process).not.toHaveBeenCalled();
  expect(processBatch).not.toHaveBeenCalled();
  batch.ack.mockClear();
  await handleAiReviewQueue({ queue: `${site}-play-ai-review`, messages: [batch] } as unknown as MessageBatch<unknown>, env);
  expect(batch.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  expect(batch.ack).not.toHaveBeenCalled();
});

it("requires a non-negative safe integer retry generation for batch messages", () => {
  const message = { kind: "otw_play_ai_batch", schemaVersion: 1, itemId: "item" };
  for (const generation of [undefined, null, -1, 0.5, "1", Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(isAiBatchMessage({ ...message, generation })).toBe(false);
  expect(isAiBatchMessage({ ...message, generation: 0 })).toBe(true);
  expect(isAiBatchMessage({ ...message, generation: Number.MAX_SAFE_INTEGER })).toBe(true);
});
