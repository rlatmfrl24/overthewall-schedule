---
name: release-ops
description: Run OTW release and deployment preflight operations for Cloudflare Worker and frontend artifacts. Use when preparing production deploys, validating release readiness, or checking post-change operational safety.
---

# Release Ops (OTW)

## Scope
Use this skill for release readiness and deploy operations:
- build, lint, and test gates
- worker deploy sequencing
- migration gating before deployment
- post-deploy sanity checks

## Procedure
1. Confirm change type (code-only, migration, API contract, or mixed).
2. Run preflight checks in order:
   - `pnpm lint`
   - `pnpm test`
   - `pnpm build`
3. If schema changed, ensure migration workflow completed (`db-migration` skill).
4. Deploy with `pnpm deploy`.
5. Run targeted smoke checks on critical routes and admin flows.
6. Record validated scope and residual risks.

## Safety Rules
- Do not deploy when lint, test, or build fails.
- Do not run remote migration and deploy out of order for schema-dependent releases.
- Document skipped checks explicitly.

## References
- Preflight checklist: `references/preflight-checklist.md`
- Compatibility workflow: `../../workflows/worker-deploy.md`
