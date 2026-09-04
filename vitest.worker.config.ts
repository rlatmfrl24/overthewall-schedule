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
  "0057_numerous_luminals.sql",
  "0058_awesome_lorna_dane.sql",
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
  "0064_loud_black_tom.sql",
  "0070_otw-play-performance-tags.sql",
] as const;
const OTW_PLAY_RELEASE_TEST_MIGRATION_NAMES = [
  ...OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.slice(0, 4),
  "0038_misty_speed_demon.sql",
  ...OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.slice(4),
] as const;
const OTW_PLAY_SOURCE_HEALTH_MIGRATION_NAME = "0056_moaning_killmonger.sql";
const OTW_PLAY_INGESTION_MIGRATION_NAMES = [
  "0057_numerous_luminals.sql",
  "0058_awesome_lorna_dane.sql",
  "0059_demonic_luke_cage.sql",
  "0060_ancient_cardiac.sql",
] as const;
const OTW_PLAY_INGESTION_TEST_MIGRATION_NAMES = [
  ...OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.filter(
    (name) =>
      name !== "0064_loud_black_tom.sql" &&
      name !== "0070_otw-play-performance-tags.sql",
  ),
  "0059_demonic_luke_cage.sql",
  "0060_ancient_cardiac.sql",
  "0061_otw-play-member-entity-backfill.sql",
  "0062_colorful_magma.sql",
  "0063_youthful_jamie_braddock.sql",
  "0064_loud_black_tom.sql",
  "0065_otw_play_authority_retention.sql",
  "0066_otw_play_integrity_drift.sql",
  "0070_otw-play-performance-tags.sql",
] as const;
const OTW_PLAY_EXTERNAL_IDENTITY_CONSOLIDATION_MIGRATION_NAME =
  "0067_otw-play-external-identity-consolidation.sql";
const OTW_PLAY_HARDENING_MIGRATION_NAMES = [
  "0065_otw_play_authority_retention.sql",
  "0066_otw_play_integrity_drift.sql",
] as const;
const OTW_PLAY_PERFORMANCE_TAGS_MIGRATION_NAME =
  "0070_otw-play-performance-tags.sql";
const SCHEDULED_OPERATIONS_MIGRATION_NAME = "0068_fixed_amazoness.sql";
const SCHEDULED_OPERATIONS_PARTIAL_MIGRATION_NAME = "0071_gifted_romulus.sql";

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
      const otwPlayIngestionMigrations =
        OTW_PLAY_INGESTION_TEST_MIGRATION_NAMES.flatMap((name) => {
          const migration = migrationsByName.get(name);
          return migration ? [migration] : [];
        });
      const otwPlayPreHardeningMigrations = otwPlayIngestionMigrations.filter(
        ({ name }) =>
          !OTW_PLAY_HARDENING_MIGRATION_NAMES.includes(
            name as (typeof OTW_PLAY_HARDENING_MIGRATION_NAMES)[number],
          ) && name !== OTW_PLAY_PERFORMANCE_TAGS_MIGRATION_NAME,
      );
      const otwPlayHardeningMigrations =
        OTW_PLAY_HARDENING_MIGRATION_NAMES.flatMap((name) => {
          const migration = migrationsByName.get(name);
          return migration ? [migration] : [];
        });
      const otwPlayPreSourceHealthMigrations =
        OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES
          .filter(
            (name) =>
              name !== OTW_PLAY_SOURCE_HEALTH_MIGRATION_NAME &&
              name !== "0064_loud_black_tom.sql" &&
              !OTW_PLAY_INGESTION_MIGRATION_NAMES.includes(
                name as (typeof OTW_PLAY_INGESTION_MIGRATION_NAMES)[number],
              ),
          )
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
      const otwPlayExternalIdentityConsolidationMigration = migrationsByName.get(
        OTW_PLAY_EXTERNAL_IDENTITY_CONSOLIDATION_MIGRATION_NAME,
      );
      const scheduledOperationsMigration = migrationsByName.get(
        SCHEDULED_OPERATIONS_MIGRATION_NAME,
      );
      const scheduledOperationsPartialSource = migrationsByName.get(
        SCHEDULED_OPERATIONS_PARTIAL_MIGRATION_NAME,
      );
      const scheduledOperationsPartialStart =
        scheduledOperationsPartialSource?.queries.findIndex((query) =>
          query.includes("PRAGMA foreign_keys=OFF")
        ) ?? -1;
      const scheduledOperationsPartialEnd =
        scheduledOperationsPartialSource?.queries.findIndex((query) =>
          query.includes("idx_scheduled_job_items_lease")
        ) ?? -1;
      const scheduledOperationsPartialMigration =
        scheduledOperationsPartialSource &&
          scheduledOperationsPartialStart >= 0 &&
          scheduledOperationsPartialEnd >= scheduledOperationsPartialStart
          ? {
              name: `${SCHEDULED_OPERATIONS_PARTIAL_MIGRATION_NAME}:scheduled-job-items`,
              queries: scheduledOperationsPartialSource.queries.slice(
                scheduledOperationsPartialStart,
                scheduledOperationsPartialEnd + 1,
              ),
            }
          : null;

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
      if (!otwPlayExternalIdentityConsolidationMigration) {
        throw new Error(
          `Expected OTW Play external identity consolidation migration: ${OTW_PLAY_EXTERNAL_IDENTITY_CONSOLIDATION_MIGRATION_NAME}`,
        );
      }
      if (!scheduledOperationsMigration) {
        throw new Error(
          `Expected scheduled operations migration: ${SCHEDULED_OPERATIONS_MIGRATION_NAME}`,
        );
      }
      if (!scheduledOperationsPartialMigration) {
        throw new Error(
          `Expected scheduled operations partial migration: ${SCHEDULED_OPERATIONS_PARTIAL_MIGRATION_NAME}`,
        );
      }

      return {
        miniflare: {
          compatibilityDate: "2025-11-25",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["otw_db"],
          bindings: {
            X_REFERENCE_MIGRATIONS: migrations.filter(({ name }) =>
              /^(0000_|0011_|0023_|0025_|0026_|0068_|0071_|0072_|0075_|0077_|0078_|0079_|0083_)/.test(name)
            ).map(migration => /^(0071_|0072_)/.test(migration.name)
              ? { ...migration, queries: migration.queries.filter(query => /^\s*ALTER TABLE `x_/.test(query)) }
              : migration),
            OTW_PLAY_CATALOG_MIGRATIONS: otwPlayCatalogMigrations,
            OTW_PLAY_PROPOSAL_SEARCH_MIGRATIONS:
              otwPlayProposalSearchMigrations,
            OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS:
              otwPlayPublicCatalogMigrations,
            OTW_PLAY_INGESTION_MIGRATIONS: otwPlayIngestionMigrations,
            OTW_PLAY_PRE_HARDENING_MIGRATIONS: otwPlayPreHardeningMigrations,
            OTW_PLAY_HARDENING_MIGRATIONS: otwPlayHardeningMigrations,
            OTW_PLAY_PRE_SOURCE_HEALTH_MIGRATIONS:
              otwPlayPreSourceHealthMigrations,
            OTW_PLAY_SOURCE_HEALTH_MIGRATIONS:
              otwPlaySourceHealthMigration ? [otwPlaySourceHealthMigration] : [],
            OTW_PLAY_RELEASE_MIGRATIONS: otwPlayReleaseMigrations,
            OTW_PLAY_EXTERNAL_IDENTITY_CONSOLIDATION_MIGRATIONS: [
              otwPlayExternalIdentityConsolidationMigration,
            ],
            SCHEDULED_OPERATIONS_MIGRATIONS: [
              scheduledOperationsMigration,
              scheduledOperationsPartialMigration,
            ],
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
