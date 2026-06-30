# Release Preflight Checklist

## Required Quality Gates
1. `pnpm lint`
2. `pnpm test`
3. `pnpm build`

All three gates must pass before deploy.

## Extension Release Gate
- If `extensions/otw-schedule-plus` changed:
  - run `pnpm extension:typecheck`
  - run `pnpm extension:build:store`
  - run `pnpm extension:validate` when package metadata or manifests changed
  - run `pnpm extension:zip` before Chrome Web Store upload
- Confirm `docs/otw-schedule-plus-extension.md`, `docs/otw-schedule-plus-deployment-guide.md`,
  `docs/otw-schedule-plus-chrome-store-form.md`, and `docs/privacy.md` match the release scope.

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
  - `/notice`
  - `/vods`
  - `/feed` when member post sources are visible
  - `/multiview`

## Release Notes Checklist
- Document validated scope.
- Document skipped checks and rationale.
- Document known residual risks and follow-up owners.
