> 2026-10-16 아카이브: 당시 계획·검증 기록입니다. 미완료 표기를 현재 실행 지시로 사용하지 않습니다. 남은 작업과 중단 조건은 [현재 작업](../../../current-work.md)을 따릅니다.

# OTW·LuvDia 공개 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 10월 19일 정각에 LuvDia를 공개하고 OTW 이관 멤버를 숨기되 관리자·보관 자료·기존 권한을 유지한다.

**Architecture:** 공통 순수 시간 정책을 Worker 요청 진입점, 공개 조회, 수집 대상 선택에 전달한다. LuvDia 사전 gate는 DB 없이 응답하며, OTW는 기존 보관 접근 의미에 시간 기반 대상 제외를 더한다. Cron 실행이나 정각 대량 UPDATE에 공개 여부를 의존시키지 않는다.

**Tech Stack:** React, TanStack Router/Query, TypeScript, Cloudflare Worker Static Assets, D1, 기존 Clerk 인증.

**Spec:** [확정 요구·현재 상태](../reports/sul-36/2026-10-15-operations-audit-and-priorities.md)

**Execution update (2026-10-15):** 사용자가 이 세션의 직접 구현을 승인했다. Task 1/2의 제품 코드와 정상 로컬 HTTP/브라우저 검증을 진행했으며 [구현·검증 기록](../reports/sul-36/2026-10-15-publication-cutover-execution.md)에 실제 판정과 한계를 남겼다. Task 3 운영 배포, OTW 빌드 설정, 기존 이관 maintenance fixture/Queue 검증은 남아 있다. 원격 D1 고비용 작업은 사용자 지시대로 연기했다. 기존 WIP와 섞인 전체 commit은 만들지 않았다.

## Global Constraints

**2026-10-16 재개:** OTW Clerk 환경 분리와 양 사이트 최종 build, 현재 독립 운영/정각 보존 collector 2건 검증을 완료했다. 추가 X 경계·LuvDia feed·결과 카운터 회귀를 포함한 Workerd/D1 89건이 통과했다. 최신 단계와 운영 schema 비호환은 [10/16 실행 계획](2026-10-16-release-readiness-and-backlog.md)·[갱신된 실행 기록](../reports/sul-36/2026-10-15-publication-cutover-execution.md)에 있다. 위 Execution update의 미해결 표기는 10/15 당시 상태다. 운영 배포/실제 정각 검증과 전체 mixed WIP preflight는 완료하지 않았다.

- 시각은 `2026-10-18T15:00:00Z`, 대상 code는 `bing_hayu`, `u_lili`, `yang_mei`다. UID는 site별 실제 자료에서 검증하며 운영 코드에 추측하여 박지 않는다.
- 공개 전 LuvDia 모든 공개 콘텐츠 페이지/API 차단, 관리자 정상 인증·작업 유지. 공개 후 기존 회원/관리자 권한 유지.
- OTW 과거 자료 삭제·LuvDia 데이터 재복사 금지. 다른 멤버의 정상 서비스 유지.
- 사이트 시간 정책은 신규 D1 query/write 없이 평가한다. 구조 변경은 architecture check, API 변경은 worker-api-change, schema 변경은 db-migration, 배포는 release-ops를 적용한다.
- 계획 승인 후 직접 구현을 진행했다. 운영 배포는 아직 수행하지 않았다.
- 앱 테스트와 build는 `node >=24.20.0 <25`, `pnpm 11.7.0`에서 실행한다. 이번 문서 점검 환경의 Node25 경고를 무시하지 않는다.

## Review Focus

- 정각 전에 열린 탭·잘못된 클라이언트 시계 → 서버 시각 재확인 후 화면과 Query cache 전환(Task 1/2).
- 직접 API·encoded URL·HEAD·SEO·Static Assets 우회 → UI와 동일한 서버 정책(Task 1/2).
- 일반 로그인 사용자를 관리자로 취급 → 서버의 현재 관리자 검사 유지(Task 1).
- 공동 콘텐츠·개인 playlist·페이지네이션 → 원본 보존, 대상 콘텐츠 비노출, 다른 콘텐츠 계속 이용(Task 2).
- 정각 전에 접수된 Queue 재시도·cache → 대상 신규 저장/노출 부활 금지, 원래 실행 증거 보존(Task 2/3).

## Task 1: LuvDia 사전 gate·카운트다운·메뉴명

**Files:**
- Create: `contracts/site-publication.ts`, `contracts/site-publication.test.ts`, `worker/app/site-publication.ts`, `worker/app/site-publication.test.ts`, `src/app/layout/site-countdown.tsx`.
- Modify: `contracts/api-routes.ts`, `worker/platform/types.ts`, `worker/app/fetch.ts`, `worker/app/routes.ts`, `src/routes/__root.tsx`, `src/app/layout/app-shell.tsx`, `src/app/layout/app-navigation.ts`, `wrangler.jsonc`, `wrangler.luvdia.jsonc`.
- Test: `worker/app/fetch.test.ts`, `src/app/layout/app-navigation.test.ts`; create `src/app/layout/site-countdown.test.tsx`, `worker/app/site-publication.integration.test.ts`.

**Interfaces:**
- `getSitePublication(siteId: SiteId, nowMs: number, hold?: boolean): { phase: 'countdown' | 'open' | 'held'; opensAt: string; serverNow: string }` in `contracts/site-publication.ts`. OTW phase는 항상 open, LuvDia는 hold가 false이고 now >= opensAt일 때 open. `SITE_PUBLICATION_HOLD`를 Env에 추가하고 기본 false, 문자열 true일 때만 hold로 처리한다. 준비 실패 시 운영자가 명시적으로 설정하는 fail-closed 수단이며 자동 연기 판단을 만들지 않는다.
- `GET /api/publication-status`: 위 공개 메타데이터만 반환, no-store, DB 접근 없음. 콘텐츠 API가 아니며 countdown 동기화 예외다.
- `readSitePublicationAccess(request: Request, env: Env): Promise<Response | null>` in `worker/app/site-publication.ts`; null만 기존 handler로 진행. 관리자 통과는 기존 handler의 권한 검사 면제가 아니다.

- [x] **Step 1: 경계 테스트 작성.** `Date.parse('2026-10-18T14:59:59.999Z')`에서 LuvDia countdown, `15:00:00.000Z`부터 open, OTW는 두 시점 모두 open. hold=true는 LuvDia를 두 시점 모두 held로 유지한다. 익명/일반 회원은 공개 콘텐츠 API에서 `403 SITE_NOT_OPEN`; 관리자는 자기 사이트의 기존 정상 흐름으로 진행한다. 위조 admin claim/타 사이트 token은 통과하지 않는다.
- [x] **Step 2: 실패 확인.** `pnpm exec vitest run contracts/site-publication.test.ts worker/app/site-publication.test.ts src/app/layout/app-navigation.test.ts`. 신규 export/정책 부재 실패만 red로 기록한다.
- [x] **Step 3: 진입점에 적용.** 새 gate는 transition 조회·SEO·route dispatch·file resolution보다 앞선다. HTML은 콘텐츠 없는 countdown(200, no-store, noindex), API는 위 오류, HEAD는 같은 상태/헤더에 body 없음. 관리자 로그인용 앱 shell과 Clerk의 정상 bootstrap, 내용 없는 JS/CSS/로고만 허용한다. `/admin` shell 자체는 권한 증거가 아니며 data는 서버 인증 필수다. 공유 public API를 이용하는 관리자도 정상 token으로 통과시킨다. 회원 업무 write도 공개 전에는 거부한다. Cron/Queue는 웹 공개 여부와 분리해 기존 설정대로 준비 작업을 유지한다.
- [x] **Step 4: Static Assets 우회 닫기.** 두 config의 Worker-first 범위를 전체 경로로 설정하고 gate에서 공개용 bundle과 보호 이미지/HTML을 구분한다. `/profile/*`, `/r2-assets/*`, sitemap, unknown SPA deep link, encoded 경로와 preview/workers.dev alias를 같은 정책으로 검증한다. 광범위 공개 cache 예외를 두지 않는다.
- [x] **Step 5: countdown 화면 연결.** root의 Outlet/사이트 콘텐츠 provider보다 앞에서 적용해 chrome 없는 profile/snapshot도 포함한다. 표시 문구 `2026년 10월 19일 오전 0시 공개`, 일/시/분/초, 기존 LuvDia 로고, 관리자 로그인 동선. 서버 시간 offset을 사용하고 foreground 복귀/0 도달 시 status를 재확인한 뒤 정상 홈으로 이동한다. held이면 `공개 준비를 마무리하고 있습니다.`로 표시하고 반복 redirect하지 않는다. 화면 낭독기에 초 단위 반복 알림을 보내지 않는다. LuvDia nav label만 `멀티뷰`; OTW 기존 label과 `c=` 선택 URL·Mul.Live 안내는 유지한다.
- [ ] **Step 6: 검증.** 위 unit + `pnpm exec vitest run --config vitest.worker.config.ts worker/app/site-publication.integration.test.ts`, 영향을 받는 API client 테스트, `pnpm typecheck:test`, `pnpm architecture:check`. 별도 로컬 DB의 양 사이트 정상 UI에서 익명/회원/관리자, 화면 새로고침, clock ±1일, 정각 전후를 검증한다. fake clock은 보조이며 운영 배포 뒤 정상 URL 확인을 별도로 남긴다.
- [ ] **Step 7: 변경 경로만 stage·commit.** `feat: gate LuvDia public launch by server time`. 기존 WIP를 일괄 포함하지 않는다.

## Task 2: OTW 대상 숨김과 동시 수집 종료

**Files:**
- Modify: Task 1 `contracts/site-publication.ts`; `worker/app/content-transition-access.ts`, `worker/app/assets.ts`, `worker/app/scheduled-workflow-cron.ts`와 각 capability composition.
- Public read owners: `worker/features/members/infrastructure/d1-member-reader.ts`, `worker/features/schedule-board/infrastructure/d1-schedule-board.ts`, `worker/features/notices/infrastructure/d1-notice-gateway.ts`, `worker/features/ddays/infrastructure/d1-dday-repository.ts`, `worker/features/chzzk/infrastructure/{d1-active-channels,d1-history-reader,site-content-videos}.ts`, `worker/features/youtube/infrastructure/{d1-active-channels,d1-history-reader,d1-youtube-vods,youtube-feed,site-content-videos}.ts`, `worker/features/member-posts/infrastructure/{d1-member-posts-port,site-content-feed}.ts`, `worker/features/otw-play/infrastructure/{d1-public-catalog-reader,d1-member-submission-repository}.ts`, `worker/features/assets/infrastructure/d1-asset-access-reader.ts`, `worker/features/seo/infrastructure/site-content-cache.ts`.
- Source selectors/execution: `worker/features/naver-cafe/infrastructure/naver-cafe-collector.ts`, existing CHZZK/YouTube/X source selectors and scheduled executor call sites found by their callers; preserve their current public ports.
- Test: extend `worker/app/archive-access.integration.test.ts`, `worker/app/scheduled-workflow-cron.integration.test.ts`; create `worker/app/publication-cutover.integration.test.ts`.

**Interfaces:**
- Extend pure contract with `getHiddenMemberCodes(siteId: SiteId, nowMs: number): readonly string[]`; only OTW at/after cutoff returns the three codes.
- Use existing `includeArchived` and archive authorization semantics. Member-code/related-root predicates must be applied inside the owning SQL before LIMIT/count and before serialization, not after a response has leaked data. Clock is injected through app composition, not read separately by every row.
- Effective visibility adds the cutoff to persisted `content_access`; it never changes old `admin_archive` to public. Relationships use existing schema and disposition rules; no copied snapshot allowlist or new runtime peer dependency.

- [x] **Step 1: create affected-consumer map.** Search every existing `content_access`, `includeArchived`, source membership and archive file/revision caller. Record its root relationship in the test case matrix: member/schedule; notice/D-day related members; X/Cafe/YouTube/CHZZK sources; Play performance participants/song/source; personal playlist references; asset legitimate references; SEO/export. Include nested shared records and old permalink paths.
- [x] **Step 2: write failing normal-flow tests.** At T−1ms ordinary OTW shows the three; at T all relevant list/detail/search/feed/SEO/export/file views hide the selected roots, other members still show, current admin can read archives. Shared song stays if a nonselected performance remains; selected performance is unavailable in a personal playlist without deleting the playlist. Mixed related content follows existing archive disposition, not a newly invented bulk-delete rule. Pagination contains no hidden records and does not lose unrelated pages.
- [x] **Step 3: implement effective predicates and cache boundary.** Reuse existing archive selection/SQL infrastructure at each owning reader. Carry phase in response/cache identity; no response TTL may cross T. Already-open OTW tabs refetch status at T and clear affected queries/views. Prevent file/304/SEO cached body from bypassing current effective policy. Administrative archive URLs remain private/no-store.
- [ ] **Step 4: stop only the transferred sources at T.** Source eligibility and final mutation guard both evaluate the policy, so a message accepted before T cannot introduce later target-member work. Preserve receipt/status/cursor/unknown-effect evidence, acknowledge or defer according to the existing safe state machine; never fake success or advance a skipped source watermark. Other members' jobs continue. LuvDia collection is unaffected. Test a late Queue retry and an in-flight collector commit at T in isolated Workerd/D1.
- [ ] **Step 5: verify.** `pnpm exec vitest run --config vitest.worker.config.ts worker/app/publication-cutover.integration.test.ts worker/app/archive-access.integration.test.ts worker/app/scheduled-workflow-cron.integration.test.ts`, affected unit tests, `pnpm architecture:check`, both site builds after proper local Clerk config. Browser smoke includes direct detail links, normal navigation, member/admin role and preexisting tab. Do not use production UPDATEs to simulate cutoff.
- [ ] **Step 6: scoped commit.** `feat: apply OTW member visibility and collection cutoff`. Commit the complete set of consumers together; landing only menu/member filtering is not complete.

## Task 3: deadline deployment and authoritative readback

**Files:** update `docs/reports/sul-36/2026-10-15-operations-audit-and-priorities.md` with actual identity/result; use existing build/deploy scripts and site configs.

**Interfaces:** depends on both previous tasks and verified artifact/schema compatibility from [shared release Task 1](2026-10-15-shared-release-architecture.md). A final source equality claim requires evidence for both sites.

- [ ] **Step 1:** inventory source/schema/build config against each live site. OTW recorded0101 vs LuvDia0136 is a material blocker to blindly deploying current code. After budget recovery use `db-migration` to estimate required scans/index writes, back up appropriately, rehearse migrations locally, then apply only the reviewed compatible path. Do not run all remote migrations merely to satisfy a doctor gate.
- [ ] **Step 2:** settle review fixes, run final release-ops/preflight once, build both from the reviewed source snapshot. Verify one-sided failure handling; do not overwrite LuvDia data or roll a DB schema back with only a Worker rollback.
- [ ] **Step 3:** before T deploy the gate/cutoff through the authorized release path and read back exact Worker versions, config and normal domains. LuvDia must already be countdown for anonymous users while current administrator can work. OTW must remain unchanged before T. Until this exists, report public exposure as still present.
- [ ] **Step 4:** at/after T use actual domain → normal menu → content to confirm LuvDia open and OTW target absent, including direct APIs/files and administrator readback. Use bounded queries only if necessary and budget permits. No Cron or agent wakeup is needed for the actual switch; observation is not its trigger.
- [ ] **Step 5:** publish PASS/FAIL with identities in the owning PR only when GitHub writing is authorized. If release safety fails, keep LuvDia closed and report the concrete blocker; do not silently override the accepted deadline or expose incomplete access controls. An operational hold needs an explicit fail-closed switch in the gate, with default off after readiness is confirmed; test hold overrides the clock.

## Self-review

All three publication requirements have owners; each review-focus case is assigned above. Open dependency: budget-safe schema alignment and complete source-consumer mapping. These are executable checks before rollout, not claims that current production is ready. This plan creates no scheduled automation and makes no promise that unimplemented code will switch on the 19th.
