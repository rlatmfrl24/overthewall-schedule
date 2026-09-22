# Safe multi-worktree closeout

## Inventory and remaining work

1. Inspect every registered path from `git worktree list --porcelain`, including
   staged/unstaged/untracked changes, detached HEAD, upstreams, local-only commits,
   locks, and missing directories. Use `git -C <path> status --porcelain=v1 -z --untracked-files=all`.
   Missing/unreadable data is unknown, never clean. Inspect ignored user data
   (especially environment files) before removing directories.
2. Identify the intended same-repository remote, fetch it with prune, and resolve
   its live default from `git ls-remote --symref <remote> HEAD` or GitHub metadata.
   OTW uses master; other repositories may not. Inventory local AND live remote
   heads and all matching PR pages. Compare repository identity, not branch names alone.
3. Check available task/session state for active worktree use. Clean Git status
   does not establish that another task is idle. Preserve active, locked,
   incomplete, unknown-owner, or ambiguous work; continue independent cleanup.
4. Review clearly owned completed residual work separately per task. Explicitly
   stage only its files/hunks, commit, push, and prepare/update its PR. Never publish
   secrets or unrelated changes. Use $pr-ready when available; otherwise perform
   scoped review/fixes, focused checks, publication, latest-head Codex review,
   comment triage and final repository preflight. Actual merge requires separate
   user authorization. Preserve incomplete work/Drafts.
5. Merge the latest default into a task branch only on a clean owned/inactive
   checkout. Resolve routine conflicts only when intent is established; preserve
   conflicts requiring product decisions. Do not auto-stash, rewrite history,
   or force-push to simplify inventory.

## Synchronization and deletion proof

1. Update default in the worktree already holding it. Require clean status and
   zero local-only default commits, then fast-forward with
   `git -C <path> merge --ff-only <remote>/<default>`. Preserve a divergent local
   default for a separate task/PR; never reset it. If no worktree holds default,
   switch only a clean owned checkout. Never force a ref to move under a worktree.
2. For EACH LOCAL tip and REMOTE tip independently, establish one proof:
   - Ancestry: captured tip is an ancestor of the current remote default.
   - Squash/rebase: a MERGED PR in the same repository has the exact head tip and
     branch, the same base repository/default branch, and its merge commit is
     present in the current remote default history.
   An older merged head, closed-unmerged PR, similar diff or missing metadata is
   insufficient. Fetch missing objects before deciding ancestry.
3. Exclude default/protected/intentionally retained branches, branches used by
   ANY open PR, and active/dirty/locked worktrees. Inspect remote-only branches too;
   never delete a fork/contributor remote. Unknown proof means preserve.
4. Remove only a proven completed, idle, clean linked worktree with normal
   `git worktree remove <absolute-path>`. Verify its resolved path is the
   inventoried repository worktree and it contains no ignored user data that must
   survive. Keep primary and calling worktree directories. For a retained current
   checkout, switch to default when available or detach at its tip when another
   worktree owns default. Never interrupt another active task.
5. Re-read status, PR state, default and candidate OIDs immediately before each
   deletion. Recompute proof if anything changed. Once no worktree holds the branch,
   conditionally delete its proven local ref:
   `git update-ref -d refs/heads/<branch> <expected-local-oid>`.
   This also supports proven squash merges. Remove only that deleted branch's
   obsolete Git config section if present.
6. Delete the independently proven same-repository remote ref with
   `git push --force-with-lease=refs/heads/<branch>:<expected-remote-oid> <remote> :refs/heads/<branch>`.
   This lease protects a deletion, not a history rewrite. On rejection, reinspect;
   never weaken the lease. Prune fetched refs after successful deletion.
7. Read back local refs/config, live remote heads (ls-remote), worktree registrations
   and status, and default OIDs. Tracking-ref absence alone does not prove remote
   deletion. Report partial failures and remaining work accurately.

Never use reset-hard, clean-force, branch-D, forced worktree removal, broad
deletion, or automatic merging into default. Use argument arrays or correctly
quoted single-shell literal paths on Windows. Branch-only cleanup needs no app tests.

## Result

Report default SHA/synchronization and deleted, PR-prepared, preserved, and
needs-decision items with paths/branches/PR links and reasons. Pending PRs or
unfinished changes mean partial closeout, not a completely clean repository.
