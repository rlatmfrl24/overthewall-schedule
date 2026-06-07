import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const envFiles = [
  process.env.DRIZZLE_ENV_FILE,
  ".env.local",
  ".env",
].filter((value): value is string => Boolean(value));

for (const file of envFiles) {
  const result = config({ path: file, override: false });
  if (!result.error) {
    break;
  }
}

const required = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_DATABASE_ID",
  "CLOUDFLARE_D1_TOKEN",
];

const missing = required.filter((key) => !process.env[key]);
const remoteD1Config =
  missing.length === 0
    ? {
        driver: "d1-http" as const,
        dbCredentials: {
          accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
          databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
          token: process.env.CLOUDFLARE_D1_TOKEN!,
        },
      }
    : {};

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  ...remoteD1Config,
});
