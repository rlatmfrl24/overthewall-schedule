import { spawn } from "node:child_process";
import {
  access,
  copyFile,
  cp,
  mkdtemp,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldBlockDestructiveLocalReset } from "./d1-reset-guard.mjs";

const require = createRequire(import.meta.url);

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerEntry = require.resolve("wrangler/bin/wrangler.js");
const wranglerStateDir = resolve(rootDir, ".wrangler", "state");
const drizzleDir = resolve(rootDir, "drizzle");
const localD1Dir = resolve(wranglerStateDir, "v3", "d1");
const legacyLocalD1Dir = resolve(
  wranglerStateDir,
  "v3",
  "miniflare-D1DatabaseObject",
);
const bootstrapMigrationName = "0030_tiresome_boomerang.sql";
const bootstrapMemberCodes = [
  "kurenai_natsuki",
  "terri_nunna",
  "bing_hayu",
  "yang_mei",
  "u_lili",
  "on_haru",
  "hane",
  "kim_ate",
];

const usage = [
  "Usage: pnpm d1:reset:local [-- --validate-only | --force]",
  "",
  "Options:",
  "  --validate-only  임시 D1에서 전체 migration만 검증하고 로컬 DB는 교체하지 않습니다.",
  "  --force          기존 로컬 D1이 있어도 검증된 빈 DB로 교체합니다.",
  "  --help           이 도움말을 표시합니다.",
].join("\n");

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
  process.exit(0);
}
const unknownArgs = args.filter(
  (arg) => arg !== "--validate-only" && arg !== "--force",
);
if (unknownArgs.length > 0) {
  console.error(
    `[d1:reset:local] 알 수 없는 인자입니다: ${unknownArgs.join(", ")}`,
  );
  console.error(usage);
  process.exit(2);
}
const validateOnly = args.includes("--validate-only");
const force = args.includes("--force");

const ensureInsideStateDir = (target) => {
  const relative = target.slice(wranglerStateDir.length);
  if (
    target === wranglerStateDir ||
    !target.startsWith(wranglerStateDir) ||
    (!relative.startsWith("\\") && !relative.startsWith("/"))
  ) {
    throw new Error(`Refusing to modify path outside .wrangler/state: ${target}`);
  }
};

const pathExists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const hasCurrentDatabase =
  (await pathExists(localD1Dir)) || (await pathExists(legacyLocalD1Dir));
if (
  shouldBlockDestructiveLocalReset({
    validateOnly,
    force,
    hasCurrentDatabase,
  })
) {
  console.error(
    [
      "[d1:reset:local] 기존 로컬 D1을 보호하기 위해 reset을 중단했습니다.",
      "현재 DB를 보존한 채 migration 체인만 확인하려면 --validate-only를 사용하세요.",
      "현재 DB를 의도적으로 폐기하려면 --force를 명시하세요.",
    ].join("\n"),
  );
  process.exit(2);
}

if (!validateOnly && force && hasCurrentDatabase) {
  console.warn(
    "[d1:reset:local] --force가 지정되어 기존 로컬 D1을 검증된 빈 DB로 교체합니다.",
  );
}

const runWrangler = (args, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [wranglerEntry, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        DOTENV_CONFIG_QUIET: "true",
      },
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";

    if (options.capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", rejectRun);
    child.on("close", (exitCode) => {
      resolveRun({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });

const assertSuccess = (result, label) => {
  if (result.exitCode === 0) return;
  if (result.stderr || result.stdout) {
    process.stderr.write(result.stderr || result.stdout);
  }
  throw new Error(`${label} 실패 (exit ${result.exitCode})`);
};

const buildConfig = (migrationsDir) =>
  JSON.stringify(
    {
      name: "otw-d1-local-reset",
      compatibility_date: "2025-11-25",
      d1_databases: [
        {
          binding: "otw_db",
          database_name: "otw-db",
          database_id: "133b980d-1701-427e-93fd-8c9dcca1132e",
          migrations_dir: migrationsDir,
        },
      ],
    },
    null,
    2,
  );

const escapeSql = (value) => value.replaceAll("'", "''");

const createBootstrapSql = () => {
  const rows = bootstrapMemberCodes
    .map(
      (code, index) =>
        `  (${-10_000 - index}, '${escapeSql(code)}', '[migration bootstrap] ${escapeSql(code)}', 1)`,
    )
    .join(",\n");
  return [
    "INSERT INTO members (uid, code, name, is_deprecated) VALUES",
    `${rows};`,
    "",
  ].join("\n");
};

const createBootstrapCleanupSql = () => {
  const codes = bootstrapMemberCodes
    .map((code) => `'${escapeSql(code)}'`)
    .join(", ");
  return [
    `DELETE FROM member_links WHERE member_uid IN (SELECT uid FROM members WHERE code IN (${codes}));`,
    `DELETE FROM members WHERE code IN (${codes});`,
    "",
  ].join("\n");
};

const getJsonRows = (stdout) => {
  const payload = JSON.parse(stdout);
  return payload[0]?.results ?? [];
};

const applyMigrations = async (configPath, persistDir) => {
  const result = await runWrangler(
    [
      "d1",
      "migrations",
      "apply",
      "otw-db",
      "--config",
      configPath,
      "--local",
      "--persist-to",
      persistDir,
    ],
    { capture: true },
  );
  assertSuccess(result, "migration 적용");
};

const executeFile = async (configPath, persistDir, filePath) => {
  const result = await runWrangler(
    [
      "d1",
      "execute",
      "otw-db",
      "--config",
      configPath,
      "--local",
      "--persist-to",
      persistDir,
      "--yes",
      "--file",
      filePath,
    ],
    { capture: true },
  );
  assertSuccess(result, `${filePath} 실행`);
};

const verifyResetDatabase = async (
  configPath,
  persistDir,
  migrationNames,
) => {
  const statusResult = await runWrangler(
    [
      "d1",
      "execute",
      "otw-db",
      "--config",
      configPath,
      "--local",
      "--persist-to",
      persistDir,
      "--json",
      "--command",
      `
        SELECT
          (SELECT COUNT(*) FROM d1_migrations) AS migration_count,
          (SELECT COUNT(*) FROM members) AS member_count,
          (SELECT COUNT(*) FROM member_links) AS member_link_count,
          (
            SELECT GROUP_CONCAT(name, '|')
            FROM (SELECT name FROM d1_migrations ORDER BY name)
          ) AS migration_names;
      `,
    ],
    { capture: true },
  );
  assertSuccess(statusResult, "migration 상태 검증");

  const status = getJsonRows(statusResult.stdout)[0];
  const appliedNames =
    typeof status?.migration_names === "string"
      ? status.migration_names.split("|")
      : [];
  if (
    Number(status?.migration_count) !== migrationNames.length ||
    JSON.stringify(appliedNames) !== JSON.stringify(migrationNames)
  ) {
    throw new Error(
      `[d1:reset:local] 실제 적용된 migration이 파일 목록과 일치하지 않습니다. expected=${migrationNames.length}, actual=${status?.migration_count ?? 0}`,
    );
  }
  if (
    Number(status?.member_count) !== 0 ||
    Number(status?.member_link_count) !== 0
  ) {
    throw new Error(
      "[d1:reset:local] migration bootstrap 데이터가 정리되지 않았습니다.",
    );
  }

  const foreignKeyResult = await runWrangler(
    [
      "d1",
      "execute",
      "otw-db",
      "--config",
      configPath,
      "--local",
      "--persist-to",
      persistDir,
      "--json",
      "--command",
      "PRAGMA foreign_key_check;",
    ],
    { capture: true },
  );
  assertSuccess(foreignKeyResult, "foreign key 검증");
  if (getJsonRows(foreignKeyResult.stdout).length > 0) {
    throw new Error("[d1:reset:local] foreign key 위반이 발견되었습니다.");
  }
};

const promoteResetDatabase = async (sourceD1Dir) => {
  const stateV3Dir = resolve(wranglerStateDir, "v3");
  const readyDir = resolve(stateV3Dir, `d1-reset-ready-${process.pid}`);
  const backupDir = resolve(stateV3Dir, `d1-reset-backup-${process.pid}`);
  for (const target of [
    localD1Dir,
    legacyLocalD1Dir,
    readyDir,
    backupDir,
  ]) {
    ensureInsideStateDir(target);
  }

  await mkdir(stateV3Dir, { recursive: true });
  await rm(readyDir, { recursive: true, force: true });
  await rm(backupDir, { recursive: true, force: true });
  await cp(sourceD1Dir, readyDir, { recursive: true });

  const hadCurrentDatabase = await pathExists(localD1Dir);
  try {
    if (hadCurrentDatabase) {
      await rename(localD1Dir, backupDir);
    }
    await rename(readyDir, localD1Dir);
  } catch (error) {
    if (
      hadCurrentDatabase &&
      !(await pathExists(localD1Dir)) &&
      (await pathExists(backupDir))
    ) {
      await rename(backupDir, localD1Dir);
    }
    throw error;
  } finally {
    await rm(readyDir, { recursive: true, force: true });
  }

  for (const staleDir of [legacyLocalD1Dir, backupDir]) {
    try {
      await rm(staleDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(
        `[d1:reset:local] 검증 DB 교체는 완료했지만 이전 상태 정리에 실패했습니다: ${staleDir}`,
        error,
      );
    }
  }
};

const tempDir = await mkdtemp(join(tmpdir(), "otw-d1-reset-"));
try {
  const stagedMigrationsDir = resolve(tempDir, "migrations");
  const tempPersistDir = resolve(tempDir, "state");
  const configPath = resolve(tempDir, "wrangler.reset.json");
  const bootstrapSqlPath = resolve(tempDir, "bootstrap-members.sql");
  const cleanupSqlPath = resolve(tempDir, "cleanup-bootstrap-members.sql");
  await mkdir(stagedMigrationsDir, { recursive: true });
  await writeFile(configPath, buildConfig(stagedMigrationsDir), "utf8");

  const migrationNames = (await readdir(drizzleDir))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right));
  const bootstrapIndex = migrationNames.indexOf(bootstrapMigrationName);
  if (bootstrapIndex <= 0) {
    throw new Error(
      `[d1:reset:local] bootstrap 기준 migration을 찾지 못했습니다: ${bootstrapMigrationName}`,
    );
  }

  for (const name of migrationNames.slice(0, bootstrapIndex)) {
    await copyFile(
      resolve(drizzleDir, name),
      resolve(stagedMigrationsDir, name),
    );
  }
  await applyMigrations(configPath, tempPersistDir);

  await writeFile(bootstrapSqlPath, createBootstrapSql(), "utf8");
  await executeFile(configPath, tempPersistDir, bootstrapSqlPath);

  for (const name of migrationNames.slice(bootstrapIndex)) {
    await copyFile(
      resolve(drizzleDir, name),
      resolve(stagedMigrationsDir, name),
    );
  }
  await applyMigrations(configPath, tempPersistDir);

  await writeFile(cleanupSqlPath, createBootstrapCleanupSql(), "utf8");
  await executeFile(configPath, tempPersistDir, cleanupSqlPath);
  await verifyResetDatabase(configPath, tempPersistDir, migrationNames);

  if (validateOnly) {
    console.log(
      `[d1:reset:local] 임시 D1에서 migration ${migrationNames.length}건을 실제 적용하고 검증했습니다. 현재 로컬 D1은 변경하지 않았습니다.`,
    );
  } else {
    const sourceD1Dir = resolve(tempPersistDir, "v3", "d1");
    if (!(await pathExists(sourceD1Dir))) {
      throw new Error(
        `[d1:reset:local] 검증된 임시 D1 경로를 찾지 못했습니다: ${sourceD1Dir}`,
      );
    }
    await promoteResetDatabase(sourceD1Dir);
    console.log(
      `[d1:reset:local] migration ${migrationNames.length}건을 실제 적용한 검증 DB로 로컬 D1을 초기화했습니다.`,
    );
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
