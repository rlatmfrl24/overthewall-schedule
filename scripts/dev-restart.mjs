import { execFile, spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { LOCAL_DEV_HOST, parseLocalDevPort, resolveLocalDevPort } from "./local-dev-config.mjs";
import { parseSiteArgument, getSiteLocalEnvironment, assertLocalPersistenceIsolation } from "./site-target.mjs";
import { matchesSiteViteProcess } from "./dev-process.mjs";

const execFileAsync = promisify(execFile);
const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: node scripts/dev-restart.mjs --site=otw|luvdia [--port=5173] [--kill-only]");
  process.exit(0);
}
const siteId = parseSiteArgument(args);
const portArg = args.find(arg => arg.startsWith("--port="));
const localEnvironment = getSiteLocalEnvironment(siteId);
assertLocalPersistenceIsolation(siteId, localEnvironment);
const port = portArg ? parseLocalDevPort(portArg.slice(7), "--port") : resolveLocalDevPort(localEnvironment, siteId);
const otherSite = siteId === "otw" ? "luvdia" : "otw";
if (port === resolveLocalDevPort(getSiteLocalEnvironment(otherSite), otherSite)) throw new Error("Local sites must use different ports.");
const hostArg = args.find(arg => arg.startsWith("--host="));
if (hostArg && hostArg.slice(7) !== LOCAL_DEV_HOST) throw new Error("Use localhost for site-local Clerk and playback origins.");

let processes;
if (process.platform === "win32") {
  const script = `$matches = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*vite.js*' } | Select-Object ProcessId, CommandLine); ConvertTo-Json -InputObject $matches -Compress`;
  const result = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { timeout: 30_000 });
  processes = JSON.parse(result.stdout || "[]").map(row => ({ pid: row.ProcessId, commandLine: row.CommandLine ?? "" }));
} else {
  const result = await execFileAsync("ps", ["-eo", "pid=,args="], { timeout: 30_000 });
  processes = result.stdout.split("\n").flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    return match ? [{ pid: Number(match[1]), commandLine: match[2] }] : [];
  });
}
const matches = processes.filter(row => row.pid > 1 && row.pid !== process.pid && matchesSiteViteProcess(row.commandLine, rootDir, port));
for (const row of matches) {
  if (process.platform === "win32") await execFileAsync("taskkill.exe", ["/PID", String(row.pid), "/T", "/F"], { timeout: 30_000 });
  else process.kill(row.pid, "SIGTERM");
  console.log(`Stopped ${siteId} Vite PID ${row.pid} on port ${port}.`);
}
if (!matches.length) console.log(`No matching ${siteId} Vite server on port ${port}.`);
if (args.includes("--kill-only")) process.exit(0);
const child = spawn(process.execPath, [resolve(rootDir, "scripts/run-site.mjs"), "dev", `--site=${siteId}`], {
  cwd: rootDir, stdio: "inherit", env: { ...localEnvironment, [`${siteId.toUpperCase()}_DEV_PORT`]: String(port) },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
