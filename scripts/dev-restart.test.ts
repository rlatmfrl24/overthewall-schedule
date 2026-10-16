import { describe, expect, it } from "vitest";
import { matchesSiteViteProcess } from "./dev-process.mjs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

describe("site restart process ownership", () => {
  it("requires the repository Vite executable and exact selected port", () => {
    const root = "C:/Develop/overthewall-schedule";
    expect(matchesSiteViteProcess(`node ${root}/node_modules/vite/bin/vite.js --port 5173 --strictPort`, root, 5173)).toBe(true);
    expect(matchesSiteViteProcess(`node ${root}/node_modules/vite/bin/vite.js --port 5174 --strictPort`, root, 5173)).toBe(false);
    expect(matchesSiteViteProcess("node C:/other/node_modules/vite/bin/vite.js --port 5173", root, 5173)).toBe(false);
    expect(matchesSiteViteProcess(`node ${root}/scripts/dev-restart.mjs --port 5173`, root, 5173)).toBe(false);
  });
  it.each([
    ["scripts/dev-restart.mjs", ["--site=luvdia", "--kill-only"]],
    ["scripts/run-site.mjs", ["dev", "--site=luvdia"]],
    ["scripts/d1-reset-local.mjs", ["--site=luvdia", "--force"]],
  ])("rejects overlapping state at %s before process or database mutations", (script, args) => {
    expect(existsSync(".tmp/rejected-site-state")).toBe(false);
    const result = spawnSync(process.execPath, [resolve(script), ...args], {
      encoding: "utf8", timeout: 10_000,
      env: { ...process.env, OTW_D1_PERSIST_TO: ".tmp/rejected-site-state", LUVDIA_D1_PERSIST_TO: ".tmp/rejected-site-state/child" },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/persistence roots/);
    expect(result.stdout).toBe("");
    expect(existsSync(".tmp/rejected-site-state")).toBe(false);
  });
});
