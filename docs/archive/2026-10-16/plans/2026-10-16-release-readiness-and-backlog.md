> 2026-10-16 아카이브: 당시 계획·검증 기록입니다. 미완료 표기를 현재 실행 지시로 사용하지 않습니다. 남은 작업과 중단 조건은 [현재 작업](../../../current-work.md)을 따릅니다.

# 19일 공개 준비와 보류 작업 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 19일 공개·OTW 숨김 구현을 검증·배포 가능한 상태로 이어가고, D1 보류·프로젝트 잔여 작업의 순서와 완료 조건을 한 곳에서 추적한다.

**Architecture:** 기존 DB 비의존 시간 정책과 capability별 권한/저장 guard를 유지한다. 공개·성능·공통 배포는 이미 별도 계획으로 분해돼 있으므로 이 계획은 현재 남은 연결과 실행 순서를 소유하며 구현을 중복 정의하지 않는다. 운영 배포는 실제 source/schema에 맞춘 검토 artifact만 사용한다.

**Tech Stack:** TypeScript, React/TanStack Query, Cloudflare Worker/Workerd/D1/R2, Drizzle, Clerk, Node 24.20.0, pnpm 11.7.0.

**Spec:** [10/16 현재 요구·작업 목록](../../../reports/sul-36/2026-10-16-work-register.md), [확정 공개 요구](../reports/sul-36/2026-10-15-operations-audit-and-priorities.md).

## Global Constraints

- `2026-10-18T15:00:00Z` 전 LuvDia countdown, 이후 기존 권한으로 open. OTW 대상은 `bing_hayu`, `u_lili`, `yang_mei`다.
- 이번 사용자는 기존 공개 계획의 **동일 세션 직접 실행을 계속 승인**했다. 새 백로그는 정리 대상이며 전부 즉시 실행하는 지시가 아니다. 새 실행 방식 선택/계획 재승인을 반복 요청하지 않는다.
- 기존 미커밋 작업·개인 데이터·원본·Queue 책임을 보존하고 전체 WIP를 배포하지 않는다.
- 운영 D1 전체 검증·재귀 음악 검사·대량 이관/백필은 계속 보류. 로컬 회귀와 기존 로그·집계를 우선한다.
- X 결과 확인은 10:55에 완료했다. 새 버전의 정규 run 2300/2301 성공 후 기존 `otw-9-d1`는 PAUSED다. 중복 예약이나 강제 수집을 만들지 않는다.
- 현재 OTW schema는 0101 + 0137/0138. 이미 적용된 0137/0138 SQL은 불변이며 0139는 content-transition 기반 뒤에만 적용한다.
- 유료 AI·키리누키/채널 자동화·별도 계정 이전·R2 사고 복구는 현재 각각의 승인/중지 결정을 따른다.

## Review Focus

- root의 개발 issuer가 production key에 혼입 → 사이트 전용 설정으로 분리하고 빌드 전에 app identity/JWKS/party 검증(Task 1).
- 옛 fixture가 실제 maintenance stop 없이 protect/collector로 진행 → 현재 독립 운영/정각 보존 계약의 owning 흐름으로 교체, 운영 보호 조건은 유지(Task 1).
- 기존 관리자를 막거나 일반 회원에게 공개 전 콘텐츠 노출 → 서명된 JWT의 정상 Worker HTTP에서 두 역할을 구분(Task 2).
- 정각 이전 열린 탭/큐 응답이 숨김 이후 자료를 되살림 → Query 폐기 순서와 최종 저장 rollback 회귀 유지(Task 2).
- 양 사이트 schema/소스가 다른데 전체 dirty tree 배포 → 호환성·선택 artifact·실제 readback 없으면 배포 완료로 판정하지 않음(Task 3).

## Task 1: 기존 두 검증 차단 해결

**Files:** `worker/features/content-transition/infrastructure/d1-transition.integration.test.ts`; ignored `config/sites/otw/.env.production.local`; `docs/reports/sul-36/2026-10-15-publication-cutover-execution.md`.

**Interfaces:** 기존 `loadSiteEnvironment(siteId, 'production')`, `assertClerkDeploymentConfig(environment, origin)`, `D1TransitionRepository.beginMaintenance(id, now, peer)`, `stopMaintenance(id, now)`, `protect(id, receipt)`를 그대로 사용한다.

- [x] OTW build identity mismatch와 두 collector의 `Protection requires the verified final maintenance stop`를 실제 명령으로 재현하고 로그 보존.
- [x] root 개발 환경을 수정하지 않고 사이트 production override에 기존 production key와 동일 app의 issuer/JWKS, 정확한 public origin party를 설정. 비밀 출력 금지.
- [x] 두 obsolete 시험을 독립 운영의 전체 후보/전역 휴방 batch와 정각 이후 대상 raw 보존으로 교체. 원본·감사 assertion은 유지하고 새 정상 운영이 지속 이관 platform을 요구하지 않게 함.
- [x] `vitest run --config vitest.worker.config.ts worker/features/content-transition/infrastructure/d1-transition.integration.test.ts -t "standalone collector preserves|timed OTW cutoff keeps global holiday"`: 2/2 PASS. 추가한 기존 maintenance 시험은 reconcile outbox 준비가 빠져 별도 FAIL이며 작업 목록 LEGACY-TESTS에 보존한다. 3/3 PASS로 보고하지 않음.
- [x] `node scripts/build-site.mjs --site=otw`, `--site=luvdia`: 모두 정상 artifact 생성. 기본 659KB console chunk 경고는 별도 성능 항목으로 기록하며 인증 검사를 우회하지 않음.

## Task 2: 공개 경계의 최종 변경 범위 확인

**Files:** 기존 [공개 계획 Task 1·2](2026-10-15-site-publication-cutover.md)의 소유 경로; 실제 통합 사례는 `worker/app/archive-access.integration.test.ts`, 열린 탭은 `src/app/providers/site-publication-boundary.test.tsx`에 있다. 계획의 가상 신규 test 파일을 중복 생성하지 않는다.

**Interfaces:** `getSitePublication(siteId, nowMs, hold)`, `getHiddenMemberCodes(siteId, nowMs)`, `readSitePublicationAccess(request, env)` 및 기존 capability 공개 포트를 유지한다.

- [x] 현재 실패/변경 범위에 해당하는 contracts·countdown·boundary·navigation·Worker gate 시험과 Workerd archive/cutoff 시험 실행. T−1ms/T, hold, encoded URL/HEAD, 일반 회원/관리자, 공유 파일/playlist와 late X/Cafe/YouTube 저장을 확인.
- [x] X repair에 필수 siteId를 전달하고 100개 materialized 후보 이후 숨김을 판정. 선택 후 T를 넘기면 최종 fact/ref 쓰기·ack가 거부되고, 숨긴 미완료는 pending 유지/checked_at 회전. hydration의 현재 출처·lease·scope와 cache/원문/참조의 최종 commit을 검사하며 실제 commit 없는 terminal/author 성공 카운터를 금지. `archive-access.integration.test.ts`와 `x-scan-cost.integration.test.ts`의 실제 race/512 hidden+eligible tail/cost 회귀로 확인.
- [x] `D1MemberPostsPort.fetchXPosts`→`xPostFeedService.fetchPosts`에 siteId를 전달. 정각 이후 정상 LuvDia `/api/member-posts?sources=x`는 대상 X 내용을 유지하고 OTW에서는 숨겨야 한다. fixture도 명시적 SITE_ID를 사용한다.
- [x] scoped lint, `pnpm typecheck:test`, `pnpm architecture:check`. 이미 같은 입력으로 PASS한 증거는 재사용하고 바뀐 입력의 검증만 갱신한다.
- [x] 기존 실제 로컬 countdown 브라우저 증거와 이번 build/HTTP 검증을 보고서에 연결. production Clerk의 localhost 로그인 제한을 실제 운영 관리자 로그인 성공으로 표현하지 않는다.
- [x] 완성 변경을 baseline과 비교해 독립 검토. 파일별 기존 WIP를 보존하고 근거 없이 일괄 commit/stage하지 않음.

## Task 3: 공개 배포 호환성과 운영 완료

**Files:** `wrangler.jsonc`, `wrangler.luvdia.jsonc`, `scripts/{site-target,site-resources,site-build-manifest,deploy-workers}.mjs`, schema/migrations 및 기존 [공개 Task 3](2026-10-15-site-publication-cutover.md), [공통 배포 Task 1](2026-10-15-shared-release-architecture.md).

**Interfaces:** 검토 소스 identity→사이트별 artifact/config/migration 목록→실제 Worker 버전의 매핑. 기존 0137/0138의 파일명/bytes와 로컬로 증명한 migration 순서를 보존한다.

- [ ] 양 사이트 운영 소스·schema의 최신 최소 메타데이터와 로컬 선택 변경을 대조하고, 공개 구현의 필수 migration/데이터 관계 의존을 명시.
- [ ] 필수 경로를 로컬 리허설하고 rows_read/쓰기 예상량·rollback 호환성을 기록. 대량 이관/검증과 묶어서 실행하지 않음. 안전한 격리가 불가능하면 필요한 구체적 변경과 남은 제한을 보고한다.
- [ ] 검토 완료 artifact에 release-ops 적용. 승인된 배포 경로·정상 도메인 countdown·현재 관리자 작업·OTW 사전 정상 상태와 버전 readback이 모두 있어야 배포 완료. 단순 build PASS는 완료 아님.
- [ ] 19일 실제 경계의 정상 공개/직접 링크 차단/관리자 보관/다른 멤버 동작을 확인. 관측 예약이 정책 실행을 대신하지 않음.

## Task 4: D1 보류·후속 작업 인계

**Files:** [작업 목록](../../../reports/sul-36/2026-10-16-work-register.md), 기존 [성능·운영 계획](2026-10-15-site-performance-operations.md), [공통 배포·구조 계획](2026-10-15-shared-release-architecture.md), `docs/development-status.md`.

**Interfaces:** 작업 ID마다 현재 상태, 소유 계획/코드, 원격 비용, 재개 조건, 실제 완료 근거를 갖는다. 제품 정책은 기존 소유 문서에서 유지한다.

- [x] D1-80% 보수 정책과 이후 실제 read-limit 사고·복구·X 개선을 대조해 오래된 완료/미완료 표기를 시점별로 정리.
- [x] 프로필, 계정 합산 guard/고비용 validator, R2, 자연 예약·Queue·AI, 소스 parity/CI, 과거 데이터 차이, 구조·구형 fixture 정리와 기존 Play backlog를 목록에 연결.
- [x] 의도적 중지/별도 승인/종료·범위 제외 항목을 표시. Task 4.4 전체와 계정 이전·확장 개발을 공개 선행 조건으로 되살리지 않음.
- [x] 새 문서 상대 링크, 확정 시간/대상, 비밀 미포함과 공백 확인. 이 documentation 단계에는 전체 앱 test/preflight를 추가하지 않는다.

## Self-review

최초 요청의 동일 소스·정리/모듈화·프로필·D1/R2·메뉴·19일 공개/숨김·이전 잔여·Cron/Queue/예약/AI·D1 고비용 후순위가 모두 위 목록에 연결된다. 독립 하위 계획 3개는 유지하며, 이미 한 복구/배포와 다음 정규 실행 증거는 구분한다. 남은 운영 조건을 로컬 PASS로 대체하지 않는다.
