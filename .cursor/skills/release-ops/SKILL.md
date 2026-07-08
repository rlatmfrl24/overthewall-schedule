---
name: release-ops
description: Run OTW release and deployment preflight operations for the web app, Cloudflare Worker, and D1-backed changes. Use when preparing production deploys, release readiness checks, migration-aware releases, or post-change operational safety validation.
---

# Release Ops (OTW)

## Scope
Use this skill for release readiness and deploy operations:
- build, lint, and test gates
- worker deploy sequencing
- migration gating before deployment
- agent and documentation mirror checks when `.agent` changed
- post-deploy sanity checks

## Procedure
1. Confirm change type (code-only, migration, API contract, documentation, or mixed).
2. Run preflight checks in order:
   - `pnpm lint`
   - `pnpm test`
   - `pnpm build`
3. If `.agent` changed, run `pnpm sync:agent-cursor` and `pnpm sync:agent-cursor:check`.
4. If schema changed, ensure migration workflow completed (`db-migration` skill).
5. Deploy with `pnpm deploy` only when production deployment is requested.
6. Run targeted smoke checks on critical routes and admin flows.
7. Record validated scope and residual risks.

## Safety Rules
- Do not deploy when lint, test, or build fails.
- Do not run remote migration and deploy out of order for schema-dependent releases.
- Do not add Chrome extension packaging or Web Store checks to this repository's release path unless that package is explicitly restored.
- Document skipped checks explicitly.

## References
- Preflight checklist: `references/preflight-checklist.md`
- Compatibility workflow: `../../workflows/worker-deploy.md`
