import path from "node:path";
import type { CoverageOptions } from "vitest/node";

export const testAliases = {
  "@": path.resolve(import.meta.dirname, "src"),
  "@contracts": path.resolve(import.meta.dirname, "contracts"),
  "@db": path.resolve(import.meta.dirname, "db"),
};

// Keep standalone and combined runs within the same developer-machine budget.
export const testMaxWorkers = 2;

export const testCoverage: CoverageOptions = {
  // Workerd has no V8 inspector; combined reports use Istanbul.
  provider: "istanbul",
  reporter: ["text", "json-summary", "html"],
  include: [
    "src/features/**/api/**/*.ts", "src/features/**/model/**/*.ts",
    "src/features/**/use-cases/**/*.ts", "src/shared/api/**/*.ts",
    "worker/features/**/application/**/*.ts", "worker/features/**/domain/**/*.ts",
    "worker/features/**/infrastructure/**/*.ts",
  ],
  exclude: [
    "**/*.test.ts", "**/*.test.tsx", "**/*.integration.test.ts",
    "src/routeTree.gen.ts", "src/vite-env.d.ts",
  ],
  thresholds: { statements: 70, branches: 60, functions: 70, lines: 70 },
};
