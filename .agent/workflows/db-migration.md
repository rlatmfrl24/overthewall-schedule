---
description: Update database schema and deploy migrations
---

1. Create a migration file based on the changes in `src/db/schema.ts`.
   // turbo
   pnpm drizzle:generate
2. Review the generated SQL file in the `drizzle/` directory. Check for unexpected DROP TABLE or RENAME statements.
3. Apply migrations to the local D1 database.
   // turbo
   pnpm drizzle:migrate:local
4. Apply migrations to the remote D1 database (Production).
   WARNING: This will apply changes to the live database.
   // turbo
   pnpm drizzle:migrate:remote
