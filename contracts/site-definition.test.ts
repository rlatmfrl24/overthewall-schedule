import { describe, expect, it } from "vitest";
import { getSiteDefinition, parseSiteId, requireSiteOrigin } from "./site-definition";

describe("explicit site definition", () => {
  it.each([undefined, "", "other"])("rejects missing or unknown selection %s", value => {
    expect(() => parseSiteId(value)).toThrow(/site/i);
  });
  it("keeps LuvDia's production origin unresolved and its own branding", () => {
    expect(parseSiteId("luvdia")).toBe("luvdia");
    expect(getSiteDefinition("luvdia")).toMatchObject({
      id: "luvdia", publicOrigin: null, serviceName: "LuvDia Schedule", playName: "LuvDia Play", fanCafeUrl: "https://cafe.naver.com/s2dia",
    });
    expect(getSiteDefinition("otw").publicOrigin).toBe("https://otw-schedule.info");
    expect(getSiteDefinition("otw").fanCafeUrl).toBe("https://cafe.naver.com/otwoffical");
  });
});
describe("site public origin", () => {
  it("requires a resolved HTTP origin and preserves explicit local ports", () => {
    expect(() => requireSiteOrigin(getSiteDefinition("luvdia"))).toThrow(/origin/);
    for (const publicOrigin of ["javascript:alert(1)", "https://user:pass@localhost/", "https://localhost/path", "https://localhost/?a=1", "http://remote.example/"]) {
      expect(() => requireSiteOrigin({ ...getSiteDefinition("luvdia"), publicOrigin })).toThrow();
    }
    expect(requireSiteOrigin({ ...getSiteDefinition("luvdia"), publicOrigin: "http://localhost:5174" })).toBe("http://localhost:5174");
  });
});
