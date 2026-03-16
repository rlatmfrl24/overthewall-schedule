---
description: Canonical Drizzle and D1 migration workflow for OTW Schedule
alwaysApply: true
---

# Drizzle + D1 Workflow

## Source of Truth
- Make schema changes only in `src/db/schema.ts`.
- Treat generated files in `drizzle/` as outputs of the migration workflow.

## Migration Creation
- Use `pnpm drizzle:generate` for schema-diff migrations.
- Use `pnpm drizzle:generate:custom` only when manual data transformation SQL is required.
- Do not manually create numbered migration files in `drizzle/`.

## SQL Safety Review
- Inspect generated SQL before applying migrations.
- Explicitly verify `DROP`, `DELETE`, `ALTER`, and `RENAME` statements.
- If SQL is unexpectedly destructive, fix schema definitions and regenerate.
- Never edit already-applied migration files; create a new migration instead.

## Apply Order (Local -> Remote)
1. Apply to local D1 first: `pnpm drizzle:migrate:local`.
2. Validate behavior locally across affected APIs and UI flows.
3. Apply to remote D1 only after local validation: `pnpm drizzle:migrate:remote`.

## Commit Requirements
- Include related schema and migration artifacts in the same change:
  - `src/db/schema.ts`
  - `drizzle/*.sql`
  - `drizzle/meta/*`
- Keep migration numbering monotonic and journal updates intact.

## High-Risk Change Checklist
- Confirm intent for destructive SQL operations.
- Confirm a fallback or repair plan for production data.
- Confirm remote apply command targets the correct database (`otw-db`).
