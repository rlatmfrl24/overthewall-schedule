import { describe, expect, it } from "vitest";
import { estimateXApiRequestCostMicros } from "./x-api";

describe("X API request cost admission", () => {
  it("charges batched Post lookups for Post resources only", () => {
    const ids = Array.from({ length: 100 }, (_, index) => String(index + 1));
    const path = `/tweets?${new URLSearchParams({
      ids: ids.join(","),
      "tweet.fields": "created_at",
    })}`;

    expect(estimateXApiRequestCostMicros("tweet_lookup", path)).toBe(500_000);
  });

  it("reserves related User and Media resources only when expanded", () => {
    const path = `/tweets?${new URLSearchParams({
      ids: "1,2",
      "tweet.fields": "created_at,public_metrics,attachments",
      expansions: "author_id,attachments.media_keys",
    })}`;

    expect(estimateXApiRequestCostMicros("tweet_lookup", path)).toBe(40_000);
  });

  it("separates cached-author User lookup from the Post lookup", () => {
    const postPath = `/tweets?${new URLSearchParams({
      ids: "1,2",
      "tweet.fields": "author_id,created_at,attachments",
      expansions: "attachments.media_keys",
    })}`;
    const userPath = `/users?${new URLSearchParams({ ids: "10,20" })}`;

    expect(estimateXApiRequestCostMicros("tweet_lookup", postPath)).toBe(20_000);
    expect(estimateXApiRequestCostMicros("user_lookup", userPath)).toBe(20_000);
  });
});
