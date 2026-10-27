# D1 Operations Read Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement sequentially, then one fresh whole-branch review. Steps use checkbox syntax.

**Goal:** Reduce unnecessary reads in idle queue state, latest successful operations and YouTube channel ownership without changing visible behavior.

**Architecture:** Preserve existing SQL predicates and consumers. Short-circuit idle backlog aggregation inside one SQL snapshot; use indexed per-job latest completion; add reverse channel lookup indexes without rewriting policy SQL.

**Tech Stack:** Existing TypeScript, Drizzle, Cloudflare Worker/D1, Vitest. Node24.20.0, pnpm11.7.0.

**Spec:** `docs/superpowers/specs/2026-10-27-d1-operations-read.md`

## Global Constraints

Account-wide UTC-day reads5M; background4M and stricter existing limits. Play/AI pauses, publication/authorization/archive/shared-owner/Bing Hayu policies and cadence settings remain. Local only; no remote D1/provider calls, migrations, forced collection, merge, deploy or automation changes. Generate schema outputs through Drizzle, preserve all other work.

## Review Focus

- A stale running item can remain after its parent finishes; global staleLeaseCount must survive the idle short-circuit.
- Large active runs mostly dispatched must not regress from an unconditional item-first join.
- Completion order can differ from acceptance order; missing jobs, null completion and unresolved YouTube partials retain existing meaning.
- Shared normal channel owners, disabled links, missing sources and transition fences must not change visibility or collection eligibility.
- Schema consumers using reduced migration fixtures must receive applicable new indexes; production release must apply generated indexes before relying on them.

### Task 1: Idle queue state

**Files:** queue-state SQL and its existing Worker integration test under `worker/features/operations/infrastructure/`.
**Interfaces:** unchanged `SCHEDULED_QUEUE_STATE_SQL` with two timestamp binds and the same four result fields. No dependency on later tasks.

- [ ] Extend the test with retained pending reconciliation on completed runs, a global stale lease and a large active mostly-dispatched case.
- [ ] Run focused Worker integration. Expected: idle read ceiling fails with existing SQL, existing counts remain correct.
- [ ] Materialize counts, conditionally evaluate the existing outbox aggregate only when activeRunCount>0; preserve one SQL snapshot and all predicates.
- [ ] Run the same tests. Expected: PASS, idle reads remain bounded, SELECT writes0 and active costs within a small constant of baseline.
- [ ] Commit task1 with evidence in ledger.

### Task 2: Indexed latest successful run

**Files:** `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts`, associated integration tests, `db/schema/index.ts`, generated `drizzle/` outputs and affected test migration selection.
**Interfaces:** unchanged `readLatestSuccessfulRunTimes()` result and YouTube normalization follow-up; produces one new partial index independent of task1.

- [ ] Add actual D1 regression for retained success history, out-of-order completion, missing jobs and failed/null/partial cases through the repository. Expected: cost ceiling fails before implementation.
- [ ] Add `(job_type,finished_at DESC,id DESC)` partial index for succeeded/non-null finished_at, generate migration and route it to the existing minimal Worker fixture.
- [ ] Replace GROUP BY MAX with per-job indexed top1; leave subsequent YouTube normalization unchanged.
- [ ] Run repository integration and Operations application tests. Expected: PASS with zero SELECT writes and complete historical success semantics.
- [ ] Record local index build/insert overhead and commit task2.

### Task 3: YouTube reverse ownership indexes

**Files:** `db/schema/index.ts`, generated `drizzle/` outputs, full-schema collector integration test and applicable minimal migration selectors.
**Interfaces:** unchanged policy SQL and YouTube application/HTTP contracts; produces members(youtube_channel_id) and member_links(youtube_channel_id,member_uid) indexes independent of tasks1/2.

- [ ] Add D1 cost/policy regression with irrelevant member/link growth, OTW shared remaining owners, LuvDia and fences. Expected: existing reverse lookups exceed the ceiling.
- [ ] Add only the two canonical indexes and generate migration; preserve policy query and final write guard.
- [ ] Run related collector/YouTube/publication checks. Expected: PASS with actual local rows_read/rows_written and index plan evidence.
- [ ] Validate full migration chain using `pnpm d1:reset:local -- --validate-only`; initialize only this fresh worktree's local DB for doctor. Expected: chain/doctor PASS, no remote access.
- [ ] Record construction/write costs and commit task3.

### Task 4: Whole-branch verification and publication

**Files:** task report and current-work entry; all earlier task files are inputs.

- [ ] Prepare review package from branch base to final commit and dispatch one independent reviewer. Fix material findings with RED→GREEN tests.
- [ ] Run final type/lint/affected checks and `pnpm preflight` once after fixes. Expected: PASS; if environment failure occurs, retain prior passes and finish failed/unreached steps as composed verification.
- [ ] Validate both site builds, inspect staged diff for scope/secrets and publish normal PR with root causes, measured local cost, index write/build cost and migration-before-release requirement.
- [ ] Attach PR; inspect exact head, existing comments/reviews, CI and conflicts, record material evidence on PR. Expected: current published HEAD and no known material unresolved findings; no merge/deploy.
