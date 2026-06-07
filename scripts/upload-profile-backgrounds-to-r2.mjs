import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(
  projectRoot,
  process.env.PROFILE_BACKGROUND_SOURCE_DIR ?? "r2/profile-background",
);
const optimizedDir = join(sourceDir, "optimized");
const defaultBucket = "otw-schedule";
const cacheControl = "public,max-age=31536000,immutable";

const bucketArg = process.argv.find((arg) => arg.startsWith("--bucket="));
const bucket = bucketArg?.slice("--bucket=".length) || process.env.R2_BUCKET || defaultBucket;
const wranglerEntry = join(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

const putObject = ({ key, file }) => {
  const result = spawnSync(
    process.execPath,
    [
      wranglerEntry,
      "r2",
      "object",
      "put",
      `${bucket}/${key}`,
      "--file",
      file,
      "--content-type",
      "image/webp",
      "--cache-control",
      cacheControl,
      "--remote",
      "--force",
    ],
    {
      cwd: projectRoot,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error(`Failed to upload ${file} to ${bucket}/${key}`);
  }
};

const parseProfileBackgroundName = (name) => {
  const parts = name.split("--");
  if (parts.length > 2) {
    throw new Error(
      `Invalid profile background filename: ${name}. Use only one "--" separator.`,
    );
  }
  const [code, backgroundId = "default"] = parts;

  if (!code || !/^[a-z0-9_]+$/.test(code)) {
    throw new Error(
      `Invalid member code in profile background filename: ${name}. Use {code}.webp or {code}--{backgroundId}.webp.`,
    );
  }

  if (!/^[a-z0-9][a-z0-9_-]*$/.test(backgroundId)) {
    throw new Error(
      `Invalid background id in profile background filename: ${name}. Use lowercase letters, numbers, hyphens, or underscores.`,
    );
  }

  return { code, backgroundId };
};

if (!existsSync(sourceDir)) {
  throw new Error(`Profile background directory does not exist: ${sourceDir}`);
}

if (!existsSync(optimizedDir)) {
  throw new Error(
    `Optimized directory does not exist: ${optimizedDir}. Run pnpm images:profile-backgrounds first.`,
  );
}

const originalFiles = readdirSync(sourceDir)
  .filter((file) => file.endsWith(".webp"))
  .sort();
const optimizedFiles = readdirSync(optimizedDir)
  .filter((file) => file.endsWith(".webp"))
  .sort();

if (originalFiles.length === 0 || optimizedFiles.length === 0) {
  throw new Error("Profile background source files are missing.");
}

const uploads = [];

for (const file of originalFiles) {
  const { code, backgroundId } = parseProfileBackgroundName(
    basename(file, ".webp"),
  );
  uploads.push({
    file: join(sourceDir, file),
    key: `members/${code}/backgrounds/${backgroundId}/original.webp`,
  });
}

for (const file of optimizedFiles) {
  const match = file.match(/^(.+)-(\d+)\.webp$/);

  if (!match) {
    continue;
  }

  const [, name, width] = match;
  const { code, backgroundId } = parseProfileBackgroundName(name);
  uploads.push({
    file: join(optimizedDir, file),
    key: `members/${code}/backgrounds/${backgroundId}/w${width}.webp`,
  });
}

for (const upload of uploads) {
  const sizeKb = Math.round(statSync(upload.file).size / 1024);
  console.log(`Uploading ${upload.key} (${sizeKb}KB)`);
  putObject(upload);
}

console.log(`Uploaded ${uploads.length} profile background objects to ${bucket}.`);
