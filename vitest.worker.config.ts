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
const OTW_PLAY_PUBLIC_CATALOG_MIGRATION_NAMES = [
  "0046_tan_nova.sql",
  ...OTW_PLAY_PROPOSAL_SEARCH_MIGRATION_NAMES,
  "0050_parched_marvel_apes.sql",
  "0051_clear_mantis.sql",
  "0052_otw-play-public-read-model-backfill.sql",
  "0053_red_talon.sql",
  "0054_odd_storm.sql",
  "0055_tiresome_pride.sql",
  "0056_moaning_killmonger.sql",
] as const;
const OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES = [
  // Actual minimal prerequisite: 0046 adds an FK to members(uid).
  "0000_flaky_spyke.sql",
  "0009_condemned_maximus.sql",
  // Actual authority table for the migration-owned daily submission limit.
  "0011_cold_maximus.sql",
  // Actual authority table used to recognize enabled member YouTube links.
  "0027_heavy_cassandra_nova.sql",
  ...OTW_PLAY_PUBLIC_CATALOG_MIGRATION_NAMES,
] as const;
const OTW_PLAY_RELEASE_TEST_MIGRATION_NAMES = [
  ...OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.slice(0, 4),
  "0038_misty_speed_demon.sql",
  ...OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.slice(4),
] as const;
const OTW_PLAY_SOURCE_HEALTH_MIGRATION_NAME = "0056_moaning_killmonger.sql";

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
      const otwPlayPublicCatalogMigrations =
        OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.flatMap((name) => {
          const migration = migrationsByName.get(name);
          return migration ? [migration] : [];
        });
      const otwPlayPreSourceHealthMigrations =
        OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES
          .filter((name) => name !== OTW_PLAY_SOURCE_HEALTH_MIGRATION_NAME)
          .flatMap((name) => {
            const migration = migrationsByName.get(name);
            return migration ? [migration] : [];
          });
      const otwPlayReleaseMigrations =
        OTW_PLAY_RELEASE_TEST_MIGRATION_NAMES.flatMap((name) => {
          const migration = migrationsByName.get(name);
          return migration ? [migration] : [];
        });
      const otwPlaySourceHealthMigration = migrationsByName.get(
        OTW_PLAY_SOURCE_HEALTH_MIGRATION_NAME,
      );

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
      if (
        otwPlayReleaseMigrations.length !==
          OTW_PLAY_RELEASE_TEST_MIGRATION_NAMES.length ||
        otwPlayReleaseMigrations.some(
          ({ name }, index) =>
            name !== OTW_PLAY_RELEASE_TEST_MIGRATION_NAMES[index],
        )
      ) {
        throw new Error(
          `Expected exact ordered OTW Play release test migrations: ${OTW_PLAY_RELEASE_TEST_MIGRATION_NAMES.join(", ")}`,
        );
      }
      if (
        otwPlayPublicCatalogMigrations.length !==
          OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.length ||
        otwPlayPublicCatalogMigrations.some(
          ({ name }, index) =>
            name !== OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES[index],
        )
      ) {
        throw new Error(
          `Expected exact ordered OTW Play public catalog test migrations: ${OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.join(", ")}`,
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
            OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS:
              otwPlayPublicCatalogMigrations,
            OTW_PLAY_PRE_SOURCE_HEALTH_MIGRATIONS:
              otwPlayPreSourceHealthMigrations,
            OTW_PLAY_SOURCE_HEALTH_MIGRATIONS:
              otwPlaySourceHealthMigration ? [otwPlaySourceHealthMigration] : [],
            OTW_PLAY_RELEASE_MIGRATIONS: otwPlayReleaseMigrations,
          },
        },
      };
    }),
  ],
  test: {
    name: "worker-integration",
    include: ["worker/**/*.integration.test.ts"],
  },
});
