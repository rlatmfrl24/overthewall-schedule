import { describe, expect, it } from "vitest";
import { getWorkerSiteDefinition } from "./site";

describe("Worker site configuration", () => {
  it("requires explicit selection and a resolved LuvDia origin", () => {
    expect(() => getWorkerSiteDefinition({})).toThrow(/selection/);
    expect(() => getWorkerSiteDefinition({ SITE_ID: "luvdia" })).toThrow(/origin/);
    expect(() => getWorkerSiteDefinition({ SITE_ID: "luvdia", SITE_PUBLIC_ORIGIN: "https://otw-schedule.info" })).toThrow(/own public origin/);
    expect(() => getWorkerSiteDefinition({ SITE_ID: "otw", SITE_PUBLIC_ORIGIN: "https://user:pass@localhost/" })).toThrow(/Invalid public origin/);
    expect(getWorkerSiteDefinition({ SITE_ID: "otw" }).publicOrigin).toBe("https://otw-schedule.info");
    expect(getWorkerSiteDefinition({ SITE_ID: "luvdia", SITE_PUBLIC_ORIGIN: "http://localhost:5174" })).toMatchObject({ id: "luvdia", playName: "LuvDia Play", publicOrigin: "http://localhost:5174" });
  });
});
