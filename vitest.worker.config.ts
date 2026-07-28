import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
    },
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2025-11-25",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["otw_db"],
      },
    }),
  ],
  test: {
    include: ["worker/**/*.integration.test.ts"],
  },
});
