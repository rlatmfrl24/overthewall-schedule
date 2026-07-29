---
description: Canonical Drizzle and D1 migration workflow for OTW Schedule
alwaysApply: true
---

# Drizzle + D1 Workflow

## Source of Truth
- Make schema changes only in `db/schema/index.ts`.
- Treat generated files in `drizzle/` as outputs of the migration workflow.

## Migration Creation
- Use `pnpm drizzle:generate` for schema-diff migrations.
- Use `pnpm drizzle:generate:custom` only when manual data transformation SQL is required.
- Do not manually create numbered migration files in `drizzle/`.
- Migration generation must work without Cloudflare account credentials. Do not
  make `pnpm drizzle:generate` depend on remote D1 configuration.

## SQL Safety Review
- Inspect generated SQL before applying migrations.
- Explicitly verify `DROP`, `DELETE`, `ALTER`, and `RENAME` statements.
- If SQL is unexpectedly destructive, fix schema definitions and regenerate.
- Never edit already-applied migration files; create a new migration instead.

## Apply Order (Local -> Remote)
1. Verify the full migration chain without replacing the current local D1:
   `pnpm d1:reset:local -- --validate-only`.
2. Reset or migrate local D1 when intended: `pnpm d1:reset:local` or
   `pnpm drizzle:migrate:local`.
   - The reset command must apply numbered migration SQL to an isolated
     temporary D1 and promote it only after validation. Do not synthesize the
     final schema and mark migrations as applied.
3. Seed deterministic local fixtures when needed: `pnpm d1:seed:local`.
   - Without `--force`, the seed command must require an empty local D1. Do
     not infer safety only from `local_*` member identities.
   - Use `pnpm d1:reset:local` before seeding only when deleting the current
     local data is intentional.
   - Use `pnpm d1:seed:local -- --force` only for an explicit destructive
     fixture replacement.
4. Run the local D1 doctor: `pnpm d1:doctor`.
5. Validate behavior locally across affected APIs and UI flows.
6. Apply to remote D1 only after local validation and only from release/deploy
   flow: `pnpm drizzle:migrate:remote`.

## Commit Requirements
- Include related schema and migration artifacts in the same change:
  - `db/schema/index.ts`
  - `drizzle/*.sql`
  - `drizzle/meta/*`
- Keep migration numbering monotonic and journal updates intact.

## High-Risk Change Checklist
- Confirm intent for destructive SQL operations.
- Confirm a fallback or repair plan for production data.
- Confirm remote apply command targets the correct database (`otw-db`).
