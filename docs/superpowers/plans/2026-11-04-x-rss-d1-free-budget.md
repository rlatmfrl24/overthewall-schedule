# RSS 혼합 보완 Queue D1 50회 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development, test-driven-development and task/final review. Checkboxes record local execution only.

**Goal:** RSS·혼합 보완 Queue의 정상 처리량과 안전장치를 유지하면서 한 invocation의 D1 binding 실행을50회 이하로 제한한다.

**Architecture:** 기존 Cron→native Workflow→Queue→RSS application→공통 writer→D1를 유지한다. 후보마다 snapshot과 원자적 root/CAS·파생·hash 저장, 원자적 item/source checkpoint를 완료한 뒤 다음 조회로 진행한다. 유료 보완은 기존 gateway·예약·receipt·정산을 사용하며 별도 RPC invocation의 호출도 따로 계측한다.

**Tech Stack:** Node>=24.20.0<25, pnpm11.7.0, TypeScript, Cloudflare D1/Workers/Queues/Workflows. 의존성·schema·Queue 설정 추가 없음.

**Spec:** 2026-11-04 사용자 지시와 명시적 범위 선택 **RSS·혼합 보완 Queue 전체(기존82/117회 지적)**, [기존 설계](../specs/2026-11-03-x-free-first-collection-design.md), [기존 결과](../../reports/2026-11-04-x-free-first-code-review.md). 시작 HEAD `f7821515a199a7d3a46b04ac4db4a8d009fab444`.

## Global Constraints

- 무료 lookup 최대5·후보100·2회 실패 후 공식 보완·기존 공식 batch 크기를 유지한다. 다음 후보 조회 전에 현재 후보의 성공/실패/제외와 진도를 내구 저장한다. 메모리로5개를 모은 뒤 저장하는 구조로 바꾸지 않는다.
- 공통 merge의 공식/웹훅/Fx 권위·불완전 응답 보존·hidden/removal/archive·현재 publication/member/identity·item/source lease·정책/유한 activation 검증을 유지한다. snapshot은 mutation 권한을 대신하지 않는다.
- root CAS 성공을 SQL에서 직접 확인하고 그 transaction의 정확한 revision/value에 파생 쓰기와 hash를 묶는다. 경쟁자가 같은 값을 썼다는 이유로 자신이 INSERT했다고 보고하지 않는다.
- 새 transaction이 실패하면 전체 rollback할 수 있다. 기존 hash-NULL 부분 행의 복구와 진짜 commit의 INSERT evidence는 보존한다. 실패/미완료를 성공으로 정규화하지 않는다.
- 후보 및 페이지 진행·공식 독립 커서·정기 완료 의미·예산·UTC 정산·receipt/site isolation·Disabled 웹훅·보관·Play/AI 중지를 유지한다.
- 실제 D1 binding method를 센다. batch는1회이며 SQL/rows_read/rows_written도 별도 보고한다. 51번째 DB 실행 전에 실패하는 검증 cap을 적용하며 cap에 걸려 정상 처리량을 줄인 테스트는 PASS가 아니다.
- 지원되는 정상 RSS/mixed 입력은 끝까지 처리한다. 지속 CAS 경합은50회 안에서 기존 pending/실패로 반환할 수 있으나 cleanup/정산/최종화 여유를 보존한다. 필요하면 관측 쓰기 없는 작은 invocation-local counter만 사용한다.
- 새 Worker·Queue·서비스 이동·강제 유료 플랜·추가 cadence·후보 처리량 축소로 한도를 맞추지 않는다. shared writer 소비자의 기존 기능 회귀는 검증하되 수동 JSON/별도 인용 보강 전체를50회로 재설계하는 일은 이번 범위 밖이다.
- 배포·운영 전환·유료 실 API 호출·원격 mutation·push/PR/merge는 계속 보류한다. 테스트 HTTP는 기존 fixture를 사용하고 실제 app DB를 seed/reset하지 않는다.

## Review Focus

1. snapshot과 batch 사이 stop·member/identity 변경·redaction·같은 값의 CAS winner가 생겨도 false ACK·미리보기 복원이 없는가.
2. 파생 쓰기/체크포인트 실패와 재시도에서 hash·후보·INSERT evidence·비용이 정확한가.
3. 무료5개+공식 후보의 mixed 실행,99개 상한·부분 응답·자정/cache replay도 Queue 전체50회 이내인가.
4. finalize·retry·outbox dispatch·RPC receiver를 누락하거나 cap에 걸린 partial을 정상 성공으로 취급하지 않는가.
5. 공통 writer의 JSON·공식 타임라인·웹훅 소비자와 사실/참조 보관 정책이 같은 의미를 유지하는가.

### Task 1: 공통 원자적 저장기

**Files:** `worker/features/x-posts/infrastructure/x-api.ts`, `x-history.ts`, `x-reply-reference.ts`, `x-reference-store.ts`; 필요시 같은 directory의 `x-post-writer.ts`로 실제 저장 책임만 추출. 기존 `x-post-merge.integration.test.ts`, `fx-collection.integration.test.ts`, RSS 저장·webhook·cache/reply consumer tests.

**Interface:** `writeStoredPosts(db,handle,user,posts,fetchedAt,siteId,context,rssFence?)`와 `{ok,count,insertedIds,error}`를 유지한다. production writer에 batch를 요구하고 per-statement fallback을 만들지 않는다. pure application/ports에 D1 타입을 넣지 않는다.

- [x] **RED:** 관계 있는 단일 후보와 bulk roots가 snapshot+atomic write의2회 정상 경로로 저장되지 않는 회귀를 기존 실제 D1 fixture에 추가하고 실패를 확인한다. 공통 병합/권위/중복/NULL hash·실제 INSERT 증거도 함께 확인한다.
- [x] **구현:** 기존 root와 incoming 양쪽에서 관계 target/user IDs를 snapshot으로 읽고 동일 merge를 실행한다. root CAS 직후 SQL assertion, 현재 target 보호, facts/references, 정확한 최종 value hash를 순서 있는 원자 batch로 저장한다. 조회 후 권한/대상 변경은 재조회 또는 실패로 처리한다. 실패한 batch의 INSERT는 집계하지 않는다.
- [x] **GREEN:** 관계·analytics on/off·동시 winner/loser·부분 행 복구·모든 파생 실패·중지/가시성·기존 실제 writer 소비자를 검증한다. 바뀐 transaction 경계를 반영한 fault injection만 수정하며 안전성 assert를 약화하지 않는다. 타입·변경 lint·구조를 통과한다.
- [x] **커밋:** own source/test만 명시 staging, `perf(x): commit posts and derived state in atomic batches`.

### Task 2: RSS 전체 Queue 예산·체크포인트·공식 보완

**Files:** `worker/features/x-posts/infrastructure/d1-fx-rss-collection.ts`, `x-rss-official-hydration.ts`, `x-api.ts`의 resource accounting·필요한 `x-shared-budget.ts`; `worker/app/x-rss-collection.ts`, `worker-queue.ts`, `scheduled-queue.ts`, `x-gateway.ts`, `worker/features/scheduled-operations/infrastructure/scheduled-job-coordinator.ts`, `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts`, `worker/test-support/d1-meter.ts`와 해당 tests. fixed tail이 필요할 때만 공통 platform 호출을 batch한다.

**Interface:** pure `store(post)`·`checkpoint(state,stats)`와 공개 DTO는 유지한다. repository의 실제 item CAS와 source ACK는 기존 composition에서 한 batch로 연결하며 item-memory는 commit 후에만 갱신한다. 기존 gateway invocation 경계는 바꾸지 않는다.

- [x] **RED:** 기존 real Queue handler profile에서 hard50 cap과 실제5개 저장·facts/reference/hash·ACK를 assert해82/117 baseline 실패를 확인한다. meter가 failed calls·session/exec 우회를 놓치지 않게 한다.
- [x] **구현:** fresh context를 writer snapshot과 합치고, item/source checkpoint를 원자화한다. 원래 요청 ID·batch·UTC·receipt·원자 admission은 그대로 두고 independent prepare reads와 resource/event accounting을 batch한다. whole Queue의 claim→execute→complete→dispatch/reconcile→finalizer→ACK 비용까지 줄인다.
- [x] **GREEN:** plain/서로 다른 reply+quote targets·facts on/off·100후보중5처리·95pending·no-op·NULL hash repair·5실패/제외·mixed free+official·최대 budget-admissible batch·부분/자정/cache·CAS/lease/stop·outbox 및 실패 cleanup 전체를 cap하에서 검증한다. separate RPC receiver도50 이하인지 별도로 측정하고 원본 DB로 빠지는 경로를 금지한다.
- [x] **커밋:** own files만 `perf(x): bound RSS Queue D1 calls without reducing throughput`.

### Task 3: 최종 로컬 검증·두 축 재리뷰·결과

**Files:** [current work](../../current-work.md), 기존 결과 보고서와 새 `docs/reports/2026-11-04-x-rss-d1-free-budget.md`, 필요한 위 기존 native/cap regressions.

- [x] 정상 Cron→native Workflow→Queue의 실제 D1 저장/readback과50 cap을 검증한다. HTTP fixture·runtime 원본·실제 무료 과거 관측을 구분하고 유료/운영 성공을 주장하지 않는다.
- [x] Node24에서 영향 consumer·전체 `pnpm test`(공통 writer/platform 영향)·typecheck:test·architecture:check·변경 lint·양 사이트 build를 최종 source에서 확인한다. schema 입력이 같으면 기존164 migration/doctor 근거를 재사용하고 preflight는 보류한다.
- [x] 구현자와 독립된 Standards/Spec reviewer가 새 diff와 정상/경합/정산/readback을 각각 검토하고 수정 재검토한다. 원래 무료 우선 전체 기준 `a6b94631`, 이번 수정 기준 `f7821515`를 구분한다.
- [x] 실제 whole Queue 전후 binding/SQL/read/write·정상 처리량·남은 한계를 보고한다. 사용자 app DB의 baseline748개·공식 커서·과거 원장은 read-only 재확인한다. 문서와 own files만 로컬 commit, branch/worktree 유지·외부 보류 유지.
