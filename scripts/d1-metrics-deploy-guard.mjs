import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { getSiteTarget } from "./site-target.mjs";

const required = ["CLOUDFLARE_D1_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID"];

export const assertD1MetricsPreservation = config => {
  if (config.keep_vars !== true) throw new Error("D1 metrics require keep_vars: true to preserve dashboard IDs.");
  for (const name of required) {
    if (Object.hasOwn(config.vars ?? {}, name) && (name === required[0] || typeof config.vars[name] !== "string" || !config.vars[name].trim())) {
      throw new Error(`D1 metrics: ${name} must be nonempty; the token must remain a remote Secret.`);
    }
  }
};

const readWranglerJson = (configPath, args) => {
  try {
    return JSON.parse(execFileSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), ...args, "--config", configPath, "--json"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
    }));
  } catch {
    // Wrangler output may contain unrelated plaintext bindings; never echo it.
    throw new Error(`D1 metrics: unable to verify ${args.slice(0, 2).join(" ")}; check Wrangler authentication and Worker read permissions.`);
  }
};

export const verifyD1MetricsForDeploy = (config, configPath = getSiteTarget(config.vars?.SITE_ID).configPath) => {
  assertD1MetricsPreservation(config);
  const database = config.d1_databases?.find(binding => binding.binding === "otw_db")?.database_id;
  if (!database || !config.name) throw new Error("D1 metrics: missing Worker or otw_db identity.");
  let account = process.env.CLOUDFLARE_ACCOUNT_ID || config.account_id;
  if (!account) {
    const identity = readWranglerJson(configPath, ["whoami"]);
    if (identity.loggedIn && identity.accounts?.length === 1) account = identity.accounts[0].id;
  }
  if (!/^[a-f0-9]{32}$/.test(account ?? "") || (config.account_id && config.account_id !== account)) {
    throw new Error("D1 metrics: set an unambiguous CLOUDFLARE_ACCOUNT_ID matching the authenticated deployment account.");
  }
  for (const [name, expected] of [["CLOUDFLARE_ACCOUNT_ID", account], ["CLOUDFLARE_D1_DATABASE_ID", database]]) {
    if (Object.hasOwn(config.vars ?? {}, name) && config.vars[name] !== expected) throw new Error(`D1 metrics: ${name} config identity does not match the deployment.`);
  }
  const deployment = readWranglerJson(configPath, ["deployments", "status"]);
  const uploaded = readWranglerJson(configPath, ["versions", "list"]);
  const latest = uploaded.reduce((previous, version) => !previous || version.number > previous.number ? version : previous, null);
  const active = deployment.versions?.filter(version => version.percentage > 0).map(version => version.version_id);
  if (!latest?.id || !active?.length) throw new Error("D1 metrics: no active or latest Worker version could be verified.");
  const versions = [...new Set([...active, latest.id])];
  for (const version of versions) {
    const bindings = readWranglerJson(configPath, ["versions", "view", version]).resources?.bindings;
    if (!Array.isArray(bindings) || bindings.filter(binding => binding.name === "otw_db" && binding.type === "d1" && binding.id === database).length !== 1) {
      throw new Error(`D1 metrics: ${config.name} version ${version} D1 binding identity does not match the deployment.`);
    }
    for (const name of required) {
      const matches = bindings.filter(binding => binding.name === name);
      const binding = matches[0];
      const encrypted = binding?.type === "secret_text";
      const validType = encrypted || (name !== required[0] && binding?.type === "plain_text");
      const validValue = (encrypted && !("text" in binding)) || (typeof binding?.text === "string" && binding.text.trim().length > 0);
      if (matches.length !== 1 || !validType || !validValue) {
        throw new Error(`D1 metrics: ${config.name} version ${version} is missing a valid ${name} binding.`);
      }
      const expected = name === "CLOUDFLARE_ACCOUNT_ID" ? account : database;
      if (binding.type === "plain_text" && binding.text !== expected) throw new Error(`D1 metrics: ${name} identity does not match the deployment.`);
    }
  }
  return { workerName: config.name, versions, requiredBindings: required, keepVars: true };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  for (const site of ["otw", "luvdia"]) {
    const configPath = getSiteTarget(site).configPath;
    const parsed = ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, "utf8"));
    if (parsed.error) throw new Error(`Invalid ${configPath}.`);
    console.log(`[deploy:d1-metrics] ${JSON.stringify(verifyD1MetricsForDeploy(parsed.config, configPath))}`);
  }
}
