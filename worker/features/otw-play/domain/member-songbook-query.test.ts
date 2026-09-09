import { describe, expect, it } from "vitest";
import { parseMemberSongbookQuery } from "./member-songbook-query";
import { canonicalizePublicCatalogQuery } from "./public-catalog-query";

describe("member songbook query", () => {
  it.each(["member=2", "memberMode=all", "relation=cover", "participation=solo", "category=bad", "category=all&category=cover", "sort=participant", "participantRole=other", "limit=61"])("rejects %s", value => {
    expect(() => parseMemberSongbookQuery(new URLSearchParams(value))).toThrow();
  });
  it("defaults to vocal and featured, and binds collaboration into cursor identity", () => {
    const base = parseMemberSongbookQuery(new URLSearchParams());
    expect(base).toMatchObject({ limit: 24, participantRole: null, memberUids: [], sort: "recent" });
    const collaboration = parseMemberSongbookQuery(new URLSearchParams("category=collaboration"));
    expect(collaboration.collaborationOnly).toBe(true);
    expect(canonicalizePublicCatalogQuery(collaboration)).not.toBe(canonicalizePublicCatalogQuery(base));
  });
});
