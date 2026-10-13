import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parseSiteArgument, loadSiteEnvironment, resolveSiteOrigin } from "./site-target.mjs";
import { assertClerkSiteIdentity } from "./clerk-environment.mjs";
import { writeSiteBuildManifest } from "./site-build-manifest.mjs";

const siteId = parseSiteArgument();
const environment = loadSiteEnvironment(siteId, "production");
resolveSiteOrigin(siteId, environment);
assertClerkSiteIdentity({ publishableKey: environment.VITE_CLERK_PUBLISHABLE_KEY, issuer: environment.CLERK_ISSUER, target: "production" });
const env = { ...process.env, SITE_ID: siteId, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", CLOUDFLARE_INCLUDE_PROCESS_ENV: "false" };
for (const [script, ...args] of [
  ["node_modules/typescript/bin/tsc", "-b"],
  ["node_modules/vite/bin/vite.js", "build"],
  ["node_modules/tsx/dist/cli.mjs", "scripts/generate-seo-assets.ts", `--site=${siteId}`],
]) {
  const result = spawnSync(process.execPath, [resolve(script), ...args], { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
writeSiteBuildManifest(siteId, environment);
console.log(`[build] Verified artifact manifest for ${siteId}.`);
