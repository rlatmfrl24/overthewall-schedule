---
name: db-migration
description: Execute safe Drizzle and D1 migration workflows for OTW Schedule. Use when changing database schema, generating migration SQL, applying local or remote D1 migrations, or reviewing migration safety.
---

# DB Migration (OTW)

## Scope
Use this skill for any change touching:
- `src/db/schema.ts`
- `drizzle/*.sql`
- `drizzle/meta/*`
- migration apply commands (`drizzle:migrate:*`)

## Procedure
1. Update schema definitions in `src/db/schema.ts`.
2. Choose migration mode:
   - schema diff: `pnpm drizzle:generate`
   - custom data migration: `pnpm drizzle:generate:custom`
3. Review generated SQL for destructive or unexpected statements.
4. Apply locally with `pnpm drizzle:migrate:local`.
5. Validate affected API and UI behavior.
6. Apply remotely with `pnpm drizzle:migrate:remote` only after local validation.
7. Commit schema and migration artifacts together.

## Safety Rules
- Do not manually create numbered migration files.
- Do not edit already-applied migration files.
- Treat `DROP`, `DELETE`, and wide `UPDATE` operations as high risk and require explicit intent.
- Keep migration numbering and `drizzle/meta/_journal.json` consistent.

## References
- Detailed checklist: `references/checklist.md`
- Canonical rule: `../../rules/drizzle-workflow.md`
