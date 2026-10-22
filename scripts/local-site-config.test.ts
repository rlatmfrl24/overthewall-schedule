import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createLocalSiteConfig, writeLocalSiteConfig } from "./local-site-config.mjs";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("local Worker config isolation", () => {
  it("keeps all resource bindings local and resolves paths from the canonical config", () => {
    const source = { main: "worker/index.ts", assets: { directory: "dist/client" }, d1_databases: [{ binding: "otw_db", migrations_dir: "drizzle", remote: true }], r2_buckets: [{ binding: "ASSET_BUCKET", remote: true }] };
    const root = join(tmpdir(), "local-site-config");
    const local = createLocalSiteConfig(source, "luvdia", root);
    expect(local.main).toBe(join(root, "worker/index.ts"));
    expect(local.vars).toMatchObject({ SITE_ID: "luvdia" });
    expect(local.d1_databases[0].remote).toBe(false);
    expect(local.r2_buckets[0].remote).toBe(false);
    expect(source.r2_buckets[0].remote).toBe(true);
  });
  it("keeps selected server inputs out of the generated config and browser inputs out of dev vars", () => {
    const root = mkdtempSync(join(tmpdir(), "local-site-"));
    try {
      writeFileSync(join(root, "wrangler.luvdia.jsonc"), JSON.stringify(ts.parseConfigFileTextToJson("wrangler.luvdia.jsonc", readFileSync("wrangler.luvdia.jsonc", "utf8")).config));
      const path = writeLocalSiteConfig("luvdia", { CLERK_ADMIN_IDS: "selected-private", VITE_CLERK_PUBLISHABLE_KEY: "public-key" }, root);
      expect(JSON.parse(readFileSync(path, "utf8")).vars.SITE_PUBLIC_ORIGIN).toBe("http://localhost:5174");
      expect(readFileSync(path, "utf8")).not.toContain("selected-private");
      const privateVars = readFileSync(join(root, ".wrangler/local/luvdia/.dev.vars"), "utf8");
      expect(privateVars).toContain("selected-private");
      expect(privateVars).not.toContain("public-key");
      writeLocalSiteConfig("luvdia", { DEV_PORT: "5194" }, root);
      expect(JSON.parse(readFileSync(path, "utf8")).vars.SITE_PUBLIC_ORIGIN).toBe("http://localhost:5194");
      expect(() => writeLocalSiteConfig("luvdia", { SITE_PUBLIC_ORIGIN: "http://localhost:5173" }, root)).toThrow(/conflicts/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
