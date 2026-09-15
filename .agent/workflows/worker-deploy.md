---
description: Compatibility wrapper for deployment workflow. Use release-ops skill as canonical guidance.
---

# Worker Deploy Workflow (Compatibility)

Use canonical sources:
- [Release skill](../skills/release-ops/SKILL.md)
- [Preflight checklist](../skills/release-ops/references/preflight-checklist.md)

Use the authorized deployment route from release-ops: merge-triggered build
or explicitly requested manual `pnpm deploy`. Readiness checks alone do not
authorize deployment; verify the released artifact and actual changed flow.
