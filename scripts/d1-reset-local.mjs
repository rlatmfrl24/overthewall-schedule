import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerEntry = require.resolve("wrangler/bin/wrangler.js");
const wranglerStateDir = resolve(rootDir, ".wrangler", "state");
const localD1Dirs = [
  resolve(wranglerStateDir, "v3", "d1"),
  resolve(wranglerStateDir, "v3", "miniflare-D1DatabaseObject"),
];

const ensureInsideStateDir = (target) => {
  const relative = target.slice(wranglerStateDir.length);
  if (
    target === wranglerStateDir ||
    !target.startsWith(wranglerStateDir) ||
    !relative.startsWith("\\") && !relative.startsWith("/")
  ) {
    throw new Error(`Refusing to delete path outside .wrangler/state: ${target}`);
  }
};

for (const dir of localD1Dirs) {
  ensureInsideStateDir(dir);
  await rm(dir, { recursive: true, force: true });
}

const wrangler = spawn(
  process.execPath,
  [wranglerEntry, "d1", "migrations", "apply", "otw-db", "--local"],
  {
    cwd: rootDir,
    stdio: "inherit",
  },
);

const exitCode = await new Promise((resolveExit) => {
  wrangler.on("close", resolveExit);
});

if (exitCode !== 0) {
  process.exit(exitCode ?? 1);
}
