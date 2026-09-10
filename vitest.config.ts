import { defineConfig } from "vitest/config";
import { testAliases, testCoverage, testMaxWorkers } from "./vitest.shared";

export default defineConfig({
  resolve: { alias: testAliases },
  test: {
    name: "unit",
    environment: "node",
    maxWorkers: testMaxWorkers,
    include: [
      "src/**/*.test.ts", "src/**/*.test.tsx",
      "worker/**/*.test.ts", "scripts/**/*.test.ts",
    ],
    exclude: ["worker/**/*.integration.test.ts"],
    coverage: { ...testCoverage, provider: "v8" },
  },
});
