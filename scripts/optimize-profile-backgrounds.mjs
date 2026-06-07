import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(
  projectRoot,
  process.env.PROFILE_BACKGROUND_SOURCE_DIR ?? "r2/profile-background",
);
const outputDir = join(sourceDir, "optimized");
const widths = [960, 1280, 1672];

if (!existsSync(sourceDir)) {
  console.log(`No profile background source directory found: ${sourceDir}`);
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });

const files = readdirSync(sourceDir)
  .filter((file) => file.endsWith(".webp"))
  .sort();

if (files.length === 0) {
  console.log("No profile background images found.");
  process.exit(0);
}

for (const file of files) {
  const input = join(sourceDir, file);
  const name = basename(file, ".webp");

  for (const width of widths) {
    const output = join(outputDir, `${name}-${width}.webp`);
    const result = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        input,
        "-vf",
        `scale='min(${width},iw)':-2`,
        "-c:v",
        "libwebp",
        "-quality",
        width >= 1600 ? "80" : "78",
        "-compression_level",
        "6",
        "-preset",
        "picture",
        output,
      ],
      { stdio: "inherit" },
    );

    if (result.status !== 0) {
      throw new Error(`Failed to optimize ${file} at ${width}px`);
    }

    const inputKb = Math.round(statSync(input).size / 1024);
    const outputKb = Math.round(statSync(output).size / 1024);
    console.log(
      `${file} -> optimized/${name}-${width}.webp (${inputKb}KB -> ${outputKb}KB)`,
    );
  }
}
