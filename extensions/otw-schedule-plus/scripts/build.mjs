import { cp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(extensionRoot, "../..");
const distDir = resolve(extensionRoot, "dist");
const publicDir = resolve(extensionRoot, "public");

const getTarget = () => {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const target = targetArg?.split("=")[1] ?? "dev";

  if (target !== "dev" && target !== "store") {
    throw new Error(`Unknown extension build target: ${target}`);
  }

  return target;
};

const run = (command, args) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: extensionRoot,
      shell: false,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walkFiles(path) : path;
    }),
  );

  return files.flat();
};

const stripStoreSourcemaps = async () => {
  const files = await walkFiles(distDir);

  await Promise.all(
    files.map(async (file) => {
      if (file.endsWith(".map")) {
        await unlink(file);
        return;
      }

      if (!file.endsWith(".js")) return;

      const source = await readFile(file, "utf8");
      const stripped = source.replace(/\n\/\/# sourceMappingURL=.*\.map\s*$/u, "");
      if (stripped !== source) {
        await writeFile(file, stripped);
      }
    }),
  );
};

const target = getTarget();
const manifestPath = resolve(extensionRoot, "manifests", `${target}.json`);

await rm(distDir, { force: true, recursive: true });
await run(process.execPath, [
  resolve(repoRoot, "node_modules/typescript/bin/tsc"),
  "-p",
  "tsconfig.build.json",
]);
await cp(publicDir, distDir, { recursive: true });
await cp(manifestPath, resolve(distDir, "manifest.json"));

if (target === "store") {
  await stripStoreSourcemaps();
}
