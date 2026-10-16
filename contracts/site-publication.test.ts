import { describe, expect, it } from "vitest";
import { getHiddenMemberCodes, getSitePublication, SITE_OPENS_AT } from "./site-publication";

describe("site publication", () => {
  const cutoff = Date.parse("2026-10-18T15:00:00Z");

  it("opens LuvDia exactly at midnight Korea time and leaves OTW open", () => {
    expect(SITE_OPENS_AT).toBe("2026-10-18T15:00:00Z");
    expect(getSitePublication("luvdia", cutoff - 1).phase).toBe("countdown");
    expect(getSitePublication("luvdia", cutoff).phase).toBe("open");
    expect(getSitePublication("otw", cutoff - 1).phase).toBe("open");
    expect(getSitePublication("luvdia", cutoff, true).phase).toBe("held");
  });

  it("hides only transferred OTW members at the same boundary", () => {
    expect(getHiddenMemberCodes("otw", cutoff - 1)).toEqual([]);
    expect(getHiddenMemberCodes("otw", cutoff)).toEqual(["bing_hayu", "u_lili", "yang_mei"]);
    expect(getHiddenMemberCodes("luvdia", cutoff)).toEqual([]);
  });
});
