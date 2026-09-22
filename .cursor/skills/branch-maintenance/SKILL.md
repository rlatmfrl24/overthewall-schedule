---
name: branch-maintenance
description: Inspect all OTW worktrees and remaining changes, prepare completed tasks separately for PR review, synchronize the default branch, and clean proven merged local and remote task branches. Use for branch/worktree cleanup and post-merge closeout, not automatic merging of unfinished work.
---

# Branch Maintenance

Aim for a clean current default checkout with unfinished work explicitly preserved.
A cleanup request includes proven merged same-repository remote task branches unless
the user limits it to local cleanup. Preparing remaining work does not authorize
merging it. Never change repository protections. An inspection-only request does
not authorize publication or deletion.

Follow [safe closeout](references/procedure.md). This skill remains usable without
personal global skills or helper scripts. For residual task PR preparation, use
[OTW review](../../../.agent/skills/code-review/SKILL.md) and the final
[preflight gate](../release-ops/references/preflight-checklist.md); $pr-ready is
optional when installed. Do not run application tests for branch-only cleanup.
