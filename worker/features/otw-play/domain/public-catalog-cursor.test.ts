import { describe, expect, it } from "vitest";
import {
  decodePublicCatalogCursor,
  encodePublicCatalogCursor,
  PublicCatalogCursorError,
  type PublicCatalogCursorIdentity,
} from "./public-catalog-cursor";
import {
  canonicalizePublicCatalogQuery,
  parsePublicCatalogQuery,
} from "./public-catalog-query";
import { encodePublicCatalogGroupKey } from "./public-group-key";

const identity: PublicCatalogCursorIdentity = {
  catalogRevision: 42,
  queryKey: "q=%ED%95%9C%EA%B8%80&member=3&sort=participant",
  hasSearch: true,
};

describe("OTW Play public catalog cursor", () => {
  it.each([
    {
      sort: "recent" as const,
      searchPhase: "indexed" as const,
      relevanceRank: 0,
      releasedAt: 1_786_000_000_000,
      songId: "song-recent",
    },
    {
      sort: "title" as const,
      searchPhase: "indexed" as const,
      relevanceRank: 2,
      normalizedTitle: "夜に駆ける",
      songId: "song-title",
    },
    {
      sort: "participant" as const,
      searchPhase: "indexed" as const,
      relevanceRank: 6,
      normalizedParticipant: "한글 참여자",
      songId: "song-participant",
    },
    {
      sort: "participant" as const,
      searchPhase: "contains" as const,
      relevanceRank: 7,
      normalizedParticipant: null,
      songId: "song-null-participant",
    },
  ])("round-trips a Unicode-safe $sort key", (position) => {
    const token = encodePublicCatalogCursor(identity, position);
    expect(token).toMatch(/^c1_[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("한글");
    expect(
      decodePublicCatalogCursor(token, {
        ...identity,
        sort: position.sort,
      }),
    ).toEqual(position);
  });

  it("requires a coherent search phase and rank exactly when q is present", () => {
    expect(() =>
      encodePublicCatalogCursor(identity, {
        sort: "recent",
        searchPhase: null,
        relevanceRank: null,
        releasedAt: 1,
        songId: "song",
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "search_state_mismatch" }),
    );
    expect(() =>
      encodePublicCatalogCursor(identity, {
        sort: "recent",
        searchPhase: "contains",
        relevanceRank: 6,
        releasedAt: 1,
        songId: "song",
      }),
    ).toThrowError(expect.objectContaining({ reason: "invalid_position" }));

    expect(() =>
      encodePublicCatalogCursor(
        { catalogRevision: 42, queryKey: "", hasSearch: false },
        {
          sort: "recent",
          searchPhase: "indexed",
          relevanceRank: 1,
          releasedAt: 1,
          songId: "song",
        },
      ),
    ).toThrow(PublicCatalogCursorError);
  });

  it("round-trips a bounded long Unicode query, group key, and sort tuple", () => {
    const queryText = "😀".repeat(80);
    const groupKey = encodePublicCatalogGroupKey({
      entityId: null,
      unitName: "🎤".repeat(50),
    });
    const query = parsePublicCatalogQuery(
      new URLSearchParams(
        `q=${encodeURIComponent(queryText)}&group=${encodeURIComponent(groupKey)}&sort=title&limit=60`,
      ).entries(),
    );
    const longIdentity = {
      catalogRevision: 99,
      queryKey: canonicalizePublicCatalogQuery(query),
      hasSearch: true,
    };
    const position = {
      sort: "title" as const,
      searchPhase: "contains" as const,
      relevanceRank: 7,
      normalizedTitle: "曲😀".repeat(160),
      songId: "song-long-unicode",
    };

    const token = encodePublicCatalogCursor(longIdentity, position);
    expect(token.length).toBeLessThanOrEqual(8_192);
    expect(
      parsePublicCatalogQuery(
        new URLSearchParams(
          `q=${encodeURIComponent(queryText)}&group=${encodeURIComponent(groupKey)}&sort=title&limit=60&cursor=${encodeURIComponent(token)}`,
        ).entries(),
      ).cursorToken,
    ).toBe(token);
    expect(
      decodePublicCatalogCursor(token, {
        ...longIdentity,
        sort: "title",
      }),
    ).toEqual(position);
  });

  it.each([
    [
      { ...identity, catalogRevision: 43, sort: "participant" as const },
      "revision_mismatch",
    ],
    [
      { ...identity, queryKey: "q=other", sort: "participant" as const },
      "query_mismatch",
    ],
    [{ ...identity, sort: "title" as const }, "sort_mismatch"],
    [
      { ...identity, hasSearch: false, sort: "participant" as const },
      "search_state_mismatch",
    ],
  ])("rejects an identity mismatch with %s", (expected, reason) => {
    const token = encodePublicCatalogCursor(identity, {
      sort: "participant",
      searchPhase: "indexed",
      relevanceRank: 3,
      normalizedParticipant: "가나다",
      songId: "song",
    });
    expect(() => decodePublicCatalogCursor(token, expected)).toThrowError(
      expect.objectContaining({ reason }),
    );
  });

  it("rejects malformed, non-canonical, and future tokens", () => {
    expect(() =>
      decodePublicCatalogCursor("plain", { ...identity, sort: "recent" }),
    ).toThrowError(expect.objectContaining({ reason: "malformed" }));
    expect(() =>
      decodePublicCatalogCursor("c2_aaaa", {
        ...identity,
        sort: "recent",
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "unsupported_version" }),
    );
    expect(() =>
      decodePublicCatalogCursor("c1_aaaa=", {
        ...identity,
        sort: "recent",
      }),
    ).toThrow(PublicCatalogCursorError);
  });
});
