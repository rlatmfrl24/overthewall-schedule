---
description: Compatibility wrapper for safe merged-branch cleanup and default-branch synchronization.
---

# Branch Maintenance Workflow (Compatibility)

Use the canonical skill:
- Skill: `../skills/branch-maintenance/SKILL.md`

Minimum sequence:
1. Fetch and prune remote refs.
2. Verify the clean worktree, open PRs, worktree use, and either merge ancestry
   or an exact merged-PR head SHA for squash/rebase merges.
3. Fast-forward the local default branch.
4. Delete only the explicitly verified merged local branch.
