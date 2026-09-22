---
name: release-ops
description: Verify OTW release readiness and carry out authorized Cloudflare Worker/D1 releases with production readback. Use for release gates, deployment requests, and post-deployment verification.
---

# Release Ops (OTW)

Follow the [shared outcome and authority rules](../../../.agent/rules/antigravity.md).
Readiness inspection, production migration, PR merge, and deployment are separate
actions; preserve the user's existing authorization for each.

## Procedure

1. Identify the change scope, reviewed HEAD, release target, and deployment route.
   Check whether the session/repository uses merge-triggered Cloudflare Builds
   or explicitly requested manual deployment. Do not launch a second manual
   deployment merely because a merge-triggered build is pending.
2. For schema changes, complete the local [migration workflow](../db-migration/SKILL.md)
   before preflight. Plan authorized remote promotion before schema-dependent
   deployment, preserving compatibility with the currently deployed version.
3. If canonical agent files changed, run `pnpm sync:agent-cursor`.
   Use `pnpm preflight` for a release, reusing final PR-preparation evidence when
   code, configuration, environment, and scope remain equivalent. Its test step
   already executes unit and Worker integration tests once. Rerun only failed or
   invalidated steps; distinguish composed evidence from a full-command pass.
   Ordinary task completion is not a release gate. Coverage is optional.
4. For an authorized merge, verify the reviewed PR HEAD, required checks, and
   relevant diff before merging. For authorized manual deployment, use
   `pnpm deploy`. A readiness-only request ends with evidence and remaining steps.
5. Verify build/deployment completion and artifact identity where it affects the
   conclusion. Command exit or PR merge alone does not prove production behavior.
6. Verify the changed representative user/admin flow and authoritative readback.
   Use Play review/registration/publication/playback or Operations job status
   flows when those capabilities changed. Distinguish accepted/queued work from
   final outcomes; respect intentionally paused automation and public flags.
7. Record actual evidence, residual risks, and scoped verification limits.
   Follow the shared PR comment policy when writes to an owning PR are authorized.

## Release constraints

- Failed lint, tests, build, D1 validation, or agent synchronization blocks release.
- Do not enable production flags, resume collection, or generate paid external
  work merely to obtain a successful check without authorization for that action.
- Preserve current extension-free repository scope.

Details: [preflight checklist](references/preflight-checklist.md).
Compatibility entry: [worker deploy workflow](../../../.agent/workflows/worker-deploy.md).
