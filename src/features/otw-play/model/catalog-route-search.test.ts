import { describe, expect, it } from "vitest";
import {
  catalogQueryFromRouteSearch,
  memberSearchValue,
  validateOtwPlayCatalogRouteSearch,
} from "./catalog-route-search";

describe("OTW Play catalog route search", () => {
  it("maps URL state to the public query without interpreting opaque group keys", () => {
    const route = validateOtwPlayCatalogRouteSearch({
      q: "노래",
      member: "3,1,3",
      memberMode: "all",
      group: "g1_opaque",
      participant: "외부-가창자",
      participantRole: "chorus",
      relation: "cover",
      unknown: "ignored",
    });
    expect(catalogQueryFromRouteSearch(route)).toMatchObject({
      q: "노래",
      member: [1, 3],
      memberMode: "all",
      group: "g1_opaque",
      participant: "외부-가창자",
      participantRole: "chorus",
      relation: "cover",
    });
  });

  it("serializes selected member IDs deterministically for browser history", () => {
    expect(memberSearchValue([3, 1, 3, 2])).toBe("1,2,3");
    expect(memberSearchValue([])).toBeUndefined();
  });
});
