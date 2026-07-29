# DB Migration Checklist

## Before Editing
- Confirm why the schema change is needed and which APIs or UI flows depend on it.
- Confirm whether data backfill or transformation is required.
- Confirm target tables, columns, nullability, and defaults.

## Generate
- Edit `db/schema/index.ts`.
- Run `pnpm drizzle:generate` or `pnpm drizzle:generate:custom`.
- Ensure only one new migration number is introduced for this change set.
- Confirm generation does not require remote Cloudflare/D1 credentials.

## Review SQL
- Check for unintended `DROP TABLE`, `DROP COLUMN`, `RENAME`, or data loss operations.
- Confirm indexes and constraints match expected runtime queries.
- For custom SQL, verify operation order and failure behavior.

## Apply and Validate
- Run `pnpm d1:reset:local -- --validate-only` when only the full migration
  chain needs verification and the current local data must remain.
- Run `pnpm drizzle:migrate:local` for incremental local apply, or
  `pnpm d1:reset:local` for a clean local database.
- Confirm reset applies numbered migration SQL in an isolated temporary D1;
  never mark migration rows as applied from a generated final schema.
- Run `pnpm d1:seed:local` when the affected behavior needs reproducible
  members/settings/ddays/sample schedules.
- `pnpm d1:seed:local` must refuse to overwrite non-fixture local data. Use
  `pnpm d1:reset:local` first only when discarding the existing local database
  is intentional; reserve `--force` for an explicit destructive fixture reset.
- Run `pnpm d1:doctor` without `--remote` for the default local-only check.
- Validate impacted endpoints in `worker/features/*/http/*` and
  `worker/app/routes.ts`.
- Validate impacted frontend consumers in `src/features/*/api/*`, related
  queries, and UI.

## Promote
- Run `pnpm drizzle:migrate:remote` only after local validation succeeds.
- Remote checks use `pnpm d1:doctor --remote` or release preflight only.
- Document operational caveats in PR notes or release notes.

## Commit Set
- `db/schema/index.ts`
- new `drizzle/*.sql`
- updated `drizzle/meta/*`
