import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { expect, it } from "vitest";

const script = fileURLToPath(new URL("./build-dependency-diagnostics.mjs", import.meta.url));

it.each([
  { broken: false, mode: "", repair: "unused", status: 0, installs: 0 },
  { broken: true, mode: "", repair: "unused", status: 0, installs: 0 },
  { broken: true, mode: "--check", repair: "unused", status: 1, installs: 0 },
  { broken: false, mode: "--repair", repair: "unused", status: 0, installs: 0 },
  { broken: true, mode: "--repair", repair: "success", status: 0, installs: 1 },
  { broken: true, mode: "--repair", repair: "failure", status: 37, installs: 1 },
  { broken: true, mode: "--repair", repair: "ineffective", status: 1, installs: 1 },
])("checks and repairs dependency links: $broken $mode $repair", ({ broken, mode, repair, status, installs }) => {
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
    const installer = join(root, "pnpm.cjs");
    writeFileSync(installer, `
      const fs = require("node:fs");
      fs.appendFileSync("installs.jsonl", JSON.stringify(process.argv.slice(2)) + "\\n");
      if (${JSON.stringify(repair)} === "failure") process.exit(37);
      if (${JSON.stringify(repair)} === "success") {
        fs.mkdirSync("missing-store/dist/esm", { recursive: true });
        fs.mkdirSync("missing-store/dist/cjs");
        fs.writeFileSync("missing-store/package.json", JSON.stringify({ name: "@tanstack/store", version: "0.9.3", type: "module",
          exports: { ".": { import: "./dist/esm/index.js", require: "./dist/cjs/index.cjs" }, "./package.json": "./package.json" } }));
        fs.writeFileSync("missing-store/dist/esm/index.js", "export {};");
        fs.writeFileSync("missing-store/dist/cjs/index.cjs", "module.exports = {};");
      }
    `);
    const before = readFileSync(join(root, "node_modules/@tanstack/react-store/package.json"), "utf8");
    const result = spawnSync(process.execPath, [script, "test", mode], { cwd: root, encoding: "utf8", timeout: 10_000,
      env: { ...process.env, npm_execpath: installer, BUILD_PRIVATE_TOKEN: "must-not-appear-in-logs" } });
    expect(result.status, result.stdout + result.stderr).toBe(status);
    expect(result.stdout).toContain('"name":"@tanstack/store"');
    expect(result.stdout).not.toContain("must-not-appear-in-logs");
    if (broken) {
      expect(result.stdout).toContain('"symbolicLink":true');
      expect(result.stdout).toContain('"exists":false');
      expect(result.stdout).toContain('"code":"ERR_MODULE_NOT_FOUND"');
    } else expect(result.stdout).toContain('"esmExists":true');
    const commands = installs ? readFileSync(join(root, "installs.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
    expect(existsSync(join(root, "installs.jsonl"))).toBe(installs > 0);
    expect(commands).toHaveLength(installs);
    if (installs) expect(commands[0]).toEqual(["install", "--frozen-lockfile", "--offline", "--force", "--config.optimistic-repeat-install=false"]);
    if (repair === "success") expect(result.stdout).toContain('"stage":"after-offline-repair"');
    expect(readFileSync(join(root, "node_modules/@tanstack/react-store/package.json"), "utf8")).toBe(before);
  } finally {
    assert(root.startsWith(prefix) && dirname(root) === resolve(tmpdir()), "Unexpected fixture path");
    rmSync(root, { recursive: true, force: true });
  }
});
