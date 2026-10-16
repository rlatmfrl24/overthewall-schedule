import { defineConfig } from "vitest/config";
import { testAliases, testCoverage, testMaxWorkers } from "./vitest.shared";

export default defineConfig({
  resolve: { alias: testAliases },
  test: {
    projects: ["vitest.config.ts", "vitest.worker.config.ts", "vitest.schema.config.ts", "vitest.workflow.config.ts"],
    reporters: ["dot"],
    maxWorkers: testMaxWorkers,
    coverage: testCoverage,
  },
});
