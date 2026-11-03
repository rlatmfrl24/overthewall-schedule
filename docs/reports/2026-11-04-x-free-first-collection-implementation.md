# 무료 우선 X 수집 구현·로컬 검증 — 2026-11-04

11/03 승인·시작한 작업이 11/04 KST까지 이어졌다. 로컬 관리자 적용→JSON 수집과 정상 예정 tick의 Cron→native Workflow→Queue→실제 RSS/Fx→D1→공개 카드 경로를 확인했다. 배포·운영 전환·실제 유료 X 호출·실청구 절감·24시간 복구 보장은 아직 검증하지 않았다. 계획의 보류 단계3a/4b/5a는 완료가 아니다.

## 승인·산출물 식별

- 브랜치 `codex/x-fxembed-hybrid`, 기존 격리 worktree를 사용했다. 시작 코드 `a6b9463111eba8c8a40a27856da55d2a74fce69e`, 계획 승인 `27b0fdb8`, Task7 기준 `a1b55db1da2c655afd2117c30f9fed044ee8832a`다. Task7 자체 commit은 이 보고서를 포함하는 `test(x): verify free-first collection through native workflows`다.
- [설계](../superpowers/specs/2026-11-03-x-free-first-collection-design.md), [계획](../superpowers/plans/2026-11-03-x-free-first-collection.md), [현재 작업](../current-work.md)을 연결한다. 이전 혼합 수집의 24시간 결과를 이번 12시간 정책 검증으로 재사용하지 않는다.
- 로컬 설치·additive migration 생성/검증·구현·범위별 로컬 커밋만 승인됐다. push/PR/merge/배포, 원격 migration/설정/구독 변경, 유료 실험은 수행하지 않았다. 실제 원격 구독 제어는 synthetic RPC/fixture 검증으로만 남는다.
- 기존 node_modules junction은 ignored `.tmp/node_modules-original-link`에 보존하고 worktree 전용 의존성을 설치했다. Node24.20/ pnpm11.7을 사용했다. XML 직접 의존성 예외는 `@rgrove/parse-xml@5.1.0` 한 개다.

## 최종 동작과 구현 범위

관리자가 기존 수집원 적용 버튼으로 FxEmbed를 적용하면 `rss_v1`과 활성 시각이 저장된다. 표식이 없는 기존 Fx 설정은 배포만으로 새 정책에 진입하지 않는다. JSON은 기존30분 기본 발견 경로, RSS는6시간 저빈도 후보 보완, 공식 타임라인은 계정별 정기 완료에서12시간 후 독립 대조다. RSS 성공·알려진 ID lookup은 공식 정기 완료 시계를 전진시키지 않는다. 예산/실제 backoff는 명목 주기와 별개다.

RSS 후보는 최대100개, item별 무료 lookup5회/상한2회 후 기존 공식 보완 경로로 진행한다. 다음 기존 UTC :23/:53 점검에 재개하며, source pointer/기존 후보 checkpoint와 계정·item lease/정책/멤버를 실제 SQL mutation 및 유료 site reservation에서 검증한다. 정기에서 pending으로 바뀌어도 원래 정기 scope를 유지한다. 완료된 HTTP 부분 응답에서 이미 저장된 ID는 재요청하지 않고 미응답 ID만 다음 자격 tick에 재시도한다.

공식 요청은 기존 사이트/공통 장부, 클라이언트, gateway와 정산을 사용한다. 새로운 과금 원장이나 우회 클라이언트는 없다. 요청 전 checkpoint한 paidBatch와 읽기 전용 receipt로 저장 실패/자정 정산 후 재생의 중복 호출을 막는다. final-page proof가 있는 로컬 파생 복구는 새 유료 호출 없이 완료할 수 있다.

웹훅의 기능은 보존하고 기본 Disabled를 유지한다. Disabled 이전 coordinator/outbox/지연 RPC/inbox의 미시작 작업은 재활성화 후 재생하지 않는다. 이미 admitted된 요청의 정산/비용은 보존한다. 단조 control revision과 site barrier로 양 사이트의 지연된 제어를 차단한다. UI는 정기12시간, 명목/실제 자격과 예산/backoff 사유, RSS 축소, 실제 호출/내부 비용과 과거 unknown을 구분한다. 상태 GET은 조회만 수행한다.

생성 migration0162–0164는 local 양 사이트에 순차 적용했다. 최종 chain164개는 임시 DB에서 검증했다. 0162의 정책/계정/RSS 상태 열,0163 lease_token,0164 control_revision은 additive다. 원래 실제 DB를 reset/seed하지 않았다. root의 migration readback에서 기존 OTW338/LuvDia410개 본문·hidden·revision, 각8개 공식 source cursor/시계, settings와 과거 장부가 모두 보존됐고 새14개 열/lease/revision 초기값을 확인했다.

## 실제 로컬 정상 경로

실제 Clerk 개발 관리자 세션을 유지하고 양 사이트의 일반/사이트별 X 자격 증명을 모두 비웠다. 두 dev Worker는 별도 RPC 이름과 Wrangler/Miniflare registry를 사용했다. 실제 자격 증명이 있던 이 worktree의 이전 서버6개 PID만 명령/부모 identity를 확인해 종료했다. 최종 readback 후 root가 새 안전 서버의12개 owned descendant도 PID/명령/생성 시각/부모 추적으로 확인해 종료했고5173/5174 listener0을 확인했다. root가 만든 브라우저 탭만 닫았다. worktree/node_modules/보존한 원본 junction/로컬 DB와 다른 작업의 프로세스는 남겼다.

양 사이트 기존 Fx 설정에 같은 관리자 적용 버튼을 사용해 `rss_v1`/12시간을 확인했다. 웹훅 Disabled와 확인된 로컬 사이트/구독 기록0을 유지했다. 실제 원격 inventory/소유 구독0은 미검증이다. 첫 수동 JSON 정상 run은 OTW `63390479-d599-40f5-9641-2007c4cea1cb`, LuvDia `d26543c7-e0d0-4b60-ac5b-66b72c3f834f`다. 실제 Fx404/남은 cursor 때문에 partial은 그대로 남겼다.

RSS는 수동 버튼의 대상이 아니므로 [기존 rollout 설정](../operations/scheduled-jobs-v2.md)의 operator 전용 `scheduled_v2_x_collection_enabled`만 로컬 양 DB에서 임시 true로 준비했다. 관리자 정책 적용은 정상 진입점이며 이 두 설정 행은 Cron 운영 준비다. 후보/ID/cursor/시각을 SQL로 주입하지 않았다. 2026-11-03 UTC15:53:08.900/09.553(11/04 KST00:53)에 기존 `/cdn-cgi/local/scheduled`를 시간 override 없이 호출했다. 이는 실제 현지 시각의 기존 scheduled handler 호출이며 운영 플랫폼 Cron 발생을 관측한 것은 아니다.

| 실제 경로 | 외부 무료 요청 | 신규 INSERT | 해석 |
| --- | --- | --- | --- |
| OTW 첫 관리자 JSON | JSON14 | 91 | baseline338→429 |
| LuvDia 첫 관리자 JSON | JSON7 | 60 | baseline410→470; postsStored61에는 기존 reply 손실 갱신1이 포함됨 |
| 양 사이트 :53 RSS | feed8+status lookup5 | OTW4+LuvDia1 | 모든8개 RSS item succeeded, raw100씩 총800, 후보5개 모두 해결, pending0, paid0 |
| LuvDia 관계 복구 후 같은 관리자 JSON 재생 | JSON12 | 106 | postsStored107에는 기존 행 hash 복구1 포함; run `d25a756e-3546-4062-becc-97cd40243a1b` |
| 최종 | paid X0 | OTW95/LuvDia167 | 총433/577; postsStored 합계와 신규 카드 수를 혼동하지 않음 |

실제 scheduled run `363fe027`/`ebd74d52`는 공식 작업의 `shared_budget_unavailable` 때문에 terminal partial이다. RSS8개 성공을 전체 run 성공으로 표시하지 않는다. 실제 로컬에는 유료 자격 증명이 없고 공통 예산을 강제로 bootstrap하지 않았다. root의 코드 대조에서 setPrimarySource는 같은 Fx 분기 전에 initializeBudget을 호출하고 shared gateway는 token이 없으면 shared_budget_unavailable로 fail-closed한다. 따라서 이 로컬 차단을 별도 bootstrap 결함으로 확장하지 않았다. 이 관측만으로 자격 증명이 있는 운영의 공식 경로 정상 여부를 판정하지 않는다.

OTW RSS 신규4개는 JSON404인 otw_ate의 `2117531103439511896`, `2117547033850761385`, `2117548044644384926`, `2117557577169162507`이며11/03 글이다. 정상 공개 멤버 필터에서 네 카드를 확인했다. LuvDia RSS의 binghayu `2114994579498000517`은10/27 기존 누락이다. 오래된 누락 저장을24시간 내 신규 복구 증거로 바꾸지 않는다. 첫 JSON 공개 표본 `2117622304603840750`/`2117587171796455852`도 확인했다. LuvDia 오래된 RSS 카드도 정상 공개 빙하유 멤버 필터에서 End 페이지10→20→30→40으로 도달해 확인했다.

최종 read-only `local-preservation-readback.json`에서 baseline338/410개 value/hidden/removal/access가 동일하고 각8개 공식 cursor/시계가 동일했다. 과거 usage6241건/내부 추정19,340,000micros가 양 사이트 모두 그대로다. 이는 복사된 과거 장부이며 이번 실험 비용이 아니다. 이번 실제 무료 요청의 paid0/estimated0은 내부 관측이다. 청구서·실제 유료 절감은 미확인이다.

## 실제 발견 오류·최소 수정과 데이터 복구

정상 첫 LuvDia JSON 재생에서 기존 Fx 행 `2116849537197453509`의 알려진 답글 `2116849242740519198`과 preview가 사라졌다. coarse `relations=true`가 Fx의 null/생략을 완전한 관계 정정으로 처리한 기존 공통 병합 때문이었다. 최초 readback에서 모든 기존 데이터가 보존됐다고 주장하지 않았다.

Task7에서 `mergeStoredXPost`의 quote/reply 대입만 각각 보완했다. Fx 생략은 알려진 관계를 보존하며, 다른 관계의 유효한 변경과 공식/웹훅의 상위 권한 정정은 계속 허용한다. 새 행의 canonical null, 기존 hidden/redaction 보호를 유지한다. 미확인 Fx 관계를 공식 정정 전까지 오래 보존할 가능성은 남는다.

root가 exact backup/row/revision/value/CAS를 확인해 그 한 행의 원래 value를 복구하고 revision2→3, `content_hash=NULL`을 기존 repair marker로 남겼다. facts/reference는 원래부터 없었고 정상 analytics-disabled 상태였다. 직접 파생 행을 만들지 않았다. 이후 같은 정상 관리자 JSON 재생이 기존 writer의 content-key/hash acknowledgement를 수행했고 답글이 유지됐다. 이 한 행의 backup 복원은 데이터 수리이며 RSS 발견·정상 수집 성공 건수에 넣지 않는다. 최종 원문과 hash `54233add…90c7` 및 revision3를 authoritative readback했다.

## 검증과 영향 범위

Task1–6은 각 구현 후 독립 검토와 수정 재검토를 통과했다. 경계별 RED/GREEN과 최종 수정 결과는 아래 commit 구간 및 회귀에서 추적한다. 합성 fixture는 외부 응답만 통제하며 production Cron/Workflow/Queue/collector/D1 경로와 authorization/예산/lease를 그대로 실행한다. 실제 무료 흐름과 fixture를 구분한다.

| 작업 | 최종 구간 | 주요 증거 |
| --- | --- | --- |
| 1 계정 시계/정기 완료 | ca92c047..d441dc63 | 계정12h 독립 계획, regular→pending 원래 scope, final-page/terminal reference 완료; 최종67 D1/103 unit |
| 2 XML/무료 lookup | 1b453607..c8736758 | Workerd 실제 parser, invalid date RED, 기존 캡처 호환; 최종43 unit/11 D1 |
| 3 durable RSS/SQL fence | 123ad183..a339603c | 실제 mutation 경계의 stop/lease/멤버/pointer 보호, 파생 실패 no ACK; 최종149 D1 및 이전 native9의 composed evidence |
| 4 공식 보완/장부 | 58bed9b4..1e653429 | 원자 site admission, receipt/자정/부분응답 재시도/재생; 최종90 D1/22 unit 및 fixture refinement1 |
| 5 웹훅 제어/rollback | 2fb113ce..f289052a | control revision/지연 RPC/Disabled no replay; 최종80 activity/RPC, 이전164 migration chain |
| 6 상태/소비 UI | d9ebe70a..a1b55db1 | GET0쓰기, due/실제 backoff/final proof 예외, 실제 Overview12h; 최종34 D1/21 UI 및 이전 양 빌드 |
| 7 수용·실제 관계 보존 | 기준 a1b55db1 이후 | 아래 fresh scoped gates 및 root 최종 whole-branch gates 참조 |

Task7 RED는 단위2 FAIL/5 PASS, 실제 D1 writer2 FAIL과 정상 JSON collector1 FAIL/30 PASS다. 모두 알려진 Fx 관계가 null로 삭제되거나 revision/hash가 바뀌는 실패를 재현했다. 수정 후 단위8 PASS, writer/collector27 PASS를 확인했다. 새 null-shape 회귀는 후속 자체 검토에서 추가했으며 별도 product RED로 주장하지 않는다.

native 신규 경계의 최초 FAIL은 fixture의 가용50,000micros가 실제 최소125,000(미디어 reservation 포함)에 못 미쳐 Workflow가 생성되지 않은 설정 오류였다. production guard를 완화하지 않고 fixture 가용량만125,000으로 맞췄다. 이후 A 정기→예산 부족 중 checkpoint 보존,12h 자격 B의 원래 regular item, B 완료 중 A 미완료 보존, A pending 재개 후 원래 regular 완료를 native Cron/Workflow/Queue/D1에서 확인했다. 마지막 native fixture는 used0/reserved875,000/limit1,000,000의 기존 예약을 표현한다. A의 실제 정산 비용과 차단 tick의 used/reserved를 보존한 뒤 그 기존 예약875,000만 조건부 해제하고 B/A를 재개한다. used를 지우거나 고정 $1 limit을 바꾸지 않는다. 실제 UTC 자정 경과는 주장하지 않고 기존 통제 clock/D1 UTC 회귀를 재사용한다. 제한을 더 엄격하게 바꾸려던 중간 fixture는 schema의 고정 $1 CHECK가 올바르게 거절했으며 setup FAIL로 기록했다. RSS200의6→0 축소와 JSON151 정상 저장, 계정 공식 cursor/시계 보존도 같은 native 경계에서 확인한다.

중복 테스트를 만들지 않고 다음 기존 회귀를 최신 scoped 실행으로 확인한다.

- `x-rss-official-hydration.integration.test.ts`: `known_lookup_is_not_timeline_completion`은 paid RSS 보완 뒤 원래 source의 last_seen/regular/완료/cursor/scope 전체 비교를 한다. `preserves pending and earlier cost when ... blocks after UTC rollover`, `reuses a response settled after midnight ...`는 통제된 clock의 실제 D1 장부/receipt 회귀다. `official_timeline_discovers_unknown_free_id`는 fixture의 독립 공식 발견이며 실제 공식 검증을 대신하지 않는다.
- `x-hybrid-policy.integration.test.ts`: `retires old hybrid final-page proof under the legacy account lease before returning to Fx`, `rollback retires hybrid proof without dropping a real unfinished pagination cursor`는 rollback/재활성 시 오래된 proof의 거짓 완료와 실제 cursor 손실을 막는다.
- `fx-rss-collection.integration.test.ts`: terminal partial의 별도 item 재개, rollout/policy/allowlist/lease 중단 때 후보 보존, pointer snapshot CAS, pending retention,6h feed 축소 이력을 실제 D1에서 검증한다. JSON/RSS item의 지연시킨 외부 호출 active 수를 직접 측정해 peak1을 확인한다.
- `x-collection-status.integration.test.ts`: `read_status_performs_no_writes_or_upstream_calls ...`는 실제 application/status 두 읽기 진입점의 SQL mutation0/fetch0을 검증한다. app Cron의 기존 admission 회귀도 다시 실행하며 테스트 파일을 불필요하게 중복 수정하지 않는다.
- `x-post-merge.integration.test.ts`와 `fx-collection.integration.test.ts`: quote/reply 독립 생략 보존, preview/hash/revision no-op, 공식 정정, hidden 보호, 정상 collector→정규화→공통 writer→D1 재생을 확인한다.

Task7 fresh commands(Node24.20, `pnpm_config_verify_deps_before_run=false`):

```powershell
pnpm.cmd exec vitest run --config vitest.all.config.ts --project=unit worker/features/x-posts/domain/merge-x-post.test.ts worker/features/x-posts/infrastructure/fx-api.test.ts worker/features/x-posts/infrastructure/fx-rss-api.test.ts worker/features/x-posts/application/fx-rss-collection.test.ts worker/features/x-posts/x-posts.test.ts
pnpm.cmd exec vitest run --config vitest.all.config.ts --project=worker-integration worker/app/scheduled-workflow-cron.integration.test.ts worker/features/x-posts/infrastructure/x-post-merge.integration.test.ts worker/features/x-posts/infrastructure/fx-collection.integration.test.ts worker/features/x-posts/infrastructure/fx-rss-collection.integration.test.ts worker/features/x-posts/infrastructure/x-rss-official-hydration.integration.test.ts worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts worker/features/x-posts/infrastructure/x-collection-status.integration.test.ts worker/features/x-posts/infrastructure/x-reference-hydration.integration.test.ts
pnpm.cmd exec vitest run --config vitest.all.config.ts --project=worker-workflow worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts
pnpm.cmd typecheck:test
pnpm.cmd architecture:check
pnpm.cmd exec eslint worker/features/x-posts/domain/merge-x-post.ts worker/features/x-posts/domain/merge-x-post.test.ts worker/features/x-posts/infrastructure/x-post-merge.integration.test.ts worker/features/x-posts/infrastructure/fx-collection.integration.test.ts worker/features/x-posts/infrastructure/fx-rss-collection.integration.test.ts worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts worker/test-support/native-workflow-provider.ts
```

Fresh unit5파일137 PASS, 실제 D1/Worker8파일196 PASS, native Workflow1파일11 PASS, typecheck:test/architecture/변경 lint PASS다. 로그는 task-7-unit-green.log/task-7-d1-green.log/task-7-native-final-3.log/task-7-types-final-2.log/task-7-architecture.log/task-7-lint.log에 남겼다. 정상 native fixture의 기존 RPC dispose 경고, 실패 주입의 예상 console warning, app Cron 부분 migration fixture의 기존 no-table 경고를 숨기거나 pristine 출력으로 주장하지 않는다.

양 사이트 최종 resolved background Queue는 batch1/concurrency1이다. 배포 설정의 consumer 한도와 item 내부 peak1은 서로 다른 증거로 각각 확인했다. 병렬 테스트 수를 운영 외부 호출 상한으로 해석하지 않는다.

### 최종 whole-branch gate — 대기

**아직 PASS가 아니다.** root가 Task7 코드 확정 후 한 번 실행할 `pnpm test`, `pnpm build`, `pnpm build:luvdia`, local validate-only chain, mirror check 및 최종 독립 브랜치 리뷰 결과는 실행 완료 후 아래를 채운다. 양 site 최종 doctor는 이미 PASS다. 기준 baseline27b0fdb8의 전체3456/3456+mirror10/10 PASS는 과거 기준이며 최종 전체 실행을 대신하지 않는다. `pnpm preflight`는 향후 병합 준비 때 실행하며 현재 로컬 승인 범위에는 넣지 않는다.

- `pnpm test`: **PENDING**
- `pnpm build` / `pnpm build:luvdia`: **PENDING**
- 양 site 최종 `d1:doctor`: **PASS**(local-otw-doctor-final.log/local-luvdia-doctor-final.log). 최종 `d1:reset:local -- --validate-only`/mirror check: **PENDING**(실제 reset 금지)
- 최종 독립 리뷰: **PENDING**
- 실제 관리자 양 site x_api rollback/RSS 비활성/Disabled 보존 및 임시 rollout flag 원상복구: **PASS**. 최종 local-final-rollback-readback.json과 local-preservation-readback.json에서 기존 legacy interval2h/원래 desired·cursor·데이터·장부를 보존했다. rollout flag는 exact value/timestamp CAS 후 원래 부재로 복구했다. x_api→Fx 재활성 시 오래된 proof 보존 방지는 별도 D1 회귀이며 실제 유료 수집은 하지 않았다.

## 판단 원장 — 원문 순서·비용 포함

아래는 계획별 progress의 모든 `Ruling:` 행을 기록 순서대로 보존한다. 뒤의 정정이 앞 판단을 대체할 때도 원문을 지우지 않는다. 구현 편의/fixture가 상위 계약을 변경한 AUTHORITY INVERSION과 추가 비용을 포함한다.

1. Ruling: Explicit Subagent-driven choice takes priority over the invoked executing-plans inline template — use fresh implementer + task reviewer for each task, final branch review — costs more reviewer contexts but matches user's choice. **비용·오판 영향:** 독립 검토 context가 늘어난다. 오판하면 사용자가 선택한 작업 방식을 어기거나 검토가 중복된다.
2. Ruling: Preserve original node_modules junction by moving the link itself to ignored .tmp/node_modules-original-link, then install a worktree-owned dependency tree — avoids mutating the original checkout while honoring existing-isolation rule — wrong interpretation would require restoring the saved link, no target data is deleted. **비용·오판 영향:** 격리 설치 디스크/시간이 추가된다. 오판하면 다른 checkout의 의존성을 변경하므로 보존한 junction을 복원해야 한다.
3. Ruling: Task gates use approved change-scoped commands and repository verification policy; baseline and final whole-branch pnpm test run cover the suite rather than seven redundant full runs — task TDD/required local checks remain mandatory — a missed cross-task regression must be caught/fixed by final full verification. **비용·오판 영향:** 교차 작업 회귀 발견이 마지막 전체 실행까지 늦어질 수 있다. 최종 whole-branch gate에서 실패를 해소해야 한다.
4. Ruling: Actual paid recovery, remote subscription effects, deployment and seven-day operational observation remain unchecked/deferred in Task7; only authorized local outcomes can be marked complete — no synthetic result substitutes for held external effects — production correctness/cost remains unproven until separately authorized. **비용·오판 영향:** 운영 보증과 실제 비용 판단은 미완료로 남는다. 오판하면 승인 없는 유료/원격 효과를 만들 수 있다.
5. Task 1: Ruling: add nullable sync_timeline_completed_at as explicit final-page durable checkpoint — origin scope/time alone cannot distinguish crash-before-first-fetch from empty-final-page/derived-pending — costs one additive column and checkpoint ack, avoids ID sentinel ambiguity and repeated paid timeline replay. In rss_v1 the final public completion can wait for required derived writes; legacy path remains unchanged. **비용·오판 영향:** 열 하나와 checkpoint ACK가 추가된다. 오판하면 빈 최종 페이지를 재구매하거나 정기 완료를 거짓 표시한다.
6. Task 1: Ruling: checkpoint-proven local derived repair can remain eligible when paid admission is exhausted — it requires no new user/timeline dispatch and still passes D1/Queue guards, optional paid hydration keeps gateway admission — costs a local repair job; a misclassification could cause no-op retries, covered by no-dispatch tests. **비용·오판 영향:** 로컬 복구 job 비용이 든다. proof 오판은 no-op 재시도를 늘릴 수 있어 no-dispatch 회귀가 필요하다.
7. Task 3: Ruling: add optional resumeFromItemId to internal RSS continuation and compare it (or current item ID for self-retry) against source pending pointer under account lease — a queued older snapshot must not replace a newer partial/finished batch — costs one internal metadata field; obsolete jobs may defer one tick but no candidate state is overwritten. **비용·오판 영향:** 내부 metadata 하나가 추가된다. false mismatch는 한 tick 지연, false match는 후보 진도 유실 위험이다.
8. Task 3: Ruling: align retry eligibility to the next existing UTC:23/:53 tick, not completion+30m — completion milliseconds would miss the next scheduled tick and silently halve throughput — actual retry spacing can be slightly under30m while existing item/concurrency bounds still hold. **비용·오판 영향:** 실제 재시도 간격이30분보다 조금 짧을 수 있다. 오판하면 tick 누락으로 처리량/복구 지연이 악화된다.
9. Task 3: Ruling: predecessor item ID alone is insufficient when a manual Queue retry updates that same predecessor; compare its current phase/candidates/nextAttemptAt with the queued copied snapshot atomically in pointer-claim UPDATE, excluding natural scope/resumeFrom differences — avoids adding another persisted revision field — false mismatch can defer one tick; false match could lose newer candidate progress and is covered by real D1 regression. **비용·오판 영향:** 원자 snapshot 비교가 길어진다. false mismatch는 지연, false match는 더 최신 후보를 잃는다.
10. Task 3: Ruling: put retention/pointer/repository checkpoint regression assertions in the existing new real-D1 RSS integration fixture and rerun owning retention/repository suites, instead of duplicating them in fake retention-unit or another fixture — stronger authoritative SQL coverage with less setup — maintainers must look in RSS integration for these cross-boundary regressions. **비용·오판 영향:** 교차 경계 회귀의 위치를 RSS 통합 fixture에서 찾아야 한다. 오판하면 보관 정책 변경이 검증에서 빠진다.
11. Task 3: Ruling: extend shared writeStoredPosts with an optional typed RSS write fence and one feature-owned SQL predicate helper, reusing it at post/derived/hash/source mutation boundaries; pin active member stable ID+exact URL instead of duplicating URL parsing in SQL — preserves all non-RSS callers and closes reviewed TOCTOU gap without duplicate writer/raw-SQL escape — costs a shared optional contract and larger consumer regression scope; changed member URL conservatively defers pending work until repinned. **비용·오판 영향:** 공유 writer의 optional fence와 소비자 검증이 늘어난다. 오판하면 중단/lease 손실 후 파생 쓰기나 거짓 ACK가 가능하다.
12. Task 4: Ruling: extend planned internal hydrateOfficialRssCandidates with a required fifth FxRssWriteFence argument injected by the owning RSS adapter; keep pure ports hydrateOfficial(candidates) unchanged — paid persistence must use Task3 same current account/item/member/policy boundary — costs one internal parameter and corresponding fixtures, avoids an unguarded paid write path. **비용·오판 영향:** 내부 필수 인자와 fixture 갱신이 필요하다. 오판하면 유료 결과가 현재 정책/lease를 벗어나 저장된다.
13. Task 4: Ruling: persist optional typed paidBatch (UTC day, original bounded IDs/order, stable request identity/path) in RSS continuation before paid dispatch, through a pure typed batch-checkpoint seam; retain it across new Cron items and partial writes, include it in predecessor snapshot CAS, start a new checkpointed batch on UTC rollover — avoids changed-path cache misses/paid redispatch without new client/cache — costs bounded continuation metadata and extra required checkpoint; invalid snapshots must be rejected. **비용·오판 영향:** bounded continuation metadata와 checkpoint가 추가된다. 오판하면 재구매 또는 parse 불가 상태로 후보가 고립된다.
14. Task 4: Ruling: expose optional newlyStoredPosts {id,createdAt,storedAt} metadata from actual INSERT acknowledgements through both RSS hydration/stats and independent official timeline result — timeline is the main unknown-ID recovery source, so candidate-only telemetry misses the goal — costs a bounded result field and existing return-chain updates; crash-lost observations must not be inferred as complete recovery evidence. **비용·오판 영향:** bounded 결과 metadata가 늘어난다. 오판하면 기존 행/관측 유실을 신규 독립 발견으로 과장한다.
15. Task 4: Ruling: add a distinct read-only gateway receipt metadata capability and dedicated LuvDia RPC/composition for stable id/operation/path with site match; never use an execute cacheOnly flag that an old peer could ignore and dispatch — fixes reproduced dispatch-before/settle-after-midnight cache replay while preserving existing requestXApi/client/settlement — costs one additive internal read contract and consumer mocks; unsupported/unknown is fail-closed pending, no observation writes or paid fallback. **비용·오판 영향:** 읽기 전용 capability/RPC가 추가된다. 오판하면 old peer가 cache-only 의도를 무시해 유료 dispatch할 수 있다.
16. Task 4: Ruling: RSS paid work becomes admitted/in-flight only at the existing site budget reservation UPDATE guarded atomically by the same current RSS policy/member/item/account/pointer fence; a prior live() read is not admission. Stop before claim means0dispatch/0reservation; stop after successful fenced claim allows existing gateway/settlement to finish and preserve cost while post/source writes remain fenced — no distributed lock/new ledger/cancellation protocol — costs a typed request-admission fence and reserve-SQL regression; at most an already admitted bounded request may finish after stop. **비용·오판 영향:** 원자 reservation fence 검증이 추가된다. 오판하면 중단 전에 미승인 dispatch, 반대로 admitted 정산 유실이 가능하다.
17. Task 4: Ruling: supersede prior same-UTC retention of a fully processed HTTP200 partial-response batch. AUTHORITY INVERSION: controller accepted a cache/test expectation that could delay recovered-upstream missing IDs past the user24h target. Keep original batch for crash/incomplete storage, but once all returned rows are durably processed/excluded, checkpoint retirement and retry only absent unresolved IDs at next existing eligible tick under budget/backoff — costs additional failure-ID-only requests, never duplicate already-returned IDs; no new cadence/client/cache/ledger. **비용·오판 영향:** 미응답 ID 전용 추가 요청 비용이 든다. 오판하면 이미 받은 ID를 다시 구매하거나24h 목표를 놓친다.
18. Task 5: Ruling: extend coordinator UUID/expiry lease with a monotonic control revision and site-applied revision/token/expiry metadata; keep public site port signatures via bound controls and DISTINCT private fenced RPC methods, unsupported peers fail closed — coordinator-only token cannot order delayed cross-DB RPC commits — costs one additional generated additive revision migration plus internal envelope/CAS; no third desired toggle. Rejected holding all controls up to10min after uncertain RPC because it adds stop/rollback unavailability; revision keeps safe retries available. **비용·오판 영향:** generated migration/내부 envelope/CAS 비용이 든다. 오판하면 늦은 cross-DB 제어가 최신 Disabled를 뒤집는다.
19. Task 5: Ruling: a legacy official collector may retire old hybrid origin/start/final-page proof only after acquiring the same account lease, before legacy work, while preserving pagination/base/newest/last-seen/data/clocks/ledger — clearing only at mode switch can race an old collector — costs a conservative future recheck if legacy then blocks, avoids falsely completing a later hybrid period. **비용·오판 영향:** legacy가 차단되면 미래에 보수적 재대조가 필요하다. 오판하면 오래된 proof로 새 정기 주기를 거짓 완료한다.
20. Task 5: Ruling: Disabled terminally skips all pending inbox entries including leased work with an explicit reason; already-dispatched hydration still completes idempotent settlement/cache and retains cost, but inbox/publication completion is not required after disable — prevents re-enable from replaying disabled-time work — costs possible delayed availability of one already-paid in-flight post through normal JSON/official recovery; existing stored posts are not redacted. **비용·오판 영향:** 이미 지불한 한 글의 공개가 정상 복구까지 늦어질 수 있다. 오판하면 Disabled 이전 backlog가 다시 실행된다.
21. Task 5: Ruling: persist an exactly attributable owned remote ID/expiry under current fence before deletion so failed cleanup retains known remote1/error; ownership mismatch stays blocked and untouched. Keep numeric counters as known local counts and Task6 displays remote-unknown on errors rather than verified0 — preserves DTO compatibility/read-only observation — unknown remote count remains an explicit UI/status limit, not false success. **비용·오판 영향:** 원격 개수가 오류 시 unknown으로 남는다. 오판하면 소유권 없는 구독 삭제나 거짓0을 보고한다.
22. Task 5: Ruling: Disabled no-replay applies to coordinator/outbox pending delivery and already-read delayed site RPC, as well as inbox. Terminalize only the disabled site and preserve other-site work/incurred shared fee; use immutable delivery admission metadata plus site disable barrier (existing revision metadata or equivalent) if needed — design excludes not-yet-started hydration regardless queue stage — costs internal delivery metadata/validation and intentionally skips pre-disable backlog; no new desired toggle or automatic migration activation. **비용·오판 영향:** 내부 delivery metadata/validation과 backlog 포기가 추가된다. 오판하면 중단한 site의 이전 작업이 재생된다.
23. Task 7: Ruling: treat Fx omission of an already-known quote/reply as incomplete relation evidence, even when the coarse relations completeness flag is true; preserve each known relation independently while retaining higher-authority official/webhook corrections — actual normal replay erased an immutable reply and violates the spec's existing relation preservation — costs possibly retaining an erroneous Fx relation until authoritative correction; no new source/lookup or hidden-content restoration. **비용·오판 영향:** 잘못된 기존 Fx 관계를 상위 권한 정정 전까지 보존할 수 있다. 오판하면 known relation/preview를 지우거나 공식 정정을 막는다.
24. Task 7: Ruling: after the preservation fix and regression pass, repair only the one locally lost reply from the exact pre-run backup using an asserted same-row/revision/value CAS and recompute content hash through the existing content-key formula; record this as backup data repair, never as RSS discovery/normal-flow success — restore data damaged by our authorized local verification without paid calls or resetting DB — costs one local row revision/write; abort on any intervening change or mismatched backup instead of overwriting. **비용·오판 영향:** 로컬 한 행 revision/write 비용이 든다. CAS 오판은 동시 변경을 덮어쓰므로 불일치면 중단해야 한다.
25. Task 7: Ruling: temporarily enable only existing local scheduled_v2_x_collection_enabled rollout flag through documented D1 operator configuration, since no administrator UI owns rollout flags and both actual local rows were absent; retain normal administrator rss_v1 activation and every Cron/Workflow/Queue/admission guard, restore original absence afterward — docs/operations/scheduled-jobs-v2.md defines this prerequisite and no RSS manual endpoint exists — costs two reversible local settings rows; wrong prep can schedule local X work, bounded by stripped X credentials and isolated service aliases. Not provider/candidate/cursor injection or operational rollout. **비용·오판 영향:** 가역 로컬 설정 두 행이 추가/제거된다. 오판하면 의도하지 않은 로컬 Cron이 실행되므로 빈 X 자격/격리 RPC와 복구 readback이 필요하다.

26. Task 7: Ruling: reuse existing precise D1 regressions for rollback/RSS-paid clocks/GET-no-write and add missing native integration coverage without manufacturing product RED for already-correct Task1–6 behavior; report fixture calibration failures only as setup errors and keep real merge/normal-collector RED as Task7 product TDD evidence — the accepted outcome outranks a plan instruction to force every new boundary test to fail — costs no pre-change native failure evidence; stronger native assertions and fresh composed gates must carry those cases. **비용·오판 영향:** 기존 정상 경계의 pre-change native RED는 없다. 잘못 재사용하면 실제 경계 결함을 놓칠 수 있어 강화한 native/assertion과 fresh composed gate 및 실제 흐름을 함께 확인한다.

위 backup 복구 판단의 실행 세부는 뒤 readback으로 명확해졌다. hash를 손으로 채우지 않고 NULL 기존 repair marker를 사용했고, 같은 관리자 정상 collector가 content-key 공식으로 hash를 acknowledgement했다. facts/reference 원래 부재를 유지했으며 이번 실험의 수리를 신규 발견으로 계산하지 않았다.

## 남은 보류·위험과 다음 행동

- 보류3a: 실제 공식 독립 발견/정상 유료 복구는 별도 승인된 자연 주기에서 확인해야 한다. 알려진 ID 진단이나 fixture 성공을 대체 증거로 사용하지 않는다.
- 보류4b: 승인된 릴리스에서 OTW 관리자→소유 구독/Worker 저장/공개 readback→LuvDia 순서로 운영 전환한다. 로컬 정상 Apply는 운영 전환 완료가 아니다.
- 보류5a: 그 후7일 기존 결과/ledger를 읽어 관측한다. 새 자동화·유료 강제 실험·자동 예산 증액은 만들지 않았다. 장기 안정성/실청구 절감/실제24h 회복은 미검증이다.
- 기존 자정 추정 장부는 dispatch-day site reservation과 response-day usage/shared settlement가 달라 두 site daily 행에 한 요청을 보수적으로 중복 합산할 수 있다. 자정을 넘는 응답에서 발생 가능하고 금액 과소계상보다 추가 차단/지연이 문제다. 청구가 두 번 된다는 증거는 없다. 이번 작업은 기존 정산 정책을 고치지 않았고 별도 재무 검토가 필요하다.
- 낮은 가능성의 deferred Minor: 비정상 내부 설정 JSON의 양수 overflow `1e999`를 SQL activation predicate가 허용하지만 JS는 finite 검사로 거절한다. 정상 관리자 시각은 유한수라 정상 흐름 영향은 낮다. 악성/잘못된 내부 직접 설정과 진행 중 race가 함께 필요하며 후속 일관화가 필요하다. 이 보고서는 해결을 주장하지 않는다.
- 예산 부족·실제 rate limit·공급자 장애가 지속되면24시간 목표를 넘을 수 있다. UI의18h attention/24h overdue와 차단 사유로 드러내며 예산 증액/새 cadence/새 공급자를 자동으로 도입하지 않는다.
- 관계 생략 보존은 Fx의 기존 잘못된 관계를 상위 권한 정정 전까지 남길 수 있다. 관계 소실을 막는 승인된 보수적 선택이며 새 lookup이나 hidden 내용 복원을 추가하지 않았다.

최종 전체 gate와 독립 리뷰가 채워지기 전까지 이 문서는 로컬 검증·최종 gate 대기 기록이다. 배포나 공식 유료 검증을 자동 재개하는 지시가 아니다.
