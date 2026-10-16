import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { verifyClientBuildForDeploy } from "./client-build-deploy-guard.mjs";
import { getSiteTarget, parseSiteArgument } from "./site-target.mjs";
import { verifySiteBuildManifest } from "./site-build-manifest.mjs";
import { resolve } from "node:path";

const isWindows = process.platform === "win32";
const dryRun = process.argv.includes("--dry-run");
const siteId = parseSiteArgument();
const target = getSiteTarget(siteId);
const manifest = verifySiteBuildManifest(siteId);
if (manifest.gitCommit !== execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()) {
  throw new Error("Artifact commit differs from the reviewed deployment checkout.");
}
const configs = [manifest.workerConfigPath];

const verifiedClientBuild = verifyClientBuildForDeploy(resolve(target.outputRoot, "client"), { siteId, issuer: manifest.clerkIssuer });
process.stdout.write(
  `[deploy] Verified Clerk configuration in ${verifiedClientBuild.entryScriptCount} client entry script(s).\n`,
);
process.stdout.write(`[deploy] Release ${JSON.stringify({ siteId, gitCommit: manifest.gitCommit, sourceTreeHash: manifest.sourceTreeHash, migrationHead: manifest.migrationHead, artifactHash: createHash("sha256").update(JSON.stringify(manifest.artifactHashes)).digest("hex") })}\n`);

const run = (args, options = {}) => {
  const displayCommand = `pnpm exec wrangler ${args.join(" ")}`;
  const command = isWindows ? "cmd.exe" : "pnpm";
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", displayCommand]
    : ["exec", "wrangler", ...args];
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (options.capture) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  if (result.status !== 0) {
    throw new Error(`${displayCommand} failed: ${result.error?.message ?? result.status}`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
};

if (!dryRun) {
  const doctor = spawnSync(process.execPath, ["scripts/d1-doctor.mjs", `--site=${siteId}`, "--remote", "--skip-local", "--schema-only"], {
    cwd: process.cwd(), stdio: "inherit", env: { ...process.env, ...(process.env.CLOUDFLARE_D1_TOKEN ? { CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_D1_TOKEN } : {}) },
  });
  if (doctor.status !== 0) throw new Error("Remote D1 schema and configuration checks failed");
}

for (const config of configs) {
  run(["deploy", "--config", config, ...(dryRun ? ["--dry-run"] : [])]);
}

if (!dryRun) {
  process.stdout.write(
    "Consolidated Worker deployed. Scheduled v2 lanes remain governed by scheduled_v2_<jobType>_enabled D1 flags.\n",
  );
}
