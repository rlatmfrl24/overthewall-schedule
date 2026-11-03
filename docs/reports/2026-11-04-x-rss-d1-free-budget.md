# RSS 혼합 보완 Queue D1 Free 최적화 — 2026-11-04

**사용자가 선택한 RSS·혼합 보완 Queue의50회 이하 최적화·로컬 검증·재리뷰를 완료했다.** 최종 기능 소스는 `a945b5cc6670bff7e93e6cce1653cf654c07741c`다. 실제 Queue 진입점에 hard50 계측을 먼저 적용한 회귀에서 무료5개30회, 무료5개+현재 예산으로 허용되는 공식28개46회, outbox8개를 포함한 정상 최대 조합48회, 오류 복구 조합50회를 확인했다. 독립 리뷰가 추가로 찾은51번째 호출도 RED→GREEN으로 수정했다. 정상 처리량을 줄이거나 quota denial을 성공으로 바꾸지 않았다. Standards와 Spec의 열린 지적은 각각0이며 양 사이트 최종 artifact와 모든 검사 이후의 실제 app DB 보존도 확인했다.

사용자는2026-11-04 남은 문제 수정을 승인하고 범위를 RSS·혼합 보완 Queue 전체(기존82/117회 지적)로 확인했다. 무료5개·공식 보완 batch·후보별 내구성·현재 안전장치를 유지한다. 배포·운영 전환·실제 유료 X 호출·원격 mutation·push/PR/merge는 계속 보류한다.

## 기준과 실행 범위

- 이번 수정 시작은 `f7821515a199a7d3a46b04ac4db4a8d009fab444`, 이전 검증 소스는 `9f10bcba`다. 무료 우선 전체 구현의 원래 비교점 `a6b94631`과 구분한다.
- [실행 계획](../superpowers/plans/2026-11-04-x-rss-d1-free-budget.md), [이전 두 축 리뷰](2026-11-04-x-free-first-code-review.md), [이전 실제 로컬 흐름·보존](2026-11-04-x-free-first-collection-implementation.md)을 연결한다.
- 이번 source commit에는 issue 참조가 없고 `docs/agents/issue-tracker.md`도 없다. 사용자가 승인한 로컬 계획·설계·최신 범위를 Spec으로 직접 사용했다. unrelated tracker/label/agent 설정은 생성하지 않았다.
- 기존 격리 worktree `codex/x-fxembed-hybrid`, Node24.20/pnpm11.7, 독립 node_modules를 사용한다. 원본 checkout/junction과 실제 app DB는 구현 테스트에서 변경하지 않는다.
- 수동 JSON·공식 타임라인·별도 인용/작성자 보강의 모든 경로를50회로 재설계하는 일은 이번 범위 밖이다. 공통 writer 소비자의 기능 회귀는 검증한다. 이 한계를 감춘 전체 X Queue 적합 판정은 하지 않는다.

## 저장기 변경과 독립 검토

`66285784`에서 공통 writer를 snapshot batch1회와 root CAS·facts/references·정확한 hash ACK의 원자적 commit1회로 바꿨다. 후보는 다음 HTTP 조회 전에 저장·checkpoint한다. root CAS 직후 SQL `changes()` assertion으로 자기 쓰기를 입증하고 실패 transaction의 INSERT를 집계하지 않는다. 기존 hash-NULL 행은 여전히 복구한다. source 권위·불완전 관계 보존·현재 member/identity/lease/policy·hidden/archive/terminal·실제 value/hash를 재검증한다.

독립 검토는 Fx-only bootstrap의 유효 ID를 거부하는 Important와 no-op의 두 번째 조회 배치 Minor를 찾았다. `a6e5ba69`에서 기존 RSS와 같은 `COALESCE(official,Fx)` 및 공식 우선순위를 snapshot/commit에 적용했다. 실제 Fx profile/timeline bootstrap→RSS 저장을 실제 fixture D1에서 확인했고 공식 UID/cursor/완료 시각은NULL로 보존했다. identity 교체는 거절하며, 완료·보호된 no-op은1회/0쓰기, 변경·hash-NULL 복구는2회다. fresh scoped 재검토가 두 지적을 addressed로 확인했다.

검증은 초기 공통 소비자480건(중복 제외)과 수정 후 integration88/unit64, 타입·구조·변경 lint를 구간별로 확인했다. HTTP만 fixture이며 저장기·SQL·기존 collector/adapter는 실제 구현이다. 테스트용 cache fake는 서비스 계약만 검증하며 CAS/가시성의 증거는 실제 D1 회귀다.

## 호출 수와 행 비용

| 구간/조건 | binding 호출 | SQL | rows_read | rows_written |
| --- | ---: | ---: | ---: | ---: |
| 이전9f10 일반5개 Queue | 82 | 97 | 588 | 105 |
| 이전9f10 답글·인용5개 Queue | 117 | 132 | 851 | 160 |
| Task1 초기6628578 일반5개 Queue | 72 | 172 | 1198 | 105 |
| Task1 초기6628578 답글·인용5개 Queue | 72 | 192 | 1710 | 155 |
| Task2 df9b6d22 일반5개 Queue | 30 | 148 | 1051 | 100 |
| Task2 df9b6d22 답글·인용5개 Queue | 30 | 168 | 1531 | 150 |
| Task2 df9b6d22 facts 포함5개 | 30 | 158 | 1126 | 120 |
| Task2 df9b6d22 무료5+공식28 | 46 | 428 | 5431 | 703 |
| Task2 df9b6d22 무료5+공식28+outbox8 | 48 | 444 | 5701 | 771 |
| Task2 df9b6d22 부분+UTC이월+outbox8 | 48 | 439 | 5582 | 756 |
| Task2 df9b6d22 reconciliation ACK 실패 | 50 | 446 | 5696 | 767 |
| Task2 df9b6d22 paid CAS+ACK 실패 | 50 | 446 | 3311 | 347 |
| Task2 df9b6d22 RSS DLQ10+outbox80전송 | 34 | 203 | 3430 | 736 |

Task1 중간 값은 identity/no-op 수정 전 해당 소스의 관측이다. **binding 감소와 함께 SQL·읽기 행은 증가했다.** 최종 일반5개는 이전588→1051읽기, 관계5개는851→1531읽기다. 입력/기존 관계의 재검증 비용을 숨기거나 청구 절감으로 부르지 않는다. 무관한 post·terminal reference·cache 각2,000개 추가 전후 snapshot 결과는 같았고 한 indexed seek만+1 read였다. 전체 이력 비례 scan으로 호출 수를 줄이지 않았다. 공식28개가 추가된 혼합 행은 무료5개만의 이전 값과 같은 처리량 비교가 아니다.

SQL은 제출 statement 수이고 실패한 batch도 포함한다. 행 비용은 성공 D1Result의 실제 metadata 합계다. 실패한 batch가 metadata를 반환하지 않으면 그 행의 비용은 관측 가능한 하한이다. `first`/`run`은 계측에서 metadata를 얻도록 같은1회 실행의 `all`로 읽는다. 실제 binding 실행은 `batch`/`all`/`first`/`run`/`raw`/`exec` 및 session을 감시하고 실패한 실행도 센다. bind/prepare는0회다. 이 Queue는 raw/exec/session을 사용하지 않는다.

Cloudflare는 D1 batch를 한 호출로 계산하며, 순서 있는 batch transaction의 실패는 전체 rollback한다. invocation 한도와 읽고 쓴 행 수는 서로 다른 지표다. [D1 한도](https://developers.cloudflare.com/d1/platform/limits/), [batch 동작](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

## 전체 Queue·정산 구현과 검증

Task2는 원자적 item/source checkpoint, 중복 adapter probe 제거, 기존 resource accounting 및 Queue 최종화 호출을 줄였다. 실제 `handleWorkerQueue`의 claim→collector→complete→dispatch/reconcile→finalizer→ACK와 정상 처리량을 함께 검증했다. OTW gateway는 같은 invocation의 로컬 DB이므로 합산하며, LuvDia의 기존 RPC receiver는 별도로 계측한다. 원본 unmetered gateway를 주입한 값으로 유료 혼합 경로의 PASS를 만들지 않았다.

- 후보마다 lookup→원자 저장→실제 item CAS/source ACK의 원자 checkpoint→다음 lookup 순서다. source ACK를 무시하는 SQLite trigger 회귀에서 item/source 모두 rollback했다. 메모리 상태는 commit 후 갱신한다.
- lookup에 사용한 expected UID를 writer에 고정한다. fresh snapshot 전에 Fx fallback UID가 바뀌어도 이전 작성자의 글에 새 UID를 붙여 저장하지 않는다. 공식 UID가 있으면 우선한다.
- 원래 official ID 순서·paidBatch·receipt·site/common UTC 예산·가격·정산은 유지한다. context 조회와 resource별 실제 INSERT, `meta.changes`의 dedup/event 집계, shared 예약/정산을 batch한다. 현재1,000,000micros 예산과 기존35,000micros/ID 사전예약에서 최대28개가 나온다. batch 축소용 새 상수나 Queue 설정 변경이 아니다.
- completion의 UPDATE RETURNING을 terminal readback으로 사용한다. non-YouTube run refresh는 SQL로 합쳤으며 YouTube의 실제 partial/해소된 partial 판정은 기존 함수를 사용한다. finalizer는 필요한 run/item만 조회한다.
- outbox8개는 기존 daily admission을 순서대로 한 batch에서 예약한다. 첫 거절 후 뒤 예약을 막고 send 결과를 leaseToken CAS로 기록한다. 뒤늦은 이전 owner가 새 owner의 성공/실패를 덮지 않는다. 누락 queue·send 실패·throttle·late ACK를 검증했다.
- RSS-only DLQ10개는 기존 delivery10개와 run당 outbox8개를 보존한다. terminal10개는 실제80전송/10ACK·34회, pending10개21회, terminal만14회, 중복7회, mixed RSS상태29회다. non-RSS와 섞인 공유 DLQ는 기존 루프를 유지하며 분류 조회1회가 추가된다. 그 전체의50회 적합을 주장하지 않는다.

### 경합과 오류 복구

관측용 D1 쓰기가 없는 invocation-local WeakMap counter를 사용한다. **실제 CAS/snapshot conflict가 발생한 뒤에만** 추가 retry에 snapshot+commit2회와 최악 unwind12회의 여유를 확인한다. 아직 admission 전인 공식 보완에는30회 여유를 요구한다. 부족하면 `rss_d1_retry_budget`으로 durable pending을 남기고 기존 tick에서 재개하며 X 비용 예산 부족으로 표시하지 않는다. admission이 끝난 요청의 멱등 정산은 완료한다. 정상5+28 처리량은 이 예외로 줄이지 않는다.

무료 CAS1회 후 무료5개는 저장하고 미승인 공식28개를 pending으로 남기는 경로31회, 지속 무료 CAS21회, 지속 paid CAS48회다. paid CAS와 마지막 ACK 실패 조합50회는 **무료5개 저장/공식28개 pending인 예외**이며 정상33개 처리 성공으로 합산하지 않는다. 정상33개 저장 후 ACK 실패는50회다. 둘의 다음 terminal replay는6회·추가HTTP0으로 ACK한다. 저장 실패/late stop도 무료5개 저장·공식28개 pending·정산 완료를 확인한다.

모든 최종 profile의 quota denial은0이다. 후보100개 중5개 처리/95pending30회, 재수신 완료14회,5실패20회/5pending,5명시적 제외20회/0pending, pending99개17회, site/common 예산 거절16회, backoff15회, deadline31회도 확인했다. cache replay는 실제 첫 paid Queue의 저장 실패24pending/31회에서 얻은 receipt와 원래 batch를 재사용한다. 다음 무료5+cached24+outbox8은45회/새 유료 호출0이며 인위적으로 성공 receipt를 심지 않았다.

LuvDia sender39회와 실제 coordinator RPC receiver별1/1/1/4회(SQL1/1/1/9, 읽기1/1/0/124, 쓰기0/0/0/9)를 따로 관측했다. 모든 receiver denial0이다. 격리 fixture DB를 공유하지만 sender 밖의 receiver 작업을 누락하지 않았다.

### 소스별 로컬 검증 기록

Task2 최종128건은 Queue/RSS 공식 보완·repository 실제 D1 회귀이며 위 표를 이 실행에서 추출했다. 영향 integration371건, schema/cadence46건, unit141건, native Cron→Workflow→Queue11건도 구간별로 통과했다. 이 숫자는 겹치므로 합산하지 않는다. 타입·구조·변경 lint·diff check는 구현 단계에서 통과했다.

meaningful RED는 실제 whole Queue가 hard50 때문에 정상 처리량 assertion에 실패한 로그와, RSS DLQ10+outbox8/run이70회였던 회귀다. 잘못된 queue이름·누락 project config·옛 fake finalizer 인터페이스·초기 TS/eslint 인자 오류는 별도 준비 실패로 구분한 뒤 수정하여 재실행했다. 이전82/117은9f10소스의 역사적 관측이며 이번 RED의 재측정으로 주장하지 않는다.

고정 `df9b6d22`에서 Node24.20.0/pnpm11.7.0의 `pnpm test`는 **420파일·3,806건 및 보조 Node10건 PASS**, 실패·skip0이었다. aggregate 약542초(Vitest535초)이며 모든 source reader가 종료된 뒤 수정 묶음을 시작했다. `pnpm typecheck:test`, `pnpm architecture:check`, 변경29개TS의 `pnpm exec eslint`, `git diff --check`, `pnpm build`, `pnpm build:luvdia`도 exit0이다. 두 build manifest는 같은 sourceTreeHash·migration0164를 가리키며 site별195개 artifact를 확인했다. 빌드의500kB chunk 경고는 남는다. 이 전체 검사의 성공이 정적 리뷰에서 찾은 미검증 결합 오류를 해소하지는 않는다.

전체 로그에는 기존 Reduced Motion/React unknown prop, image body text, RPC stub disposal 안내와 고의 오류 fixture의 console 진단이 남았다. 테스트를 바꾸거나 경고를 숨기지 않았으며 runner 실패0과 구분했다. deploy-guard unit fixture의 mocked `Consolidated Worker deployed` 출력은 실제 배포가 아니다. 검사는 자격 값을 출력하지 않고 child 환경의 X/Twitter/Fx 변수와 dotenv 자동 로드를 차단했다. 소스 drift는 없었다.

P1/P3 수정 후 관련 검사·독립 scoped 재검토·최종 source artifact 확인을 아래와 같이 완료했다. 무효화된 검사만 다시 확인하고 유지되는 검사는 해당 identity의 근거로 재사용하는 **composed verification**이다. 수정 후 전체 `pnpm test` 명령을 다시 통과했다고 보고하지 않는다. 실제 유료 API나 배포 후 자연 주기·청구 검증은 이 로컬 작업에 포함하지 않는다.

### 실제 app DB 읽기 전용 보존 점검

2026-11-04KST `DatabaseSync({readOnly:true})`로 OTW338+LuvDia410=기존748개의 value/hidden/removal/access와 계정별 공식 cursor/시각8개씩을 원래 baseline과 대조했다. 현재 총433/577개, 각 과거 usage6,241건·내부 추정19,340,000micros가 그대로였다. LuvDia 복원 행 `2116849537197453509`는 revision3, reply와 hash `54233add474a5a4c1f23e85793deb14fa022df336a7a1936e8545310b379d0c7`를 보존했다. 이 수치는 과거 원장 보존값이며 이번 실험의 API 비용이나 실청구가 아니다.

별도 허용 키만 읽은 제어 상태는 두 site 모두 `x_api`/RSS 비활성/웹훅 Disabled, 임시 `scheduled_v2_x_collection_enabled` 행 부재, 기존2시간 설정 보존이었다. 남은 `rss_v1` marker만으로 RSS 활성으로 오판하지 않았다. OTW coordinator의 양 site enabled0/hybrid_rollback, LuvDia local coordinator의 enabled0/user도 유지했다. 실제 app DB를 seed/reset/복원하거나 수집을 다시 활성화하지 않았다.

## Standards — df9b6d22 독립 재리뷰
# Standards — PASS WITH NON-BLOCKING NOTE

Frozen HEAD `df9b6d22233071537daa2a15cc987d31a98cff6a`; fresh followup review `f7821515..df9b6d22`, including all three commits and affected original consumers. Canonical `code-review-otw`, AGENTS, project standards/architecture/context, and the supplied complete smell baseline applied. Counts: **hard violations 0; possible smells 1 (P3); blocking findings 0**.

- **P3 — possible Duplicated Code.** `C:/Users/rlatm/.codex/worktrees/x-fxembed-hybrid/overthewall-schedule/worker/features/x-posts/infrastructure/x-rss-official-hydration.ts:29–32` introduces `Math.min(100,Number.isFinite(cents)&&cents>0?cents:100)*10_000`; `C:/Users/rlatm/.codex/worktrees/x-fxembed-hybrid/overthewall-schedule/worker/features/x-posts/infrastructure/x-api.ts:666–667` introduces the same parsing/clamping rule, already owned by `x-api.ts:501–507`. Trigger: a future budget-default/normalization change updates only one copy. Impact: batch selection and actual admission can disagree, causing avoidable deferral; present copies agree, so current likelihood/impact are low. Prefer one pure value-to-micros helper reused by all three, retaining the batched reads. This is a judgment call against the supplied Duplicated Code baseline, not a documented hard violation or observed overspend.

Atomic root/derived/hash writes replace the previous multi-step writer; fact SQL and preview parsing are shared with existing consumers. Snapshot revalidation is deliberate concurrency protection, not unnecessary duplicate work. Candidate storage/checkpoint ordering remains intact. Counter observation adds no D1 writes; actual Queue composition wraps the local gateway before use. Repository refresh/checkpoint/completion/outbox/DLQ batching retains real results and lease guards; no dependency, migration, queue-size, or topology change was introduced.

Read existing raw final-budget2 evidence: free5=30; mixed5+28=46; outbox=48; combined reconciliation unwind=50; quota denials zero. The earlier 82/117 blocker is addressed for these exercised RSS/mixed scenarios. Rows/SQL remain separately reported; no billing reduction inferred. Original UI invalidation and shared candidate-reader fixes remain present. Historical review verdicts are prior evidence, not a new broad recertification of every original file. No test/authority drift found in inspected changes.

Skipped: tests, HTTP, DB/runtime execution, remote actions, and source edits; only this report written. Risk/limit: static review plus existing fixture logs cannot certify production quotas, every fault combination, paid behavior, or excluded legacy/manual all-X paths.

## Spec — df9b6d22 독립 재리뷰

# Final Spec / whole-followup review

Frozen source: `df9b6d22233071537daa2a15cc987d31a98cff6a`. **Spec compliance: CHANGES REQUESTED. Task quality: CHANGES REQUESTED. One P1; no additional scope-creep finding.**

**P1 — retry-budget denial requires a 51st D1 execution.** Location: `C:/Users/rlatm/.codex/worktrees/x-fxembed-hybrid/overthewall-schedule/worker/app/scheduled-queue.ts:77–88` (called at `:189–191`); `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts:1037–1064` implements the additional batch. Binding contract: `docs/superpowers/plans/2026-11-04-x-rss-d1-free-budget.md:21`: “지속 CAS 경합은50회 안에서 기존 pending/실패로 반환할 수 있으나 cleanup/정산/최종화 여유를 보존한다.”

The existing mixed outbox reconciliation-failure evidence reaches failed ACK call48, current-item read49, retry admission50. Seed Queue operations at4976/5000 before dispatch: all eight sends legitimately consume the remaining24 operations; the retry reservation then returns false. `retryReconciliation` proceeds to `markRunFailed`, a51st binding execution, instead of completing the required failure/ACK path. This also applies to the tested paid-CAS unwind. Its regression presently asserts retry admission succeeds; the separate throttled case sends only one item and does not combine denial with failed reconciliation. Static trigger is concrete; occurrence requires both late reconciliation failure and exhausted Queue budget, so expected frequency is low, but Free-safe recovery remains unproven. Batch or otherwise reduce this denial tail, retain all admitted sends/settlement, and add the combined hard50 regression. Raising reserve14 alone does not fix the conflict-free case.

Reviewed the complete followup inventory/diff `f7821515..df9b6d22`, affected primary functions, plan/design/current-work, reports and cap-test evidence. The broader `a6b94631...df9b6d22` comparison is the original scope reference; earlier implementation review is cited historical evidence, not newly repeated review.

Positive trace: pre-gateway counter, free lookup/store/checkpoint sequencing, fresh effective UID, transactional root/derived/hash and item/source CAS, original official batch/receipt/UTC settlement, YouTube partial handling, outbox lease guards and RSS DLQ cohort delivery. No normal throughput reduction or unmetered primary-path escape found. Crash-before-send cohort over-accounting remains a disclosed conservative availability tradeoff, not proof of lower billing.

No tests, HTTP, DB, remote effects or source edits performed. Reported48/50 profiles are inspected prior fixture evidence; production quota, real paid recovery and billing remain unverified.

두 축을 합치거나 우선순위를 다시 매기지 않는다. 위 보고서는 `df9b6d22`에서의 최초 재리뷰 그대로다. Spec P1과 Standards의 중복 파싱 P3를 같은 원래 구현자의 한 수정 묶음으로 처리했다.

## 후속 수정·scoped 재검토

`a945b5cc`는 worker8개 파일만 수정했다. P1을 `reserveReconciliationRetry(runId,error)`로 고쳤다. 한 batch transaction에서 현재 UTC ledger의 admission 거절 조건으로 기존 실패 전이를 적용하고 같은 ledger의 예약을 수행한다. 예산이 있으면 실패 전이는 no-op이고 retry, 없으면 기존 run/item/outbox 실패 기록 후 ACK다. 기존 amount3·일일5000·일반/control 예약은 유지한다. `markRunFailed`도 같은 prepared statements를 사용해 실패 전이를 복제하지 않았다.

예산 row 부재·잔여3 정확일치·reserved로 인한 거절·저장된 더 낮은 limit·terminal 결과/metadata·running lease 보존·queued peer 종료·trigger abort 전체 rollback을 실제 D1로 검증했다. non-RSS Naver, control/nonterminal Queue의 허용·거절도 확인했다. P3는 기존 x-api의 순수 `normalizeDailyBudgetMicros(value)`를 세 실제 호출자가 재사용하도록 통합했다. 기존 parseInt·기본100cents·상한100cents·missing/invalid/nonfinite/비양수의13개 정규화 사례와 batched SQL을 유지했다. 새 파일·의존성 edge·framework는 없다.

| a945b5cc 최종 결합 오류 | 호출 | 제출SQL | 읽기 | 쓰기 | 저장/pending | ACK/retry | quota 거절 |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| ACK 실패+retry 예산 거절 | 50 | 449 | 5734 | 805 | 33/0 | 1/0 | 0 |
| paid CAS+ACK 실패+retry 예산 거절 | 50 | 449 | 3362 | 385 | 5/28 | 1/0 | 0 |

두 RED는 실제51번째 시도에서 `d1_binding_call_limit`로 실패했다. GREEN은 Queue used4976에서8전송으로5000/reserved0, failed run/finished_at, queued peer0, 미해결 outbox 상태0, reconciliation ACK 시각NULL을 확인했다. source lease는 해제되고 receipt complete/cost>0, 양 site/common 원장 used=실제 추정비용·reserved0이었다. CAS의 원래28IDs/requestId/day와 paidBatch를 보존했다. 이 failed run을 성공으로 정규화하지 않았다. 정상30/46/48회, retry 허용50회/retry1, terminal replay6회/ACK1/HTTP0도 재측정해 유지했다. retry 경로의 제출SQL은 조건부 실패3개가 추가되어446→449이며 행/청구 절감을 주장하지 않는다.

수정 후 검증은 다음과 같다. 모두 Node24에서 실행하고 실제 로그의 runner summary/exit code를 확인했다.

- `vitest --project=worker-integration`: RSS 공식보완·repository·양 activity·hybrid·Queue state **6파일234건 PASS**.
- `vitest --project=worker-schema --project=worker-workflow`: cadence/auto-update/native **3파일57건 PASS**.
- unit scheduled-queue/api-cost/collection/coordinator/executor **5파일91건 PASS**.
- 마지막 정산 readback을 강화한 결합2사례 **PASS**. `-t failure-denied` 선택에 따른91개 skipped는 전체 suite skip이 아니다. 다른234건과 중복되므로 합산하지 않는다.
- `pnpm typecheck:test`와 마지막 test assertion 추가 후 test tsc, `pnpm architecture:check`, 변경8개TS eslint, `git diff --check` **PASS**.

parser RED는 미구현 helper12건 실패/기존3건 통과였고 nonfinite overflow 사례를 GREEN 후 보강했다. 처음 PATH 따옴표 오류는 소스 실행 전 준비 실패로 구분한다. 새 전체 suite/preflight는 실행하지 않았으며 `df9b6d22`의 전체420파일3,806+10은 변경 영향 밖의 근거로 재사용한다.

### 독립 scoped 재검토 — a945b5cc

**Spec P1 — ADDRESSED.** `worker/app/scheduled-queue.ts:78` now uses `reserveReconciliationRetry`; `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts:663` executes denial transitions and retry admission in one atomic batch. Its denial predicates (`:1058`) run before reservation, so successful admission does not fail the run. Denial preserves the prior queued-peer/outbox/run failure semantics; terminal results and running leases remain untouched. The separate 51st execution is removed.

**Standards P3 — ADDRESSED.** `worker/features/x-posts/infrastructure/x-api.ts:501` owns the pure normalization helper, called at `:511`, `:670`, and `x-rss-official-hydration.ts:31`. Existing batched reads, parseInt behavior, default/cap100, nonfinite and nonpositive handling remain. No speculative configuration, dependency or helper framework was added.

**Checks:** Reviewed frozen `a945b5cc6670bff7e93e6cce1653cf654c07741c`, the `df9b6d22..a945b5cc` package, affected functions/tests, report and raw logs. Queue RED fails both combined scenarios at `markRunFailed` with `d1_binding_call_limit`; final settlement GREEN passes both through real `handleWorkerQueue` with hard50, 50 calls and zero quota denials. Readback assertions preserve 33 stored/0 pending and paid-CAS5 stored/28 pending; all8 sends, failed run, ACK1/retry0, unreconciled marker, receipt/site/shared cost equality, zero reservations, original paidBatch and unchanged official clocks are checked.

**Checks:** Repository regressions cover absent ledger, exact remaining3, reserved-budget denial, stored lower limit, non-RSS state preservation and transaction rollback without budget consumption. Existing admission-allowed reconciliation/replay, control and nonterminal fallback remain covered. Inspected logs show91 unit,234 integration,57 schema/native tests passing, plus the final strengthened2-case settlement run; type/architecture evidence is recorded. Parser RED demonstrates the missing helper, not a pre-existing semantic bug; final13-case coverage matches all three inspected callers.

**New breakage:** None found in this fix diff. No test/authority drift found. UTC clock, lane/all accounting, site boundaries and financial predicates remain unchanged. Out-of-scope observations: none.

**Verdict:** Spec compliance PASS; task quality PASS for this fix wave. Spec: P1 addressed1/open0. Standards: P3 addressed1/open0; hard violations0, possible smells0, blocking findings0. New Critical/Important findings0.

**Skipped/limits:** No tests/builds, HTTP, appDB, remote actions or source edits performed; only this report written. Final-source builds are independently owned by root. Existing fixture evidence does not certify production quota, live paid behavior, billing or24h recovery.


## 최종 artifact·보존 재확인과 마감

Node24.20/pnpm11.7에서 최종 `a945b5cc`의 `pnpm build`와 `pnpm build:luvdia`를 순차 재실행해 모두 exit0이었다. 기존 `verifySiteBuildManifest`의 source/artifact hash·canonical config·site/Worker/binding 검증도 통과했다. 두 manifest는 gitCommit이 정확히 최종 기능 소스이며 sourceTreeHash는 `1f8a74e8729be82f5f2952f584b3e7764b446fab0b45a0e4d04e96713b2f0be2`, migration head는0164, artifact는 site별195개다. 이전 df9 artifact를 최종 산출물로 재사용하지 않았다. 기존 console-screen 681.76kB/gzip181.87kB의500kB 경고는 남는다.

초기 보존 snapshot이 전체 검사보다 먼저였던 간격도 닫았다. 모든 테스트·수정·빌드 이후 UTC2026-11-03 23:45:10(KST11/04)에 같은 SELECT-only 스크립트를 다시 실행하고 초기/최종 site 배열을 deepEqual했다. 기존748글·총433/577·각 공식source8·과거usage/cost·복원행·x_api/RSS비활성/Disabled·rollout행 부재가 모두 같았다. 실제 app DB 쓰기·복구·활성화는 없었다.

이번 source commit은 `66285784` 원자 저장, `a6e5ba69` Fx identity/no-op, `df9b6d22` 전체 Queue 최적화, `a945b5cc` 결합 오류/중복 정규화다. 이 뒤 문서 commit은 기능 검증 소스와 구분한다. [현재 작업](../current-work.md)·[계획](../superpowers/plans/2026-11-04-x-rss-d1-free-budget.md)·이전 보고서에 후속 결과를 연결하고 own 파일만 로컬 commit한다. 브랜치/worktree는 보존한다. 원래 정상 공개 카드 증거는 이전 source의 실제 관측이고, 이번 수정은 실제 Worker/D1/Queue/native의 fixture HTTP 회귀 및 읽기 전용 실제 app DB 증거다. test drift나 authority inversion은 독립 재검토에서 확인되지 않았다.

## 한계와 보류

- outbox cohort는 send 전에 모두 admission한다. 그 사이 process crash가 나면 아직 보내지 않은 admitted record까지 daily resource budget이 보수적으로 소비될 수 있다. 자동 환불/증액하지 않으며 lease/reconcile가 멱등 재전송을 맡는다. X 유료 정산 의미는 유지한다.
- 오류 복구 최대50회로 여유가 없으므로 해당 경로에 D1 호출을 추가할 때 whole Queue cap 회귀를 함께 갱신해야 한다. 임의 네트워크/인프라 장애에서도 항상 완료됨을 보장하지 않는다. 실패·pending은 남긴다.
- 이번 후속 작업은 외부 HTTP 없이 fixture 응답과 실제 Worker/D1/native orchestration으로 검증한다. 이전 실제 무료 공급자→공개 카드의 관측은 이전 소스 증거다. 이 수정 뒤 live 공급자를 다시 실행하거나 유료 공식 독립 발견·실제24시간 복구·7일 안정성·청구 절감을 확인했다고 주장하지 않는다.
- 의존성·schema·migration·Queue config·topology는 이번 수정에서 바꾸지 않았다. 동일164개 migration 입력의 기존 chain/doctor 근거를 재사용하며 merge 준비용 preflight는 수행하지 않는다.

## 이번 판단 원장

이 후속 계획의 판단을 기록순·오판 비용과 함께 보존한다. 이전39건은 이전 구현 보고서의 역사이며 현재 계획의 미완료 단계로 되돌리지 않는다.

1. **사용자가 고른 RSS·혼합 보완 Queue 전체만50회 대상으로 확정.** 공통 writer 소비자 회귀는 검증하되 별도 legacy/manual/reference의 전면 재설계는 제외한다. 잘못 해석하면 전체 X Queue 준비 완료를 오보고한다.
2. **후보별 내구성을 유지하고 snapshot+원자 저장, item/source 원자 checkpoint를 선택.** 새 실패 transaction은 전체 rollback하며 기존 NULL-hash 행은 복구한다. 잘못된 CAS/target/hash assertion은 오래되거나 미검증인 내용을 공개할 수 있다.
3. **실제 binding·실패 실행·Queue tail·별도 RPC를 계측하고 정상 처리량을 함께 판정.** SQL/행과 호출을 구분하며 cap-triggered skip은 PASS가 아니다. 계측 우회나 정상 partial은 거짓 성공을 만든다.
4. **기존 격리 worktree/Node24를 재사용하고 새 계획 전용 원장을 생성.** 이전39개 역사와 원본 checkout을 보존한다. 소유권을 틀리면 다른 작업이나 기존 증거를 덮을 수 있다.
5. **Fx-only identity 회귀와 완전 no-op의 불필요한 두 번째 batch를 같은 bounded 수정으로 처리.** 공식 우선 COALESCE와 mutation 재검증을 유지한다. 잘못된 fallback은 교체 계정을 신뢰하고 NULL-hash를 no-op으로 오판하면 복구를 잃는다.
6. **실제 경합 후에만 retry/unwind 예산으로 pending 또는 미승인 공식 단계 이월 허용.** 이미 admitted된 정산은 끝내며 정상5+28은 유지한다. 오분류는 정상 부족을 숨기고 여유를 작게 잡으면 정산/복구를 잃는다. 예외 복구는 지연될 수 있다.
7. **RSS-only DLQ10과 중복/terminal 복구도 전체 invocation에 포함.** run당 outbox8을 줄이지 않으며 mixed non-RSS 전면 재설계는 제외한다. 누락하면 같은 장애가 DLQ로 이동하고 확대하면 승인 범위를 벗어난다.
8. **고정 df9b6d22에서 두 축 리뷰와 검증만 병렬 수행.** Task3는 product source를 바꾸지 않아 동일 artifact의 Task2 gate와 최종 후속 리뷰를 겸한다. 지적 수정 시 관련 검사를 다시 해야 하며 stale 검사나 dirty 문서를 코드로 혼동하면 잘못 닫을 수 있다.
9. **확인된 복구 예산 거절 P1과 세 곳 예산 파싱 중복 P3를 원래 구현자의 한 수정 묶음으로 처리.** P1은50회 계약을 어기고 P3는 사용자가 요청한 중복 검토 범위에 직접 해당한다. 잘못된 조건부 실패 batch는 retry/terminal/비용 정산을 바꾸고 과도한 helper는 기존 기본값/정규화를 바꿀 수 있어 경로별 회귀와 재검토가 필요하다.
