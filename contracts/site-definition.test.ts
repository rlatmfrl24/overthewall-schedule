import { describe, expect, it } from "vitest";
import { getSiteDefinition, parseSiteId } from "./site-definition";

describe("explicit site definition", () => {
  it.each([undefined, "", "other"])("rejects missing or unknown selection %s", value => {
    expect(() => parseSiteId(value)).toThrow(/site/i);
  });
  it("keeps LuvDia's production origin unresolved and its own branding", () => {
    expect(parseSiteId("luvdia")).toBe("luvdia");
    expect(getSiteDefinition("luvdia")).toMatchObject({
      id: "luvdia", publicOrigin: null, serviceName: "LuvDia Schedule", playName: "LuvDia Play",
    });
    expect(getSiteDefinition("otw").publicOrigin).toBe("https://otw-schedule.info");
  });
});
