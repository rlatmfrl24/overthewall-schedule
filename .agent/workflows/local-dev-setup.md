---
description: Compatibility wrapper for local development setup.
---

# Local Dev Setup (Compatibility)

Use canonical guidance:
- [Project context](../rules/project-context.md)
- [DB setup checklist](../skills/db-migration/references/checklist.md)
- [API touchpoints](../skills/worker-api-change/references/touchpoints.md)

Minimum bootstrap commands:
1. `pnpm install`
2. `pnpm cf-typegen`
3. Validate the migration chain with `pnpm d1:reset:local -- --validate-only`.
   Use incremental local migration for existing data. Use reset `--force` only
   when discarding that database is explicitly intended.
4. `pnpm d1:seed:local` only when an empty local database needs fixtures.
5. `pnpm d1:doctor`
6. `pnpm dev`

Local development and tests must use local D1 by default. Remote D1 is reserved
for explicit release/deploy commands such as `pnpm drizzle:migrate:remote`.
