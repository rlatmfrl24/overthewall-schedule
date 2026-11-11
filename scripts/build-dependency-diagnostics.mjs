import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

console.log("BUILD_DEPENDENCIES", JSON.stringify({ stage: process.argv[2], node: process.version, platform: process.platform,
  build: process.env.WORKERS_CI_BUILD_UUID, commit: process.env.WORKERS_CI_COMMIT_SHA }));
let parent = resolve("package.json");
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
    catch (error) { console.log("BUILD_DEPENDENCY_ESM", JSON.stringify({ name, ok: false, code: error.code, error: error.message })); }
    parent = manifest;
  } catch (error) {
    console.log("BUILD_DEPENDENCY", JSON.stringify({ name, candidates, code: error.code, error: error.message }));
    break;
  }
}
