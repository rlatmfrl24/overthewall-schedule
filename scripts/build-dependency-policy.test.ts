import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const script = fileURLToPath(new URL("./build-dependency-diagnostics.mjs", import.meta.url));

it.each([
  { strict: true, engine: ">=999", status: 1 },
  { strict: false, engine: ">=999", status: 0 },
  { strict: true, engine: ">=18", status: 0 },
])("preserves actual pnpm engine policy during repair: $strict $engine", ({ strict, engine, status }) => {
  const prefix = resolve(tmpdir(), "otw-build-policy-");
  const root = mkdtempSync(prefix);
  try {
    for (const name of ["react-router", "react-store", "store"]) {
      const dir = join(root, "packages", name);
      mkdirSync(join(dir, "dist/esm"), { recursive: true });
      mkdirSync(join(dir, "dist/cjs"));
      const dependency = name === "react-router" ? "react-store" : name === "react-store" ? "store" : null;
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `@tanstack/${name}`, version: "1.0.0", type: "module",
        exports: { ".": { import: "./dist/esm/index.js", require: "./dist/cjs/index.cjs" }, "./package.json": "./package.json" },
        engines: name === "store" ? { node: engine } : {},
        dependencies: dependency ? { [`@tanstack/${dependency}`]: `file:../${dependency}` } : {} }));
      writeFileSync(join(dir, "dist/esm/index.js"), dependency ? `import "@tanstack/${dependency}"; export {};` : "export {};");
      writeFileSync(join(dir, "dist/cjs/index.cjs"), "module.exports = {};");
    }
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "build-policy-fixture", private: true,
      packageManager: "pnpm@11.7.0", dependencies: { "@tanstack/react-router": "file:packages/react-router" } }));
    writeFileSync(join(root, "pnpm-workspace.yaml"), `packages: ["."]\nengineStrict: ${strict}\n`);
    assert(process.env.npm_execpath, "Run pnpm policy tests through pnpm run test:unit or pnpm test");
    const pnpm = realpathSync(process.env.npm_execpath);
    const options = { cwd: root, encoding: "utf8" as const, timeout: 15_000, env: { ...process.env, npm_execpath: pnpm } };
    // Create a previously installed tree; the repair itself must respect the fixture policy.
    const setup = spawnSync(process.execPath, [pnpm, "install", "--offline", "--config.engine-strict=false", "--config.optimistic-repeat-install=false"], options);
    expect(setup.status, setup.stdout + setup.stderr).toBe(0);
    const protectedFiles = ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"];
    const before = protectedFiles.map(path => readFileSync(join(root, path), "utf8"));
    const healthy = spawnSync(process.execPath, [script, "--repair"], options);
    expect(healthy.status, healthy.stdout + healthy.stderr).toBe(0);
    expect(healthy.stdout + healthy.stderr).not.toContain("repairing the frozen installation once");
    let parent = join(root, "package.json");
    for (const name of ["react-router", "react-store", "store"]) parent = createRequire(parent).resolve(`@tanstack/${name}/package.json`);
    assert(parent.startsWith(root), "Expected an isolated dependency");
    unlinkSync(join(dirname(parent), "dist/esm/index.js"));
    const repaired = spawnSync(process.execPath, [script, "--repair"], options);
    const output = repaired.stdout + repaired.stderr;
    expect(repaired.status, output).toBe(status);
    expect(output.match(/repairing the frozen installation once/g)).toHaveLength(1);
    expect(output.includes("after-offline-repair")).toBe(status === 0);
    if (strict && engine === ">=999") expect(output).toContain("ERR_PNPM_UNSUPPORTED_ENGINE");
    else expect(readFileSync(join(dirname(parent), "dist/esm/index.js"), "utf8")).toBe("export {};");
    expect(protectedFiles.map(path => readFileSync(join(root, path), "utf8"))).toEqual(before);
    expect(JSON.parse(readFileSync(parent, "utf8")).version).toBe("1.0.0");
  } finally {
    assert(root.startsWith(prefix) && dirname(root) === resolve(tmpdir()), "Unexpected fixture path");
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
