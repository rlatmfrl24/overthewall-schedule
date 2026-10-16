# OTW·LuvDia 성능·운영 검증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LuvDia 이미지 응답 지연을 줄이고, 계정 예산을 지키며 Cron·Workflow·Queue·AI의 실제 동작 상태를 구분해 확인한다.

**Architecture:** 기존 asset 접근 reader와 응답 경로, Cloudflare Analytics reader, scheduled job/AI 정상 UI를 사용한다. 보관/비공개 접근 정책을 유지하고 관측을 위한 새 D1 쓰기를 만들지 않는다. 정상 수집과 의도적으로 꺼진 기능은 별도 판정한다.

**Tech Stack:** React image hooks, Worker/D1/R2, Cache headers, Cloudflare GraphQL Analytics, Vitest/Workerd.

**Spec:** [점검 결과와 요구](../../reports/sul-36/2026-10-15-operations-audit-and-priorities.md)

## Global Constraints

- 현 관측 읽기 사용량은 무료 기준 약91.8%; 원격 전수 조회·backfill·AI batch·DB 재복사·전체 doctor는 후순위다.
- 계정 합산 읽기/쓰기와 자체 ledger 목표를 구분한다. 실제 요금제와 지표의 UTC 기간을 명시한다.
- 이미지 최적화가 보관 파일이나 공개 전 콘텐츠를 노출해서는 안 된다. 기존 R2 업로드 사고 파일은 별도 보존 대상이다.
- AI·키리누키·Play 채널 감시는 현재 비활성 상태를 유지한다. 검사와 활성화 결정을 혼용하지 않는다.
- 신규 의존성·범용 캐시 플랫폼·동기화 서비스를 만들지 않는다.
- 실행 환경은 `node >=24.20.0 <25`, `pnpm 11.7.0`; 현재 Node25를 앱 검증 환경으로 사용하지 않는다.

## Review Focus

- 304/HEAD 요청으로 파일 존재·bytes가 노출됨 → 권한 검사 이후에만 처리(Task 1).
- 로그인/로그아웃·관리자 변경으로 Blob/cache 재사용 → 세션 경계에서 폐기(Task 1).
- R2 통계 0/지연·원본과 파생 이미지 차이 → 누락 확정 전에 정확 key 확인(Task 2).
- Cron 등록/Queue 길이0/wrapper1/1을 성공으로 오인 → 실행·item·결과 readback 대조(Task 3).
- AI timeout/unknown 효과 → 자동 재POST 금지 및 기존 관리자 복구 계약 유지(Task 3).

## Task 1: 이미지 지연의 작은 완전한 개선

**Files:**
- Modify: `worker/features/assets/infrastructure/d1-asset-access-reader.ts`, `worker/features/assets/http/handler.ts`, `worker/app/content-transition-access.ts`(측정상 필요할 때만), `src/shared/hooks/use-authenticated-image.ts`, `src/features/members/ui/member-profile-page.tsx`, `src/features/members/model/profile-background-images.ts`.
- Test: `worker/app/archive-access.integration.test.ts`, `src/shared/ui/authenticated-image.test.tsx`; create `worker/features/assets/infrastructure/d1-asset-access-reader.integration.test.ts` only if no existing owning suite covers the query; extend existing handler tests.
- Evidence: create `docs/reports/sul-36/profile-loading-verification.md`.

**Interfaces:** existing `AssetAccessReader.readAccess(path)` and `useAuthenticatedImages(sources, protectedImage, context)` signatures stay. New helper only if needed: `isMatchingAssetEtag(ifNoneMatch: string | null, etag: string): boolean` in asset domain, with weak/list/wildcard HTTP cases covered. Publication phase identity must match [cutover plan](2026-10-15-site-publication-cutover.md).

- [ ] **Step 1: baseline and caller trace.** Search all `readAccess`, `useAuthenticatedImages`, image variant builders and `readInactiveTargetWorkspace` callers. With local copied/sanitized schema, compare asset authority queries, number of D1 calls, R2 get/list, body wait and decode. In normal browser navigation compare anonymous/admin, all three profiles, initial/revisit, narrow/wide screen. Capture waterfall with a supported browser developer interface; do not claim LCP from tool wall time. Production sampling waits for read-budget recovery.
- [ ] **Step 2: regression tests before edits.** Same access result for public member images, archived member, archived-only notice, public+archived shared reference, unreferenced admin draft, wrong origin and encoded path. A rejected request may not receive 304. Logout aborts old blobs; fallback original is fetched only when optimized image fails. Rendered image change may not wait for unselected carousel images.
- [ ] **Step 3: run failing scoped tests.** `pnpm exec vitest run src/shared/ui/authenticated-image.test.tsx`; run affected Workerd asset suites using `--config vitest.worker.config.ts`. Existing safety tests should stay green; new redundant-fetch/conditional-response cases should expose the missing behavior.
- [ ] **Step 4: reduce measured server work.** Keep exact legitimate-reference semantics but bound the member lookup and reference EXISTS queries; combine duplicate revision/workspace reads within a request where ownership permits. Do not add a cross-request TTL to authorization state. Support body-free conditional responses after authorization using the effective site/revision/phase ETag. Keep private/no-store on protected content; public `no-cache` revalidation is acceptable only when the Worker checks the current policy first. Neither signed-in status nor an old ETag makes content public.
- [ ] **Step 5: reduce client work.** Fetch only the selected optimized source initially; fetch its original on error and defer other backgrounds. Preserve authenticated requests when required and session-bound object URL cleanup. Public direct URLs may be used only where current server access policy permits; do not remove the prelaunch administrator preview path. Do not resize/reupload the 31KB image as a presumed cure for its observed ~1.46s TTFB.
- [ ] **Step 6: verify same flow.** Run affected unit/Workerd tests and `pnpm architecture:check` if imports change. Use same browser role/viewport/network for before/after, report at least three bounded samples after budget recovery, median TTFB/total and request count. Acceptance: primary image displays without waiting for fallback/carousel requests, unnecessary requests disappear, no auth/cache regression, no median latency regression. If server latency is unchanged, report unresolved rather than calling fewer lines a performance fix.
- [ ] **Step 7: scoped commit.** `perf: reduce profile asset read and transfer overhead`; record both code identity and actual domain measurements separately.

## Task 2: D1/R2 budget and ownership readback

**Files:** use `worker/features/operations/infrastructure/cloudflare-d1-observability-reader.ts`, `worker/features/otw-play/infrastructure/cloudflare-ingestion-read-budget.ts`, `worker/platform/scheduled-jobs/job-policy.ts`, `worker/app/scheduled-workflow-cron.ts`; update `docs/operations/backend-cost-optimization.md` and the audit report. Code changes only for a reproduced wrong measurement/guard contract.

**Interfaces:** existing account Analytics data and `scheduledOperations.d1WriteGuard` semantics; no new telemetry tables or write-on-read behavior.

- [ ] **Step 1:** read actual plan, account UTC totals, per-DB split, timestamps and configured guard targets through Cloudflare/Operations. Show free reference limits separately from the purchased plan. Compare totals with ledger but do not equate ledger usage to provider billable usage.
- [ ] **Step 2:** inspect the existing top-query Analytics breakdown without executing those queries. Classify asset access, source reads, migration/copy, polling, and retention. Query text may contain private values: publish only normalized family/cost, never raw sensitive SQL. Limit the time window and group count.
- [ ] **Step 3:** after daily headroom recovers, use indexed/primary-key bounded readback for necessary state only; record actual `rows_read`/`rows_written`. SELECT is not free. Stop optional work when account read utilization is >=80% of the verified applicable budget. Do not change operational flags or terminate accepted jobs merely for observation.
- [ ] **Step 4:** inspect R2 bucket metrics, public access/custom domains, lifecycle policy and known profile keys. Compare existing copy manifest logical key/hash with own-bucket metadata for the three profiles; distinguish static `/profile/*` from R2 backgrounds. Do not LIST/download the whole bucket or delete apparent orphans. Confirm archive objects/backups are excluded from lifecycle deletion and direct public origins cannot bypass hidden-content policy.
- [ ] **Step 5:** classify each suspected issue: confirmed missing key, stale analytics, absent optional background, incorrect access path, or unresolved. For a confirmed missing required image, prepare a separate exact source/hash/target repair list through the existing versioned uploader; no upload is part of this read-only audit. The old accidental overwrite requires historical evidence and is not resolved by a successful current GET.
- [ ] **Step 6:** record savings candidates and order: duplicated fetch/access query, inefficient source query, eligible polling, then budget-safe index/migration/backfill. Index changes require measured EXPLAIN/query costs in isolated D1 and db-migration; do not assume more indexes reduce overall writes. Commit docs only when this task changed only evidence.

## Task 3: natural scheduled execution and AI readiness

**Files:** inspect `worker/app/scheduled-workflow-cron.ts`, `worker/workflows/scheduled-workflows.ts`, `worker/app/scheduled-queue.ts`, `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts`, owning executors, `worker/features/otw-play/application` AI service; update `docs/reports/sul-36/otw-resume-and-luvdia-collection.md` with a dated new section. Regression tests stay with the root cause if one is reproduced.

**Interfaces:** normal Operations and existing job/AI UI → own Workflow/Queue → existing run/item/outbox/AI result → public/admin readback. No direct enqueue or forged token replaces this flow.

- [ ] **Step 1:** map enabled job flags to their actual Cron minute, due time, limits and eligible sources. Current schedule is minutes3/13/23/33/53, so it cannot trigger a midnight publication switch. Read-only metadata already proves registrations, not execution.
- [ ] **Step 2:** observe one naturally due execution for each enabled class after budget recovery. Record scheduled source/run ID, Workflow status, item counts, nested result failure, retry/outbox and one resulting UI/readback. Reuse valid prior manual-flow evidence rather than triggering four more collections. Empty Workflow list before an eligible tick is inconclusive.
- [ ] **Step 3:** verify queue ownership, DLQ/retention, retry and idempotency locally with real isolated Workerd/D1 and existing regression tests. Record old OTW running wrappers separately from true unfinished items; do not bulk-normalize to success. Follow any real operational failure to the root function, reproduce minimally, fix, then verify the same normal flow.
- [ ] **Step 4:** AI checklist is initially readiness-only: false flag/paused state, own queue, credentials existence (never values), model/config, own budgets, imported unfinished/unknown disposition. Verify local disabled rejection causes no provider call. Do not call AI healthy based on disabled queues.
- [ ] **Step 5:** if the user later explicitly requests AI activation and budget permits, enable through the existing control and submit one approved normal UI request. Verify actual provider attempt → stored response → admin review → explicit application and authoritative readback. Failed/unknown POST must not be blindly retried; imported unissued requests retain required administrator confirmation. Stop expanding to batch/quality benchmarks.
- [ ] **Step 6:** close each class separately as PASS, FAIL, intentionally disabled, or not observed. Attach scoped regression results for fixes; final whole-suite preflight belongs to release, not this evidence update.

## Self-review

Image latency, D1/R2, Cron/Queue/reservations and AI each have a task and actual-flow criterion. No savings estimate or success rate is invented from the initial sample. Operational sampling and optional live mutations remain budget/authorization dependent; code-local work can proceed independently.
