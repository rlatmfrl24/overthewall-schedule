import { describe, expect, it } from "vitest";
import {
  toXCollectionOutcome,
  toYouTubeFeedCollectionOutcome,
} from "./scheduled-job-executor";

const result = (
  status: "success" | "skipped" | "failed",
  error: string | null = null,
) => ({
  checkedHandles: 1,
  refreshedHandles: status === "success" ? 1 : 0,
  postsReturned: 0,
  postsStored: 0,
  apiCalls: 0,
  estimatedCostMicros: 0,
  status,
  success: status === "success",
  error,
  updatedAt: "2026-02-13T00:00:00.000Z",
});

describe("scheduled job executor outcomes", () => {
  it("maps a successful X collection to a succeeded item", () => {
    expect(toXCollectionOutcome(result("success"))).toMatchObject({
      status: "succeeded",
      result: { status: "success" },
    });
  });

  it("maps admission protection to a skipped item", () => {
    expect(
      toXCollectionOutcome(result("skipped", "budget_exceeded")),
    ).toMatchObject({
      status: "skipped",
      errorCode: "budget_exceeded",
      error: "budget_exceeded",
    });
  });

  it("maps an external collection failure to a failed item", () => {
    expect(
      toXCollectionOutcome(result("failed", "rate_limited")),
    ).toMatchObject({
      status: "failed",
      errorCode: "rate_limited",
      error: "rate_limited",
    });
  });

  it("normalizes a fully completed YouTube result from partial to succeeded", () => {
    expect(toYouTubeFeedCollectionOutcome({
      status: "partial",
      attempted: 1,
      succeeded: 1,
      failed: 0,
    })).toMatchObject({
      status: "succeeded",
      attempted: 1,
      succeeded: 1,
      failed: 0,
      errorCode: null,
    });
  });

  it("preserves a genuine YouTube partial and exposes its failure", () => {
    expect(toYouTubeFeedCollectionOutcome({
      status: "partial",
      attempted: 5,
      succeeded: 4,
      failed: 1,
    })).toMatchObject({
      status: "partial",
      attempted: 5,
      succeeded: 4,
      failed: 1,
      errorCode: "youtube_feed_collection_failed",
      error: "YouTube feed collection failed for 1 of 5 sources",
    });
  });

  it("keeps an incomplete YouTube result partial even without a reported failure", () => {
    expect(toYouTubeFeedCollectionOutcome({
      status: "partial",
      attempted: 2,
      succeeded: 1,
      failed: 0,
    })).toMatchObject({
      status: "partial",
      attempted: 2,
      succeeded: 1,
      failed: 0,
    });
  });
});
