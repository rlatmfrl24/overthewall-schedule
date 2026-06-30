---
name: release-ops
description: Run OTW release and deployment preflight operations for the web app, Cloudflare Worker, and OTW Schedule + extension. Use when preparing production deploys, Chrome Web Store packages, release readiness checks, or post-change operational safety validation.
---

# Release Ops (OTW)

## Scope
Use this skill for release readiness and deploy operations:
- build, lint, and test gates
- worker deploy sequencing
- migration gating before deployment
- OTW Schedule + extension package readiness
- post-deploy sanity checks

## Procedure
1. Confirm change type (code-only, migration, API contract, extension, documentation, or mixed).
2. Run preflight checks in order:
   - `pnpm lint`
   - `pnpm test`
   - `pnpm build`
3. If extension files changed, run the relevant extension build/validation command.
4. If schema changed, ensure migration workflow completed (`db-migration` skill).
5. Deploy with `pnpm deploy` only when production deployment is requested.
6. Run targeted smoke checks on critical routes and admin flows.
7. Record validated scope and residual risks.

## Safety Rules
- Do not deploy when lint, test, or build fails.
- Do not run remote migration and deploy out of order for schema-dependent releases.
- Do not submit Store packages when permissions, privacy text, and package manifest are out of sync.
- Document skipped checks explicitly.

## References
- Preflight checklist: `references/preflight-checklist.md`
- Compatibility workflow: `../../workflows/worker-deploy.md`
