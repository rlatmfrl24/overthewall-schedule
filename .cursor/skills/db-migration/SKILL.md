---
name: db-migration
description: Review, generate, and validate OTW Drizzle/D1 schema or data migrations, and apply them during an authorized release. Use for db/schema/index.ts, drizzle artifacts, or migration-safety requests.
---

# DB Migration (OTW)

Follow the [canonical D1 rules](../../../.agent/rules/drizzle-workflow.md) and
[shared outcome rules](../../../.agent/rules/antigravity.md). Select the mode
from the user's request and existing authorization.

## Review only

Inspect the schema, SQL, journal, target database, affected consumers, and
destructive/backfill/concurrency risks. Do not generate, apply, edit, or commit
migrations as a consequence of a review request. When chain verification is
in scope, `pnpm d1:reset:local -- --validate-only` validates in temporary D1
without replacing the existing local database.

## Generate and validate locally

1. Update `db/schema/index.ts` for schema changes, then use
   `pnpm drizzle:generate`; use `pnpm drizzle:generate:custom` for data migrations.
2. Inspect generated SQL and journal consistency. Never hand-create numbered
   migrations or edit already-applied migrations. Preserve unrelated artifacts.
3. Validate the full chain with `pnpm d1:reset:local -- --validate-only`.
   Apply incrementally with `pnpm drizzle:migrate:local` when local apply is
   intended. Reset/seed with `--force` only when discarding that local data is
   explicitly intended; an existing database must otherwise be preserved.
4. Run `pnpm d1:doctor` and verify affected API/UI behavior through the intended
   flow, including persisted identities, constraints, and authoritative readback.

## Authorized production promotion

Only enter this mode when remote migration is part of the authorized release.
Verify target account/database (`otw-db`), local evidence, existing deployment
compatibility, and the recovery plan before `pnpm drizzle:migrate:remote`.
Confirm applied/pending migration state and affected data after promotion.
Coordinate schema-dependent deployment using [release-ops](../release-ops/SKILL.md).
Local success alone is not authorization for remote apply or commit.

When commits are requested, include the related schema, SQL, and metadata
together. Use the [detailed checklist](references/checklist.md) for chain,
seed, and promotion details.
