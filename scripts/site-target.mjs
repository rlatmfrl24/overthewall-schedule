import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { getSiteDefinition, parseSiteId } from "../contracts/site-definition.ts";

export const getSiteTarget = (siteId) => {
  parseSiteId(siteId);
  return { siteId, configPath: siteId === "otw" ? "wrangler.jsonc" : "wrangler.luvdia.jsonc", outputRoot: `dist/${siteId}`, localPersistTo: `.wrangler/state/${siteId}` };
};

export const parseSiteArgument = (args = process.argv.slice(2)) => {
  const selections = args.filter(arg => arg.startsWith("--site="));
  if (selections.length !== 1) throw new Error("Exactly one --site=otw|luvdia argument is required.");
  return parseSiteId(selections[0].slice(7));
};

export const getSiteEnvDirectory = (siteId) => `config/sites/${parseSiteId(siteId)}`;

export const loadSiteEnvironment = (siteId, mode, environment = process.env, root = process.cwd()) => {
  parseSiteId(siteId);
  const files = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];
  const result = {};
  // Only the explicit OTW alias retains legacy root files.
  for (const directory of siteId === "otw" ? [root, resolve(root, getSiteEnvDirectory(siteId))] : [resolve(root, getSiteEnvDirectory(siteId))]) {
    for (const file of files) {
      const path = resolve(directory, file);
      if (existsSync(path)) Object.assign(result, parse(readFileSync(path)));
    }
  }
  const prefix = `${siteId.toUpperCase()}_`;
  for (const [name, value] of Object.entries(environment)) {
    if (name.startsWith(prefix) && value !== undefined) result[name.slice(prefix.length)] = value;
  }
  delete result.VITE_CLERK_ADMIN_IDS;
  result.VITE_SITE_ID = siteId;
  return result;
};

export const resolveSiteOrigin = (siteId, environment) => {
  const origin = environment.PUBLIC_ORIGIN || getSiteDefinition(siteId).publicOrigin;
  if (!origin) throw new Error(`Missing production PUBLIC_ORIGIN for ${siteId}.`);
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.hostname === "localhost") throw new Error(`Invalid production PUBLIC_ORIGIN for ${siteId}.`);
  if (siteId === "luvdia" && parsed.origin === getSiteDefinition("otw").publicOrigin) throw new Error("LuvDia must use its own production origin.");
  return parsed.origin;
};

export const getSiteLocalEnvironment = (siteId, environment = process.env, root = process.cwd()) => {
  const selected = loadSiteEnvironment(siteId, "development", environment, root);
  const result = { ...environment };
  for (const name of ["DEV_PORT", "D1_PERSIST_TO"]) {
    const key = `${siteId.toUpperCase()}_${name}`;
    if (selected[name] || selected[key]) result[key] = selected[name] || selected[key];
  }
  return result;
};
