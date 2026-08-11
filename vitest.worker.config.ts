import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

const OTW_PLAY_CATALOG_MIGRATION_PREFIX = "0046_";
const OTW_PLAY_PROPOSAL_SEARCH_MIGRATION_NAMES = [
  "0047_nasty_cargill.sql",
  "0048_previous_the_phantom.sql",
  "0049_otw_play_catalog_meta_seed.sql",
] as const;

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
      const migrationsByName = new Map(
        migrations.map((migration) => [migration.name, migration]),
      );
      const otwPlayProposalSearchMigrations =
        OTW_PLAY_PROPOSAL_SEARCH_MIGRATION_NAMES.flatMap((name) => {
          const migration = migrationsByName.get(name);
          return migration ? [migration] : [];
        });

      if (otwPlayCatalogMigrations.length !== 1) {
        throw new Error(
          `Expected exactly one ${OTW_PLAY_CATALOG_MIGRATION_PREFIX}*.sql migration, found ${otwPlayCatalogMigrations.length}`,
        );
      }
      if (
        otwPlayProposalSearchMigrations.length !==
          OTW_PLAY_PROPOSAL_SEARCH_MIGRATION_NAMES.length ||
        otwPlayProposalSearchMigrations.some(
          ({ name }, index) =>
            name !== OTW_PLAY_PROPOSAL_SEARCH_MIGRATION_NAMES[index],
        )
      ) {
        throw new Error(
          `Expected exact ordered OTW Play proposal/search migrations: ${OTW_PLAY_PROPOSAL_SEARCH_MIGRATION_NAMES.join(", ")}`,
        );
      }

      return {
        miniflare: {
          compatibilityDate: "2025-11-25",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["otw_db"],
          bindings: {
            OTW_PLAY_CATALOG_MIGRATIONS: otwPlayCatalogMigrations,
            OTW_PLAY_PROPOSAL_SEARCH_MIGRATIONS:
              otwPlayProposalSearchMigrations,
          },
        },
      };
    }),
  ],
  test: {
    include: ["worker/**/*.integration.test.ts"],
  },
});
