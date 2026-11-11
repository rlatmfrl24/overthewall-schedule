import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

if (process.argv.includes("--repair")) {
  const check = stage => spawnSync(process.execPath, [process.argv[1], stage, "--check"],
    { stdio: "inherit", timeout: 5_000, killSignal: "SIGKILL" });
  const initial = check("before-vite");
  if (initial.status === 0) process.exit(0);
  if (initial.error || initial.status !== 1) throw initial.error ?? new Error("Dependency check was interrupted");
  const pnpm = process.env.npm_execpath && realpathSync(process.env.npm_execpath);
  if (!pnpm || !/[/\\]pnpm\.[cm]?js$/.test(pnpm)) throw new Error("Dependency repair requires pnpm run build");
  console.warn("[build] Dependency check failed; repairing the frozen installation once from the local store.");
  // Refresh generated install state; --force would bypass engineStrict.
  rmSync(resolve("node_modules/.pnpm/lock.yaml"), { force: true });
  const repair = spawnSync(process.execPath, [pnpm, "install", "--frozen-lockfile", "--offline", "--config.optimistic-repeat-install=false"],
    { stdio: "inherit", timeout: 120_000, killSignal: "SIGKILL" });
  if (repair.error) throw repair.error;
  if (repair.status !== 0) process.exit(repair.status ?? 1);
  // Use a fresh process so failed ESM imports cannot remain cached after relinking.
  const verified = check("after-offline-repair");
  if (verified.error) throw verified.error;
  process.exit(verified.status ?? 1);
}

console.log("BUILD_DEPENDENCIES", JSON.stringify({ stage: process.argv[2], node: process.version, platform: process.platform,
  build: process.env.WORKERS_CI_BUILD_UUID, commit: process.env.WORKERS_CI_COMMIT_SHA }));
let parent = resolve("package.json");
let failed = false;
for (const name of ["@tanstack/react-router", "@tanstack/react-store", "@tanstack/store"]) {
  const require = createRequire(parent);
  const candidates = require.resolve.paths(name).map(base => join(base, name)).flatMap(path => {
    try {
      const entry = lstatSync(path);
      return [{ path, symbolicLink: entry.isSymbolicLink(), target: entry.isSymbolicLink() ? readlinkSync(path) : null,
        exists: existsSync(path), physical: existsSync(path) ? realpathSync(path) : null }];
    } catch (error) { return error.code === "ENOENT" ? [] : [{ path, code: error.code }]; }
  });
  try {
    const manifest = require.resolve(`${name}/package.json`);
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    const esm = resolve(dirname(manifest), "dist/esm/index.js");
    console.log("BUILD_DEPENDENCY", JSON.stringify({ name, version: pkg.version, manifest, candidates,
      storeDependency: pkg.dependencies?.["@tanstack/store"], cjs: require.resolve(name), esm, esmExists: existsSync(esm) }));
    try { await import(pathToFileURL(esm).href); console.log("BUILD_DEPENDENCY_ESM", JSON.stringify({ name, ok: true })); }
    catch (error) { failed = true; console.log("BUILD_DEPENDENCY_ESM", JSON.stringify({ name, ok: false, code: error.code, error: error.message })); }
    parent = manifest;
  } catch (error) {
    failed = true;
    console.log("BUILD_DEPENDENCY", JSON.stringify({ name, candidates, code: error.code, error: error.message }));
    break;
  }
}
if (process.argv.includes("--check") && failed) process.exitCode = 1;
