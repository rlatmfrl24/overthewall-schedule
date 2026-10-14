import ts from "typescript";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifySiteBuildManifest } from "./site-build-manifest.mjs";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("site artifact identity", () => {
  it("rejects an OTW artifact requested for LuvDia before reading bundles", () => {
    expect(() => verifySiteBuildManifest("luvdia", { siteId: "otw" })).toThrow(/site/);
  });
  it("verifies generated identity/assets and rejects canonical drift or cross-site assets", () => {
    const root = mkdtempSync(join(tmpdir(), "site-manifest-"));
    try {
      const canonical = ts.parseConfigFileTextToJson("wrangler.luvdia.jsonc", readFileSync("wrangler.luvdia.jsonc", "utf8")).config;
      const source = JSON.stringify(canonical);
      writeFileSync(join(root, "wrangler.luvdia.jsonc"), source);
      const directory = join(root, "dist/luvdia/luvdia_schedule");
      mkdirSync(directory, { recursive: true });
      const generated = { ...canonical, assets: { directory: "../client" } };
      const configPath = join(directory, "wrangler.json");
      writeFileSync(configPath, JSON.stringify(generated));
      const manifest = { siteId: "luvdia", gitCommit: "a".repeat(40), publicOrigin: "https://luvdia.example", workerName: generated.name, configHash: createHash("sha256").update(source).digest("hex"), clerkIssuer: "https://luvdia.clerk.accounts.dev", workerConfigPath: "dist/luvdia/luvdia_schedule/wrangler.json" };
      expect(verifySiteBuildManifest("luvdia", manifest, root)).toBe(manifest);
      writeFileSync(configPath, JSON.stringify({ ...generated, assets: { directory: "../../otw/client" } }));
      expect(() => verifySiteBuildManifest("luvdia", manifest, root)).toThrow(/assets/);
      writeFileSync(join(root, "wrangler.luvdia.jsonc"), "{}");
      expect(() => verifySiteBuildManifest("luvdia", manifest, root)).toThrow(/changed since build/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
