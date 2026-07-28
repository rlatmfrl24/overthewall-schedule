import { describe, expect, it } from "vitest";
import {
  parseChzzkChannelTargetArray,
  parseChzzkChannelTargets,
} from "./channel-targets";

describe("CHZZK channel target policy", () => {
  it("normalizes case and removes duplicates while preserving order", () => {
    const first = "a".repeat(32);
    const second = "b".repeat(32);
    expect(
      parseChzzkChannelTargets(
        `${first.toUpperCase()}, ${second},${first}`,
      ),
    ).toEqual({ ok: true, channelIds: [first, second] });
  });

  it("rejects invalid and oversized target lists", () => {
    expect(parseChzzkChannelTargets("invalid")).toMatchObject({ ok: false });
    expect(
      parseChzzkChannelTargets(
        Array.from({ length: 21 }, (_, index) =>
          index.toString(16).padStart(32, "0"),
        ).join(","),
      ),
    ).toMatchObject({ ok: false });
    expect(parseChzzkChannelTargetArray(["a", 1])).toMatchObject({
      ok: false,
    });
  });
});
