import { defineConfig } from "vitest/config";
import { testAliases, testCoverage, testMaxWorkers } from "./vitest.shared";

export default defineConfig({
  define: {
    "import.meta.env.VITE_SITE_ID": JSON.stringify("otw"),
    "import.meta.env.VITE_PUBLIC_ORIGIN": JSON.stringify("https://otw-schedule.info"),
  },
  resolve: { alias: testAliases },
  test: {
    name: "unit",
    reporters: ["dot"],
    environment: "node",
    maxWorkers: testMaxWorkers,
    include: [
      "src/**/*.test.ts", "src/**/*.test.tsx",
      "worker/**/*.test.ts", "scripts/**/*.test.ts", "contracts/**/*.test.ts",
    ],
    exclude: ["worker/**/*.integration.test.ts"],
    coverage: { ...testCoverage, provider: "v8" },
  },
});
