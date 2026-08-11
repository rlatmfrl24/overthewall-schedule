import { describe, expect, it } from "vitest";
import { encodePublicCatalogGroupKey } from "./public-group-key";
import {
  canonicalizePublicCatalogQuery,
  isStructuredFirstPagePublicCatalogCacheQuery,
  parsePublicCatalogQuery,
  PublicCatalogQueryError,
} from "./public-catalog-query";

const parse = (query: string) =>
  parsePublicCatalogQuery(new URLSearchParams(query).entries());

describe("OTW Play public catalog query", () => {
  it("normalizes search and canonicalizes equivalent member sets", () => {
    const left = parse(
      "member=22&member=3&member=22&memberMode=all&q=%EF%BC%A1%EF%BC%A2%E3%80%81%20%20Song&limit=24&sort=recent",
    );
    const right = parse(
      "q=ab%20song&memberMode=all&member=3&member=22",
    );

    expect(left.normalizedQuery).toBe("ab song");
    expect(left.memberUids).toEqual([3, 22]);
    expect(canonicalizePublicCatalogQuery(left)).toBe(
      canonicalizePublicCatalogQuery(right),
    );
  });

  it("decodes and re-canonicalizes the opaque group selector", () => {
    const groupKey = encodePublicCatalogGroupKey({
      entityId: null,
      unitName: "OTW 유닛",
    });
    const query = parse(`group=${encodeURIComponent(groupKey)}`);

    expect(query.group).toEqual({
      entityId: null,
      unitName: "OTW 유닛",
    });
    expect(canonicalizePublicCatalogQuery(query)).toBe(
      `group=${encodeURIComponent(groupKey)}`,
    );
  });

  it("caches every structured non-search first page but not q or cursor pages", () => {
    expect(isStructuredFirstPagePublicCatalogCacheQuery(parse(""))).toBe(true);
    expect(
      isStructuredFirstPagePublicCatalogCacheQuery(
        parse("relation=cover&sort=participant&limit=60"),
      ),
    ).toBe(true);
    expect(
      isStructuredFirstPagePublicCatalogCacheQuery(parse("cursor=opaque")),
    ).toBe(false);
    expect(isStructuredFirstPagePublicCatalogCacheQuery(parse("q=song"))).toBe(
      false,
    );
  });

  it("keeps relevance-compatible selected sorts for searched queries", () => {
    const query = parse("q=song&sort=participant");
    expect(query).toMatchObject({
      normalizedQuery: "song",
      sort: "participant",
    });
    expect(canonicalizePublicCatalogQuery(query)).toContain(
      "sort=participant",
    );
  });

  it("applies the query limit by Unicode code point rather than UTF-16 units", () => {
    expect(parse(`q=${"가".repeat(80)}`).normalizedQuery).toBe("가".repeat(80));
    expect(parse(`q=${"😀".repeat(80)}`).normalizedQuery).toBe("😀".repeat(80));
    expect(() => parse(`q=${"😀".repeat(81)}`)).toThrowError(
      expect.objectContaining({ reason: "invalid_query", field: "q" }),
    );
  });

  it("accepts a trimmed Unicode public entity slug", () => {
    expect(parse("originalArtist=%EC%98%A4%EB%B2%84%EB%8D%94%EC%9B%94-%E5%8E%9F%E6%9B%B2").originalArtistSlug).toBe(
      "오버더월-原曲",
    );
  });

  it.each([
    ["unknown=1", "unknown_parameter", "unknown"],
    ["sort=recent&sort=title", "duplicate_parameter", "sort"],
    ["q=%5B%5D%3F*", "invalid_query", "q"],
    ["q=%20%20", "invalid_query", "q"],
    ["member=0", "invalid_member", "member"],
    ["memberMode=all", "member_mode_without_members", "memberMode"],
    ["group=plain", "invalid_group", "group"],
    ["relation=broadcast", "invalid_relation", "relation"],
    ["participation=trio", "invalid_participation", "participation"],
    ["originalArtist=bad%00slug", "invalid_original_artist", "originalArtist"],
    ["publishedFrom=2026-02-30", "invalid_date", "publishedFrom"],
    [
      "publishedFrom=2026-08-02&publishedTo=2026-08-01",
      "invalid_date_range",
      "publishedTo",
    ],
    ["sort=random", "invalid_sort", "sort"],
    [`cursor=${"a".repeat(8_193)}`, "invalid_cursor", "cursor"],
    ["limit=0", "invalid_limit", "limit"],
    ["limit=61", "invalid_limit", "limit"],
  ])("rejects %s with a typed reason", (raw, reason, field) => {
    expect(() => parse(raw)).toThrowError(
      expect.objectContaining({ reason, field }),
    );
  });

  it("rejects more than ten raw member selectors before dedupe", () => {
    expect(() =>
      parse(Array.from({ length: 11 }, () => "member=1").join("&")),
    ).toThrow(PublicCatalogQueryError);
  });
});
