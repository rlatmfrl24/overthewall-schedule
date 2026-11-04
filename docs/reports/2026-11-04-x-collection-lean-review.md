# X 수집 Ponytail 검토·최적화 — 2026-11-04

What this change does: 무료 JSON·RSS·공식 API가 기존 Queue와 저장기를 공유하는 X 수집 코드에서 실제로 쓰이지 않는 경로와 반복 조회를 줄인다. 검토 중 확인한 UTC 자정 예산 검사 버그도 수정하며, 수집 주기·출처 권위·처리량·후보별 내구성·공식 커서·예산/정산·Disabled 웹훅은 유지한다.

**완료:** 변경 기준 `c9feb1992fb1bc176c1c4f581fb9780bef2d8879`, 최종 기능 소스 `88353c34cbefa446fd30692f47691edfa3befdf8`. 확인된5건을 수정하고 독립 재리뷰에서 추가 지적0건이었다. 배포·운영 전환·실제 유료/API 호출·원격 mutation·push/PR/merge·Play/AI 재개는 보류한다.

## 범위와 예상 부하

마지막 commit은 문서이므로 사용자 대화에서 지정한 현재 X 수집 기능과 연결된 Worker composition·planner·Queue·저장기·관리 상태·공개 피드 호출자를 검토했다. 무료 우선 전체 비교 기준은 기존 `a6b94631`이며 이번 수정의 기준은 `c9feb199`다. README·양 사이트 Wrangler의 일반 Queue batch1/concurrency1·DLQ batch10/concurrency1과 요청된 멤버 규모를 전제로 판단했다. 수동 JSON/별도 인용 보강 전부를50회로 재설계하지 않는다.

동일 feature 안의 함수 한 구현을 사용한다는 이유만으로 ports/application을 삭제하지 않았다. 공식/API/webhook 권위와 쓰기 직전 identity/lease/publication 재검증도 중복으로 간주하지 않았다. 기존 webhook의 인증·CRC·이력·관리자 수동 활성화는 보존한다. dependency·schema·migration·Queue config 변경은 없다.

## Must fix

### 1. 지연된 Cron이 전날 예산을 확인한다 — 수정

- **What this is:** `worker/app/scheduled-workflow-cron.ts`의 D1 쓰기 guard가 Workflow 생성 전에 일일 원장을 읽는다.
- **Problem:** 전날23:23 Cron이 다음날00:03 실행되면 예약일 원장을 읽지만 Queue admission과 실제 작업 비용은 실행일 원장을 쓴다. 당일 차단을 놓치거나 당일 회복 후에도 작업을 막는다. 기존 제품 버그이며 실제 발생 빈도는 측정하지 않았다.
- **Fix:** guard의 날짜를 실제 `Date.now()` UTC로 통일하고 필요 없어진 시각 인자와 외부 호출 없는 export를 제거했다. 작업 선택·`scheduledFor`·idempotency는 원래 이벤트 시각을 유지한다. native fixture도 예산 행을 실제 실행일에 둔다.
- **If we skip it:** 지연 이벤트에서 당일 guard의 no-Workflow/no-run 의미가 깨지거나 복구가 불필요하게 늦어진다. 실제 D1 두 날짜를 사용하는 차단/회복 양방향 회귀가 기존 코드에서 모두 실패했다.

## Should fix

### 2. RSS 목록 조회 직전에 같은 값을 다시 읽는다 — 수정

- **What this is:** `d1-fx-rss-collection.ts`의 fresh `readContext`가 이미 `rss_last_raw_count`를 읽는다.
- **Problem:** 바로 뒤 `fetchFeed`가 같은 값을 별도 SELECT로 다시 가져온다. 신규 RSS fetch 작업마다 binding1회와 indexed read1개가 추가된다.
- **Fix:** 해당 adapter 실행의 fresh context에서 읽은 이전 개수만 재사용한다. 권한·정책·identity 조회와 mutation fence는 유지하며, 네트워크 전에 값을 고정하고 이후 결과와 비교한다.
- **If we skip it:** 무료5개 정상 Queue가30회를 사용한다. 실제 `handleWorkerQueue`에서 저장5개·공식 호출0을 보존한29회 회귀가 기존 코드에서 실패했고 수정 후 통과했다.

### 3. 작업 계획용 독립 조회3개를 별도 호출한다 — 수정

- **What this is:** `x-hybrid-policy.ts`가 source·Fx source·settings를 읽어 같은 계획을 만든다.
- **Problem:** `Promise.all`로 세 D1 binding 호출을 실행했다. 계획을 검토·생성할 때마다 동일한 호출 묶음이 필요하다.
- **Fix:** 기존 SQL3개를 D1 read batch1회로 실행했다. 공통/사이트 budget 조회와 원장 부재 시 실제 비용 이력 대체 조회는 보존했다.
- **If we skip it:** 계획마다 binding2회가 더 필요하다. 실제 gateway DB도 계측한 전체 계획은 site ledger가 있으면5회, 없으면6회이며 D1 쓰기0·동일 대상/scope·source 상태 보존을 확인했다.

### 4. 호출 없는 삭제 함수와 빈 캐시 초기화가 남아 있다 — 제거

- **What this is:** `x-history.ts:redactXPostHistory`는 facts 삭제 상태만 갱신하는 별도 함수이고, `d1-active-handles.ts:clearActiveXHandlesCacheForTests`는 빈 함수다.
- **Problem:** repository 전체에서 첫 함수는 호출자가 없고 실제 삭제는 `x-api.ts:redactStoredXPosts`의 기존 원자 경로가 맡는다. 빈 함수는 실제로 없는 캐시를 초기화하는 것처럼 테스트 두 파일에 남아 있었다.
- **Fix:** dead 함수와 빈 함수·그 import/호출을 제거했다. 실제 redaction 경로와 매 조회의 fresh allowlist 검증은 유지한다. facts backfill의 내부 전용 `recordXPostFacts`도 공개 export에서 제외했다.
- **If we skip it:** 이후 유지보수자가 잘못된 삭제 진입점을 선택하거나 테스트의 캐시 초기화가 실제 동작한다고 오해할 수 있다. 현재 실제 삭제 누락을 발견했다는 뜻은 아니다.

## Nice to have

### 5. 사용하지 않는 RSS 계약과 공개 참조가 있다 — 제거

- **What this is:** RSS port의 `store`에 출처 인자가 있었고 context에 `pendingItemId`가 있었다. feature index는 사용하지 않는 fence type과 account decision을 re-export했다.
- **Problem:** 실제 `store` 호출은 항상 Fx JSON이며 공식 저장은 `hydrateOfficial` 경로다. 반환한 pending 필드는 읽는 코드가 없고 두 re-export도 feature 외부 소비자가 없다.
- **Fix:** 사용하지 않는 인자·반환 필드·SELECT projection·re-export를 제거하고 application/adapter/test fixture를 함께 수정했다. 실제 source pending pointer·공식 저장 출처·공식 커서는 유지했다.
- **If we skip it:** 실행하지 않는 계약을 추가로 이해·유지해야 한다. 현재 공개 HTTP DTO/API 호환성 문제는 없으며 이번에도 바꾸지 않았다.

## 검증 기록

- RED: 무료5개30>29, 올바른 budget fallback을 포함한 planner5/6 cap 초과2건, 실행일 guard 차단/회복2건을 실제 D1/정상 진입점에서 확인했다.
- 준비 오류는 별도다. 첫 planner fixture의 gateway 생성자 인자, 처음 누락한 원장 부재 대체 조회, 처음 UTC fixture의 잘못된 polling minute/Workflow payload 및 integration에 없는 workflow 전용 migration binding을 바로잡은 뒤 같은 계약으로 RED를 다시 실행했다. 이를 제품 버그나 성공 근거로 계산하지 않는다.
- 최초 영향9파일286건은283 PASS/3 FAIL이었다. 새 planner 상한 가정1건과 UTC native fixture1건, 이후 남은 비동기 요청 때문에 영향을 받은 다음 native case1건을 확인했다. 뒤 case의 직접 인과관계는 정적 추정이며 단정하지 않는다. 독립 리뷰가 실제 guard 버그와 fixture 날짜 불일치를 구분했다.
- planner 전체21건 PASS, budget 유무별5/6회·읽기17·쓰기0. RSS 무료5개29회/SQL147/읽기1050/쓰기100이었다. hydrate에서 시작하는 혼합 Queue는 기존46/48/50회를 유지하므로 RSS fetch 절감값을 혼합 전체에 일반화하지 않는다.
- 최종 `green-final-tests.log`: Cron integration/unit·native·hybrid·redaction **5파일55건 PASS**. `planner-caller.log`의 실제 호출자 `scheduled-job-planner.test.ts` **1파일15건 PASS**. 최초9개 중 변경 영향 밖의 완전 통과7파일255건과 합친 **구간별 검증은13파일325건**이다. 전체 명령 재실행으로 보고하지 않는다.
- `pnpm typecheck:test`(test/worker/node), `pnpm architecture:check`, 변경15개TS의 `pnpm exec eslint <각 경로>`와 `git diff --check` 모두 exit0. 최초 lint 뒤 발견한 dead helper 파일의 EOF 빈 줄도 정리한 뒤 재검증했다.

최종5파일 실행 명령은 다음과 같다. 최초 통과7파일은 RSS 공식 보완·Fx RSS·공통 병합·scan cost·RSS application·공개 route·collector cadence였으며, 전체 RSS Queue/DLQ cap·실제 저장·facts/reference/hash·보관/삭제·identity/lease·예산/정산 회귀를 포함한다.

```text
pnpm exec vitest run --config vitest.all.config.ts worker/app/scheduled-workflow-cron.integration.test.ts worker/app/scheduled-workflow-cron.test.ts worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts worker/features/x-posts/infrastructure/x-redaction.test.ts
pnpm exec vitest run worker/features/scheduled-operations/infrastructure/scheduled-job-planner.test.ts
```

## 최종 빌드·실제 데이터·독립 리뷰

Node24.20.0/pnpm11.7.0에서 `pnpm build`, `pnpm build:luvdia`를 순차 실행해 모두 exit0이었다. child 환경의 X/Twitter/Fx 변수를 이름으로 제거하고 credential 값을 출력하지 않았으며 dotenv 자동 로드를 차단했다. 두 manifest는 기존 `verifySiteBuildManifest` 검증에 통과했고 gitCommit이 정확히 `88353c34`, sourceTreeHash는 `54558b8d59e006466443cce0ef9ed43a1bfadc585d509a5999370dd96bde11ec`, migration head0164, site별195개 artifact였다. 기존500kB 초과 chunk 경고는 남으며 숨기지 않았다.

실제 D1 fixture 검사와 빌드 이후 UTC2026-11-04 00:27:38(KST09:27:38)에 기존 app DB를 `DatabaseSync({readOnly:true})`로 재확인했다. 기존748개 value/hidden/removal/access, 각8개 공식 source의 cursor/시각, site별 과거usage6241건·내부 추정19,340,000micros, LuvDia 복구 행의 revision3/본문/reply/hash가 보존됐다. 총433/577개이며 두 site는 x_api/RSS비활성/웹훅Disabled·rollout행 부재다. 이 원장 합계는 과거 보존값이며 이번 호출 비용이나 실제 청구가 아니다. 앱 DB seed/reset/복구/활성화는 없었다.

구현자와 별도인 두 read-only 리뷰를 수행했다. 첫 리뷰는 실제 지연 Cron의 날짜 버그와 native fixture 오류를 구분했다. 최종 frozen source 리뷰는5건 모두 addressed, 추가 Must/Should/Nice0건을 확인했다. reviewer가 테스트를 재실행하거나 부모의 빌드/readback을 자기 실행으로 보고하지 않았다. 테스트 drift·authority inversion·정상 진입점 우회는 확인되지 않았다. 기존 Cron→native Workflow→Queue→adapter/application→fenced store/checkpoint가 유지된다.

원본 checkout/junction과 기존 격리 branch/worktree를 보존한다. 검토 근거는 ignored `.tmp/x-collection-lean-2026-11-04`에 유지하고 이전 계획의 원장/자료는 수정하지 않았다. source commit 뒤의 문서 마감 commit은 기능 검증 source와 구분한다.

## 마감 판정

Verdict: Ship. 로컬 코드 검토·검증 기준이며 배포나 운영 전환 승인이 아니다. 열린 지적0건.

Lean: **제품 코드24줄 순감소**(23추가/47삭제). 테스트는51추가/9삭제다. source/test 전체는74추가/56삭제이며 전체 파일이24줄 줄었다고 보고하지 않는다.

Not checked: 운영 배포/전환·실제 유료 API·실청구 절감·실제24시간 복구는 보류했다. 전체 suite/preflight와 migration chain/doctor 재실행은 이번 변경 범위에서 자동 실행하지 않는다.
