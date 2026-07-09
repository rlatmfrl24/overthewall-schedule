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
- agent and documentation mirror checks as a fixed release gate
- post-deploy sanity checks

## Procedure
1. Confirm change type (code-only, migration, API contract, documentation, or mixed).
2. If mirrored `.agent` files changed, run `pnpm sync:agent-cursor` before the release gate.
3. Run the combined preflight gate:
   - `pnpm preflight`
4. Treat `pnpm sync:agent-cursor:check` as mandatory because it is part of `pnpm preflight`, even for code-only releases.
5. If schema changed, ensure migration workflow completed (`db-migration` skill).
6. Deploy with `pnpm deploy` only when production deployment is requested.
7. Run targeted smoke checks on critical routes and admin flows.
8. Record validated scope and residual risks.

## Safety Rules
- Do not deploy when lint, test, or build fails.
- Do not bypass `.cursor` mirror drift failures in release preflight.
- Do not run remote migration and deploy out of order for schema-dependent releases.
- Do not add Chrome extension packaging or Web Store checks to this repository's release path unless that package is explicitly restored.
- Document skipped checks explicitly.

## References
- Preflight checklist: `references/preflight-checklist.md`
- Compatibility workflow: `../../workflows/worker-deploy.md`
