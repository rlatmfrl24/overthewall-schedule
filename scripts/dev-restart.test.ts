import { describe, expect, it } from "vitest";
import { matchesSiteViteProcess } from "./dev-process.mjs";

describe("site restart process ownership", () => {
  it("requires the repository Vite executable and exact selected port", () => {
    const root = "C:/Develop/overthewall-schedule";
    expect(matchesSiteViteProcess(`node ${root}/node_modules/vite/bin/vite.js --port 5173 --strictPort`, root, 5173)).toBe(true);
    expect(matchesSiteViteProcess(`node ${root}/node_modules/vite/bin/vite.js --port 5174 --strictPort`, root, 5173)).toBe(false);
    expect(matchesSiteViteProcess("node C:/other/node_modules/vite/bin/vite.js --port 5173", root, 5173)).toBe(false);
    expect(matchesSiteViteProcess(`node ${root}/scripts/dev-restart.mjs --port 5173`, root, 5173)).toBe(false);
  });
});
