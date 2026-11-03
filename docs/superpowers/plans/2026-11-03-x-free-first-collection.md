# JSON 기본·RSS 보완·공식 X 누락 복구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JSON 기본·저빈도 RSS로 공개 피드를 확보하고 공식 X가 독립 복구하며, 기본 Disabled 웹훅을 관리자가 필요시 활성화할 수 있게 한다.

**Architecture:** 기존 Cron→Worker→native Workflow→Queue→기능 소유 use case→출처 병합→D1→공개 피드를 유지한다. RSS는 후보 ID만 전달하고 검증된 JSON/공식 응답만 저장한다. 계정별 공식 진행·RSS 후보 checkpoint·웹훅 desired 상태를 분리하고 관리자 정상 경로가 새 정책을 활성화한다.

**Tech Stack:** Node.js >=24.20.0 <25, pnpm 11.7.0, TypeScript, Cloudflare Workers/Workflows/Queues/D1, Drizzle, React/TanStack Query. 승인 대상 직접 의존성 하나: `@rgrove/parse-xml@5.1.0`.

**Spec:** [상세 설계](../specs/2026-11-03-x-free-first-collection-design.md), [8명 실측](../../reports/2026-11-03-rss-json-comparison.md), [공식 복구·과금 조사](../../research/2026-11-03-x-free-first-recovery-options.md).

## Global Constraints

- 2026-11-03 사용자 승인: **Subagent-driven 구현·로컬 검증**, 필요한 로컬 설치·additive migration 생성/검증·범위별 로컬 커밋을 진행한다. **배포·운영 전환·실제 유료 API 호출·원격 DB/구독/설정 변경·push/PR/merge는 계속 보류**한다.
- 사용자가 선택·승인한 계획값은 JSON 기본 + RSS 저빈도 보완, **JSON 30분·RSS 6시간·공식 정기 12시간**, XML 파서 직접 의존성 1개 예외다. 구현/로컬 활성화 검증이 실제 운영 주기 변경을 승인한 것은 아니다.
- 복구 허용 지연은 **24시간 이내**다. 예산/upstream/지연 노출 때문에 초과하면 미충족으로 기록한다. 점검 경과와 실제 새 글 복구 지연을 구분한다.
- 공통 **UTC 하루 $1 목표**, 사이트 보호, 보수적 선예약·멱등 정산·자동충전 설정, D1/Queue guard를 유지한다. 실패 전환·공식 lookup도 우회하지 않는다.
- Fx JSON은 계정당 실행 최대 **4페이지**, 매 실행 head와 기존 pending을 확인한다. 비정렬/unchanged head/오래된 ID로 탐색을 끝내지 않는다.
- RSS는 **6시간**, `count=100&with_replies=true`, timeout **15초**, 압축 해제 본문 **2,000,000 bytes**를 상한으로 한다. DTD/외부 entity/redirect 거절, 후보 최대 **100개**, 계정/실행당 무료 lookup 최대 **5개**, 외부 동시 호출 최대 **2개**다.
- 동시2개는 두 사이트의 정상 수집 경로 기준이다. 기존 background Queue의 site별 `max_batch_size=1/max_concurrency=1`과 item 내부 순차 외부 호출을 유지한다. 별도 분산 semaphore·관측 D1 쓰기를 만들거나 공유 Queue 처리량을 늘리지 않는다.
- 같은 계정의 RSS 후보가 pending이면 새 feed scan을 만들지 않고 **다음 기존 30분 점검**에서 재개한다. 무료 lookup **2회 실패** 뒤의 후보만 공식 보완 대상으로 다룬다.
- Fx JSON 공급자 연속 실패 **2회**→해당 계정 공식 **2시간** fallback, JSON 조회·저장 연속 성공 **2회**→해제. RSS 성공/목록 축소는 이 횟수와 공식 완료 cursor를 바꾸지 않는다.
- 공식 정기 완료 경과 **12시간 due / 18시간 주의 / 24시간 지연**, 초기 정상 운영 **7일 관측**은 제안값이다. 공식/웹훅 비용 추정과 실제 청구를 구분한다.
- 공식 필드→웹훅 필드→Fx JSON 우선순위, 불완전 응답의 기존 정상 필드 보존, CAS/멱등성·숨김/삭제/redaction·공개 범위·보관·멤버 허용 목록을 유지한다. RSS HTML은 저장하지 않는다.
- 수집 활성화 이전 일반 백필·개인 쿠키/twscrape·새 daemon/큐·공개 요청의 upstream 조회·ID 구간 분할 재검사·Play/AI 재개는 추가하지 않는다.
- 기본 `x_api`와 legacy Fx 정책을 배포/migration으로 자동 전환하지 않는다. 기존 공식 cursor·장부·이력·웹훅 endpoint/CRC/secret을 보존한다. 정상 관리자 제어로 OTW→LuvDia 순서 전환한다.
- `.agent`가 canonical이다. API/migration/릴리스 작업 때 해당 repository skill을 적용하며, preflight는 최종 병합 준비에서만 실행한다.

## Review Focus

1. HTTP200 RSS가 짧아지거나 CDATA/다른 작성자/중복을 포함할 때 후보 검증·별도 상태를 유지하고 공식 완료/삭제로 오인하지 않는가. **Task2/3**.
2. 후보 저장 직후 crash·Queue 중복 전달·lease 상실·JSON 동시 저장에도 후보가 유실되거나 숨긴 글이 복원되지 않고, 유료 재호출이 중복 정산되지 않는가. **Task3/4**.
3. 한 계정의 pending/예산/실패가 다른 계정의12시간 자격을 막지 않으며 regular→pending 재개가 올바른 정기 완료로 귀결되는가. **Task1/4/7**.
4. Fx 수집 중 관리자 start/disable/reconcile가 경합하거나 원격 중단이 실패할 때 최신 desired 상태·다른 사이트 구독·endpoint/비용이 보존되는가. **Task5**.
5. 기존 provider/mode 없는 작업, legacy Fx 설정, UTC 이월/관측 GET/정책 rollback에서 자동 활성화·잘못된 무료/정상 표시·숨은 쓰기가 없는가. **Task1/3/6/7**.

---

## 범위 검토·파일 구조·실행 준비

단일 수집 기능의 계획으로 유지한다. 세 수집 경로가 같은 source lease·공식 예산·작업 최종화·관리자 모드에 의존하므로 별도 제품/독립 배포 계획으로 분리하지 않는다. 아래7개 작업은 각자 회귀·검토 가능한 경계다. 기존 구현을 다시 만들거나 현재 브랜치 작업을 master로 병합하지 않는다.

| 작업 | 생성/변경 위치와 책임 |
| --- | --- |
| 1 | `contracts/x-collection.ts`; `db/schema/index.ts`; `worker/features/x-posts/domain/x-collection-policy.ts`(신규); `infrastructure/x-hybrid-policy.ts`, `x-collection.ts`, `x-api.ts`: 계정별12시간·공식 원래 scope·정책 활성화 gate |
| 2 | `package.json`, `pnpm-lock.yaml`; `worker/features/x-posts/infrastructure/fx-rss-api.ts`(신규), `fx-api.ts`: 안전한 XML과 고정 호스트 개별 JSON adapter |
| 3 | `contracts/x-collection.ts`, `contracts/scheduled-operations.ts`; `worker/features/x-posts/application/fx-rss-collection.ts`·`ports/fx-rss-collection.ts`·`infrastructure/d1-fx-rss-collection.ts`(신규); `worker/app/x-rss-collection.ts`(신규); 기존 planner/executor/repository: 내구 후보·재개 |
| 4 | `worker/features/x-posts/infrastructure/x-rss-official-hydration.ts`(신규), 기존 `x-api.ts`/RSS adapter와 composition: 예산 내 공식 후보 보완 |
| 5 | 기존 webhook coordinator/site·`contracts/x-activity.ts`·`worker/app/x-rpc.ts`/`x-activity.ts`: 독립 desired·원격 소유권·정책 적용 |
| 6 | 기존 상태 application/HTTP/RPC·`x-collection-status.ts`·작업 read model·프런트 API/query/model/admin: RSS·계정별 자격·실제 유료 호출·관리자 readback |
| 7 | 기존 Cron/native/Queue 통합 테스트·실제 관리자/공개 경로·보고서: 회귀와 향후 승인된 운영 전환 |

모든 경로는 repository 상대 경로다. 신규 파일은 해당 task에서 테스트와 함께 생성한다. cross-feature 접근은 `worker/features/x-posts/index.ts`를 통하고 application/ports는 Env·D1·Drizzle·platform을 import하지 않는다. infrastructure는 ports를 구현하고 `worker/app`에서 조립한다.

향후 실행 환경은 다음처럼 고정한다. 이 계획 작성 중 실행하지 않는다.

```powershell
$env:PATH="$PWD\.tmp\node24;$env:PATH"
$env:pnpm_config_verify_deps_before_run='false'
node --version  # v24.20.0 이상, v25 미만
pnpm --version  # 11.7.0
```

이 worktree의 node_modules는 원본 checkout과 공유된다. 설치는 **승인된 실행 worktree의 독립 node_modules**에서 수행한다. 기존 junction은 ignored `.tmp` 안으로 링크 자체만 이동해 보존하고 원본 dependency tree는 변경하지 않는다. 다른 `.tmp` 측정 코드·브라우저·DB 파일은 정리/초기화하지 않는다.

### Task 1: 정책 활성화와 계정별 공식 완료·계획

**Files**
- Create: `worker/features/x-posts/domain/x-collection-policy.ts`, `worker/features/x-posts/domain/x-collection-policy.test.ts`, `worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts`
- Modify: `contracts/x-collection.ts`, `db/schema/index.ts`, `worker/features/x-posts/infrastructure/x-hybrid-policy.ts`, `worker/features/x-posts/infrastructure/x-collection.ts`, `worker/features/x-posts/infrastructure/x-api.ts`, `worker/features/x-posts/index.ts`, `vitest.worker.config.ts`
- Test: 기존 `worker/features/x-posts/infrastructure/x-collection.test.ts`, `worker/features/scheduled-operations/infrastructure/scheduled-job-planner.test.ts`
- Generated: Drizzle 생성 SQL·snapshot·`drizzle/meta/_journal.json`. 다음 번호/파일명은 생성기가 정하며 이미 적용된0159–0161을 편집하지 않는다.

**Interfaces**
- `contracts/x-collection.ts`: `XCollectionMode = "timeline" | "rss_candidates"`, `XHybridPolicy = "legacy" | "rss_v1"`; `FX_RSS_INTERVAL_MS=6*3_600_000`, `X_HYBRID_REGULAR_INTERVAL_MS=12*3_600_000`. 기존 공식 기본/legacy24시간 상수와 JSON30분/fallback2시간은 보존한다.
- domain `getOfficialAccountDecision(input: {now:number; activatedAt:number; regularCompletedAt:number|null; completedAt:number|null; pending:boolean; originScope:XCollectionScope|null; fallbackActive:boolean; backoffUntil:number|null}): {scope:XCollectionScope|null; originScope:XCollectionScope; nominalDueAt:number; eligibleAt:number; ageMs:number; health:"due"|"attention"|"overdue"|"waiting"}`. 없음/정기완료12시간/18시간/24시간 경계는 fake clock으로 결정한다.
- `x_post_sources`: additive `sync_origin_scope TEXT NULL`, `sync_origin_started_at INTEGER NULL`. regular로 시작한 범위가 마지막 페이지/필수 파생 저장까지 성공한 뒤에만 regular 완료를 기록한다.
- `x_fx_sources`: nullable `rss_cadence_anchor_at`, `rss_last_attempt_at`, `rss_last_http_success_at`, `rss_last_check_completed_at`, `rss_last_error`, `rss_last_raw_count`, `rss_previous_raw_count`, `rss_last_candidate_count`, `rss_pending_item_id`. timestamps/counts는 INTEGER, error/pointer는 TEXT. 초기 NULL은 성공/완료가 아니다.
- 새 설정 `x_collection_hybrid_policy='rss_v1'`, `x_collection_hybrid_activated_at`은 **Task5 관리자 적용만** 기록한다. 없으면 기존 Fx24시간/JSON 경로를 유지하고 RSS를 계획하지 않는다. migration에 활성화 INSERT를 넣지 않는다.
- `readHybridXCollectionTargets(env,timestamp)`의 기존 호출을 유지하되 rss_v1에서 계정별 scope를 반환한다. `CollectXPostsOptions`에 선택적 `officialSyncOriginScope?:XCollectionScope`를 더하고 `runXCollectionForHandles`의 기존 호출 signature는 유지한다.

- [ ] **Step 1 — RED 작성:** `x-collection-policy.test.ts`의 `does_not_gate_healthy_accounts_on_failed_peer`와 `x-hybrid-policy.integration.test.ts`의 `regular_resume_finishes_original_scope`를 추가한다. regular 시작→페이지 저장→프로세스 재생성→pending 완료, fallback 완료, 새 설정 없는 legacy를 각각 arrange한다.

```ts
expect(healthy.nominalDueAt).toBe(lastRegularCompletedAt + 12 * 3_600_000);
expect(plan.handles).toContain(healthyHandle);
expect(afterRegularResume.regular_completed_at).toBe(afterRegularResume.last_completed_at);
expect(afterFallback.regular_completed_at).toBe(beforeFallback.regular_completed_at);
expect(legacyPlan.some(item => item.mode === "rss_candidates")).toBe(false);
```

- [ ] **Step 2 — 실패 확인:** `pnpm exec vitest run worker/features/x-posts/domain/x-collection-policy.test.ts worker/features/scheduled-operations/infrastructure/scheduled-job-planner.test.ts` 및 `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts`에서 새 경계가 FAIL임을 확인한다.
- [ ] **Step 3 — 구현:** domain 결정과 source 읽기/쓰기를 연결한다. rss_v1에서 site 전체 anchor gate를 제거하고 계정당 한 공식 item/한 페이지의 기존 처리량을 유지한다. 같은 계정 pending→regular→fallback 중 하나만 선택하며 overdue 시각·마지막 시도·handle 순으로 정렬한다. 기존 `sync_origin_scope=NULL` pending은 보수적으로 pending으로 해석하며 과거 완료를 regular로 추정하지 않는다. scope/시작은 첫 공식 범위 시작 때 저장하고 다음 run/재시도에서 재사용한다. 마지막 페이지 이후 파생 저장 실패 시 origin을 남기며 재개가 이미 저장한 페이지를 불필요하게 다시 유료 조회하지 않게 한다. lease/가시성/CAS 확인 뒤 완료를 기록한다. `isHybridRegularCollectionComplete`는 집계 전용이며 계정 자격 gate에서 제거한다. schema 변경 후 `pnpm drizzle:generate`를 실행하고 실제 생성 파일을 기록해 Worker migration fixture에 포함한다.
- [ ] **Step 4 — GREEN/검증:** 위 테스트와 기존 `x-collection.test.ts`, `pnpm typecheck:test`, `pnpm d1:reset:local -- --validate-only`를 통과한다. migration이 source cursor·본문·예산·운영 설정을 갱신하지 않는지 확인한다. regular 빈 페이지/참조 저장 실패/예산 중단에서 완료 시각이 잘못 갱신되지 않는지도 확인한다.
- [ ] **Step 5 — 커밋:** 변경한 명시 파일과 Step3에서 기록한 생성 SQL/snapshot/journal만 스테이징한다. `git commit -m "feat(x): schedule independent account reconciliation"`.

### Task 2: RSS와 개별 무료 JSON adapter

**Files**
- Create: `worker/features/x-posts/infrastructure/fx-rss-api.ts`, `worker/features/x-posts/infrastructure/fx-rss-api.test.ts`, `worker/features/x-posts/infrastructure/fx-rss-api.integration.test.ts`, `worker/features/x-posts/ports/fx-rss-collection.ts`
- Modify: `worker/features/x-posts/infrastructure/fx-api.ts`, `worker/features/x-posts/infrastructure/fx-api.test.ts`, `package.json`, `pnpm-lock.yaml`

**Interfaces**
- `FxRssEntry = {id:string; handle:string; createdAtHint:number}`; `FxRssPage = {entries:FxRssEntry[];rawCount:number}`를 `ports/fx-rss-collection.ts`에서 export하고 adapter와 application이 함께 사용한다.
- `parseFxRssFeed(xml:string,targetHandle:string):FxRssPage`; `fetchFxRssFeed(handle:string):Promise<FxRssPage>`.
- `parseFxStatus(payload:unknown,targetHandle:string,trustedUserId:string,expectedPostId:string):XPostDto`; `fetchFxStatus(postId:string,targetHandle:string,trustedUserId:string):Promise<XPostDto>`. 기존 timeline과 author/media/relations 검증을 공유한다. repost/다른 author는 후보 제외로 구분할 수 있는 typed error를 반환한다.
- 직접 의존성 예외의 구체 후보는 **`@rgrove/parse-xml@5.1.0` exact pin**이다. ISC·의존0·Node>=22.12.0·브라우저ESM을 공식 README/npm metadata로 확인했다. `parseXml`로 tree를 읽고 documentType node를 거절하며 custom entity resolver는 전달하지 않는다. regex로 XML을 파싱하지 않는다. Worker runtime/bundle 동작은 이 task에서 처음 검증한다.

- [ ] **Step 1 — RED 작성:** `rejects_dtd_and_malformed_xml`, `filters_context_and_deduplicates_guid`, `validates_status_identity_and_gif`, `rejects_redirect_and_oversized_stream`를 추가한다. CDATA/namespace 확장/escaped URL, foreign handle, 중복 ID, 100→35항목의 유효200, 100초과 item, 비UTF8/잘못된 날짜, 15초 timeout, 2,000,001 bytes를 포함한다.

```ts
expect(page.entries.map(p => p.id)).toEqual([targetId]);
expect(shortPage.rawCount).toBe(35);
expect(() => parseFxRssFeed(dtdXml, handle)).toThrow();
expect(post.media[0].type).toBe("animated_gif");
expect(() => parseFxStatus(otherAuthorPayload, handle, trustedId, targetId)).toThrow();
```

- [ ] **Step 2 — 실패 확인:** `pnpm exec vitest run worker/features/x-posts/infrastructure/fx-rss-api.test.ts worker/features/x-posts/infrastructure/fx-api.test.ts`에서 새 adapter 미구현 FAIL을 확인한다.
- [ ] **Step 3 — 구현:** 승인된 독립 dependency tree에서만 `pnpm add --save-exact @rgrove/parse-xml@5.1.0`을 수행한다. RSS는 고정 fxtwitter host, status는 고정 api.fxtwitter host `/2/status/{id}`, 기존 UA/자격 증명 없음/manual redirect를 사용한다. RSS body는 stream 누적2,000,000 bytes에서 중단하고 fatal UTF8 decode와 XML root/channel/item을 검증한다. raw100초과는 payload 오류이며 성공으로 잘라내지 않는다. HTTP200/유효XML은 전체 목록 완료가 아니다. numeric ID/target handle/미디어 경계는 현 Fx parser로 모으며 본문·링크를 RSS에서 가져오지 않는다.
- [ ] **Step 4 — GREEN/Worker 확인:** 위 unit, `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/features/x-posts/infrastructure/fx-rss-api.integration.test.ts`, `pnpm typecheck:test`를 통과한다. Workerd에서 실제 parser import/CDATA/DTD 거절을 확인하고 stub test 성공을 실제 운영 HTTP 검증과 구분한다. 직접 의존1개·transitive0개를 lock에서 확인한다.
- [ ] **Step 5 — 커밋:** `git add -- package.json pnpm-lock.yaml worker/features/x-posts/ports/fx-rss-collection.ts worker/features/x-posts/infrastructure/fx-api.ts worker/features/x-posts/infrastructure/fx-api.test.ts worker/features/x-posts/infrastructure/fx-rss-api.ts worker/features/x-posts/infrastructure/fx-rss-api.test.ts worker/features/x-posts/infrastructure/fx-rss-api.integration.test.ts` → `git commit -m "feat(x): validate RSS and free post lookups"`.

### Task 3: 내구 RSS 후보와 정상 Cron/Workflow 재개

**Files**
- Create: `worker/features/x-posts/application/fx-rss-collection.ts`, `worker/features/x-posts/application/fx-rss-collection.test.ts`, `worker/features/x-posts/infrastructure/d1-fx-rss-collection.ts`, `worker/features/x-posts/infrastructure/fx-rss-collection.integration.test.ts`, `worker/app/x-rss-collection.ts`
- Modify: `contracts/x-collection.ts`, `contracts/scheduled-operations.ts`, `worker/features/x-posts/ports/fx-rss-collection.ts`, `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts`, `worker/features/scheduled-operations/infrastructure/scheduled-job-planner.ts`, `worker/features/scheduled-operations/infrastructure/scheduled-job-executor.ts`, `worker/features/x-posts/index.ts`
- Modify: `worker/features/operations/infrastructure/data-retention.ts`, `worker/features/operations/infrastructure/data-retention.test.ts`: 실제 재개 책임이 남은 RSS item/run은 완료된 이력이 아님을 반영한다. 보관 기간 값은 바꾸지 않는다.
- Test: 기존 repository integration·planner/executor tests·`worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts`

**Interfaces**
- `contracts/x-collection.ts`에 `FxRssCandidate={id:string;firstSeenAt:number;createdAtHint:number;attempts:number;nextAttemptAt:number;error:string|null;stage:"free"|"official"}`를 정의한다.
- 같은 파일에 `FxRssContinuation={provider:"fxembed";mode:"rss_candidates";scope:"regular"|"pending";handles:[string];phase:"fetch"|"hydrate";candidates:FxRssCandidate[];nextAttemptAt:number|null}`를 둔다. provider 없는 기존 item은 공식, mode 없는 item은 timeline이다. 불법 mode/100초과 후보/복수 handle의 RSS item은 거절한다.
- application `createFxRssCollection(ports:FxRssCollectionPorts): {run(state:FxRssContinuation):Promise<FxRssStepResult>}`. 결과 타입도 contracts에 둔다: `FxRssStepResult={state:FxRssContinuation;stats:FxRssStats;status:"complete"|"pending"|"blocked";error:string|null;nextAttemptAt:number|null}`. `FxRssStats`의 `rawCount,candidatesFound,resolved,postsReturned,postsStored,pending,freeApiCalls,paidApiCalls,estimatedCostMicros`는 모두 비음수 number다.
- ports에 `now():number`, `readContext(handle:string):Promise<{allowed:boolean;policy:XHybridPolicy;collectionStartedAt:number;trustedUserId:string|null;pendingItemId:string|null}>`, `fetchFeed(handle:string):Promise<FxRssPage>`, `fetchStatus(postId:string,handle:string,trustedUserId:string):Promise<XPostDto>`, `readStoredIds(ids:string[]):Promise<string[]>`, `store(post:XPostDto,origin:"fxembed"|"x_api"):Promise<{ok:boolean;postsStored:number}>`, `checkpoint(state:FxRssContinuation,stats:FxRssStats):Promise<boolean>`를 둔다. Task2의 ports 타입을 재사용하고 application에서 infrastructure를 import하지 않는다. concrete adapter가 기존 lease/guard/CAS를 구현한다. trusted ID가 아직 없으면 기본 JSON의 정상 신원 초기화를 기다리며 추정 작성자 저장/유료 신원 조회를 하지 않는다.
- platform repository에 `checkpointItemContinuation(item:ScheduledJobItemRecord,continuation:Record<string,unknown>,result:unknown):Promise<boolean>`를 추가한다. running item의 유효 lease token/기한으로 continuation/result를 같은 UPDATE에 저장한다. 기존 `completeItem`은 이 continuation을 지우지 않는다.
- `worker/app/x-rss-collection.ts`: `runFxRssCollectionItem(env:Env,item:ScheduledJobItemRecord,state:FxRssContinuation,repository:D1ScheduledJobRepository):Promise<FxRssStepResult>`. composition에서 adapter/clock/feature와 platform checkpoint를 연결한다.

- [ ] **Step 1 — RED 작성:** `does_not_rescan_pending_feed`, `checkpoints_before_first_lookup`, `replays_after_post_commit_without_duplicate_write`, `preserves_candidates_on_lost_checkpoint`, `rss_success_does_not_repair_json_or_official_clock`, retention의 `does_not_prune_referenced_pending_rss_item`을 추가한다. 후보6개·5개 처리 후 restart·동시 JSON 저장·hidden ID·후보1개404·mode rollback/allowlist 변경을 준비한다.

```ts
expect(first.stats.freeApiCalls).toBe(5);
expect(first.state.candidates).toHaveLength(1);
expect(resumedFeedCalls).toBe(0);
expect(afterInterrupted.state.candidates.map(c => c.id)).toContain(unacknowledgedId);
expect(afterReplay.hiddenAt).toBe(before.hiddenAt);
expect(after.officialCursor).toBe(before.officialCursor);
expect(after.jsonFailureCount).toBe(before.jsonFailureCount);
expect(prunedIds).not.toContain(pendingRssItemId);
```

- [ ] **Step 2 — 실패 확인:** `pnpm exec vitest run worker/features/x-posts/application/fx-rss-collection.test.ts worker/features/scheduled-operations/infrastructure/scheduled-job-planner.test.ts worker/features/scheduled-operations/infrastructure/scheduled-job-executor.test.ts worker/features/operations/infrastructure/data-retention.test.ts` 및 Step4와 같은 Worker pool의 새 RSS/repository integration에서 FAIL을 확인한다.
- [ ] **Step 3a — 계약/ports:** 위 Interfaces의 persisted state/결과/ports를 정의한다. application이 infrastructure나 Env를 import하지 않는지 확인한다.
- [ ] **Step 3b — checkpoint:** `checkpointItemContinuation`을 구현해 후보 snapshot을 lookup 전에 기록한다. 거짓 lease/만료/revision 경합에서는 false이며 continuation/result가 함께 이전 값으로 남아야 한다.
- [ ] **Step 3c — 후보 처리:** `createFxRssCollection`에서 before-start/기존 저장(hidden 포함)/foreign을 제외하고 실행당5 lookup까지만 수행한다. 실패 후보는 다음23/53분 점검 자격으로 남기고 성공으로 제거하지 않는다. 저장 후 checkpoint 전 crash는 DB 존재 재확인으로 멱등 재생한다. 후보가 끝날 때만 check 완료이며 RSS 축소는 JSON 장애/공식 anchor와 섞지 않는다.
- [ ] **Step 3d — D1 adapter:** account lease 후 `rss_pending_item_id`를 현 item으로 CAS하고 다른 running item을 추월하지 않는다. source 요약과 실제 postsStored를 반환하며 본문/HTML은 continuation에 넣지 않는다. snapshot checkpoint 실패 시 pointer가 가리키는 후보를 임의 전진시키지 않는다.
- [ ] **Step 3e — planner/executor 조립:** 후보가 남은 terminal partial의 최신 checkpoint를 다음 Cron이 새 item으로 복사하도록 연결한다. 처리 시작 CAS로 pointer를 갱신하고 기존 run idempotency/targetKey로 중복 생성을 막는다. Queue retry는 원래 item checkpoint를 재생한다. composition의 `runFxRssCollectionItem`을 executor가 사용하고 mode/provider 기본값의 호환 해석을 적용한다.
- [ ] **Step 3f — 보관 경계:** 현재 `rss_pending_item_id`의 미완료 item/부모 run을 완료 이력 삭제에서 제외한다. 완료/명시적 취소로 pointer를 해제한 뒤 기존 보관 기간을 적용하며 삭제/redaction 우선순위는 유지한다.
- [ ] **Step 4 — GREEN/정상 dispatch:** 위 tests와 `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/features/x-posts/infrastructure/fx-rss-collection.integration.test.ts worker/platform/scheduled-jobs/d1-scheduled-job-repository.integration.test.ts`, `pnpm exec vitest run --config vitest.all.config.ts --project=worker-workflow worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts`를 통과한다. Cron→Workflow→Queue에서 다음 점검의 별도 run이 남은1개를 처리하는 D1 readback을 확인한다. D1/Queue guard 때 후보/공식 상태 불변, 무료2회 실패 후보가 stage=official/pending으로 보존됨도 확인한다.
- [ ] **Step 5 — 커밋:** Files의 실제 변경과 대응 test만 명시 stage한다. `git commit -m "feat(x): resume durable RSS discovery candidates"`.

### Task 4: 공식 독립 복구와 유료 후보 보완

**Files**
- Create: `worker/features/x-posts/infrastructure/x-rss-official-hydration.ts`, `worker/features/x-posts/infrastructure/x-rss-official-hydration.integration.test.ts`
- Modify: `worker/features/x-posts/ports/fx-rss-collection.ts`, `worker/features/x-posts/application/fx-rss-collection.ts`, `worker/features/x-posts/infrastructure/d1-fx-rss-collection.ts`, `worker/features/x-posts/infrastructure/x-api.ts`, `worker/app/x-rss-collection.ts`, `worker/features/scheduled-operations/infrastructure/scheduled-job-planner.ts`, `worker/features/scheduled-operations/infrastructure/scheduled-job-executor.ts`
- Test: 기존 `x-post-merge.integration.test.ts`, `x-activity.integration.test.ts`, `native-workflow.integration.test.ts`

**Interfaces**
- `OfficialRssHydrationResult={resolvedIds:string[];remaining:FxRssCandidate[];postsReturned:number;postsStored:number;paidApiCalls:number;estimatedCostMicros:number;error:string|null}`를 ports에 둔다. infrastructure의 `hydrateOfficialRssCandidates(env:Env,handle:string,candidates:FxRssCandidate[],source:"manual"|"scheduled"):Promise<OfficialRssHydrationResult>`가 이를 반환한다.
- ports에 `hydrateOfficial(candidates:FxRssCandidate[]):Promise<OfficialRssHydrationResult>`를 추가하고 Task3와 같은 lease에서 adapter가 호출한다. 후보 lookup은 timeline cursor/regular 완료를 갱신하지 않는다.
- 공식 timestamp/권위는 기존 `normalizeXTimelineResponse`/`xTimelineWriteContext`와 lookup의 author_id 검증을 사용한다. `requestXApi<XTweetLookupResponse>`/shared gateway/usage tracker를 재사용하며 별도 HTTP client·예산·정산 경로를 만들지 않는다. 기존 `writeStoredPosts` 결과에 실제 INSERT로 확정한 `insertedIds:string[]`를 더해 갱신/경합을 신규 발견으로 세지 않는다.

- [ ] **Step 1 — RED 작성:** `official_timeline_discovers_unknown_free_id`, `known_lookup_is_not_timeline_completion`, `free_replay_preserves_official_fields`, `utc_budget_block_keeps_pending`, `reuses_success_after_checkpoint_crash`, `budget_blocked_candidate_plan_creates_no_item`을 추가한다.

```ts
expect(new Set(freeDiscoveredIds).has(officialOnlyPost.id)).toBe(false);
expect(afterOfficialThenFx.text).toBe(officialPost.text);
expect(afterKnownLookup.regular_completed_at).toBe(beforeKnownLookup.regular_completed_at);
expect(blocked.remaining.map(c => c.id)).toEqual(beforeCandidates.map(c => c.id));
expect(duplicateSettlementCount).toBe(1);
expect(secondAttemptPaidDispatches).toBe(0);
```

- [ ] **Step 2 — 실패 확인:** `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/features/x-posts/infrastructure/x-rss-official-hydration.integration.test.ts worker/features/x-posts/infrastructure/x-post-merge.integration.test.ts`와 `pnpm exec vitest run --config vitest.all.config.ts --project=worker-workflow worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts`에서 연결되지 않은 동작의 FAIL을 확인한다.
- [ ] **Step 3 — 구현:** 무료2회 실패한 stage=official 후보는 독립 timeline으로 충족됐는지 먼저 확인한다. `last_completed_at >= firstSeenAt`의 공식 범위 완료 증거가 있는 후보만 부족 ID lookup으로 진행하고, 미완료 timeline은 기존 pending을 우선한다. 저장 ID/성공 응답 cache를 재확인하고 잔여 예산에 맞춰100보다 작은 batch를 구성한다. author_id/실제 생성 시각/공개/활성 경계를 검증해 `origin=x_api`로 저장한다. 미해결/예산/404는 기존 분류·redaction 규칙으로 남기고 무료 최신 ID로 공식 cursor를 올리지 않는다. 후보 우선 시각은 `min(firstSeenAt+24h,createdAtHint+24h)`지만 hint로 실제 지연을 확정하지 않는다. Task1과 같은 계정의 유료 작업을 같은 점검에 중복 생성하지 않는다. UTC 성공 응답 재사용으로 선예약을 축소하지 않으며 `paidApiCalls`/실제 추가 저장/추정 비용을 result에 남긴다.
- [ ] **Step 3a — 차단 시 계획 억제:** 남은 후보가 전부 공식 대기이고 공통/사이트 예산·backoff로 실행 불가이면 RSS 후보 item/run을 새로 만들지 않는다. 무료 후보가 섞였으면 무료 처리만 계획한다. 실제 admission은 실행 직전에도 재확인하고 차단 이유는 기존 상태/원장의 읽기로 노출한다. 차단 관측만을 위한 job/source 쓰기를 추가하지 않는다.
- [ ] **Step 4 — GREEN:** 위 테스트와 정상 비용/lease/hidden 회귀를 통과한다. UTC 경계 전후에 공통/사이트 어느 예산이 부족해도 pending·ledger 보존, 새 dispatch0, 이미 발생한 비용 보존을 확인한다. 공식만의 신규 INSERT에 대해 job result에 `{id,createdAt,storedAt}`를 남겨24시간 초과를 판정한다. 실제 유료 API 실험은 하지 않는다.
- [ ] **Step 5 — 커밋:** 이 task의 변경/회귀 파일만 stage한다. `git commit -m "feat(x): repair unresolved candidates within shared budgets"`.

### Task 5: 관리자 정책 적용·수동 웹훅 활성화·경합 보호

**Files**
- Modify: `worker/features/x-posts/infrastructure/x-activity-coordinator.ts`, `worker/features/x-posts/infrastructure/x-activity-site.ts`, `worker/features/x-posts/infrastructure/x-activity.integration.test.ts`, `contracts/x-activity.ts`, `worker/app/x-rpc.ts`, `worker/app/x-activity.ts`, `db/schema/index.ts`, `vitest.worker.config.ts`
- Generated: 추가 Drizzle SQL/snapshot/journal. Task1과 같은 절차로 생성/검증하고 기존 migration은 변경하지 않는다.

**Interfaces**
- `D1XActivityCoordinator.setPrimarySource(site,source)`/`start(site)`/`stop(site)`, `XActivitySitePort.setPrimarySource(source)`/`setWebhookDisabled(disabled)`의 기존 signature를 유지한다. site의 `enabled`와 local `x_webhook_disabled`를 기존 desired 표현으로 쓰고 세 번째 충돌 스위치를 늘리지 않는다.
- `setPrimarySource("fxembed")` 정상 readback 마지막에 Task1의 policy/activatedAt을 local settings에 저장한다. 이미 Fx인 미적용 상태도 같은 PATCH로 적용하며 명시적 Enabled 웹훅을 다시 끄지 않는다. `XActivitySiteSnapshot`은 `hybridPolicy?:XHybridPolicy`를 반환한다.
- `x_activity_coordinator`에 nullable `lease_token TEXT`를 추가하고 기존 control/reconcile lease에 UUID token fence를 적용한다. local process mutex로 RPC/다른 isolate를 직렬화했다고 간주하지 않는다.

- [ ] **Step 1 — RED 작성:** `allows_manual_webhook_with_fx_primary`, `idempotent_policy_apply_preserves_explicit_enable`, `disabled_never_resubscribes_after_utc_reset`, `stale_reconcile_cannot_override_disable`, `failed_remote_stop_cannot_activate_policy`, `old_peer_cannot_report_policy_applied`와 다른 site 공유 UID/소유 tag 불일치/endpoint 보존 회귀를 추가한다.

```ts
expect(startWithFx.status).toBe(200);
expect(afterRepeatApply.webhookDesired).toBe(true);
expect(afterDisableAndReset.createSubscriptionCalls).toBe(0);
expect(staleOwnerStateWriteCount).toBe(0);
expect(remoteStopFailed.hybridPolicy).not.toBe("rss_v1");
expect(otherSiteSubscription).toEqual(beforeOtherSiteSubscription);
expect(deleteWebhookEndpointCalls).toBe(0);
```

- [ ] **Step 2 — 실패 확인:** `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/features/x-posts/infrastructure/x-activity.integration.test.ts`에서 현재 Fx start409/SQL disabled 판정과 새 기대의 차이를 확인한다.
- [ ] **Step 3a — lease/schema:** Task1과 같은 생성 절차로 `lease_token`을 추가하고 control/reconcile의 상태 쓰기를 취득 token 일치·미만료 조건으로 보호한다. 오래된 외부 create 비용은 보존하고 최신 reconcile이 소유 tag로 회수한다.
- [ ] **Step 3b — desired 판정:** Fx 자체를 금지 조건에서 빼고 transition/desiredDisabled/수집중지/권한/예산을 독립 판정한다. `WEBHOOK_DISABLED_SQL`, inbox 수락·process 재확인·reconcile·budget resume의 모든 호출을 갱신한다. Disabled 당시 이벤트는 이후 enable로 재생하지 않는다.
- [ ] **Step 3c — 관리자 적용:** 기존 `setPrimarySource/start/stop`을 Task5 Interfaces대로 연결한다. 최초 Fx 전환의 예산 초기화→desiredDisabled→소유 subscription 중단/readback→primary/policy 저장을 유지하며 실패 시 partial/transition을 보존한다. 같은 Fx 요청에서 명시적 Enabled를 다시 끄지 않고 `x_api` 복귀 시 이력/cursor/desired를 보존한다.
- [ ] **Step 3d — 원격 정리:** 수동 Enabled 후 stop해도 Fx의 미사용 endpoint는 삭제하지 않는다. 다른 site 공유 구독과 tag 불일치를 보호하고 원격 잔존을0으로 표시하지 않는다.
- [ ] **Step 4 — GREEN:** 신구 webhook 회귀, protocol/site 오류, 동시 RPC/오래된 lease, 진행 중 유료 정산, remote5xx 후 readback을 확인한다. `pnpm typecheck:test`, `pnpm architecture:check`, migration 전체 chain을 통과한다. Disabled/미초기화 REST도 webhook start 없이 예산 초기화/admission이 성립해야 한다.
- [ ] **Step 5 — 커밋:** 관련 source/tests/schema와 이 task가 생성한 SQL/meta만 stage한다. `git commit -m "feat(x): separate webhook intent from free collection mode"`.

### Task 6: 관리자 API·결과·공개 신선도 소비자 연결

**Files**
- Modify: `contracts/x-collection.ts`, `contracts/scheduled-operations.ts`, `worker/features/x-posts/infrastructure/x-collection-status.ts`, `worker/platform/scheduled-jobs/x-collection-run-read-model.ts`, `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts`, `worker/features/x-posts/application/x-collection-service.ts`, `worker/app/x-collection.ts`, `worker/features/x-posts/http/x-collection.ts`
- Modify: `src/features/member-posts/api/x-collection-api.ts`, `src/features/member-posts/queries/use-x-collection-status.ts`, `src/features/member-posts/model/x-collection-monitoring.ts`, `src/features/member-posts/ui/admin/x-collection-manager.tsx`, `src/features/member-posts/ui/admin/x-activity-manager.tsx`, `src/features/member-posts/ui/admin/x-collection-monitoring.tsx`, `src/features/member-posts/ui/admin/member-post-settings.tsx` 및 대응 기존 tests/DTO fixtures
- Create: `worker/features/x-posts/infrastructure/x-collection-status.integration.test.ts`, `worker/features/x-posts/http/x-collection.test.ts`

**Interfaces**
- 기존 관리자 `GET/PATCH /api/x/collection`과 PATCH `{primarySource:"fxembed"|"x_api"}`를 유지하고 `XCollectionStatusDto.hybridPolicy:XHybridPolicy|null`을 추가한다. RSS 전용 새 endpoint/provider 선택은 만들지 않는다. 기존 Fx의 정책 미적용 상태에서는 같은 PATCH를 호출하는 ‘혼합 구성 적용’ 버튼을 제공한다.
- status에 `rss:{enabled:boolean;intervalHours:number;lastHttpSuccessAt:number|null;lastCheckCompletedAt:number|null;pendingSources:number;pendingCandidates:number;windowReduced:boolean;error:string|null}`를 추가한다. enabled는 수집 활성·primary=fxembed·policy=rss_v1의 결합이며 rollback 후 남은 이력/표식만으로 활성 표시하지 않는다.
- account에 `rssLastHttpSuccessAt,rssLastCheckCompletedAt,rssPendingCandidates,rssWindowReduced,rssError,officialNominalDueAt,officialBlockedReason,officialRegularAgeMs,officialHealth`를 추가한다. 시각은 number|null, 건수 number, 축소 boolean, error/blockedReason string|null, health는 Task1의 union이다. 기존명 `officialNextEligibleAt`은 실제 backoff를 반영하고 예산 불명/부족은 blockedReason으로 병기한다.
- operation `collection`에 `mode?:XCollectionMode`, `paidApiCalls?:number`, `rss?:{rawCount:number;candidatesFound:number;pendingCandidates:number;nextAttemptAt:number|null;windowReduced:boolean}`를 추가한다. 기존 증거에 없는 값은 unknown/optional이며 가짜0/성공으로 채우지 않는다.

- [ ] **Step 1 — RED 작성:** `read_status_performs_no_writes_or_upstream_calls`, `rss_success_cannot_hide_official_overdue`, `fx_rss_paid_lookup_is_not_labelled_free`, `unconfigured_legacy_does_not_show_rss_enabled`와 비관리자/다른 site 거절, GET 실패 후 stale 표시를 추가한다.

```ts
expect(observedWrites).toBe(0);
expect(observedUpstreamCalls).toBe(0);
expect(screen.getByText(/공식.*24시간/)).toBeVisible();
expect(paidRssDescription).not.toContain("유료 원문 조회 없음");
expect(unauthed.status).toBe(401);
expect(afterApply.hybridPolicy).toBe("rss_v1");
```

- [ ] **Step 2 — 실패 확인:** `pnpm exec vitest run worker/features/x-posts/http/x-collection.test.ts src/features/member-posts/ui/admin/x-collection-manager.test.tsx src/features/member-posts/ui/admin/x-activity-manager.test.tsx src/features/member-posts/ui/admin/x-collection-monitoring.test.tsx`와 `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/features/x-posts/infrastructure/x-collection-status.integration.test.ts`에서 새 계약의 FAIL을 확인한다.
- [ ] **Step 3a — 상태 API:** Task6의 DTO와 `readXCollectionStatus(env,activity,activityError)` 반환을 연결한다. GET은 기존 상태/ledger를 읽으며 관측용 reconcile/예산 초기화/쓰기를 하지 않는다. account별 nominal due와 backoff/차단을 함께 표시한다.
- [ ] **Step 3b — 작업 결과:** read model에 RSS mode/후보/paidApiCalls를 연결한다. terminal RSS의 `nextAttemptAt`은 다음 점검 재개 자격이며 실행 보장이 아니다. provider=fxembed를 일괄 ‘유료 원문 조회 없음’으로 표시하던 model을 실제 유료 호출 기준으로 수정한다.
- [ ] **Step 3c — 관리자 소비자:** handler/composition→RPC→readback→audit→API→query cache→관리 화면을 연결한다. JSON/RSS/공식/webhook 네 상태와 같은 Fx 공급자/RSS 불완전성을 구분하고 Fx 중 수동 webhook은 허용, transition은 차단한다.
- [ ] **Step 3d — 공개 신선도:** 현재 계산 호출을 `rg`로 추적해 RSS HTTP 성공을 채택하지 않고 검증/저장된 JSON·공식 값만 사용함을 회귀로 고정한다. 공개 DTO/D1 전용 읽기는 유지한다.
- [ ] **Step 4 — GREEN:** 신구 contract/UI/권한 tests, `pnpm typecheck:test`, `pnpm architecture:check`, 변경 TS/TSX eslint, 양 site build를 통과한다. RSS 정상/공식 실패/예산 불명 조합, nullable legacy DTO, audit/cache invalidation, site 간 상태 혼입을 검증한다.
- [ ] **Step 4a — 적용 readback 확인:** source만 확인하던 application의 전환 검증을 정책 readback까지 확장한다. protocol1인 이전 peer가 policy를 저장하지 못하면 `x_collection_policy_readback_failed`/503을 반환하고 적용 성공으로 audit하지 않는다. site 간 순차 배포 중의 부분 상태를 숨기지 않는다.
- [ ] **Step 5 — 커밋:** 이 task의 source와 대응 tests/fixtures만 stage한다. `git commit -m "feat(x): expose free collection and recovery status"`.

### Task 7: 정상 경로 검증·승인된 운영 전환

**Files**
- Modify: `worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts`, `worker/app/scheduled-workflow-cron.integration.test.ts`, `worker/features/x-posts/infrastructure/x-post-merge.integration.test.ts`, `docs/current-work.md`
- Create: `docs/reports/2026-11-03-x-free-first-collection-implementation.md`(실행일이 달라지면 해당 날짜로 작성하고 current-work 링크를 갱신한다)

**Interfaces**
- Task1–6의 같은 관리자 진입점·정책 표식·continuation·status를 사용한다. 낮은 단계 SQL/손으로 알려준 ID로 수용 성공을 대체하지 않는다.
- 새 실행/공개 인터페이스는 만들지 않는다. 릴리스 단계에서는 repository `release-ops`를 적용한다.

- [ ] **Step 1 — RED 작성:** 정상 Cron→native Workflow→Queue에서 ‘A regular 도중 UTC 예산 소진→다음 점검 재개, B 독립12시간 실행’, ‘RSS200 축소+JSON 정상 저장’, ‘source 전환/남은 후보’, ‘RSS 유료 보완의 regular 시계 불변’을 회귀로 추가한다. 기존 본문/cursor 보존과 GET 쓰기0을 authoritative D1 readback으로 assert한다.
- [ ] **Step 2 — 실패 확인:** `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/app/scheduled-workflow-cron.integration.test.ts worker/features/x-posts/infrastructure/x-post-merge.integration.test.ts` 및 `pnpm exec vitest run --config vitest.all.config.ts --project=worker-workflow worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts`에서 새 경계의 FAIL을 확인한다. fixture에 맞춰 계약을 약화하지 않는다.
- [ ] **Step 3 — 정상 경로 확인:** 구현 재개 승인 후 로컬 관리자 정상 버튼→정책 readback→정상 작업→실제 Fx/RSS→D1→공개 카드를 확인한다. 샘플 화면/SQL 후보 주입으로 대체하지 않는다. RSS에 실제 새 후보가 없으면 그 구간은 미실증으로 보고하고 fixture로 성공 처리하지 않는다. 공식 독립 발견의 실제 응답은 유료/운영 실행이 별도 승인된 정상 주기에서 검증하며 lookup 진단과 구분한다. 권위·cursor/수집 시작 경계·기존 본문·Disabled/endpoint·공통/사이트 장부를 readback한다.
- [ ] **Step 4 — GREEN/릴리스 판정:** 관련 Vitest/`pnpm typecheck:test`/`pnpm architecture:check`/변경 lint/`pnpm build`/`pnpm build:luvdia`/양 site 로컬 migration·doctor를 실행한다. 전체 chain은 `pnpm d1:reset:local -- --validate-only`, 최종 병합 준비만 `pnpm preflight`다. 승인된 릴리스에서 OTW 관리자 적용→소유 구독/실제 Worker 저장/공개 readback→LuvDia 순으로 전환한다. 설정만의 성공·합성 검증·미확인 공식 응답을 운영 PASS로 보지 않는다.
- [ ] **Step 4a — 호출 상한 확인:** 양 site의 최종 resolved Queue 설정에서 background consumer의 batch/concurrency1을 확인하고, JSON/RSS item 내부의 측정된 동시 외부 호출이1을 넘지 않는지 검증한다. 병렬 테스트가 배포 소비자 한도를 대신하지 않는다.
- [ ] **Step 5 — 결과 기록·커밋:** 실제 결과/commit/artifact/테스트 영향/한계/24시간 초과/내부 추정과 청구를 보고서·current-work·소유 PR에 기록한다. 초기7일은 기존 결과/ledger를 읽으며 새 자동화·강제 유료 실험·자동 예산 증액을 하지 않는다. rollback은 관리자 x_api 복귀, 데이터/cursor/장부/기존 desired 보존을 확인한다. 구현 파일과 실제 보고서만 명시 stage 후 `git commit -m "test(x): verify free-first collection through native workflows"`. push/PR/merge/deploy는 각 승인 범위를 따른다.

## 설계 검토로 구체화한 판단

1. 기존 Fx 설정에도 배포만으로 RSS/12시간 정책을 켜지 않도록 관리자 적용 표식 `rss_v1`을 둔다. 범용 flag 화면/새 endpoint는 만들지 않는다.
2. regular→pending이 별도 run이 될 때 원래 scope를 source2열로 보존한다. token만으로 재개/완료를 판단하지 않는다.
3. 기존 Queue의 terminal partial은 후보 continuation 갱신이 아니다. Task3에서 lease 조건 checkpoint·source pointer·다음 Cron의 복사/재개를 함께 구현한다.
4. RSS 후보가 공식 lookup으로 진행하면 provider=fxembed item도 유료일 수 있다. Task6의 표시에서 숨기지 않는다.
5. XML 후보는 [parse-xml 공식 README](https://github.com/rgrove/parse-xml#readme)와 [5.1.0 배포 metadata](https://registry.npmjs.org/@rgrove%2Fparse-xml/5.1.0)로 확인했다. 의존0/ISC/Node 조건은 확인했으며 Workerd 호환·설치·security/runtime tests는 Task2의 미실행 필수 검증이다. 현재 패키지 환경은 변경하지 않았다.
6. 재개 책임이 남은 RSS partial은 완료 이력이 아니다. Task3의 source pointer가 참조하는 item/run을 정리 대상에서 보호하며 보관 기간·기존 삭제/redaction 정책 자체는 바꾸지 않는다.

## Self-Review

- Spec coverage: 의도/비교/정상 진입점→전체/Task7, 12시간·regular 의미→Task1, JSON 보존→Task1/3/7, RSS 후보·100/5/2→Task2/3, 공식/예산/24시간→Task1/4/6, webhook→Task5, DTO/UI/GET 쓰기0→Task6, migration/rollback/초기관측→Task1/5/7. 미대응 요구는 없으며 실제 응답·청구 미확인은 Task7에 남겼다.
- Step scan: 각 task는 실패 작성→FAIL 확인→구현→GREEN→범위 커밋이다. schema는 생성기 소유라 미래 번호를 고정하지 않고 실제 생성 직후 경로를 기록한다. 모르는 운영 결과를 채워 넣는 단계는 없다.
- Type consistency: `rss_v1`/`rss_candidates`/`stage=free|official`/`FxRssStepResult`/`paidApiCalls`/`sync_origin_scope`를 횡단 확인했다. mode 없음은 timeline, provider 없음은 공식으로 통일했다.
- Review Focus: 다섯 항목의 각 소유 task에 회귀를 배치했다. standalone pending을 regular로 격상하지 않고 regular 시작 범위만 재개 완료와 연결한다.
- Proportion: file map/계약/테스트 assert/검증을 중심으로 하고 parser/수집 본문 구현은 쓰지 않았다. 공통 제약은 task의 Interfaces를 참조한다.

## Execution Handoff

2026-11-03 사용자가 계획을 승인하고 **Subagent-driven** 구현·로컬 검증을 선택했다. 위 단계는 이 로컬 승인 범위에서 실행하며 Task7의 배포·원격 전환·실제 유료 정상 주기·초기 운영 관측은 계속 보류해 unchecked/미검증으로 남긴다. 작업별 구현·독립 검토와 마지막 전체 브랜치 검토를 진행하고, 검증 대체나 유료 호출로 보류를 우회하지 않는다.
