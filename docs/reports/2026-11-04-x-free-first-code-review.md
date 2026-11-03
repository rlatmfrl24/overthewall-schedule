# 무료 우선 X 수집 두 축 코드 리뷰 — 2026-11-04

추가 요청한 Matt Pocock code-review에 따라 Standards와 Spec을 독립 subagent로 병렬 검토했다. 최초 결과는 Standards hard 1/heuristic 1, Spec 3건이었다. 기능 지적과 후속 INSERT 증거 회귀를 수정한 최종 코드 `9f10bcbafee850734e555cdf70855738de6f696e`에서 원래 지적은 모두 addressed다. **Standards hard P1 1건과 Spec 조건부 환경 미충족 1건이 남으며, 둘 다 Free50 적용 시 정상 Queue의 D1 호출 한도 초과다. Free 적합·운영 준비 PASS가 아니다.** 구현·로컬 검증 승인 범위에서만 수정하며 배포·운영 전환·실제 유료 API 호출·push/PR/merge는 보류한다.

비교는 `git diff a6b9463111eba8c8a40a27856da55d2a74fce69e...HEAD`를 고정해 최초 HEAD `c62fffad4f6eaaedaaf3915131caefa3d7505694`에서 수행했다. merge-base도 시작점과 같음을 확인했고 변경 diff는 비어 있지 않다. 최초에는 응답을 기다리는 동안 문서화된 구현 시작점을 사용했고, 이후 사용자가 **“이번 무료 우선 구현 시작점 a6b94631부터”**라고 확인했다. 기준 변경은 없다. 이전 혼합 수집 전체를 master와 비교한 결과는 아니다. commit의 issue 참조가 없어 승인된 [설계](../superpowers/specs/2026-11-03-x-free-first-collection-design.md)·[계획](../superpowers/plans/2026-11-03-x-free-first-collection.md)을 Spec으로 사용했다. Standards는 canonical .agent 규칙과 Design.md 및 skill의 smell 기준을 사용했다.

아래 최초 보고서는 각 축을 합치거나 우선순위를 다시 매기지 않고 보존한다. 수정 후 축별 재검토는 별도로 기록한다.

## Standards — 최초 독립 보고서

BASE `a6b9463111eba8c8a40a27856da55d2a74fce69e` → HEAD `c62fffad4f6eaaedaaf3915131caefa3d7505694`. 고정된 source diff와 관련 전체 함수·호출자·인덱스를 읽었다. Spec 축 판정은 하지 않았다.

1. **Hard P2 — 새 혼합 수집 화면의 상태를 변경 뒤 갱신하지 않는다.** `src/features/member-posts/ui/admin/x-activity-manager.tsx:21–23`의 `onSuccess`는 `setQueryData(xActivityQueryKey,data)` 뒤 settings/operations/reference만 무효화한다. 새로 허용한 FxEmbed 웹훅 활성화가 성공해도 같은 화면의 `x-collection-manager.tsx:60`은 별도 `xCollectionQueryKey`에서 받은 **웹훅 Disabled**를 계속 표시한다. `use-x-collection-status.ts:4`는 staleTime만 있고 폴링이 없으며 공통 QueryClient는 focus 재조회도 끈다. 30초 경과는 자동 재조회를 일으키지 않는다. `member-post-settings.tsx:180–188`의 수집 중지/재개 후에도 새 RSS 활성 표시가 같은 방식으로 남는다. 기준: **`Design.md:706` “저장 뒤 관련 목록·홈 요약·이력을 무효화해 서버 결과를 다시 확인한다.”** 해당 성공/부분 실패 뒤 collection query도 무효화하고 두 패널을 함께 mount한 변경→서버 readback 회귀를 추가해야 한다. 기존 무효화 기반의 누락이 이번 새 활성화/RSS 소비 흐름에도 남은 문제다.

2. **Heuristic P3 — possible Duplicated Code.** `d1-fx-rss-collection.ts:43–44,135–136`과 `x-rss-official-hydration.ts:14–15`가 `source_authority IS NULL OR content_hash IS NOT NULL`을 포함하는 동일한 “저장 완료 또는 보호된 후보” 판정을 세 번 소유한다. 후보 재개·무료 조회·유료 재구매 방지가 같은 판정에 의존하므로 한 곳만 수정하면 불완전 저장을 완료로 오판하거나 재구매할 수 있다. owning infrastructure의 작은 공유 reader/predicate로 통합할 판단 사항이다. 현재 동작 차이 또는 추가 과금은 확인하지 않았다.

Cron→planner→Workflow/Queue→RSS checkpoint→공유/site 예산 예약→공통 저장을 추적했다. JSON/RSS/공식 대조와 cross-runtime fence 자체는 불필요한 중복으로 분류하지 않았다. RSS 후보는 100개, 무료 lookup은 item당 5회, 유료 batch는 99개 이하이며 candidate/source/item 조회는 PK에 한정된다. 새 관측용 D1 쓰기는 확인하지 않았다. 다만 공식 완료의 account-history 관계 확인 비용을 규모별로 새 계측하지 않았으므로 운영 D1 절감을 판정하지 않는다.

**집계: Hard 1 / heuristic 1. 이 축 최우선은 P2 상태 무효화 누락.**

새 테스트·서버·실제 DB·HTTP·원격 작업은 실행하지 않았다. 비용·실화면 결과는 정적 추적의 한계가 있다.


## Spec — 최초 독립 보고서

검토 HEAD: `c62fffad4f6eaaedaaf3915131caefa3d7505694` (BASE `a6b9463111eba8c8a40a27856da55d2a74fce69e`). **수정 필요 3건**, 추가 범위 확장 finding 없음.

1. **[P2] 계정 지연 우선순위가 실제 dispatch까지 전달되지 않는다.** 설계 `docs/superpowers/specs/2026-11-03-x-free-first-collection-design.md:51`: “계정 간에는 pending의 오래된 순서와 정기 대조 지연을 함께 고려”; `:78`: “후보 `firstSeenAt + 24h`가 가까우면 … 지연 우선순위를 높인다.” `worker/features/x-posts/infrastructure/x-hybrid-policy.ts:58`의 정렬은 배열 순서뿐이다. planner가 전달하는 item에는 우선순위가 없고(`worker/features/scheduled-operations/infrastructure/scheduled-job-planner.ts:61`), repository는 동일 available_at·무작위 outbox ID를 만들고 그 ID로 dispatch를 고른다(`worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts:453`, `:283`). RSS 후보 나이도 계정 간 선택에 반영되지 않는다. 여러 계정이 동시에 due이고 잔액이 일부만 허용하면 덜 지연된 계정이 먼저 예산을 사용해 오래된 복구가 밀릴 수 있다. 우선순위를 실제 admission/dispatch 선택까지 보존해야 한다.

2. **[P2] 공식 응답으로 판명된 타 작성자 후보가 영구 pending으로 남는다.** 설계 `docs/superpowers/specs/2026-11-03-x-free-first-collection-design.md:77`: “잘못된 작성자·리포스트·범위 이전은 명시적 처리 제외 사유를 남긴다.” `worker/features/x-posts/infrastructure/x-rss-official-hydration.ts:76`은 타 작성자를 valid에서 제거하지만 resolved/excluded에는 넣지 않는다. 따라서 `:92`는 batchProcessed=false이고, `:46`은 같은 날의 성공 응답을 계속 재사용한다. 다음날에는 동일 잘못된 후보를 다시 구매할 수 있으며 pending pointer가 새 RSS scan도 억제한다. 기존 `x-rss-official-hydration.integration.test.ts:210`은 foreign의 paidBatch 보존을 기대해 이 계약 위반을 고정한다. 확인된 타 작성자는 사유와 함께 terminal 제외하고 실제 일시 오류만 남겨야 한다.

3. **[P2] 무료 RSS 신규 저장 ID·시각이 완료 증거에서 사라진다.** 설계 `docs/superpowers/specs/2026-11-03-x-free-first-collection-design.md:159`: “RSS 추가 발견 ID와 JSON 검증 후 실제 새 저장 ID, 최근24시간 추가 기여”. `worker/features/x-posts/infrastructure/d1-fx-rss-collection.ts:146`은 공통 writer의 insertedIds를 버리고 count만 반환하며, `worker/features/x-posts/application/fx-rss-collection.ts:75`는 count만 누적한 뒤 후보 ID를 제거한다. newlyStoredPosts는 유료 보완에만 연결돼 있다(`:105`). 정상 완료 후 JSON/RSS가 같은 fxembed 출처여서 기존 결과·원장만으로 무료 RSS 추가 기여와 복구 지연을 구분할 수 없다. 기존 checkpoint/result에 실제 INSERT acknowledgement의 ID·createdAt·storedAt을 전달해야 한다.

D1 검토 범위와 측정 한계: 아래 D1 검증 범위. Spec 3건, 가장 큰 영향은 1번의 예산 제한 상황에서 지연 우선순위 소실이다.

새 테스트·실제 DB·외부 호출·유료 검증은 실행하지 않았다. 운영 D1 청구와 실제24시간 복구는 미측정이며 위 위험의 발생 빈도도 확정하지 않는다.


## D1 검증 범위·추가 계측 — 무료 플랜 한계 확인

후보 selector의 PK 접근·최대100 후보·item당5 무료 lookup만으로 실제 D1 자원 사용량이 작다고 판정하지 않았다. 기존 test-only D1 meter에 SQL statement 수와 binding 호출 수를 분리해 계측한다. db.batch의 SQL은 개별 집계하되 binding 호출은 한 번으로 센다. setup/seed/계획과 실행·완료·admin readback을 구분하며 새 관측용 운영 쓰기는 추가하지 않는다.

Cloudflare 공식 한도는 Worker invocation당 D1 호출 Free50/Paid1000이며 batch는 한 호출이다. 실제 계정 요금제는 조회하지 않았다. 저장소의 Workers Free 목표를 유료 플랜 가정으로 대체하지 않고 정상 Queue 전체 경로를 계측했다. batching은 네트워크 왕복을 줄일 수 있지만 SQL rows_read/rows_written이나 청구 절감을 자동으로 뜻하지 않는다. [Cloudflare D1 한도](https://developers.cloudflare.com/d1/platform/limits/)

동일한 실제 로컬 D1 fixture에서 `handleScheduledJobQueue`→claim→executor→저장/checkpoint→complete→dispatch/reconcile→legacy finalizer→ACK까지 계측했다. 계획/run 생성·seed는 별도 invocation의 준비 단계라 제외했고, 관리자 readback도 제외했다. 다음 Queue 전달은 기존 send port로 기록하며 해당 전달의 실행 비용을 현재 invocation에 합산하지 않았다. 무료 조회 응답만 fixture이며 유료/RPC 호출은 없다. quota 자체를 강제한 Cloudflare 원격 실행은 아니다.

| 한 Queue invocation | 변경 전 binding 호출 / SQL | 변경 후 binding 호출 / SQL | rows_read 전→후 | rows_written 전→후 |
| --- | ---: | ---: | ---: | ---: |
| 관계 없는 신규5개 | 144 /145 | 82 /97 | 684→588 | 105→105 |
| 각 글의 답글·인용 포함 신규5개 | 179 /180 | 117 /132 | 947→851 | 160→160 |

중복 live context 조회를 기존 전체 fence SELECT 하나로 합치고 독립 context 조회를 batch했다. 모든 mutation CAS/정책·멤버·계정/item lease와 유료 reservation fence, 처리량5는 유지했다. trusted numeric identity는 재조회하며 임의 cache를 추가하지 않았다. 두 경로 모두 binding62회·SQL48개·read96행을 줄였지만, 쓰기량은 그대로다. 관계 경로의10개 relation 저장도 readback했다. 원래 post/facts/references를 다시 쓰지 않는 no-op과 필수 scheduled bookkeeping은 구분한다.

별도 feature 경로(executor→complete→readItem→관리자 readRunDto)는 이미 저장된5개 재수신에서27 SQL/22 binding/116 read/20 write였다. post/facts/references mutation은0이고20 write는 job/source bookkeeping이다. 신규5개는88/73/566/90, 미완료 hash 복구5개는83/68/471/40이다. 이 작은 경로를 위 Queue 전체 수치로 대신하지 않는다. 후보 PK selector는 무관한 글2,000개 추가 전후 read가 같고, 우선순위에 막힌 claim은 같은 run의 terminal item2,000개 추가 전후1 SQL/1 binding/5 read/0 write였다. EXPLAIN은 각각 기존 PK와 run/status index를 사용한다. 다른 모든 운영 쿼리의 규모 상한을 증명한 결과는 아니다.

**미해결: Workers Free50 한도에 맞는 구현이라고 판정할 수 없다.** 측정한82/117회가 한도를 넘는다. 실제 계정이 Free이고 같은 입력을 처리하면 quota 오류·재시도·수집 지연 위험이 있다. 계정이 Paid라는 가정으로 숨기거나 lookup5를 줄여 처리량을 바꾸지 않았다. 이 범위를 넘는 writer 구조 변경/실제 요금제 선택은 후속 판단이며 배포 전 해결 또는 적용 환경 확인이 필요하다. 로컬 전체 테스트 통과가 이 플랫폼 한계의 해소를 의미하지 않는다. 운영 장기 backlog·전체 사이트 일간 사용량·실청구는 미계측이다.

## 수정 이력·재검토 범위

`bb1b02c`는 상태 query 갱신, `765eabe`는 공통 후보 selector·현재 snapshot의 terminal 제외·실제 INSERT 증거, `ead91e0`는 실제 dispatch/claim 우선순위와 관리자 evidence DTO, `dbb5d3b`는 중복 live 조회와 Queue 프로파일을 수정했다. `dbb5d3b`의 scoped 재검토에서 두 축 모두 INSERT 후 파생 저장 실패의 metadata가 관리자 DTO에서 사라짐을 확인했다. writer의 count0은 전체 저장 미완료이고 insertedIds는 이미 일어난 삽입이므로 둘을 같게 강제한 검증이 원인이었다.

원래 P3 계약을 닫기 위한 좁은 예외 판단(Ruling39)으로 `9f10bcba`에서 검증 조건 하나만 제거했다. 두 unit RED와 실제 D1 실패 경로 RED 후 unit/admin auth34·D1 2 GREEN을 확인했고, 실패 상태·완료0·미완성 hash·pending을 유지한 채 raw→readRunDto의 실제 INSERT1을 검증했다. 두 원래 reviewer가 각 축에서 이3개 파일만 amendment했다. 새 broad review나 원격 검증으로 과장하지 않는다. 최종 전체 테스트·양 빌드는 root가 같은 코드에서 별도 실행하며 아래 결과에 연결한다.

## Standards — 최종 독립 판정

현재 HEAD `9f10bcbafee850734e555cdf70855738de6f696e`. 전체 고정 비교는 `a6b9463111eba8c8a40a27856da55d2a74fce69e...9f10bcbafee850734e555cdf70855738de6f696e`이다. 최초 scoped 재검토는 dbb5d3b에서 수행했으며, 이번 amendment는 Ruling39가 허용한 INSERT 증거 수정 3개 파일만 확인했다. 추가 broad review는 하지 않았다. 최초 c62/dbb 판정은 당시 기록이다.

**원래 지적:** S1 Hard P2 **addressed**. 웹훅 `onSettled`와 설정 성공/부분 실패·새로고침이 collection query를 갱신하며, 두 소비자를 함께 mount한 회귀가 그 관측 결과를 확인한다. S2 heuristic P3 **addressed**. 세 후보 조회는 단일 `readStoredRssCandidateIds`의 PK ID-IN 판정을 사용한다. wrapper의 Set 변환은 다른 반환 형태를 위한 것으로 추가 smell로 세지 않았다.

1. **Hard P1 — Free 운영 목표의 실행 한도 미충족, 새 계측으로 확인된 잔여 제약.** `application/fx-rss-collection.ts:67`의 정상 5회 무료 조회를 일반 Queue handler로 실행한 `x-rss-official-hydration.integration.test.ts:132`에서 최종 D1 binding 호출은 일반 글 **82**, 답글+인용 글 **117**이다. 전용 meter는 batch를 한 호출로 센다. 원문 profile 로그도 이 결과와 쓰기 105/160행을 확인한다. 기준: `docs/operations/scheduled-jobs-v2.md:260`의 Free 운영 환경, AGENTS Outcome Standard의 실제 환경·정상 주 흐름 요구. [D1 한도](https://developers.cloudflare.com/d1/platform/limits/)의 Free50을 적용하면 정상 입력이 query-limit 오류·재시도에 의존한다. 기존 144/179보다 개선됐지만 충족은 아니다. 실제 계정 요금제와 원격 quota 적용은 미확인이므로 운영에서 항상 실패한다고 단정하지 않는다. 처리량·보호 경계를 임의 완화하지 말고 별도 실행 설계/요금제 결정까지 Free 적합 판정을 보류해야 한다.

**dbb에서 추가한 Hard P2 — addressed.** 원래 위치 `worker/platform/scheduled-jobs/x-collection-run-read-model.ts:27–28`의 `value.length > data.postsStored`만 제거했다. 실제 INSERT와 전체 저장 완료를 같은 수치로 강제하지 않으며 count·실패 상태를 바꾸지 않는다. ID/date/time·중복·배열 상한 검증은 유지된다. `fx-rss-collection.integration.test.ts:393–424`의 기존 facts-fence 실패 경로는 실제 row1/content_hash NULL, facts 부재, 후보 pending, raw result의 INSERT1/완료0을 확인하고 ScheduledJobExecutor→completeItem→readRunDto에서 동일 metadata·skipped·rss_storage_failed를 검증한다. 원문 RED(unit2/D1 1실패)→GREEN(unit/auth34/D1 2통과) 로그를 읽어 해당 누락이 해소됐음을 확인했다. 기준은 `.agent/rules/project-standards.md` API Contract Conventions와 AGENTS Reporting이며, 이 경로에서 닫는다. 이 좁은 수정에서 새 concrete 회귀는 확인하지 않았다.

추가 concrete smell은 확인하지 않았다. priority의 run/status 인덱스, outbox/claim 동시 gate, deferred delivery 재등록과 mutation fence를 추적했으며 신규 관측용 쓰기는 없다.

**집계: 기존 S1/S2 해결 + dbb의 metadata P2 해결 / Hard 잔여1(Free 계측 제약) / heuristic 잔여0. 이 축 최악은 Free 목표 P1.**

이번 reviewer는 새 테스트·HTTP·서버·DB 작업을 실행하지 않았다. root의 현재 HEAD 전체 검증은 별도 판정이며, 기존 Queue profile은 운영 과금 절감·모든 입력 상한·Free 적합을 증명하지 않는다.


## Spec — 최종 독립 판정

최종 HEAD `9f10bcbafee850734e555cdf70855738de6f696e`, 원래 BASE `a6b9463111eba8c8a40a27856da55d2a74fce69e`. `c62fffad...dbb5d3b` scoped 재검토 후, 이번에는 `matt-p3-final.diff`의 P3 잔여 경로만 확인했다. **기존 P1·P2·P3 모두 addressed. 조건부 목표 환경 미충족 1건은 유지.** P1–P3는 원래 finding 식별자이며, dbb 당시 P3 partial 판정은 당시 유효한 역사다.

- **P1 addressed.** 설계 `docs/superpowers/specs/2026-11-03-x-free-first-collection-design.md:51`의 “pending의 오래된 순서와 정기 대조 지연을 함께 고려”, `:78`의 “지연 우선순위를 높인다”가 `x-hybrid-policy.ts:64`의 RSS 포함 deadline, `item-execution-priority.ts:9`, repository의 outbox 선택·원자 claim(`d1-scheduled-job-repository.ts:750`)까지 연결됐다. 재전달은 기존 outbox 재활성화(`:782`)로 보존하고 늦은 ACK는 pending을 덮지 않는다(`:643`). 기존 native/adverse-ID·scarce-budget 회귀를 읽었다. 승인된 site/run 범위이며 겹친 별도 run의 전역 선점 보장은 아니다.
- **P2 addressed.** 같은 설계 `:77`의 “잘못된 작성자…명시적 처리 제외 사유”를 `x-rss-official-hydration.ts:73` 이후 `wrong_author`로 처리하고 후보/batch를 종결한다. 캐시 재생·다음 UTC 재구매 방지 회귀가 있다. 영구 denylist 없이 새로운 feed snapshot은 다시 관측한다는 승인 범위를 유지한다.
- **P3 addressed.** 설계 `:159`: “RSS 추가 발견 ID와 JSON 검증 후 실제 새 저장 ID”; 승인 계획 `docs/superpowers/plans/2026-11-03-x-free-first-collection.md:182`: “실제 INSERT acknowledgement…를 RSS stats/보완 결과…에 전달”. `worker/platform/scheduled-jobs/x-collection-run-read-model.ts:28`에서 완료 건수와 INSERT 증거 길이를 잘못 비교한 조건만 제거했다. ID·날짜·시각·중복·길이 검증, 실패 상태와 postsStored=0은 유지된다. 기존 실제 D1 facts-fence 회귀의 executor→completeItem→raw→readRunDto 검증(`worker/features/x-posts/infrastructure/fx-rss-collection.integration.test.ts:413`)은 INSERT1·hash NULL·facts 없음·pending 후보와 관리자 INSERT 증거 보존을 함께 확인한다. 관련 기존 RED와 GREEN 로그(단위/인증34 PASS, D1 2 PASS)를 읽었으며 이 좁은 amendment에서 새 회귀나 범위 확장은 발견하지 않았다.

**조건부 잔여 위험:** 설계 `:34`의 “정상 Cron…Queue…D1” 흐름과 `docs/operations/scheduled-jobs-v2.md:260`의 “Free 운영 환경”을 함께 적용하면, 정상5건 Queue의82회·답글/인용5건117회 D1 호출은 제공된 Free50 한도를 초과한다(위 동일 fixture 측정). 실제 계정 요금제는 미확인이라 운영 실패를 확정하지 않지만, Free 한도 적용 시 수집 오류·pending 지연을 낳는 목표 환경 미충족이다. 안전한 실행 설계와 실제 배포 한도 확인이 필요하며 개선된 측정값만으로 Free-ready라고 할 수 없다.

Spec 잔여: 기존3건 모두 addressed, 조건부 환경1건; 현재 가장 큰 영향은 Free50 적용 시 정상 수집 실패다. 별도 scope-creep finding은 없다.

새 테스트·HTTP·DB·서버 실행 없이 코드와 기존 증거만 읽었다. 실제 D1 청구·24시간 복구·운영 요금제는 검증하지 않았다.


## 최종 검증·보류

최종 코드 `9f10bcbafee850734e555cdf70855738de6f696e`의 `pnpm test`는 **419파일3,761건+보조10건 PASS**(528.33초, exit0), `pnpm build`/`pnpm build:luvdia`도 양 manifest 확인·exit0이다. 같은 전체 실행에서 feature profile88/73/566/90,83/68/471/40,27/22/116/20 및 Queue97/82/588/105,132/117/851/160을 다시 확인했다(순서 SQL/binding/read/write). 타입·구조·변경 lint도 최종 scoped 명령으로 PASS다. schema가 바뀌지 않아 실제 양 local doctor와164 migration chain의 동일 입력 증거를 유지한다. [실제 로컬 경로·보존·전체 판단 원장](2026-11-04-x-free-first-collection-implementation.md)을 함께 읽는다. merge 준비용 preflight는 보류 범위에 맞춰 실행하지 않았다.

최초 리뷰 후 실제 무료 요청·운영 전환을 재실행하지 않았다. 관측된262개 신규 글은 기존 정상 로컬 무료 흐름의257 JSON+5 RSS이며, 후속 priority/실패/예산 회귀는 통제 fixture다. 실제 유료 복구·원격 구독0·운영 D1 청구·장기24시간 복구·실청구 절감은 미검증이다. 배포·원격 전환·유료 호출·push/PR/merge는 계속 보류한다.

**축별 집계: Standards 잔여 hard1/heuristic0, 최악은 조건부 Free50 P1. Spec 잔여 환경1, 최악은 Free50 적용 시 정상 수집 실패.** 두 축의 동일 위험을 별개 제품 결함 두 개로 합산하지 않는다.
