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
    name: "unit",
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "worker/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    exclude: ["worker/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
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
