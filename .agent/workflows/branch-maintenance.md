---
description: Compatibility wrapper for safe merged-branch cleanup and default-branch synchronization.
---

# Branch Maintenance Workflow (Compatibility)

Use the canonical skill:
- [Branch maintenance skill](../skills/branch-maintenance/SKILL.md)

The skill owns all-worktree inventory, task-specific PR preparation, preservation,
exact-tip merge proof, expected-OID local/remote deletion and final readback.
Do not infer that other worktrees are clean from the main checkout's status.
