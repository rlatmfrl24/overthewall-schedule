import { readFileSync } from "node:fs";
import ts from "typescript";
import { assertSiteResourceConfig } from "./site-resources.mjs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { getSiteTarget, parseSiteArgument, loadSiteEnvironment, resolveSiteOrigin } from "./site-target.mjs";
import { assertClerkDeploymentConfig } from "./clerk-environment.mjs";
import { writeSiteBuildManifest } from "./site-build-manifest.mjs";
import { writeStaticAssetManifest } from "./static-asset-manifest.mjs";

const siteId = parseSiteArgument();
const environment = loadSiteEnvironment(siteId, "production");
const origin = resolveSiteOrigin(siteId, environment);
assertClerkDeploymentConfig(environment, origin);
const configPath = getSiteTarget(siteId).configPath;
const config = ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, "utf8"));
if (config.error) throw new Error("Invalid canonical resource config.");
assertSiteResourceConfig(config.config, siteId);
const env = { ...process.env, SITE_ID: siteId, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", CLOUDFLARE_INCLUDE_PROCESS_ENV: "false" };
// Keep regression checks in the existing Workers Builds pipeline before upload/deploy.
if (process.env.WORKERS_CI === "1") {
  for (const command of ["architecture:check", "typecheck:test", "lint", "test", "sync:agent-cursor:check"]) {
    const result = spawnSync("pnpm", ["run", command], { stdio: "inherit", env });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
for (const [script, ...args] of [
  ["node_modules/typescript/bin/tsc", "-b"],
  ["node_modules/vite/bin/vite.js", "build"],
  ["node_modules/tsx/dist/cli.mjs", "scripts/generate-seo-assets.ts", `--site=${siteId}`],
]) {
  const result = spawnSync(process.execPath, [resolve(script), ...args], { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
writeStaticAssetManifest(resolve(getSiteTarget(siteId).outputRoot,"client"));
writeSiteBuildManifest(siteId, environment);
console.log(`[build] Verified artifact manifest for ${siteId}.`);
