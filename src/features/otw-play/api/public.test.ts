import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRoutes } from "@contracts/api-routes";
import {
  fetchOtwPlayCatalog,
  fetchOtwPlayConfig,
  fetchOtwPlayFacets,
  fetchOtwPlayPerformance,
  fetchOtwPlaySong,
  getOtwPlayCatalogQueryKey,
  serializeOtwPlayCatalogQuery,
} from "./public";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({
  apiFetch: apiFetchMock,
}));

describe("OTW Play public API client", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      data: null,
      nextCursor: null,
      catalogRevision: 0,
      generatedAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it("member 반복값과 parameter를 결정적으로 canonicalize한다", () => {
    const serialized = serializeOtwPlayCatalogQuery({
      q: "  Song  ",
      member: [10, 2, 10],
      memberMode: "all",
      sort: "title",
      limit: 60,
      cursor: "next/page",
    });
    const params = new URLSearchParams(serialized);

    expect(params.getAll("member")).toEqual(["2", "10"]);
    expect(params.get("q")).toBe("  Song  ");
    expect(params.get("memberMode")).toBe("all");
    expect(params.get("sort")).toBe("title");
    expect(params.get("limit")).toBe("60");
    expect(params.get("cursor")).toBe("next/page");
    expect([...params.keys()]).toEqual([
      "cursor",
      "limit",
      "member",
      "member",
      "memberMode",
      "q",
      "sort",
    ]);
  });

  it("명시한 기본값은 생략하고 cursor를 base query key에서 제외한다", () => {
    expect(
      serializeOtwPlayCatalogQuery({
        memberMode: "any",
        sort: "recent",
        limit: 24,
      }),
    ).toBe("");
    expect(
      getOtwPlayCatalogQueryKey({
        relation: "cover",
        cursor: "page-2",
      }),
    ).toBe("relation=cover");
  });

  it("wire 검색어는 보존하고 의미가 같은 검색어는 같은 query key를 사용한다", () => {
    expect(
      new URLSearchParams(
        serializeOtwPlayCatalogQuery({ q: "  ＦＯＯ・bar  " }),
      ).get("q"),
    ).toBe("  ＦＯＯ・bar  ");
    expect(getOtwPlayCatalogQueryKey({ q: "  ＦＯＯ・bar  " })).toBe(
      getOtwPlayCatalogQueryKey({ q: "foo bar" }),
    );
  });

  it("모든 공개 endpoint를 bearer 없이 호출한다", async () => {
    await fetchOtwPlayConfig();
    await fetchOtwPlayCatalog({ member: [2, 1], relation: "original" });
    await fetchOtwPlayFacets();
    await fetchOtwPlaySong("한 곡-slug");
    await fetchOtwPlayPerformance("performance-id");

    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      apiRoutes.otwPlay.config.build(),
      { auth: "omit" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      2,
      `${apiRoutes.otwPlay.catalog.build()}?member=1&member=2&relation=original`,
      { auth: "omit" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      3,
      apiRoutes.otwPlay.facets.build(),
      { auth: "omit" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/play/songs/%ED%95%9C%20%EA%B3%A1-slug",
      { auth: "omit" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/play/performances/performance-id",
      { auth: "omit" },
    );
  });
});
