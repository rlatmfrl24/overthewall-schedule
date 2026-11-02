# X REST·웹훅 변경의 두 축 리뷰 및 수집 최적화 검토

2026-11-03. 최초 판정: **배포 전 Spec P2 두 건 보완이 필요하다.** 아래는 당시 실패 증거이며 후속 수정·재검토는 마지막 절에 기록한다. 앞선 관련419건 PASS는 당시 실행한 범위의 증거이며, 새로 재현한 실패 조건까지 검증한 결과가 아니다. 최초 검토에서는 제품 코드·기존 테스트·운영 상태를 수정하지 않았다.

## 검토 범위와 방법

- 고정 기준: `6897d7b9cc69f45cd009a8fc0c9b18b6f80edd4a`, 현재 HEAD도 같다.
- `git diff 6897d7b9...HEAD`, `git log 6897d7b9..HEAD --oneline`은 미커밋 작업이므로 비어 있다. 현재 변경 검토라는 요청에 따라 `git diff 6897d7b9 -- worker src/features/member-posts/ui/admin/x-collection-monitoring.tsx`를 고정 WIP diff로 사용했다.
- 범위: 해당 제품/테스트12파일, [구현 보고서](2026-11-03-x-rest-budget-recovery.md), current-work의 새 X REST 절. 기존 Haiku/Play 문서는 제외했다.
- 제품/테스트 WIP diff의 `git hash-object --stdin` 결과: `4d9089780940701f42ba106caea7c129bff5e3bc`. 검토 전후 동일하다.
- Spec은 사용자의 ‘하루$1 유지·REST 예약 경합/반복 이월 수정·안전한 웹훅 보강 절감 검토·예산 조정 검토’ 요청이 최상위다. 구현 보고서는 해당 요구의 주장과 검증 범위를 설명하는 보조 자료다.
- `docs/agents/issue-tracker.md`는 없다. setup 스킬은 저장소 구성 변경을 명시적으로 요청한 경우의 작업이므로, 트래커를 새로 만들지 않고 대화의 요구와 로컬 보고서를 사용했다.
- Standards와 Spec을 별도의 신규 하위 에이전트로 병렬 검토했다. 아래 결과는 축을 섞어 우열을 정하지 않았다.

## Standards

문서화된 규칙 위반 **0건**, 판단에 따른 코드 냄새 **1건**이다.

**낮음·비차단 / Duplicated Code (판단).** `scheduled-job-coordinator.ts:101–103`과 `scheduled-job-planner.ts:306–308`의 `items.some(item => item.continuation?.recoveryOnly)` → `updateRunSummary(..., { xCollectionScope: "pending" })` 패턴이 중복된다. 이후 복구 범위 판정이 바뀔 때 한 경로만 수정하면 전체 cadence 최종화가 달라질 수 있다. 두 진입점을 함께 유지해야 한다. 현재 세 줄 규모에서 별도 추상화까지 요구하지 않는다. 이는 유지보수 판단이며 저장소 규칙 위반이 아니다.

Capability 공개 진입점, infrastructure의 D1/API 소유권, 기존 DTO 호환성, 원자적 예약·정산, source lease, 저장 후 cursor 확인, redaction fence를 약화한 지점은 이 정적 Standards 검토에서 발견하지 못했다. 기준은 `.agent/rules/architecture.md`의 Ownership Rules, `project-standards.md`의 API Contract Conventions·Verification Gates, code-review-otw의 idempotency/race 검토 절차다. 테스트 재실행·운영 UI·유료 API 확인은 Standards 에이전트가 수행하지 않았다.

## Spec

### P2 — 실패한 보강 요청까지 게시물·UTC일 키로 공유

요구: ‘웹훅 보강 조회 비용도 **안전하게** 줄일 수 있는지 확인’. 구현 보고서는 ‘같은 날의 **확정된 미디어 응답**을 재사용’한다고 설명한다.

`worker/features/x-posts/infrastructure/x-activity-site.ts:175`의 새 키는 성공 응답뿐 아니라 게이트웨이의 `blocked` 상태와 실패 응답도 공유한다. 첫 이벤트의 보강이 임시 공통 예약으로 차단되면, 예약 해제 후 도착한 같은 Post의 다른 이벤트도 `x-shared-budget.ts:99–101`에서 원래의 `budget_exceeded`를 받아 다음 UTC일까지 연기된다. 임시 차단이 해당 글의 당일 공통 차단으로 남는다.

실제 `D1SharedXApiGateway`와 `requestXApi`를 격리 Node24 SQLite에서 실행했다. 공통 예약990,000으로 첫 요청은 외부 호출 없이 차단됐다. 예약0으로 해제한 뒤에도 같은 키는 차단됐지만, 새 이벤트 키를 쓴 대조 요청은 성공했다. 공급자 응답은 네트워크 없는 로컬 stub이며 관측된 공급자 호출은 대조 요청1회다. 이 순차 재현에는 동시 DB transaction 동작 차이가 결론에 영향을 주지 않는다.

필요한 수정: **공통 성공 캐시와 실행 시도/차단 claim의 수명을 구분한다.** 확정 성공 payload만 공통 재사용하거나, 외부 요청 전 차단된 claim을 원자적으로 재승인한다. 실제 호출 여부가 불명확한 요청을 무조건 다시 보내면 안 되며 기존 idempotency·삭제 fence를 유지해야 한다.

### P2 — 복구 완료 계정이 다음 전체 점검에서 빠짐

요구: ‘REST의 … **반복 이월 문제를 수정**’. 구현 보고서는 ‘전체 수집의24시간 cadence는 … 연기하지 않는다’고 설명한다.

새 미완료 복구 계획은 `scheduled-job-planner.ts:61`에서 전체 cadence보다 먼저 실행된다. 하지만 `x-api.ts:2769`는 기존 오류나 커서가 있으면 원래 예정 시각을 버리고, `:1625`, `:1679`에서 해당 source의 `next_check_at`을 복구 완료+24시간으로 만든다. 최적화 모드의 다음 전체 점검은 그 계정을 아직 이르다고 판단해 건너뛴다. 성공 후 오류·커서는 없어졌으므로 `x-collection.ts:357`의 별도 복구 대상에서도 빠진다.

정상 Worker/D1의 coordinator → outbox/Queue → executor → finalizer 경로로 재현했다. 전체 기준10:00 KST, 지연 복구12:00 KST일 때 다음날10:00 전체 실행의 timeline 누적 호출이 기대2회가 아닌 **1회**였다. source 자격이 돌아오는12:00에도 planner가 빈 목록을 반환했다. 따라서 다음 전체 주기까지 추가로 밀릴 수 있다.

필요한 수정: 복구 작업에 원래 전체 주기의 기준을 영속적으로 전달하거나 source eligibility를 다음 전체 주기에 맞춘다. 실제 조회/완료 시각은 사실대로 보존한다. 복구 성공 직후뿐 아니라 **그 다음 전체 점검에서 실제 요청이 발생하는지** 회귀에 포함해야 한다.

## 재현 증거

- `.tmp/2026-11-03-x-review/gateway-proof.json`: 차단 키 지속과 새 키 성공 대조.
- `.tmp/x-spec-review-gateway.mts`: 실제 게이트웨이를 사용한 순차 SQLite 재현. 명령: `.tmp/node24.exe --import tsx .tmp/x-spec-review-gateway.mts`.
- `.tmp/2026-11-03-x-review/cadence-proof.log`: 정상 Worker/D1 흐름에서 기대2회/관측1회로 FAIL한 회귀.
- `cadence-repro.txt`, `cadence-config.txt`: 같은 `.tmp` 폴더의 재현 원본. 임시 테스트는 기존 통합 테스트와 같은 디렉터리에 생성해 실행한 뒤 원본을 이 폴더에 보존하고 작업 소스에서는 제거했다.
- 실시간 운영·유료 X 호출은 하지 않았다. 제품/테스트 diff는 변경하지 않았다. 신규 실패를 확인하기 위한 좁은 재현만 실행했으며 전체 suite/preflight를 재실행하지 않았다.

## 수집 방식 개선·최적화 방향

1. **먼저 두 P2의 상태·시각 모델을 고친다.** 공통 성공 캐시/시도 claim과 전체 점검 기준/실제 완료 시각을 구분하면 이번 실패를 제거하면서 이후 최적화도 안전해진다. 새 계층을 넓게 만들기보다 기존 continuation·게이트웨이 상태·source cadence를 활용하는 것이 우선이다.
2. **다음 절감 후보는 REST와 웹훅 사이의 확정 보강 결과 재사용이다.** 현재 새 키는 웹훅 보강끼리만 묶고 timeline·별도 조회는 다른 요청 키를 쓴다. 원본/보강의 필드 완전성·조회 시각·작성자·삭제 상태를 증거로 남긴 결과만 재사용할 수 있다. 단순히 `x_posts`에 행이 있다는 이유로 미디어 확인을 생략해서는 안 된다. 실제 두 경로의 동일 Post 중복량부터 측정해 도입 효과를 판단한다.11/02 웹훅 보강62회는62개 고유 Post였으므로 현재 동일 Post 중복 방지만으로 그날$0.310은 줄지 않는다.
3. **페이지는 무조건 작게 만들지 않고 예산에 맞추되 공급자 동작을 확인한다.** X는 가능한 큰 페이지로 요청 수를 줄이고, `next_token`이 없어질 때까지 이어 읽도록 안내한다. 토큰의 문자값 보존만으로 가변 크기 재개의 실제 품질을 입증하지 못한다. 현재 문서에서 기존 token과 `max_results` 변경을 금지하는 근거는 찾지 못했으므로 결함으로 단정하지 않는다. 다만 배포 전후 대표 token 재개·만료·빈 페이지·중복/누락을 실제 응답으로 확인해야 한다. [X pagination](https://docs.x.com/x-api/fundamentals/pagination), [timeline 요청 범위5–100](https://docs.x.com/x-api/users/get-posts)
4. **공통$1은 유지하며 원인별 사용량과 대기를 관측한다.** 실제 비용과 미정산 예약, 중복 적중, 실제 X 과금, 미완료 대기시간, 한도로 잘린 수신 구간을 구분한다. 최적화·증액의 효과를 평균 장부만으로 판단하지 않는다. X의 UTC일 중복 과금 제거는 soft guarantee이므로 이를 엄격한0원 예약의 근거로 삼지 않는다. [X 요금과 중복 과금](https://docs.x.com/x-api/getting-started/pricing)

보류할 방향: 웹훅 정상만으로 REST 생략, 최신 웹훅 ID로 REST 완료 커서 전진, 첨부 필드 부재를 미디어 없음으로 간주, 아카이브한 구간 재검사 방식의 재도입, 자동 예산 인상. 누락·권한·청구 경계를 바꿀 수 있으며 이번 검토에서 도입 근거를 확보하지 못했다. X는 이벤트 필드 가용성이 달라질 수 있다고 설명한다. [X 이벤트 원본 계약](https://docs.x.com/x-api/activity/event-payloads)

Standards: 규칙 위반0·비차단 냄새1(최대 영향은 두 진입점의 중복 판정 유지보수). Spec: P2 2건(실패 보강 키 공유·복구 후 다음 전체 점검 누락). 현재 배포 준비 완료로 판정하지 않는다.

## 후속 수정 — 사용자 승인 후

- 보강 시도는 이벤트별 키를 복원하고, 공통 조회는 같은 UTC일·경로·operation의 완료 성공 응답만 반환한다. 같은 ID의 기존 claim은 우회하지 않는다. 임시 공통 예약 차단/공급자503 이후 별도 이벤트가 성공하는 회귀를 추가했다.
- 복구 계획에 원래 전체 점검 기준을 저장해 Queue 지연에도 executor·수집기·source 다음 점검까지 전달한다. 실제 성공 시각과 전체 cadence를 보존한다. 최적화 on/off 모두 정상 coordinator→outbox→Queue→최종화 후 다음 전체 점검에서 실제 timeline 요청이 발생하는 회귀를 추가했다.
- 복구 범위 표시와 item 저장을 planner의 `addPlannedItems`에 모았다. 두 진입점 모두 기준 시각과 `xCollectionScope=pending`을 영속화하는 테스트를 추가했다.
- 수정 전 신규4건 FAIL, 수정 후 관련5파일117건 PASS, 추가 planner 두 경로 포함13건 PASS를 확인했다. 고유119건의 후속 범위 검증이다. 외부 응답은 로컬 stub이며 운영 성공을 뜻하지 않는다.
- Spec 재검토에서 HTTP200 부분 미디어 응답도 공유하던 추가 P2를 재현했다. empty/missing_media 실패 회귀 후 캐시에 단일 게시물·현재 dispatch의 게시물/작성자 일치·오류 없음·미디어 준비 검증을 추가했다. `includes` 누락은 빈 객체로 처리해 예외 대신 unavailable로 종료한다. empty/missing_media/wrong_author/wrong_post/partial_error 다섯 변형 PASS, 관련6파일90건 PASS와 추가 세 변형 PASS를 확인했다.
- 독립 최종 재검토: **Standards hard 위반0·의미 있는 냄새0, Spec 미해결0/PASS**. Spec 에이전트는 기존 실패 격리·다음 전체 점검·삭제 관련8건도 독립 실행해 통과했다. 최종 부분 응답 보완은 두 축 모두 정적 재검토했으며, 전체 최종 게이트 결과는 구현 보고서에 기록한다.
- 최초 최종 게이트의 타입 호환 오류를 런타임 변경 없이 보정했다. 이후 전체401파일3,400건+보조10건, 타입·린트·구조·양 사이트 빌드·로컬 DB·mirror의 구성요소가 모두 PASS했다. fail-fast 후 합성 검증이며, 기존 로컬 인덱스0157·0158의 미적용과 해소까지 [최종 검증 기록](2026-11-03-x-rest-budget-recovery.md)에 남긴다.
