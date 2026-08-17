import { describe, expect, it } from "vitest";
import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";
import { assembleOtwPlayCollaborationSongs } from "./public-discover";

const song = (id: string, releasedAt: string | null) =>
  ({
    id,
    representativePerformance: { releasedAt },
  }) as OtwPlayPublicSongSummaryDto;

describe("OTW Play Discover assembly", () => {
  it("deduplicates collaboration sections and orders release null-last with id tie-break", () => {
    expect(
      assembleOtwPlayCollaborationSongs([
        [song("b", "2026-08-01T00:00:00.000Z"), song("a", null)],
        [song("c", "2026-08-02T00:00:00.000Z"), song("b", "2026-08-01T00:00:00.000Z")],
      ]).map(({ id }) => id),
    ).toEqual(["c", "b", "a"]);
  });
});
