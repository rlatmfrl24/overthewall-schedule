# Release Preflight Checklist

## Required Quality Gates
1. `pnpm preflight`

This runs, in order:
- `pnpm architecture:check`
- `pnpm typecheck:test`
- `pnpm lint`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm build`
- `pnpm d1:doctor`
- `pnpm sync:agent-cursor:check`

All gates must pass before deploy.

## Agent Mirror Gate
- `.agent` remains the canonical source for mirrored rules and skills.
- If mirrored `.agent/*` files changed, run `pnpm sync:agent-cursor` before release preflight.
- `pnpm sync:agent-cursor:check` is always part of `pnpm preflight`; do not remove, skip, or replace this gate for code-only releases.
- A mirror drift failure blocks deploy until `.agent` and generated `.cursor` files are aligned.

## Schema-Aware Release Gate
- If `db/schema/index.ts` or `drizzle/*` changed:
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

## Release Notes Checklist
- Document validated scope.
- Document skipped checks and rationale.
- Document known residual risks and follow-up owners.

## Out of Scope
- Chrome extension packages, Web Store metadata, and extension permission checks are not part of the current repository release path.
