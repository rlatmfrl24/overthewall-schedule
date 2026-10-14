import { assertSiteResourceConfig } from "./site-resources.mjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, relative, dirname, isAbsolute } from "node:path";
import ts from "typescript";
import { getSiteTarget, resolveSiteOrigin } from "./site-target.mjs";

const hashConfig = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const readJson = path => JSON.parse(readFileSync(path, "utf8"));

export const writeSiteBuildManifest = (siteId, environment) => {
  const target = getSiteTarget(siteId);
  const workerConfigs = readdirSync(target.outputRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== "client").map(entry => resolve(target.outputRoot, entry.name, "wrangler.json"));
  if (workerConfigs.length !== 1) throw new Error("Expected one generated Worker config in the site's output root.");
  const generated = readJson(workerConfigs[0]);
  const manifest = {
    siteId,
    gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    publicOrigin: resolveSiteOrigin(siteId, environment),
    workerName: generated.name,
    configHash: hashConfig(target.configPath),
    clerkIssuer: environment.CLERK_ISSUER,
    workerConfigPath: relative(process.cwd(), workerConfigs[0]).replaceAll("\\", "/"),
  };
  verifySiteBuildManifest(siteId, manifest);
  writeFileSync(resolve(target.outputRoot, "site-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
};

export const verifySiteBuildManifest = (siteId, manifest = readJson(resolve(getSiteTarget(siteId).outputRoot, "site-manifest.json")), root = process.cwd()) => {
  const target = getSiteTarget(siteId);
  if (manifest.siteId !== siteId) throw new Error("Artifact site does not match the selected deployment site.");
  if (!/^[a-f0-9]{40}$/.test(manifest.gitCommit ?? "") || !manifest.clerkIssuer) throw new Error("Artifact is missing commit or Clerk app identity.");
  const canonicalPath = resolve(root, target.configPath);
  if (manifest.configHash !== hashConfig(canonicalPath)) throw new Error("Artifact canonical config has changed since build.");
  const origin = resolveSiteOrigin(siteId, { PUBLIC_ORIGIN: manifest.publicOrigin });
  const configPath = resolve(root, manifest.workerConfigPath);
  const outputRoot = resolve(root, target.outputRoot);
  const location = relative(outputRoot, configPath);
  if (location.startsWith("..") || isAbsolute(location)) throw new Error("Artifact Worker config escapes its site output root.");
  const generated = readJson(configPath);
  const canonical = ts.parseConfigFileTextToJson(canonicalPath, readFileSync(canonicalPath, "utf8"));
  if (canonical.error || generated.name !== canonical.config.name || generated.name !== manifest.workerName || generated.vars?.SITE_ID !== siteId) throw new Error("Generated Worker config has a different site or Worker identity.");
  assertSiteResourceConfig(canonical.config, siteId);
  assertSiteResourceConfig(generated, siteId);
  for (const variable of Object.keys(canonical.config.vars).filter(name => name.endsWith("_QUEUE_NAME") || name === "PLAY_ANALYTICS_DATASET")) {
    if (generated.vars[variable] !== canonical.config.vars[variable]) throw new Error("Generated resource vars differ from the canonical config.");
  }
  if (resolve(dirname(configPath), generated.assets.directory) !== resolve(outputRoot, "client")) throw new Error("Generated Worker assets do not belong to this site.");
  if (origin !== manifest.publicOrigin) throw new Error("Artifact origin is not canonical.");
  return manifest;
};
