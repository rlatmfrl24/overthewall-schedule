import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const script = fileURLToPath(new URL("./build-dependency-diagnostics.mjs", import.meta.url));

it.each([
  { strict: true, engine: ">=999", status: 1, hook: false },
  { strict: false, engine: ">=999", status: 0, hook: false },
  { strict: true, engine: ">=18", status: 0, hook: false },
  { strict: true, engine: ">=18", status: 41, hook: true },
])("preserves actual pnpm policy and unfinished repair: $strict $engine hook=$hook", ({ strict, engine, status, hook }) => {
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
        scripts: hook && name === "store" ? { postinstall: "node install.cjs" } : {},
        dependencies: dependency ? { [`@tanstack/${dependency}`]: `file:../${dependency}` } : {} }));
      if (hook && name === "store") writeFileSync(join(dir, "install.cjs"), `
        const fs = require("node:fs");
        const root = ${JSON.stringify(root)};
        fs.appendFileSync(root + "/hook.log", "ran\\n");
        if (fs.readFileSync(root + "/hook-mode", "utf8") === "fail") process.exit(41);
      `);
      writeFileSync(join(dir, "dist/esm/index.js"), dependency ? `import "@tanstack/${dependency}"; export {};` : "export {};");
      writeFileSync(join(dir, "dist/cjs/index.cjs"), "module.exports = {};");
    }
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "build-policy-fixture", private: true,
      packageManager: "pnpm@11.7.0", dependencies: { "@tanstack/react-router": "file:packages/react-router" } }));
    writeFileSync(join(root, "pnpm-workspace.yaml"), `packages: ["."]\nengineStrict: ${strict}\nsideEffectsCache: false\nallowBuilds:\n  "@tanstack/store@file:packages/store": true\n`);
    if (hook) writeFileSync(join(root, "hook-mode"), "ok");
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
    if (hook) writeFileSync(join(root, "hook-mode"), "fail");
    const repaired = spawnSync(process.execPath, [script, "--repair"], options);
    const output = repaired.stdout + repaired.stderr;
    expect(repaired.status, output).toBe(status);
    expect(output.match(/repairing the frozen installation once/g)).toHaveLength(1);
    expect(output.includes("after-offline-repair")).toBe(status === 0);
    if (strict && engine === ">=999") expect(output).toContain("ERR_PNPM_UNSUPPORTED_ENGINE");
    else expect(readFileSync(join(dirname(parent), "dist/esm/index.js"), "utf8")).toBe("export {};");
    const pendingPath = join(root, ".tmp/build-dependency-repair.pending");
    if (hook) {
      const hookBefore = readFileSync(join(root, "hook.log"), "utf8");
      const retry = spawnSync(process.execPath, [script, "--repair"], options);
      expect(retry.status, retry.stdout + retry.stderr).toBe(41);
      expect((retry.stdout + retry.stderr).match(/repairing the frozen installation once/g)).toHaveLength(1);
      expect(readFileSync(join(root, "hook.log"), "utf8")).toBe(hookBefore + "ran\n");
      expect(existsSync(pendingPath)).toBe(true);
      writeFileSync(join(root, "hook-mode"), "ok");
      const resumed = spawnSync(process.execPath, [script, "--repair"], options);
      expect(resumed.status, resumed.stdout + resumed.stderr).toBe(0);
      expect((resumed.stdout + resumed.stderr).match(/repairing the frozen installation once/g)).toHaveLength(1);
      expect(existsSync(pendingPath)).toBe(false);
      const completedHooks = readFileSync(join(root, "hook.log"), "utf8");
      const normal = spawnSync(process.execPath, [script, "--repair"], options);
      expect(normal.status, normal.stdout + normal.stderr).toBe(0);
      expect(normal.stdout + normal.stderr).not.toContain("repairing the frozen installation once");
      expect(readFileSync(join(root, "hook.log"), "utf8")).toBe(completedHooks);
    } else expect(existsSync(pendingPath)).toBe(status !== 0);
    expect(protectedFiles.map(path => readFileSync(join(root, path), "utf8"))).toEqual(before);
    expect(JSON.parse(readFileSync(parent, "utf8")).version).toBe("1.0.0");
  } finally {
    assert(root.startsWith(prefix) && dirname(root) === resolve(tmpdir()), "Unexpected fixture path");
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
