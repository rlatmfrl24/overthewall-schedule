import { existsSync, readFileSync, realpathSync, statSync, lstatSync, readdirSync } from "node:fs";
import { resolve, dirname, basename, sep } from "node:path";
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

const resolvePersistenceIdentity = (path, root) => {
  let parent = resolve(root, path);
  const missing = [];
  for (;;) {
    try {
      const physical = realpathSync.native(parent);
      if (!statSync(physical).isDirectory()) throw new Error("Local persistence must resolve to a directory.");
      const identity = resolve(physical, ...missing);
      return process.platform === "win32" ? identity.toLowerCase() : identity;
    } catch (error) {
      if (error.code !== "ENOENT" || dirname(parent) === parent) throw error;
      if (lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("Cannot resolve local persistence filesystem alias.");
      missing.unshift(basename(parent));
      parent = dirname(parent);
    }
  }
};

const persistenceRootContains = (parent, child) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`);
const persistenceRootsOverlap = (left, right) => persistenceRootContains(left, right) || persistenceRootContains(right, left);

const assertPersistenceTree = (path, root, identity) => {
  const versionRoot = resolve(root, path, "v3");
  if (!persistenceRootContains(identity, resolvePersistenceIdentity(versionRoot, root))) throw new Error("Local persistence v3 filesystem alias escapes its site root.");
  const directories = new Set(["cache", "d1", "do", "kv", "observability", "r2", "ratelimit", "workflows", "miniflare-D1DatabaseObject"]);
  if (existsSync(versionRoot)) {
    for (const entry of readdirSync(versionRoot, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink()) directories.add(entry.name);
    }
  }
  for (const directory of directories) {
    if (!persistenceRootContains(identity, resolvePersistenceIdentity(resolve(versionRoot, directory), root))) throw new Error("Local persistence resource filesystem alias escapes its site root.");
  }
};

export const assertLocalPersistenceIsolation = (siteId, environment = process.env, root = process.cwd(), override) => {
  parseSiteId(siteId);
  const configured = Object.fromEntries(["otw", "luvdia"].map(id => {
    const selected = getSiteLocalEnvironment(id, environment, root);
    const path = selected[`${id.toUpperCase()}_D1_PERSIST_TO`]?.trim() || getSiteTarget(id).localPersistTo;
    return [id, { path, identity: resolvePersistenceIdentity(path, root) }];
  }));
  if (persistenceRootsOverlap(configured.otw.identity, configured.luvdia.identity)) throw new Error("Local sites must use different persistence roots without overlap or filesystem aliases.");
  const legacy = resolvePersistenceIdentity(".wrangler/state/v3", root);
  for (const target of Object.values(configured)) {
    if (persistenceRootsOverlap(target.identity, legacy)) throw new Error("Local persistence must not overlap preserved legacy state.");
    assertPersistenceTree(target.path, root, target.identity);
  }
  if (override !== undefined) {
    const identity = resolvePersistenceIdentity(override, root);
    const other = configured[siteId === "otw" ? "luvdia" : "otw"];
    if (persistenceRootsOverlap(identity, other.identity)) throw new Error("Local sites must use different persistence roots without overlap or filesystem aliases.");
    if (persistenceRootsOverlap(identity, legacy)) throw new Error("Local persistence must not overlap preserved legacy state.");
    assertPersistenceTree(override, root, identity);
  }
  return override ?? configured[siteId].path;
};
