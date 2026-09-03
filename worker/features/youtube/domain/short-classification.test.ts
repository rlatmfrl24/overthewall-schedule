import { describe, expect, it } from "vitest";
import { isYouTubeShort } from "./short-classification";

const publishedAt = Date.parse("2026-09-03T00:00:00Z");

describe("isYouTubeShort", () => {
  it.each([
    [60, "", true],
    [61, "clip #shorts", true],
    [180, "#Shorts clip", true],
    [181, "#shorts", false],
    [0, "#shorts", false],
    [Number.NaN, "#shorts", false],
    [61, "#shortstory", false],
  ])("duration=%s title=%s => %s", (durationSeconds, title, expected) => {
    expect(isYouTubeShort({ durationSeconds, publishedAt, title })).toBe(expected);
  });

  it("does not classify extended videos published before the product cutoff", () => {
    expect(isYouTubeShort({
      durationSeconds: 61,
      publishedAt: Date.parse("2024-10-14T23:59:59Z"),
      description: "#shorts",
    })).toBe(false);
  });
});
