import { describe, expect, it } from "vitest";
import { getSiteTarget, loadSiteEnvironment, parseSiteArgument, resolveSiteOrigin, getSiteLocalEnvironment } from "./site-target.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("site target boundaries", () => {
  it("selects an independent LuvDia config, build and local state", () => {
    const otw = getSiteTarget("otw");
    const luvdia = getSiteTarget("luvdia");
    expect(luvdia).toEqual({ siteId: "luvdia", configPath: "wrangler.luvdia.jsonc", outputRoot: "dist/luvdia", localPersistTo: ".wrangler/state/luvdia" });
    expect(otw.configPath).toBe("wrangler.jsonc");
    expect(otw.outputRoot).not.toBe(luvdia.outputRoot);
    expect(otw.localPersistTo).not.toBe(luvdia.localPersistTo);
  });
  it("rejects missing and ambiguous CLI selections", () => {
    expect(() => parseSiteArgument([])).toThrow(/one --site/);
    expect(() => parseSiteArgument(["--site=otw", "--site=luvdia"])).toThrow(/one --site/);
    expect(() => parseSiteArgument(["--site=other"])).toThrow(/site selection/);
  });
  it("never lets generic env or OTW files replace a selected LuvDia identity", () => {
    const root = mkdtempSync(join(tmpdir(), "site-env-"));
    try {
      writeFileSync(join(root, ".env.local"), "CLERK_ISSUER=https://otw.test\nVITE_CLERK_PUBLISHABLE_KEY=otw\nCLERK_ADMIN_IDS=otw-private");
      const directory = join(root, "config/sites/luvdia");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, ".env.development.local"), "CLERK_ISSUER=https://luvdia.test\nVITE_CLERK_PUBLISHABLE_KEY=luvdia");
      expect(loadSiteEnvironment("luvdia", "development", { VITE_SITE_ID: "otw", VITE_CLERK_PUBLISHABLE_KEY: "wrong", LUVDIA_VITE_CLERK_PUBLISHABLE_KEY: "selected" }, root)).toMatchObject({
        VITE_SITE_ID: "luvdia", VITE_CLERK_PUBLISHABLE_KEY: "selected", CLERK_ISSUER: "https://luvdia.test",
      });
      expect(loadSiteEnvironment("otw", "development", {}, root).CLERK_ISSUER).toBe("https://otw.test");
      expect(loadSiteEnvironment("luvdia", "development", { CLERK_ADMIN_IDS: "ambient-private" }, root)).not.toHaveProperty("CLERK_ADMIN_IDS");
      writeFileSync(join(directory, ".env.local"), "DEV_PORT=5184\nD1_PERSIST_TO=.wrangler/state/luvdia-test");
      expect(getSiteLocalEnvironment("luvdia", {}, root)).toMatchObject({ LUVDIA_DEV_PORT: "5184", LUVDIA_D1_PERSIST_TO: ".wrangler/state/luvdia-test" });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("requires a separate explicit production origin before LuvDia build", () => {
    expect(() => resolveSiteOrigin("luvdia", {})).toThrow(/Missing production/);
    expect(() => resolveSiteOrigin("luvdia", { PUBLIC_ORIGIN: "https://otw-schedule.info" })).toThrow(/own production/);
    expect(() => resolveSiteOrigin("luvdia", { PUBLIC_ORIGIN: "http://localhost:5174" })).toThrow(/Invalid production/);
    expect(resolveSiteOrigin("otw", {})).toBe("https://otw-schedule.info");
  });
});
