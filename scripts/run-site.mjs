import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { parseSiteArgument, getSiteLocalEnvironment, assertLocalPersistenceIsolation } from "./site-target.mjs";
import { getLocalDevServerConfig } from "./local-dev-config.mjs";

const args = process.argv.slice(2);
const siteId = parseSiteArgument(args);
const operation = args[0];
if (operation !== "dev" && operation !== "preview") throw new Error("Expected dev or preview operation.");
const localEnvironment = getSiteLocalEnvironment(siteId);
const server = getLocalDevServerConfig(localEnvironment, siteId);
const otherSite = siteId === "otw" ? "luvdia" : "otw";
const otherEnvironment = getSiteLocalEnvironment(otherSite);
if (server.port === getLocalDevServerConfig(otherEnvironment, otherSite).port) throw new Error("Local sites must use different ports.");
assertLocalPersistenceIsolation(siteId, localEnvironment);
const forwarded = args.slice(1).filter(arg => !arg.startsWith("--site="));
if (forwarded.some(arg => /^--(?:port|host)(?:=|$)/.test(arg))) throw new Error("Set DEV_PORT in the selected site env file or use its prefixed process input; localhost is required.");
const child = spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), ...(operation === "preview" ? ["preview"] : []), "--host", server.host, "--port", String(server.port), "--strictPort", ...forwarded], {
  stdio: "inherit",
  env: { ...localEnvironment, SITE_ID: siteId, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false", CLOUDFLARE_INCLUDE_PROCESS_ENV: "false" },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
