import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const dryRun = process.argv.includes("--dry-run");
const configs = [
  "wrangler.collectors.jsonc",
  "wrangler.media.jsonc",
  "wrangler.auto-update.jsonc",
  "wrangler.maintenance.jsonc",
  "wrangler.scheduler.jsonc",
  "wrangler.jsonc",
];

const run = (args, options = {}) => {
  const displayCommand = `pnpm exec wrangler ${args.join(" ")}`;
  const command = isWindows ? "cmd.exe" : "pnpm";
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", displayCommand]
    : ["exec", "wrangler", ...args];
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (options.capture) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  if (result.status !== 0) {
    throw new Error(`${displayCommand} failed: ${result.error?.message ?? result.status}`);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
};

if (!dryRun) {
  const pending = run(
    ["d1", "migrations", "list", "otw-db", "--remote"],
    { capture: true },
  );
  if (/\b\d{4}_[^\s|]+\.sql\b/.test(pending)) {
    throw new Error(
      "Remote D1 has unapplied migrations. Apply and read back migrations before deploying Workers.",
    );
  }
}

for (const config of configs) {
  run(["deploy", "--config", config, ...(dryRun ? ["--dry-run"] : [])]);
}

if (!dryRun) {
  process.stdout.write(
    "Workers deployed in consumer -> scheduler -> web order. Scheduled v2 lanes remain governed by scheduled_v2_<jobType>_enabled D1 flags.\n",
  );
}
