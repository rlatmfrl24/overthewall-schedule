import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wranglerEntry = require.resolve("wrangler/bin/wrangler.js");

const requiredColumns = {
  members: ["uid", "code", "name", "youtube_channel_id", "is_deprecated"],
  ddays: ["id", "title", "date", "type", "created_at"],
};

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(name);
const getArgValue = (name, fallback) => {
  const prefix = `${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

const baseUrl = getArgValue("--url", "http://127.0.0.1:5173").replace(
  /\/$/,
  "",
);
const skipApi = hasArg("--skip-api");
const skipLocal = hasArg("--skip-local");
const skipRemote = hasArg("--skip-remote");

if (hasArg("--help") || hasArg("-h")) {
  console.log(`Usage: node scripts/d1-doctor.mjs [options]

Options:
  --url=http://127.0.0.1:5173  API base URL to check
  --skip-api                   Skip API health checks
  --skip-local                 Skip local D1 checks
  --skip-remote                Skip remote D1 checks
`);
  process.exit(0);
}

const stripAnsi = (value) =>
  value.replace(
    /\x1b\[[0-?]*[ -/]*[@-~]/g,
    "",
  );

const run = async (command, commandArgs, options = {}) => {
  try {
    const result = await execFileAsync(command, commandArgs, {
      cwd: rootDir,
      timeout: options.timeout ?? 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      ok: true,
      stdout: stripAnsi(result.stdout ?? ""),
      stderr: stripAnsi(result.stderr ?? ""),
    };
  } catch (error) {
    return {
      ok: false,
      code: error.code,
      stdout: stripAnsi(error.stdout ?? ""),
      stderr: stripAnsi(error.stderr ?? error.message ?? ""),
    };
  }
};

const runWrangler = (commandArgs, options) =>
  run(process.execPath, [wranglerEntry, ...commandArgs], options);

const extractJsonArray = (text) => {
  for (let index = text.indexOf("["); index >= 0; index = text.indexOf("[", index + 1)) {
    const candidate = text.slice(index).trim();
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Continue scanning; wrangler prints human text before JSON.
    }
  }
  return null;
};

const printResult = (status, message) => {
  console.log(`[${status}] ${message}`);
};

const summarizeCommandFailure = (result) => {
  const output = `${result.stdout}\n${result.stderr}`.trim();
  return output.split(/\r?\n/).find(Boolean) ?? "command failed";
};

const checkApi = async (path) => {
  const url = `${baseUrl}${path}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        message: `${response.status} ${response.statusText}: ${text.slice(0, 180)}`,
      };
    }
    return { ok: true, message: `${response.status} ${response.statusText}` };
  } catch (error) {
    return { ok: false, message: error.message };
  }
};

const checkMigrations = async (scope) => {
  const result = await runWrangler([
    "d1",
    "migrations",
    "list",
    "otw-db",
    scope === "remote" ? "--remote" : "--local",
  ]);

  if (!result.ok) {
    return { ok: false, message: summarizeCommandFailure(result) };
  }

  const output = `${result.stdout}\n${result.stderr}`;
  return {
    ok: true,
    message: output.includes("No migrations to apply")
      ? "no pending migrations"
      : "review wrangler output for pending migrations",
  };
};

const readTableColumns = async (scope, tableName) => {
  const result = await runWrangler([
    "d1",
    "execute",
    "otw-db",
    scope === "remote" ? "--remote" : "--local",
    "--command",
    `PRAGMA table_info(${tableName});`,
  ]);

  if (!result.ok) {
    return { ok: false, message: summarizeCommandFailure(result) };
  }

  const parsed = extractJsonArray(`${result.stdout}\n${result.stderr}`);
  const rows = parsed?.[0]?.results;
  if (!Array.isArray(rows)) {
    return { ok: false, message: "could not parse wrangler JSON output" };
  }

  return { ok: true, columns: rows.map((row) => row.name).filter(Boolean) };
};

const checkSchema = async (scope) => {
  let failures = 0;

  for (const [tableName, columns] of Object.entries(requiredColumns)) {
    const result = await readTableColumns(scope, tableName);
    if (!result.ok) {
      const isLocked = /SQLITE_BUSY|database is locked/i.test(result.message);
      printResult(
        isLocked ? "warn" : "fail",
        `${scope} ${tableName}: ${result.message}`,
      );
      if (!isLocked) failures += 1;
      continue;
    }

    const missing = columns.filter((column) => !result.columns.includes(column));
    if (missing.length > 0) {
      printResult(
        "fail",
        `${scope} ${tableName}: missing columns ${missing.join(", ")}`,
      );
      failures += 1;
    } else {
      printResult(
        "ok",
        `${scope} ${tableName}: required columns present (${columns.join(", ")})`,
      );
    }
  }

  return failures;
};

const hasRemoteD1Binding = () => {
  const configPath = join(rootDir, "wrangler.jsonc");
  if (!existsSync(configPath)) return false;
  const config = readFileSync(configPath, "utf8");
  return /"d1_databases"\s*:\s*\[[\s\S]*"remote"\s*:\s*true/.test(config);
};

let failures = 0;

console.log("OTW D1 doctor");
console.log(`Project: ${rootDir}`);
console.log(`API URL: ${baseUrl}`);
if (hasRemoteD1Binding()) {
  printResult(
    "info",
    "wrangler.jsonc uses remote D1 bindings during dev; local D1 may differ from the running app.",
  );
}

const version = await runWrangler(["--version"], { timeout: 30_000 });
if (version.ok) {
  printResult("ok", `wrangler ${version.stdout.trim() || version.stderr.trim()}`);
} else {
  printResult("fail", `wrangler unavailable: ${summarizeCommandFailure(version)}`);
  process.exit(1);
}

if (!skipApi) {
  for (const path of ["/api/members", "/api/ddays?noCache=1"]) {
    const result = await checkApi(path);
    if (result.ok) {
      printResult("ok", `${path}: ${result.message}`);
    } else {
      printResult("fail", `${path}: ${result.message}`);
      failures += 1;
    }
  }
}

for (const scope of ["remote", "local"]) {
  if ((scope === "remote" && skipRemote) || (scope === "local" && skipLocal)) {
    continue;
  }

  const migrations = await checkMigrations(scope);
  if (migrations.ok) {
    printResult("ok", `${scope} migrations: ${migrations.message}`);
  } else {
    printResult("warn", `${scope} migrations: ${migrations.message}`);
  }

  failures += await checkSchema(scope);
}

if (failures > 0) {
  console.log("");
  console.log("Suggested next step:");
  console.log("  pnpm dev:restart");
  console.log("  pnpm d1:doctor");
  process.exit(1);
}

console.log("");
console.log("D1 doctor completed without blocking failures.");
