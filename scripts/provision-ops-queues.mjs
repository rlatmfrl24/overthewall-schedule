import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const runWrangler = (args, stdio = "pipe") => {
  const displayCommand = `pnpm exec wrangler ${args.join(" ")}`;
  return spawnSync(
    isWindows ? "cmd.exe" : "pnpm",
    isWindows
      ? ["/d", "/s", "/c", displayCommand]
      : ["exec", "wrangler", ...args],
    { cwd: process.cwd(), encoding: "utf8", stdio },
  );
};
const queues = [
  "otw-ops-control",
  "otw-ops-critical",
  "otw-ops-background",
  "otw-play-ingestion",
  "otw-websub",
  "otw-dead-letter",
];

const list = runWrangler(["queues", "list"]);
if (list.status !== 0) {
  process.stderr.write(list.stderr ?? "");
  throw new Error("Unable to list Cloudflare Queues");
}

const existing = list.stdout ?? "";
for (const queue of queues) {
  if (existing.includes(queue)) continue;
  const created = runWrangler(["queues", "create", queue], "inherit");
  if (created.status !== 0) throw new Error(`Failed to create queue: ${queue}`);
}
