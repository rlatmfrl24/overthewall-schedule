import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

const OTW_PLAY_CATALOG_MIGRATION_PREFIX = "0046_";

export default defineConfig({
  resolve: {
    alias: {
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
    },
  },
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(
        path.resolve(__dirname, "./drizzle"),
      );
      const otwPlayCatalogMigrations = migrations.filter(({ name }) =>
        name.startsWith(OTW_PLAY_CATALOG_MIGRATION_PREFIX),
      );

      if (otwPlayCatalogMigrations.length !== 1) {
        throw new Error(
          `Expected exactly one ${OTW_PLAY_CATALOG_MIGRATION_PREFIX}*.sql migration, found ${otwPlayCatalogMigrations.length}`,
        );
      }

      return {
        miniflare: {
          compatibilityDate: "2025-11-25",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["otw_db"],
          bindings: {
            OTW_PLAY_CATALOG_MIGRATIONS: otwPlayCatalogMigrations,
          },
        },
      };
    }),
  ],
  test: {
    include: ["worker/**/*.integration.test.ts"],
  },
});
