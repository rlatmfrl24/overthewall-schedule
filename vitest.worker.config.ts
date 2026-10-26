import { readFileSync } from "node:fs";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import {createRequire} from "node:module";
import { gzipSync } from "node:zlib";
import { defineConfig } from "vitest/config";
import { testAliases, testMaxWorkers } from "./vitest.shared";

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
  "0059_demonic_luke_cage.sql",
  "0060_ancient_cardiac.sql",
  "0061_otw-play-member-entity-backfill.sql",
  "0062_colorful_magma.sql",
  "0063_youthful_jamie_braddock.sql",
  "0064_loud_black_tom.sql",
  "0065_otw_play_authority_retention.sql",
  "0066_otw_play_integrity_drift.sql",
  "0070_otw-play-performance-tags.sql",
  "0089_ambitious_titania.sql",
  "0090_demonic_sugar_man.sql",
  "0091_tranquil_luke_cage.sql",
  "0093_omniscient_sunset_bain.sql",
  "0094_reflective_spirit.sql",
  "0097_fine_agent_zero.sql",
  "0102_content_transition_foundation.sql",
] as const;
const OTW_PLAY_RELEASE_TEST_MIGRATION_NAMES = [
  ...OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.slice(0, 4),
  "0038_misty_speed_demon.sql",
  ...OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES.slice(4),
] as const;
const OTW_PLAY_SOURCE_HEALTH_MIGRATION_NAME = "0056_moaning_killmonger.sql";
const OTW_PLAY_INGESTION_TEST_MIGRATION_NAMES = [...OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES, "0098_late_beast.sql", "0099_acoustic_rachel_grey.sql", "0100_far_shotgun.sql", "0101_playlist_work_progress_backfill.sql"];
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
let schemaMigrations: ReturnType<typeof readD1Migrations> | undefined;
const schemaTests = [
  "worker/features/scheduled-operations/infrastructure/collector-sql-cadence.integration.test.ts",
  "worker/features/scheduled-operations/infrastructure/scheduled-auto-update.integration.test.ts",
  "worker/app/admin-catalog-replay.integration.test.ts",
  "worker/app/work-queue-flow.integration.test.ts",
  "worker/features/operations/infrastructure/read-efficiency.integration.test.ts",
  "worker/app/schedule-member-policy.integration.test.ts",
  "worker/app/archive-access.integration.test.ts",
  "worker/app/publication-schema-upgrade.integration.test.ts",
  "worker/features/assets/infrastructure/file-projection.integration.test.ts",
  "worker/features/assets/infrastructure/file-recovery.integration.test.ts",
  "worker/features/operations/infrastructure/retained-content.integration.test.ts",
];
const workflowTest = "worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts";

export const workerTestConfig = (mode: "feature" | "schema" | "workflow" = "feature") => {
const nativeWorkflow = mode === "workflow";
return defineConfig({
  resolve: { alias: testAliases },
  plugins: [
    cloudflareTest(async () => {
      const dependencyRequire=createRequire(createRequire(import.meta.url).resolve("wrangler/package.json"));
      const migrations = await (schemaMigrations ??= readD1Migrations(path.resolve(__dirname, "./drizzle")));
      // Compile the actual Worker locally with the installed library, never a
      // deploy/upload CLI. The native Workflow shares only task-owned D1 fixtures.
      const workerScript=nativeWorkflow ? dependencyRequire("esbuild").buildSync({entryPoints:[path.resolve(__dirname,"worker/index.ts")],bundle:true,write:false,format:"esm",platform:"browser",external:["cloudflare:*","node:*"],tsconfig:path.resolve(__dirname,"tsconfig.worker.json")}).outputFiles[0].text : "";
      const nativeWorkflowWorker = {
        name:"scheduled-test-worker",modules:true,script:workerScript,compatibilityDate:"2025-11-25",compatibilityFlags:["nodejs_compat"],
        d1Databases:{otw_db:"otw_db"},bindings:{CLOUDFLARE_ACCOUNT_ID:"native-test",CLOUDFLARE_D1_TOKEN:"native-test",SITE_ID:"otw",SITE_D1_DATABASE_NAME:"otw-db",SITE_ASSET_BUCKET_NAME:"otw-schedule",SITE_PUBLIC_ORIGIN:"https://otw-schedule.info",...Object.fromEntries(["control","critical","background"].map(lane=>[`SITE_${lane.toUpperCase()}_QUEUE_NAME`,`otw-ops-${lane}`])),SITE_INGESTION_QUEUE_NAME:"otw-play-ingestion",SITE_AI_REVIEW_QUEUE_NAME:"otw-play-ai-review",SITE_DEAD_LETTER_QUEUE_NAME:"otw-dead-letter",PLAY_ANALYTICS_DATASET:"otw_play_events"},
        workflows:{SCHEDULED_OPERATIONS_WORKFLOW:{name:"scheduled-native-test",className:"ScheduledOperationsWorkflow"}},
        queueProducers:{OTW_OPS_BACKGROUND_QUEUE:"otw-ops-background"},queueConsumers:{"otw-ops-background":{maxBatchSize:1,maxBatchTimeout:0,maxRetries:0}},outboundService:"native-workflow-provider",
      };
      Object.assign(nativeWorkflowWorker.bindings, { X_BEARER_TOKEN: "native-fixture", YOUTUBE_API_KEY: "native-fixture" });
      // Small feature fixtures consume the exact canonical access DDL for their tables.
      // Stable per-table migration names let combined fixtures deduplicate members.
      const accessMigrations = (tables: string[]) => [...tables.map(table => ({
        name: `0102_content_transition_foundation.sql:${table}`,
        queries: migrations.find(migration => migration.name === "0102_content_transition_foundation.sql")!.queries
          .filter(query => query.startsWith(`ALTER TABLE \`${table}\` ADD COLUMN \`content_access\``) ||
            (table === "content_transitions" && (query.startsWith("CREATE TABLE `content_transitions`") || query.startsWith("CREATE TABLE `content_transition_membership`")))),
      })), ...(tables.includes("content_transitions") ? migrations
        .filter(({ name }) => /^(0133_|0134_)/.test(name))
        .map(migration => ({
          name: `${migration.name}:control`,
          queries: migration.queries.filter(query => /^\s*ALTER TABLE `content_transition(?:s|_membership)` ADD /.test(query)),
        })) : [])];
      const efficiencyIndexes = (prefix: string) => migrations.filter(migration => /^(0142_|0143_|0144_|0145_|0146_|0147_)/.test(migration.name)).map(migration => ({
        name: `${migration.name}:${prefix}`,
        queries: migration.queries.filter(query => query.includes(`ON \`${prefix}`)),
      })).filter(migration => migration.queries.length > 0);
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
          return migration ? [migration.name === "0102_content_transition_foundation.sql" ? {
            ...migration,
            queries: [
              ...migrationsByName.get("0071_gifted_romulus.sql")!.queries.filter(query => /^\s*CREATE (?:TABLE|(?:UNIQUE )?INDEX) `(?:youtube_feed_|u?idx_youtube_feed_)/.test(query)),
              ...migration.queries.filter(query => !/^\s*ALTER TABLE `(?!members`|music_|__new_music_|youtube_feed_videos`)/.test(query)),
            ],
          } : migration] : [];
        });
      const otwPlayIngestionMigrations =
        OTW_PLAY_INGESTION_TEST_MIGRATION_NAMES.flatMap((name) => {
          const migration = migrationsByName.get(name);
          return migration ? [migration.name === "0102_content_transition_foundation.sql" ? {
            ...migration,
            queries: [
              ...migrationsByName.get("0071_gifted_romulus.sql")!.queries.filter(query => /^\s*CREATE (?:TABLE|(?:UNIQUE )?INDEX) `(?:youtube_feed_|u?idx_youtube_feed_)/.test(query)),
              ...migration.queries.filter(query => !/^\s*ALTER TABLE `(?!members`|music_|__new_music_|youtube_feed_videos`)/.test(query)),
            ],
          } : migration] : [];
        });
      const otwPlayPreHardeningMigrations = otwPlayIngestionMigrations.filter(
        ({ name }) =>
          !OTW_PLAY_HARDENING_MIGRATION_NAMES.includes(
            name as (typeof OTW_PLAY_HARDENING_MIGRATION_NAMES)[number],
          ) && name !== OTW_PLAY_PERFORMANCE_TAGS_MIGRATION_NAME && name !== "0091_tranquil_luke_cage.sql" && name !== "0094_reflective_spirit.sql",
      );
      const otwPlayHardeningMigrations =
        OTW_PLAY_HARDENING_MIGRATION_NAMES.flatMap((name) => {
          const migration = migrationsByName.get(name);
          return migration ? [migration] : [];
        });
      const otwPlayPreSourceHealthMigrations =
        OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES
          // This suite verifies the 0056 backfill from its actual predecessor.
          // Later catalog migrations depend on ingestion tables absent here.
          .filter((name) => name < OTW_PLAY_SOURCE_HEALTH_MIGRATION_NAME)
          .flatMap((name) => {
            const migration = migrationsByName.get(name);
            return migration ? [migration] : [];
          });
      const otwPlayReleaseMigrations =
        OTW_PLAY_RELEASE_TEST_MIGRATION_NAMES.flatMap((name) => {
          const migration = otwPlayPublicCatalogMigrations.find(migration => migration.name === name) ?? migrationsByName.get(name);
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
          ...(nativeWorkflow ? {
            workers:[nativeWorkflowWorker,{name:"native-workflow-provider",modules:true,script:dependencyRequire("esbuild").buildSync({entryPoints:[path.resolve(__dirname,"worker/test-support/native-workflow-provider.ts")],bundle:true,write:false,format:"esm",platform:"browser"}).outputFiles[0].text,compatibilityDate:"2025-11-25"}],
            workflows:{NATIVE_SCHEDULED_WORKFLOW:{name:"scheduled-native-test",className:"ScheduledOperationsWorkflow",scriptName:"scheduled-test-worker"}},
            serviceBindings:{NATIVE_WORKFLOW_PROVIDER:"native-workflow-provider"},
          } : {}),
          compatibilityDate: "2025-11-25",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["otw_db", "transition_target_db"],
          r2Buckets: ["ASSET_BUCKET"],
          bindings: {
            MULTIVIEW_MIGRATIONS: migrations.filter(({ queries }) => queries.some(query => query.startsWith("CREATE TABLE `multiview_channels`"))),
            ...(mode !== "feature" ? { SITE_SCHEMA_MIGRATIONS_GZIP: gzipSync(JSON.stringify(migrations)).toString("base64") } : {}),
            CONTENT_TRANSITION_CONTROL_MIGRATIONS: accessMigrations(["content_transitions"]),
            SCHEDULE_DAY_MIGRATION_SQL: readFileSync(path.resolve(__dirname, "drizzle/0096_unknown_hex.sql"), "utf8"),
            OTW_PLAY_SEARCH_INTEGRITY_SQL: readFileSync(path.resolve(__dirname, "scripts/otw-play-search-integrity.sql"), "utf8"),
            OTW_PLAY_SEARCH_BACKFILL_MIGRATIONS: migrations.filter(({ name }) => name === "0095_otw-play-ready-search-backfill.sql"),
            MEMBER_POSTS_CAFE_MIGRATIONS: [...migrations.filter(({ name }) => /^(0024_|0036_|0039_)/.test(name))
              .map(migration => ({ ...migration, queries: migration.queries.filter(query => !/^\s*CREATE INDEX `idx_x_/.test(query)) })), ...accessMigrations(["naver_cafe_posts"])],
            OTW_PLAY_PLAYLIST_MIGRATIONS: migrations.filter(({ name }) => ["0038_misty_speed_demon.sql", "0087_burly_midnight.sql", "0088_friendly_photon.sql"].includes(name)),
            SETTINGS_MIGRATIONS: [...migrations.filter(({ name }) =>
              /^(0011_|0038_|0086_)/.test(name)
            ), ...accessMigrations(["content_transitions"])],
            YOUTUBE_QUOTA_MIGRATIONS: migrations.filter(({ name }) =>
              name === "0086_canonical-youtube-quota.sql"
            ),
            DDAY_SCHEMA_MIGRATIONS: [...migrations.filter(({ name }) =>
              /^(0004_|0005_)/.test(name)
            ), ...accessMigrations(["ddays", "content_transitions"])],
            YOUTUBE_FEED_MIGRATIONS: [...migrations.filter(({ name }) =>
              /^(0000_|0009_|0011_|0017_|0027_|0035_|0037_|0068_|0069_|0071_|0082_|0086_)/.test(name)
            ).map(migration => migration.name.startsWith("0071_")
              ? { ...migration, queries: migration.queries.filter(query =>
                  /^\s*CREATE (?:TABLE|(?:UNIQUE )?INDEX) `(?:youtube_feed_|u?idx_youtube_feed_)/.test(query)
                ) }
              : migration),
              // Publication ownership also reads the actual Play channel-credit schema.
              ...otwPlayCatalogMigrations,
              ...accessMigrations(["members", "youtube_feed_videos", "content_transitions"]), ...efficiencyIndexes("youtube_feed_"), ...efficiencyIndexes("scheduled_")],
            X_REFERENCE_MIGRATIONS: [...migrations.filter(({ name }) =>
              /^(0000_|0011_|0023_|0025_|0026_|0068_|0071_|0072_|0075_|0077_|0078_|0079_|0083_|0084_|0137_|0138_|0152_|0153_|0154_|0155_|0156_)/.test(name)
            ).map(migration => /^(0071_|0072_)/.test(migration.name)
              ? { ...migration, queries: migration.queries.filter(query => /^\s*ALTER TABLE `x_/.test(query)) }
              : migration), ...accessMigrations(["members", "x_posts", "x_post_facts"]), ...efficiencyIndexes("x_")],
            OTW_PLAY_CHANNEL_SEPARATION_MIGRATIONS: migrations.filter(({ name }) => name === "0017_short_satana.sql"),
            OTW_PLAY_CATALOG_MIGRATIONS: otwPlayCatalogMigrations,
            OTW_PLAY_PROPOSAL_SEARCH_MIGRATIONS:
              otwPlayProposalSearchMigrations,
            OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS:
              otwPlayPublicCatalogMigrations,
            OTW_PLAY_INGESTION_MIGRATIONS: [...otwPlayIngestionMigrations,
              ...accessMigrations(["content_transitions"]).filter(migration => migration.name.endsWith(":control"))],
            OTW_PLAY_AI_REVIEW_MIGRATIONS: [
              ...otwPlayIngestionMigrations,
              migrationsByName.get("0092_perfect_manta.sql")!,
              ...accessMigrations(["content_transitions"]).filter(migration => migration.name.endsWith(":control")),
            ],
            OTW_PLAY_POLLING_MIGRATIONS: migrations.filter(({ name }) =>
              name === "0085_retire_websub_hourly_polling.sql"
            ),
            OTW_PLAY_PRE_HARDENING_MIGRATIONS: otwPlayPreHardeningMigrations,
            OTW_PLAY_HARDENING_MIGRATIONS: otwPlayHardeningMigrations,
            OTW_PLAY_PRE_SOURCE_HEALTH_MIGRATIONS:
              otwPlayPreSourceHealthMigrations,
            OTW_PLAY_SOURCE_HEALTH_MIGRATIONS:
              otwPlaySourceHealthMigration ? [otwPlaySourceHealthMigration,...efficiencyIndexes("music_media_sources")] : [],
            OTW_PLAY_RELEASE_MIGRATIONS: otwPlayReleaseMigrations,
            OTW_PLAY_EXTERNAL_IDENTITY_CONSOLIDATION_MIGRATIONS: [
              otwPlayExternalIdentityConsolidationMigration,
            ],
            SCHEDULED_OPERATIONS_MIGRATIONS: [
              scheduledOperationsMigration,
              scheduledOperationsPartialMigration,
              {name:'0135_transition_scheduled_reconciliation.sql:outbox',queries:migrationsByName.get('0135_transition_scheduled_reconciliation.sql')!.queries.filter(query=>query.startsWith('ALTER TABLE `scheduled_outbox`'))},
              migrationsByName.get('0136_transition_unresolved_scheduled_outbox.sql')!,
              ...efficiencyIndexes('scheduled_'),
            ],
          },
        },
      };
    }),
  ],
  test: {
    name: mode === "schema" ? "worker-schema" : nativeWorkflow ? "worker-workflow" : "worker-integration",
    reporters: ["dot"],
    maxWorkers: testMaxWorkers,
    include: mode === "schema" ? schemaTests : nativeWorkflow ? [workflowTest] : ["worker/**/*.integration.test.ts"],
    exclude: mode === "feature" ? [...schemaTests, workflowTest] : [],
  },
});
};

export default workerTestConfig();
