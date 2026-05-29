import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { spawn } from "node:child_process";

const execFileAsync = promisify(execFile);
const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

const hasArg = (name) => args.includes(name);
const getArgValue = (name, fallback) => {
  const prefix = `${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

const host = getArgValue("--host", "127.0.0.1");
const port = getArgValue("--port", "5173");
const killOnly = hasArg("--kill-only");

if (hasArg("--help") || hasArg("-h")) {
  console.log(`Usage: node scripts/dev-restart.mjs [options]

Options:
  --host=127.0.0.1  Host for the restarted Vite dev server
  --port=5173       Port for the restarted Vite dev server
  --kill-only       Stop matching dev server processes and exit
`);
  process.exit(0);
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const runPowerShell = async (script) => {
  try {
    const result = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        cwd: rootDir,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
    return `${result.stdout ?? ""}${result.stderr ?? ""}`;
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? error.message ?? ""}`;
  }
};

const stopWindowsVite = async () => {
  const escapedRoot = rootDir.replace(/'/g, "''");
  const escapedPort = String(port).replace(/'/g, "''");
  const script = `
$root = '${escapedRoot}'
$port = '${escapedPort}'
$currentProcessId = $PID
$matches = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -ne $currentProcessId -and
  $_.CommandLine -and
  $_.CommandLine -like '*vite*' -and
  ($_.CommandLine -like ('*' + $root + '*') -or $_.CommandLine -like ('*' + $port + '*'))
}
$matches | ForEach-Object {
  Write-Output ("Stopping PID " + $_.ProcessId + ": " + $_.CommandLine)
  Stop-Process -Id $_.ProcessId -Force
}
if (-not $matches) {
  Write-Output "No matching Vite dev server process found."
}
`;
  return runPowerShell(script);
};

const stopUnixVite = async () => {
  const escapedRoot = rootDir.replace(/'/g, "'\\''");
  const escapedPort = String(port).replace(/'/g, "'\\''");
  const script = `
ps -eo pid=,args= | awk '/vite/ && (index($0, "${escapedRoot}") || index($0, "${escapedPort}")) { print $1 }' |
while read -r pid; do
  if [ -n "$pid" ] && [ "$pid" != "$$" ]; then
    echo "Stopping PID $pid"
    kill "$pid" 2>/dev/null || true
  fi
done
`;
  try {
    const result = await execFileAsync("sh", ["-c", script], {
      cwd: rootDir,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return `${result.stdout ?? ""}${result.stderr ?? ""}`;
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? error.message ?? ""}`;
  }
};

const stopVite = async () => {
  if (process.platform === "win32") {
    return stopWindowsVite();
  }
  return stopUnixVite();
};

console.log(`Stopping existing Vite dev server for port ${port}...`);
const stopOutput = await stopVite();
if (stopOutput.trim()) {
  console.log(stopOutput.trim());
}

await sleep(1200);

if (killOnly) {
  console.log("Stopped matching dev server processes.");
  process.exit(0);
}

console.log(`Starting Vite on http://${host}:${port}/`);
const viteBin = resolve(rootDir, "node_modules", "vite", "bin", "vite.js");
const child = spawn(
  process.execPath,
  [viteBin, "--host", host, "--port", String(port), "--strictPort"],
  {
    cwd: rootDir,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    console.log(`Vite exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`Failed to start Vite: ${error.message}`);
  process.exit(1);
});
