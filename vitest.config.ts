import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "extensions/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
        "src/features/**/*.ts",
        "extensions/*/src/**/*.ts",
      ],
      exclude: ["src/routeTree.gen.ts", "src/vite-env.d.ts"],
    },
  },
});
