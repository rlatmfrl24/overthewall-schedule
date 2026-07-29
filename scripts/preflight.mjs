import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";

const steps = [
  { label: "architecture", args: ["run", "architecture:check"] },
  { label: "test typecheck", args: ["run", "typecheck:test"] },
  { label: "lint", args: ["run", "lint"] },
  { label: "test", args: ["run", "test"] },
  { label: "test coverage", args: ["run", "test:coverage"] },
  { label: "build", args: ["run", "build"] },
  { label: "d1:doctor", args: ["run", "d1:doctor"] },
  { label: "mirror check", args: ["run", "sync:agent-cursor:check"] },
];

const runStep = ({ label, args }) =>
  new Promise((resolve) => {
    const displayCommand = `pnpm ${args.join(" ")}`;
    const command = isWindows ? "cmd.exe" : "pnpm";
    const commandArgs = isWindows
      ? ["/d", "/s", "/c", displayCommand]
      : args;
    console.log(`\n[preflight] ${label}: ${displayCommand}`);
    const child = spawn(command, commandArgs, {
      cwd: rootDir,
      stdio: "inherit",
      shell: false,
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });

    child.on("error", (error) => {
      console.error(`[preflight] ${label} failed to start:`, error);
      resolve(1);
    });
  });

for (const step of steps) {
  const code = await runStep(step);
  if (code !== 0) {
    console.error(`\n[preflight] failed at ${step.label} with exit code ${code}`);
    process.exit(code);
  }
}

console.log("\n[preflight] all checks passed");
