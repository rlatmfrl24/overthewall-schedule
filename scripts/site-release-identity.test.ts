import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { getSiteReleaseIdentity, verifySiteBuildManifest } from "./site-build-manifest.mjs";
import { createHash } from "node:crypto";

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "site-release-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const canonical = ts.parseConfigFileTextToJson("wrangler.luvdia.jsonc", readFileSync("wrangler.luvdia.jsonc", "utf8")).config;
  const config = JSON.stringify(canonical);
  writeFileSync(join(root, "wrangler.luvdia.jsonc"), config);
  for (const directory of ["worker", "drizzle/meta", "dist/luvdia/client", "dist/luvdia/luvdia_schedule"]) mkdirSync(join(root, directory), { recursive: true });
  writeFileSync(join(root, "worker/index.ts"), "export default {};");
  writeFileSync(join(root, "drizzle/meta/_journal.json"), JSON.stringify({ entries: [{ tag: "0139_x-repair-maintenance-guards" }] }));
  writeFileSync(join(root, "dist/luvdia/client/index.html"), "<html>reviewed</html>");
  writeFileSync(join(root, "dist/luvdia/luvdia_schedule/index.js"), "export default {};");
  const workerConfigPath = "dist/luvdia/luvdia_schedule/wrangler.json";
  const generated = { ...canonical, assets: { directory: "../client" } };
  writeFileSync(join(root, workerConfigPath), JSON.stringify(generated));
  const manifest = {
    siteId: "luvdia", gitCommit: "a".repeat(40), publicOrigin: "https://luvdia.example", workerName: generated.name,
    configHash: createHash("sha256").update(config).digest("hex"), clerkIssuer: "https://luvdia.clerk.accounts.dev", workerConfigPath,
    ...getSiteReleaseIdentity("luvdia", root),
  };
  return { root, manifest, generated, workerConfigPath };
};

describe("reviewed release source and artifacts", () => {
  it("rejects changed source or built assets even with the same commit label", () => {
    const { root, manifest } = fixture();
    try {
      expect(verifySiteBuildManifest("luvdia", manifest, root)).toBe(manifest);
      writeFileSync(join(root, "worker/index.ts"), "export default { changed: true };");
      expect(() => verifySiteBuildManifest("luvdia", manifest, root)).toThrow(/source/i);
      writeFileSync(join(root, "worker/index.ts"), "export default {};");
      writeFileSync(join(root, "dist/luvdia/client/index.html"), "<html>unreviewed</html>");
      expect(() => verifySiteBuildManifest("luvdia", manifest, root)).toThrow(/artifact/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("rejects a cross-site database UUID even when names and freshly computed hashes match", () => {
    const { root, manifest, generated, workerConfigPath } = fixture();
    try {
      generated.d1_databases[0].database_id = "133b980d-1701-427e-93fd-8c9dcca1132e";
      writeFileSync(join(root, workerConfigPath), JSON.stringify(generated));
      Object.assign(manifest, getSiteReleaseIdentity("luvdia", root));
      expect(() => verifySiteBuildManifest("luvdia", manifest, root)).toThrow(/database|binding/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("does not include private environment files in source identity or manifest", () => {
    const { root, manifest } = fixture();
    try {
      writeFileSync(join(root, ".env.local"), "CLOUDFLARE_API_TOKEN=private-test-value");
      expect(getSiteReleaseIdentity("luvdia", root).sourceTreeHash).toBe(manifest.sourceTreeHash);
      expect(JSON.stringify(manifest)).not.toContain("private-test-value");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
