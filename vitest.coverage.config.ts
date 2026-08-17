import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
    },
  },
  test: {
    projects: ["vitest.config.ts", "vitest.worker.config.ts"],
    coverage: {
      // Workerd does not expose the V8 inspector coverage API. Istanbul lets
      // unit and Miniflare D1 integration tests contribute to one report.
      provider: "istanbul",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/features/**/api/**/*.ts",
        "src/features/**/model/**/*.ts",
        "src/features/**/use-cases/**/*.ts",
        "src/shared/api/**/*.ts",
        "worker/features/**/application/**/*.ts",
        "worker/features/**/domain/**/*.ts",
        "worker/features/**/infrastructure/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.integration.test.ts",
        "src/routeTree.gen.ts",
        "src/vite-env.d.ts",
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
