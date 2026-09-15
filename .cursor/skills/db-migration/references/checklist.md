# DB Migration Checklist

## Before Editing
- Confirm why the schema change is needed and which APIs or UI flows depend on it.
- Confirm whether data backfill or transformation is required.
- Confirm target tables, columns, nullability, and defaults.

## Generate
- Edit `db/schema/index.ts`.
- Run `pnpm drizzle:generate` or `pnpm drizzle:generate:custom`.
- Verify generated migration numbering and journal entries are consistent; preserve unrelated migrations.
- Confirm generation does not require remote Cloudflare/D1 credentials.

## Review SQL
- Check for unintended `DROP TABLE`, `DROP COLUMN`, `RENAME`, or data loss operations.
- Confirm indexes and constraints match expected runtime queries.
- For custom SQL, verify operation order and failure behavior.

## Apply and Validate
- Run `pnpm d1:reset:local -- --validate-only` when only the full migration
  chain needs verification and the current local data must remain.
- Run `pnpm drizzle:migrate:local` for incremental local apply, or
  `pnpm d1:reset:local -- --force` for a clean local database when local D1
  state already exists.
- Confirm reset applies numbered migration SQL in an isolated temporary D1;
  never mark migration rows as applied from a generated final schema.
- Run `pnpm d1:seed:local` when the affected behavior needs reproducible
  members/settings/ddays/sample schedules.
- Without `--force`, `pnpm d1:seed:local` must require an empty local D1
  instead of inferring safety from fixture member names. Use
  `pnpm d1:reset:local -- --force` first only when discarding the existing
  local database is intentional; reserve seed `--force` for an explicit
  destructive fixture reset.
- Run `pnpm d1:doctor` without `--remote` for the default local-only check.
- Validate impacted endpoints in `worker/features/*/http/*` and
  `worker/app/routes.ts`.
- Validate impacted frontend consumers in `src/features/*/api/*`, related
  queries, and UI.

## Promote
- Enter promotion only for an authorized remote migration/release, after local validation.
- Verify the target account and database, compatibility with deployed code, and the recovery plan.
- Run `pnpm drizzle:migrate:remote`, then verify applied/pending state and affected data.
- Use `pnpm d1:doctor -- --remote` for an intended remote check; ordinary preflight checks local D1.
- Document operational caveats in PR notes or release notes.

## Commit Set
- `db/schema/index.ts`
- new `drizzle/*.sql`
- updated `drizzle/meta/*`
