# FxEmbed 혼합 수집 및 웹훅 Disabled 유지 Implementation Plan

> **For agentic workers:** `superpowers:executing-plans`로 작업별 구현·검증하고 체크박스로 기록한다.

**Goal:** FxEmbed를 기본 수집원으로 사용하고 공식 X API가 누락을 보완하며, 기존 웹훅 기능은 재사용 가능한 Disabled 상태로 보존한다.

**Architecture:** 기존 Worker→Workflow→Queue→D1→공개 피드를 사용한다. 같은 X 글 ID로 병합하되 공급자 진행 상태와 공식 완료 커서를 분리한다. 웹훅 시작과 공통 예산 초기화를 분리한다.

**Tech Stack:** Node 24.20.0 이상·25 미만, pnpm 11.7.0, TypeScript, Cloudflare Workers·Workflows·Queues·D1, Drizzle, React·TanStack Query. 의존성 추가 없음.

**Spec:** [혼합 구성 검토](../../research/2026-11-03-x-fxembed-hybrid-review.md), [실제 조회 결과](../../reports/2026-11-03-x-alternative-live-test.md), 사용자 승인 조건.

## Global Constraints

- FxEmbed 30분, 공식 X 24시간. 계정별 Fx 공급자 실패 연속 2회이면 공식 2시간 임시 수집, 조회·저장 성공 연속 2회이면 복귀.
- 공식 확인 본문·첨부·관계는 Fx 응답으로 덮어쓰지 않는다. 불완전 응답은 정상 필드를 지우지 않는다.
- 공통 UTC 하루 $1 목표, 사이트 예산·자동충전·D1·Queue 보호를 유지하며 장애 전환도 우회하지 않는다.
- 웹훅 코드·인증·CRC·secret·원격 endpoint·관리 화면·이력·재활성화 기능을 보존한다. 혼합 구성에서는 소유 유료 구독을 중단하고 자동 재등록하지 않는다.
- 공개 범위·동적 멤버 허용 목록·보관·삭제/redaction·Play/AI 중지를 유지한다.
- 배포/migration만으로 상태를 변경하지 않는다. 운영 전환은 승인된 릴리스에서 관리자 정상 경로로 OTW→LuvDia 순으로 한다.

## Review Focus

1. 비정렬·중복·다른 작성자 문맥이 섞인 Fx 응답에서 대상 글만 저장되는가.
2. 동시 수집·재시도로 공식 정보가 사라지거나 숨긴 글이 복원되지 않는가.
3. Fx 저장·초기화가 공식 완료 커서·24시간 주기를 앞당기지 않는가.
4. 장애 전환·복귀가 계정별이며 예산 소진·미완료 페이지를 보존하는가.
5. Disabled 이후 재구독·새 유료 보강이 없고 재활성화 기능이 남는가.

## Task 1: 출처별 안전한 저장과 진행 상태

**Files:** `db/schema/index.ts`, `worker/features/x-posts/infrastructure/x-api.ts`, `x-activity-site.ts`, 새 `domain/merge-x-post.ts`, `infrastructure/x-post-merge.integration.test.ts`, Drizzle SQL·metadata.

**Interfaces:** 저장에 origin `fxembed | x_api | webhook`과 text/media/relations 완전성. `mergeStoredXPost(existing,incoming,context)`는 내용·필드별 출처·변경 여부. `x_posts` 출처·확인·해시·revision, 기존 행은 공식 데이터. `x_post_sources`는 공식 커서 전용이며 `last_completed_at`은 최종 페이지 저장 성공만 갱신. 새 `x_fx_sources`에 계정별 cursor·성공·완료·연속 실패/성공·fallback.

**Rules:** 공식>웹훅>Fx. 동일 Fx 재수신·지표만 변경은 posts/facts/references 쓰기 없음. 숨김·삭제·공개 제한 우선. revision CAS, 해결 못한 충돌은 실패·커서 보존.

- [x] RED: 공식 text/media/reply 보존, 동일 재수신 postWrites=0, hiddenAt 보존, 경합 회귀.
- [x] 구현: additive schema·실제 두 호출부 origin 연결.
- [x] GREEN: 관련 단위·D1 통합, `pnpm typecheck:test`, migration 전체 체인.
- [x] 커밋: `feat(x): preserve source authority when merging posts`.

## Task 2: FxEmbed 수집기와 정상 저장 연결

**Files:** 새 `infrastructure/fx-api.ts`, `fx-collection.ts`, 단위·D1 테스트, 기존 `x-collection.ts`, feature `index.ts`.

**Interfaces:** `fetchFxTimelinePage(handle,cursor)`→posts/nextCursor/rawCount. `runFxCollectionForHandles(env,handles,source,scheduledFor)`→기존 결과+provider=fxembed·pendingSources.

**Rules:** 고정 Fx 호스트, X 자격증명 미전달. 신뢰 계정 ID와 설정 handle 대조, 다른 작성자·리포스트 제외, gif→animated_gif. HTTP·payload code·구조·ID·날짜·미디어 검증. 404/빈 목록으로 삭제하지 않는다. 매 실행 head 확인 후 저장 cursor 재개, 계정당 최대 4페이지. 오래된 ID로 중단하지 않는다. 반복 cursor 실패·미완료 보존. 확인 성공과 전체 완료 별도. 기존 계정 lease·저장 경로 재사용. 활성화 이전 일반 백필 없음.

- [x] RED: 대상 작성자·중복 제거, 공식 cursor 불변, 저장 실패 시 durable cursor 유지.
- [x] 구현: 파싱·페이지·재시작·정규화·저장.
- [x] GREEN: 비정렬·중복·잘못된 응답·저장 실패·반복 cursor 단위/D1.
- [x] 커밋: `feat(x): collect FxEmbed posts through existing persistence`.

## Task 3: 30분 수집·24시간 보강·장애 시 2시간 전환

**Files:** scheduled-job-planner/executor, contracts/scheduled-operations, platform/scheduled-jobs/x-collection-run-read-model, planner/executor/cadence/native Workflow 테스트.

**Interfaces:** 기존 x_collection job. continuation provider와 scope=regular|pending|fallback. provider 없는 이전 작업은 x_api. 23·53분 점검에서 독립 판단. 공식 cursor로 Fx 저장 글도 확인. Fx·공식 pending·fallback은 전체24h 기준점 불변. 공식 정기 item 완료만 정기 완료 기록.

**Rules:** 공급자 실패 2회(timeout/network/429/5xx/404/invalid payload)만 fallback. D1/예산/사용자 중지/lease는 제외. 공식 전체 완료 이후2h, pending 우선. Fx 조회+저장2회 성공 복귀, 공식 cursor 보존. 예산/backoff 준수, 웹훅 자동 시작 없음.

- [x] RED: 계정별 2실패/2성공, 공식 regular anchor 불변, 예산 차단 cursor 보존.
- [x] 구현: 공급자 계획·실행·최종화.
- [x] GREEN: Cron→native Workflow→Queue→D1 저장/최종화.
- [x] 커밋: `feat(x): schedule hybrid collection with bounded API fallback`.

## Task 4: 웹훅 Disabled 보존과 관리자 제어

**Files:** x-activity-coordinator/site, worker/app/x-rpc.ts/routes.ts, frontend x-activity-manager/member-post-settings, 새 contracts/x-collection와 기능 소유 application/HTTP adapter·테스트.

**Interfaces:** 관리자 GET `/api/x/collection`은 primary·공급자 성공/미완료/실패·계정 fallback·공식 완료/다음 자격. PATCH `{primarySource:fxembed|x_api}`. 기존 수동 endpoint optional provider, 생략은 기존 공식, scope=pending 보존. 공개 DTO/D1 전용 유지, 공개 freshness만 공급자별 성공 반영.

**Switch:** 공통 예산 bootstrap 먼저(실패 시 유료 호출 차단), 사이트 Disabled 저장+소유 원격 구독 중지, 원격 부재 확인 후 primaryFx 저장. 실패는 명시, 자동 재활성화 없음. endpoint/CRC/secret/history 유지. 대기 이벤트는 명시 이유로 제외·새 유료 보강 없음, 이미 in-flight 비용·멱등 정산 유지. 혼합 중 start/resume409. x_api 복귀 후 기존 명시 확인으로 재활성화. default=x_api.

**UI:** Fx 기본·공식 보강·웹훅 Disabled 별도. Fx 성공이 공식 실패/예산 이월을 감추지 않는다. 조회는 기존 상태/원장 읽기, 관측 쓰기 없음. 권한·사이트·감사 유지.

- [x] RED: owned subscriptions0, 자동등록0, start409, history 보존, REST bootstrap 독립.
- [x] 구현: 제어 API/RPC/UI/감사.
- [x] GREEN: 권한·타사이트 구독 보존·중지 실패·수동 재활성화.
- [x] 커밋: `feat(x): retain disabled webhooks and expose hybrid controls`.

## Task 5: 실제 경로 검증과 운영 전환

- [ ] 로컬 관리자→수집원 변경→정상 작업→실제Fx→D1→공개 카드. SQL 주입/샘플로 대체하지 않는다.
- [ ] 공식 타임라인이 Fx 미발견을 독립 발견·중복 카드 없이 추가. 알려진 ID lookup과 구분.
- [ ] 장애/복귀·경합·UTC 예산 이월·Disabled·기존 글/커서 보존.
- [ ] Node24 관련 Vitest, typecheck:test, architecture:check, 변경 lint, 양 사이트 build, migration 체인·D1 doctor. preflight는 최종 병합 준비에서만.
- [ ] 승인된 릴리스에서 OTW→LuvDia 관리자 전환, 각 원격 소유 구독0/Disabled/실제Worker·D1·공개 readback 후 다음 사이트.
- [ ] 정상 주기/기존 원장 관측. 추가 강제 유료 실험·자동 증액 없음.
- [ ] rollback primary=x_api, webhookDisabled 유지, 필요 시만 수동 재활성화. 데이터/커서/원장 rollback 없음.
- [ ] 결과·한계 current-work/해당 PR 기록, 명시 파일만 stage.

**완료 기준:** 양 사이트 정상 공개 경로 및 공식 독립 복구·계정 fallback·병합·Disabled를 authoritative readback으로 확인한다. 구현/로컬 검증과 조건부 운영 전환을 구분한다. 절감은 원장과 실제 청구를 구분하며 고정 절감률·무누락을 주장하지 않는다.
