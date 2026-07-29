import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasProtectedLocalSeedData } from "./d1-seed-guard.mjs";

const require = createRequire(import.meta.url);

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerEntry = require.resolve("wrangler/bin/wrangler.js");
const fixtureFile = resolve(rootDir, "scripts", "fixtures", "local-d1-seed.sql");
const force = process.argv.includes("--force");

const runWrangler = (args, options = {}) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [wranglerEntry, ...args], {
      cwd: rootDir,
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

const guardResult = await runWrangler(
  [
    "d1",
    "execute",
    "otw-db",
    "--local",
    "--json",
    "--command",
    `
      SELECT
        (SELECT COUNT(*) FROM members) AS member_count,
        (SELECT COUNT(*) FROM members WHERE code LIKE 'local_%') AS fixture_member_count,
        (
          (SELECT COUNT(*) FROM members) +
          (SELECT COUNT(*) FROM member_links) +
          (SELECT COUNT(*) FROM member_profile_images) +
          (SELECT COUNT(*) FROM naver_cafe_sources) +
          (SELECT COUNT(*) FROM kirinuki_channels) +
          (SELECT COUNT(*) FROM schedules) +
          (SELECT COUNT(*) FROM pending_schedules) +
          (SELECT COUNT(*) FROM update_logs) +
          (SELECT COUNT(*) FROM notices) +
          (SELECT COUNT(*) FROM ddays) +
          (SELECT COUNT(*) FROM settings)
        ) AS destructive_row_count;
    `,
  ],
  { capture: true },
);

if (guardResult.exitCode !== 0) {
  process.stderr.write(guardResult.stderr || guardResult.stdout);
  console.error(
    "\n[d1:seed:local] 로컬 D1 상태를 확인하지 못했습니다. 먼저 pnpm drizzle:migrate:local을 실행하세요.",
  );
  process.exit(guardResult.exitCode);
}

const guardPayload = JSON.parse(guardResult.stdout);
const guardRow = guardPayload[0]?.results?.[0];

if (!guardRow) {
  console.error("[d1:seed:local] 로컬 D1 보호 상태를 읽지 못했습니다.");
  process.exit(1);
}

const memberCount = Number(guardRow.member_count ?? 0);
const fixtureMemberCount = Number(guardRow.fixture_member_count ?? 0);
const destructiveRowCount = Number(guardRow.destructive_row_count ?? 0);
const hasProtectedData = hasProtectedLocalSeedData(guardRow);

if (hasProtectedData && !force) {
  console.error(
    [
      "[d1:seed:local] 기존 로컬 데이터를 보호하기 위해 fixture seed를 중단했습니다.",
      `- 전체 멤버: ${memberCount}명`,
      `- local_* fixture 멤버: ${fixtureMemberCount}명`,
      `- seed 삭제 대상 데이터: ${destructiveRowCount}건`,
      "",
      "비강제 seed는 빈 DB에서만 실행됩니다. 먼저 pnpm d1:reset:local을 실행하세요.",
      "현재 데이터를 의도적으로 덮어쓰려면 pnpm d1:seed:local -- --force를 사용하세요.",
    ].join("\n"),
  );
  process.exit(2);
}

if (force && hasProtectedData) {
  console.warn(
    "[d1:seed:local] --force가 지정되어 기존 로컬 데이터를 fixture로 교체합니다.",
  );
}

const seedResult = await runWrangler([
  "d1",
  "execute",
  "otw-db",
  "--local",
  "--yes",
  "--file",
  fixtureFile,
]);

process.exit(seedResult.exitCode);
