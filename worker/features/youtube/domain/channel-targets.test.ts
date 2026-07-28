import { describe, expect, it } from "vitest";
import {
  parseKirinukiMaxResults,
  parseYouTubeChannelTargets,
  parseYouTubeMaxResults,
} from "./channel-targets";

describe("YouTube channel target policy", () => {
  const channelId = `UC${"A".repeat(22)}`;

  it("accepts valid channel ids and removes exact duplicates", () => {
    expect(
      parseYouTubeChannelTargets(`${channelId},${channelId}`),
    ).toEqual({ ok: true, channelIds: [channelId] });
  });

  it("enforces target count, format, and maxResults bounds", () => {
    expect(parseYouTubeChannelTargets("UC_A")).toMatchObject({ ok: false });
    expect(
      parseYouTubeChannelTargets(
        Array.from(
          { length: 21 },
          (_, index) => `UC${index.toString().padStart(22, "0")}`,
        ).join(","),
      ),
    ).toMatchObject({ ok: false });
    expect(parseYouTubeMaxResults("0")).toBeNull();
    expect(parseYouTubeMaxResults("21")).toBeNull();
    expect(parseYouTubeMaxResults("20")).toBe(20);
  });

  it("allows the 40-item kirinuki cache profile without widening official requests", () => {
    expect(parseKirinukiMaxResults("40")).toBe(40);
    expect(parseKirinukiMaxResults("41")).toBeNull();
    expect(parseYouTubeMaxResults("40")).toBeNull();
  });
});
