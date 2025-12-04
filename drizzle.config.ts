import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const envFiles = [
  process.env.DRIZZLE_ENV_FILE,
  ".env.local",
  ".env",
].filter((value): value is string => Boolean(value));

let loadedEnvFile: string | undefined;
for (const file of envFiles) {
  const result = config({ path: file, override: false });
  if (!result.error) {
    loadedEnvFile = file;
    break;
  }
}

const required = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_DATABASE_ID",
  "CLOUDFLARE_D1_TOKEN",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  const hint = loadedEnvFile
    ? `Loaded variables from ${loadedEnvFile}`
    : `Searched files: ${envFiles.join(", ") || "N/A"}`;
  throw new Error(
    `[drizzle.config] Missing environment variables: ${missing.join(
      ", "
    )}. ${hint}`
  );
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
});
