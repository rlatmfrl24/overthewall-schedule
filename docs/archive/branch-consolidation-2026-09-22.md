# Branch consolidation, 2026-09-22

## Scope and preservation

The user authorized reviewing and integrating uncommitted work in both remaining
worktrees, reconciling remote-only commits, and deleting the completed branches
and worktrees. The starting master was `14293241951e9226501cbf526939b5ab7883cc72`.

- SUL-26: preserved three changed files as `19f0828a`. Refresh stored YouTube
  metadata after 24 hours, at most two 50-video requests per run, retaining quota
  admission and partial-progress reporting. Public reads remain read-only.
- SUL-28: preserved 28 changed/new files as `6559ee86`. Add evidence-based holiday
  suggestions, additional-broadcast spacing checks, scan failure reporting, and
  the corresponding administrator review UI. Schema, generated migration 0096,
  snapshot and journal are included together.
- Both feature commits were merged without squashing so their identities remain
  reachable. The Design.md conflict retained both current AEO guidance and new
  schedule-review guidance.

## Remote branch reconciliation

The docs branch tip was `dbbaa3e5a3f864bff50b39d91203c39754ee86b1`; SUL-22's tip
was `6f73f28c146fa91934d9d278e2a77af072d5acea` and already contained that docs tip.
Their differing commit identities were not evidence of missing product changes.
Comparing branch-changed paths showed the documentation and generated graph
artifacts already matched master, except subsequent AEO/AI documentation updates.
The Play queue changes also matched; later PR #143 changes improved the player,
playlist feedback/transitions, quick search and reduced-motion handling. PR #147
added AEO initialization and public access policy handling. The removed elastic
slider must not be restored.

An explicit history-only merge of SUL-22 retained the current tree and connected
both remote tips as ancestors. This avoids replaying obsolete code and allows
subsequent branch deletion with ancestry proof. No open PR owned these branches.

## Validation and operational boundary

- `pnpm preflight` passed on integrated code `d2487265`: architecture, test
  typechecks, lint, unit/Worker integration tests, build, local D1 doctor and
  agent mirror validation. This report is the only subsequent source change.
- All 96 migrations applied successfully to temporary D1 using
  `pnpm d1:reset:local -- --validate-only`; the existing local database was preserved.
- Migration 0096 then applied incrementally to local D1. Its SQL only creates
  `schedule_day_assessments` and a partial unique pending-holiday index.
- The local administrator route `/admin/review?tab=schedule` displayed the existing
  12 pending items with Korean dates and the new existing-schedule comparison.
  Existing operator decisions were not changed to exercise the UI.
- Environment files and local Wrangler state from both worktrees were backed up
  outside the repository before removal, with all 45 file hashes verified.
- Production D1 had migration 0096 pending at review time. Pushing the validated
  master automatically deployed Worker version
  `f38d9b6b-6c93-43e2-a22e-787d02575e74` at 100%. Because that runtime requires the
  new table, migration 0096 was then promoted as the required compatibility step.
  Remote readback confirmed the table, unique index and migration record, with
  no migrations pending. No second manual Worker deployment was started.
- The automatic Cloudflare build deployed despite the pending migration; the
  guard in `scripts/deploy-workers.mjs` therefore did not protect this automatic
  route. Future schema-dependent merges must promote compatible migrations
  before pushing master or route automatic deployment through that guard.
  A real production collection and holiday approval flow remains unverified.
- Remote SUL-22/docs branches and local SUL-26/SUL-28/integration branches were
  deleted after ancestry checks. Only master and the main registered worktree
  remain. Windows long paths left files in the old SUL-26 directory and a
  node_modules directory in SUL-28; automatic approval review blocked recursive
  cleanup of those residual directories without supplying a more specific reason.
- The pre-existing `codex/x-api` stash contains separate historical work and is
  preserved; it is not a local or remote branch.
