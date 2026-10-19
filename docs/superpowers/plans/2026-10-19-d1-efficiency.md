# D1 Efficiency Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:executing-plans. Execute inline, with one final independent review.

**Goal:** Preserve all functionality and access policies while targeting at most 5,000,000 account-wide D1 rows read per UTC day.
**Architecture:** Narrow existing indexed reads, batch related projections and share request-local results. Reuse account analytics without D1 observation writes; never enable cross-request caching without complete invalidation evidence.
**Tech Stack:** TypeScript, React Query, Cloudflare Workers/D1, Drizzle, Vitest; no new dependencies.
**Spec:** User-approved plan in this conversation; accepted constraints and all33 audit dispositions are recorded in [the local implementation report](../../reports/sul-36/2026-10-19-d1-efficiency.md). Original audit source is recorded in the execution ledger.

## Global Constraints
- Base 71913fe9c710d268664706bcb7ee03e09cad3150; isolated codex/d1-efficiency branch. Preserve other checkouts.
- Account allowance 5,000,000 reads/day UTC. Defer new background work at 4,000,000 or unavailable analytics. Keep stricter existing guards and accepted-work recovery.
- No production SQL, business API requests, collection, migration, push, merge or deployment.
- Keep Play automation paused, LuvDia AI disabled, all publication/archive/shared-owner and ended-member scheduling policies.
- Node 24.20.0, pnpm 11.7.0. No new dependency. Generate schema migrations with Drizzle.

## Review Focus
- Hidden rows ahead of a visible older row must not truncate the public result; ties/cursors remain stable.
- Analytics unavailable or a UTC rollover must not admit new background work or block accepted-work cleanup.
- Cached public content must never survive an unrepresented access/member/link/default-setting change.
- Pagination must not narrow global publish/export or prevent selecting an off-page editing reference.
- Exceptions and concurrency must preserve leases, CAS, audit, holds and genuine partial/retry status.

## Task 1: Account budget and observability (OPS-08, OPS-09)
- [ ] RED: Cron defers new collection before D1 planning at 4m/unavailable; recovery continues. Account analytics totals both databases; observations do not mutate D1.
- [ ] GREEN: Move existing analytics reader to platform with compatible Play adapter; gate new cron/background admission. Add accountCurrentDay/databaseContributions/topReadWorkloads to Operations without removing existing DB fields.
- [ ] Verify related cron, budget, observability, Operations tests and typecheck; commit scoped paths.

## Task 2: Public YouTube and X reads (OPS-01, OPS-02, SPEC-01 SQL)
- [ ] RED: Visible older items behind hidden rows, all sources, mixed handle case, equal timestamps and page boundaries; measure local D1 history growth.
- [ ] GREEN: Eligible sources/handles first; per-source indexed top N and exact global merge under existing visibility, ordering and cursors. Preserve shared-owner policy. Use minimal expression/composite indexes only where needed.
- [ ] Verify YouTube/X/site-content/access integration tests and cost evidence; commit.

## Task 3: Collection probes and metadata (OPS-03, OPS-04, S-09)
- [ ] RED: Due metadata behind newer history, empty work, unchanged origins, duplicate insert, late policy change.
- [ ] GREEN: Indexed per-source due lookup, cheap existence probes, retain final revalidation; sum actual origin INSERT changes instead of before/after COUNT.
- [ ] Verify collection/coordinator/channel-monitor tests; commit.

## Task 4: Request-local HTML/SEO/profile reuse (SPEC-01,03,04,06,09; S-07)
- [ ] RED: One request shares expensive projection; SEO limit10 independent of sitemap5001; prefix escaping; schedule hook does not await unused D-days; static rights retains publication gate.
- [ ] GREEN: Request-local promises, minimal SEO/profile reads, limit10 batched song summaries, PK prefix range, remove unused D-day reads.
- [ ] Verify SEO/site-content/member/schedule consumers and local rendered routes; commit.

## Task 5: Runs, leases, logs, retention (OPS-05,06,07; S-10)
- [ ] RED: Run list query count independent of page length; real partial/retry retained; lease cleanup on exceptions; hasMore existence; dates/UID preserve exact totals.
- [ ] GREEN: Set-based run DTO hydration/latest lookup, lease-token index, EXISTS retention probes, canonical indexed log bounds.
- [ ] Verify scheduled repository/audit/retention tests; commit.

## Task 6: Schedule review and automation (S-13,14,15)
- [ ] RED: Exact member/date pairs above100 binds, explicit schedule IDs, rejected candidates, multiple holiday targets, ended-member policies.
- [ ] GREEN: JSON requested-pair relation and ID union, indexed rejection ID set, once-per-run global holiday reconciliation; keep atomic guards and logs.
- [ ] Verify review/automatic schedule integration tests; commit.

## Task 7: Play admin reads (S-01,02,03)
- [ ] RED: 25-row server pagination/filter/cursor, off-page edit selection, full publish target, one-proposal child scoping, queue/generation isolation.
- [ ] GREEN: Add bounded catalog page API while retaining full API, scoped editing/search references; selected-proposal children and PK approval; queue/generation-first queries. Update contracts, handlers, client/hooks/UI together.
- [ ] Verify admin handler/repository/UI and normal local save/readback; commit.

## Task 8: Public Play and search (S-04,05; SPEC-02,05,07,08)
- [ ] RED: Requested-member-only read, full semantic indexed search, image priority, public/access change with warm cache.
- [ ] GREEN: Member-scoped counts, indexed candidate search, minimal artwork projections. Enable shared cache only with proven complete invalidation (catalog/access/member/link/owner/default-setting versions); otherwise explicitly retain bypass and request-local reuse.
- [ ] Verify public catalog/playlist/access/search tests and local public flows; commit.

## Task 9: Remaining lookups and cleanup (S-06,08,11,12)
- [ ] RED: Archived YouTube proposal regardless of status, expired/completed AI rows, source exceptions, current/historical/shared file holds.
- [ ] GREEN: Minimal lookup indexes, scoped source-health reads, batched historical file-reference checks using existing current-path index. Do not resume automation.
- [ ] Generate Drizzle migration, inspect non-destructive SQL, validate local chain; verify affected integration tests and read/write costs; commit.

## Verification and closeout
Each task follows observed RED -> GREEN, focused consumer checks and scoped commit. Use vitest.all.config.ts Worker projects, not old worker config. Record exact commands and evidence in the plan ledger. Final checks: architecture, typecheck:test, lint, relevant/full suite once and both site builds. PR merge preflight belongs to future PR preparation. One independent whole-branch review and fix pass. Report every audit item's disposition and measured local read/write changes; no assertion of production daily compliance without later deployed UTC-day account analytics. No remote release in this task.
