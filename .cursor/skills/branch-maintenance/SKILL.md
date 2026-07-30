---
name: branch-maintenance
description: Safely synchronize the local default branch with its remote tracking branch and remove a specific merged local task branch. Use when the user asks to clean up branches, prune stale remote refs, update master after a PR merge, or repeat the OTW short-lived branch closure workflow.
---

# Branch Maintenance

Keep the operation local and conservative unless the user explicitly requests
remote branch deletion or repository-setting changes.

## Procedure

1. Inspect `git status --short --branch`. Stop before switching branches when
   tracked or untracked user changes are present.
2. Run `git fetch origin --prune`.
3. Resolve the default branch from `origin/HEAD`; do not assume `master` when
   the remote reports another branch.
4. Identify the exact local task branch to remove.
5. Capture its current tip with
   `git rev-parse refs/heads/<task>` as `<task-tip>`, then verify:
   - it is not the default branch
   - no open PR still uses it
   - `git worktree list --porcelain` shows no other worktree using it
6. Establish exactly one deletion proof:
   - **Ancestry proof for merge commits:** require
     `git merge-base --is-ancestor <task> origin/<default>` to succeed and the
     left count from
     `git rev-list --left-right --count <task>...origin/<default>` to be `0`.
   - **Exact PR proof for squash or rebase merges:** query the merged PR and
     require its state to be `MERGED`, `baseRefName` to equal `<default>`,
     `headRefName` to equal `<task>`, and `headRefOid` to equal `<task-tip>`.
     Reject ambiguous, unavailable, closed-unmerged, or mismatched PR data.
7. Verify the local default branch has no commits absent from its remote. The
   left count from
   `git rev-list --left-right --count <default>...origin/<default>` must be `0`.
8. Switch to the default branch and run
   `git merge --ff-only origin/<default>`.
9. Delete only the verified local task branch:
   - with ancestry proof, run `git branch -d -- "<task>"`
   - with exact PR proof, re-read the branch tip and require it still to equal
     `<task-tip>`, then atomically run
     `git update-ref -d "refs/heads/<task>" "<task-tip>"`
10. Confirm:
   - the worktree is clean
   - local and remote default branch SHAs match
   - the deleted branch is absent locally
   - stale remote-tracking refs are pruned

When already on the default branch and no task branch was named, perform only
the fetch, fast-forward, and final verification steps.

## Safety Rules

- Never use `git reset --hard`, `git branch -D`, or broad branch deletion.
- Use `git update-ref -d` only for the exact merged-PR fallback, with the full
  local branch ref and expected old OID shown above.
- Never delete a remote branch, change branch protection, or alter repository
  settings without explicit authorization.
- Never delete a branch unless its current tip is covered by one deletion
  proof. Block deletion for an open PR, dirty changes, or an active worktree.
- Never resolve divergence with an automatic merge or rebase; report it and
  request direction.
- Do not commit, push, or create a PR as part of cleanup unless separately
  requested.

## Result Report

Report the updated default branch SHA, the exact deleted branch, whether the
remote-tracking branch was already absent or pruned, and any skipped cleanup.
