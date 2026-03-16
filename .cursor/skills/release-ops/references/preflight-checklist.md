# Release Preflight Checklist

## Required Quality Gates
1. `pnpm lint`
2. `pnpm test`
3. `pnpm build`

All three gates must pass before deploy.

## Schema-Aware Release Gate
- If `src/db/schema.ts` or `drizzle/*` changed:
  - complete local migration and validation first
  - complete remote migration before deployment
  - verify impacted API and admin surfaces

## Deploy Step
- Run `pnpm deploy`.
- Confirm deployment command completed without errors.

## Smoke Checks
- API baseline:
  - `/api/members`
  - `/api/schedules?date=YYYY-MM-DD`
  - `/api/settings`
- Admin baseline:
  - `/admin/settings`
  - `/admin/logs`
- User baseline:
  - `/`
  - `/weekly`

## Release Notes Checklist
- Document validated scope.
- Document skipped checks and rationale.
- Document known residual risks and follow-up owners.
