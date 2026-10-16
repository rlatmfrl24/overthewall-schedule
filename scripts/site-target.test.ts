import { describe, expect, it } from "vitest";
import { getSiteTarget, loadSiteEnvironment, parseSiteArgument, resolveSiteOrigin, getSiteLocalEnvironment, assertLocalPersistenceIsolation } from "./site-target.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync, symlinkSync, unlinkSync, lstatSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const removeJunctionFixture = (fixture: string, alias: string, prefix: string) => {
  if (!resolve(fixture).startsWith(prefix)) throw new Error("Unsafe junction fixture cleanup path");
  if (!lstatSync(alias).isSymbolicLink()) throw new Error("Expected owned junction fixture");
  unlinkSync(alias);
  rmSync(fixture, { recursive: true, force: true });
};

describe("site target boundaries", () => {
  it("accepts disjoint normal site roots without creating state", () => {
    expect(assertLocalPersistenceIsolation("otw", {})).toBe(".wrangler/state/otw");
    expect(assertLocalPersistenceIsolation("luvdia", {}, process.cwd(), ".wrangler/state/luvdia-read-only-probe")).toBe(".wrangler/state/luvdia-read-only-probe");
    expect(existsSync(".wrangler/state/luvdia-read-only-probe")).toBe(false);
  });
  it.each([
    [".tmp/site-state", ".tmp/site-state/child"],
    [".tmp/site-state/child", ".tmp/site-state"],
  ])("rejects configured nested persistence roots %s and %s", (otw, luvdia) => {
    expect(() => assertLocalPersistenceIsolation("luvdia", { OTW_D1_PERSIST_TO: otw, LUVDIA_D1_PERSIST_TO: luvdia })).toThrow(/persistence/);
  });
  it.runIf(process.platform === "win32")("rejects Windows case aliases", () => {
    expect(() => assertLocalPersistenceIsolation("luvdia", { LUVDIA_D1_PERSIST_TO: ".wrangler/state/OTW" })).toThrow(/persistence/);
  });
  it("resolves existing directory aliases and missing children through their real parent", () => {
    const alias = resolve("node_modules/vite");
    const physical = realpathSync.native(alias);
    const leaf = "sul36-read-only-state-probe";
    expect(() => assertLocalPersistenceIsolation("luvdia", { OTW_D1_PERSIST_TO: join(alias, leaf), LUVDIA_D1_PERSIST_TO: join(physical, leaf) })).toThrow(/persistence/);
    expect(() => assertLocalPersistenceIsolation("luvdia", { OTW_D1_PERSIST_TO: alias, LUVDIA_D1_PERSIST_TO: join(physical, leaf) })).toThrow(/persistence/);
    expect(existsSync(join(physical, leaf))).toBe(false);
  });
  it("rejects temporary junction aliases including an absent child, without creating state", () => {
    const fixturePrefix = resolve(".tmp/site-persistence-junction-");
    mkdirSync(resolve(".tmp"), { recursive: true });
    const fixture = mkdtempSync(fixturePrefix);
    const physical = join(fixture, "physical");
    const alias = join(fixture, "alias");
    mkdirSync(physical);
    symlinkSync(physical, alias, "junction");
    try {
      expect(() => assertLocalPersistenceIsolation("luvdia", { OTW_D1_PERSIST_TO: physical, LUVDIA_D1_PERSIST_TO: alias })).toThrow(/persistence/);
      expect(() => assertLocalPersistenceIsolation("luvdia", { OTW_D1_PERSIST_TO: join(physical, "missing"), LUVDIA_D1_PERSIST_TO: join(alias, "missing") })).toThrow(/persistence/);
      expect(existsSync(join(physical, "missing"))).toBe(false);
      renameSync(physical, join(fixture, "moved"));
      expect(() => assertLocalPersistenceIsolation("luvdia", { OTW_D1_PERSIST_TO: join(fixture, "other"), LUVDIA_D1_PERSIST_TO: join(alias, "missing") })).toThrow(/filesystem alias/);
    } finally {
      removeJunctionFixture(fixture, alias, fixturePrefix);
    }
  });
  it.each(["v3", "v3/d1", "v3/r2"])("rechecks embedded %s junctions at the mutation boundary", directory => {
    mkdirSync(resolve(".tmp"), { recursive: true });
    const prefix = resolve(".tmp/site-mutation-junction-");
    const fixture = mkdtempSync(prefix);
    const selected = join(fixture, "selected");
    const other = join(fixture, "other");
    mkdirSync(selected);
    mkdirSync(other);
    const environment = { OTW_D1_PERSIST_TO: other, LUVDIA_D1_PERSIST_TO: selected };
    expect(assertLocalPersistenceIsolation("luvdia", environment)).toBe(selected);
    const alias = join(selected, directory);
    mkdirSync(resolve(alias, ".."), { recursive: true });
    symlinkSync(other, alias, "junction");
    try {
      expect(() => assertLocalPersistenceIsolation("luvdia", environment)).toThrow(/filesystem alias escapes/);
    } finally { removeJunctionFixture(fixture, alias, prefix); }
  });
  it.each([".wrangler/state", ".wrangler/state/v3/d1", ".wrangler/state/v3/r2/new-site"])("protects preserved legacy state from target %s", persistTo => {
    expect(() => assertLocalPersistenceIsolation("luvdia", {}, process.cwd(), persistTo)).toThrow(/legacy|persistence/);
  });
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
