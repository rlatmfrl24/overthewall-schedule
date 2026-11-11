import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { expect, it } from "vitest";

const script = fileURLToPath(new URL("./build-dependency-diagnostics.mjs", import.meta.url));

it.each([false, true])("records actual dependency links without changing them (broken=%s)", broken => {
  const prefix = resolve(tmpdir(), "otw-build-deps-");
  const root = mkdtempSync(prefix);
  try {
    writeFileSync(join(root, "package.json"), "{}");
    for (const name of ["react-router", "react-store", "store"]) {
      const dir = join(root, "node_modules/@tanstack", name);
      if (name === "store" && broken) {
        symlinkSync(join(root, "missing-store"), dir, "junction");
        continue;
      }
      mkdirSync(join(dir, "dist/esm"), { recursive: true });
      mkdirSync(join(dir, "dist/cjs"));
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `@tanstack/${name}`, version: "0.9.3", type: "module",
        exports: { ".": { import: "./dist/esm/index.js", require: "./dist/cjs/index.cjs" }, "./package.json": "./package.json" },
        dependencies: name === "react-store" ? { "@tanstack/store": "0.9.3" } : {} }));
      writeFileSync(join(dir, "dist/cjs/index.cjs"), "module.exports = {};");
      writeFileSync(join(dir, "dist/esm/index.js"), name === "react-store" ? 'import "@tanstack/store"; export {};' : "export {};");
    }
    const before = readFileSync(join(root, "node_modules/@tanstack/react-store/package.json"), "utf8");
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", timeout: 5_000,
      env: { ...process.env, BUILD_PRIVATE_TOKEN: "must-not-appear-in-logs" } });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"name":"@tanstack/store"');
    expect(result.stdout).not.toContain("must-not-appear-in-logs");
    if (broken) {
      expect(result.stdout).toContain('"symbolicLink":true');
      expect(result.stdout).toContain('"exists":false');
      expect(result.stdout).toContain('"code":"ERR_MODULE_NOT_FOUND"');
    } else expect(result.stdout).toContain('"esmExists":true');
    expect(readFileSync(join(root, "node_modules/@tanstack/react-store/package.json"), "utf8")).toBe(before);
  } finally {
    assert(root.startsWith(prefix) && dirname(root) === resolve(tmpdir()), "Unexpected fixture path");
    rmSync(root, { recursive: true, force: true });
  }
});
