import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { getSiteTarget } from "./site-target.mjs";
import { getLocalDevOrigin } from "./local-dev-config.mjs";

export const createLocalSiteConfig = (source, siteId, root = process.cwd()) => ({
  ...source,
  main: resolve(root, source.main),
  assets: { ...source.assets, directory: resolve(root, source.assets.directory) },
  vars: { ...source.vars, SITE_ID: siteId },
  d1_databases: source.d1_databases.map(binding => ({ ...binding, migrations_dir: resolve(root, binding.migrations_dir), remote: false })),
  r2_buckets: source.r2_buckets.map(binding => ({ ...binding, remote: false })),
});

export const writeLocalSiteConfig = (siteId, environment, root = process.cwd()) => {
  const target = getSiteTarget(siteId);
  const canonical = resolve(root, target.configPath);
  const parsed = ts.parseConfigFileTextToJson(canonical, readFileSync(canonical, "utf8"));
  if (parsed.error) throw new Error(`Invalid canonical config for ${siteId}.`);
  const directory = resolve(root, ".wrangler/local", siteId);
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, "wrangler.json");
  const config = createLocalSiteConfig(parsed.config, siteId, root);
  config.vars.SITE_PUBLIC_ORIGIN = getLocalDevOrigin({ [`${siteId.toUpperCase()}_DEV_PORT`]: environment.DEV_PORT || environment[`${siteId.toUpperCase()}_DEV_PORT`] }, siteId);
  writeFileSync(path, JSON.stringify(config, null, 2));
  const privateVars = Object.entries(environment).filter(([name]) => !name.startsWith("VITE_") && name !== "PUBLIC_ORIGIN");
  writeFileSync(resolve(directory, ".dev.vars"), privateVars.map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n"));
  return path;
};
