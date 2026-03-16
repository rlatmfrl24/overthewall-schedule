# DB Migration Checklist

## Before Editing
- Confirm why the schema change is needed and which APIs or UI flows depend on it.
- Confirm whether data backfill or transformation is required.
- Confirm target tables, columns, nullability, and defaults.

## Generate
- Edit `src/db/schema.ts`.
- Run `pnpm drizzle:generate` or `pnpm drizzle:generate:custom`.
- Ensure only one new migration number is introduced for this change set.

## Review SQL
- Check for unintended `DROP TABLE`, `DROP COLUMN`, `RENAME`, or data loss operations.
- Confirm indexes and constraints match expected runtime queries.
- For custom SQL, verify operation order and failure behavior.

## Apply and Validate
- Run `pnpm drizzle:migrate:local`.
- Validate impacted endpoints in `worker/routes/*`.
- Validate impacted frontend consumers in `src/lib/api/*` and related features.

## Promote
- Run `pnpm drizzle:migrate:remote` only after local validation succeeds.
- Document operational caveats in PR notes or release notes.

## Commit Set
- `src/db/schema.ts`
- new `drizzle/*.sql`
- updated `drizzle/meta/*`
