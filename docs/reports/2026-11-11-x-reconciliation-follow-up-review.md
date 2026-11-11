# 공식 X 대조 후속 조사

2026-11-11 KST · `236fd349` 위의 미배포 작업본 · 정상 구간 큐 재개, 응답 재사용, 인용 분할 반영 후

저장 글을 다시 읽지 않는 대조에는 현재의 ID 구간 조회를 유지할 근거가 있다. 남은 성능 개선은 **인용 원문 조회의 D1 왕복을 줄이고, 인용 대상 하나에 쓰는 행 수를 제한하는 것**이다. 여러 글이 몰린 구간에서는 페이지 크기도 조정할 수 있으나, 33구간 표본처럼 대부분 빈 구간에는 이득이 없다. [X 사용자 타임라인](https://docs.x.com/x-api/users/get-posts) · [인용 보강 실행](../../worker/features/x-posts/infrastructure/x-reference-hydration.ts#L281)

## 현재 구현 재확인

로컬 Worker 통합 테스트를 다시 실행해 아래 4건과 과거 누락 ID 재발견 4건이 통과했다. X 응답은 테스트에서 제어했으며 33구간 시나리오의 시각은 진행시키지 않았다. [큐 통합 테스트](../../worker/features/scheduled-operations/infrastructure/x-hybrid.integration.test.ts#L49) · [과거 누락 ID 재발견](../../worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts#L46)

| 표본 | 관측 결과 | 읽는 방법 |
| --- | --- | --- |
| 공식 대조 33구간 | X 요청 33회, 서로 다른 경로 33개, 즉시 재개 16회, 최대 D1 45회 | 다음 Cron 슬롯을 기다리지 않았다는 시뮬레이션이다. `$0.005`는 표본의 내부 정산액이다. |
| 링크 전용 인용 대기 20건 | 12회 실행, 최대 D1 45회 | 링크 전용 정책대로 처리했다. 인용 원문을 유료로 불러오는 표본과는 작업량이 다르다. |
| 작성자 보강 인용 대기 2건 | 6회 실행, 최대 D1 50회 | 이 표본은 무료 한도까지 사용했다. 미디어 혼합, 캐시 적중·미적중, 여러 글이 같은 원문을 인용하는 경우의 상한은 이 숫자로 판단할 수 없다. |
| 예산 부족과 백오프 | 저장 응답을 재생해 완료, 추가 X 호출 0회 | 공급자 응답 저장 뒤 사이트 진행 기록 실패를 재현했다. 저장 응답이 남아 있을 때의 결과다. |

두 실행 모두 `pnpm.cmd exec vitest run --config vitest.all.config.ts --project=worker-integration`을 사용했다. 큐 통합 파일은 `-t 'bounded official gap sweep|waiting quotes|settled timeline response'`, 대조 정책 파일은 `-t 'recovers historical missing post'`를 적용했다. D1 Free의 50회는 Worker 실행당 호출 한도이고, D1 일일 사용량과 유료 요금은 읽고 쓴 행을 기준으로 센다. [D1 호출 한도](https://developers.cloudflare.com/d1/platform/limits/#batch-limits) · [D1 요금과 행 수](https://developers.cloudflare.com/d1/platform/pricing/#definitions)

## 추가 로컬 재현

기존 통합 테스트를 임시 복제해 실패 조건을 주입했다. 두 조회 정책 시험, 두 관리자 결과 시험, 큐 경쟁 시험, 늦은 DLQ 시험, 입력 형식 시험의 총 7개 단언이 관측 결과와 일치했다. 복제 파일은 검증 후 제거했다.

| 조건 | 관측 결과 | 보완 방향 |
| --- | --- | --- |
| 같은 항목의 다음 큐 메시지가 전송된 뒤 첫 메시지가 DLQ에 도착 | 첫 두 페이지까지만 저장됐고 항목은 `queue_retries_exhausted`로 실패했다. 전송됐던 정상 후속 메시지도 다음 페이지를 진행하지 못했다. | 실행 회차를 메시지에 포함하고 해당 회차가 여전히 유효할 때만 처리권 또는 실패 상태를 갱신한다. [DLQ 분기](../../worker/app/scheduled-queue.ts#L124) · [실패 기록](../../worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts#L944) |
| 동일 계정의 저장 요청 URL에서 매개변수 순서만 변경 | 정산된 응답 본문을 게이트웨이에서 읽을 수 있었으나, 재개는 `x_gateway_identity_conflict`로 끝났다. 확인점은 100이고 저장 요청은 그대로였다. | 동일 계정은 검증된 저장 경로로 재개한다. 실제 계정 ID 변경은 별도 전환으로 처리한다. [요청 재구성](../../worker/features/x-posts/infrastructure/x-api.ts#L2218) |
| 백오프 중 재사용할 정산 응답 54개 | 한도 없는 플래너는 D1 56회로 54개를 계획했다. 한도 50회를 적용하면 6회가 거부됐고 48개만 계획했다. | 후보를 제한된 묶음으로 확인한다. 호출 한도 거부와 응답 미존재를 구분해 나머지 대상을 다음 계획에서 이어간다. [후보별 조회](../../worker/features/x-posts/infrastructure/x-hybrid-policy.ts#L56) |
| 우선순위가 높은 계정의 후속 메시지 전송 실패, 같은 실행의 다른 계정 준비 완료 | 전송 기록은 60초 뒤로 밀렸지만 다른 계정도 `queued`에 남았다. 같은 시각에 전송을 재시도한 결과 선택된 항목은 0개였다. | 순위 판정에 실제 전송 가능 시각을 반영한다. 이미 실행 중인 계정의 독점 조건은 유지한다. [순위 조건](../../worker/platform/scheduled-jobs/item-execution-priority.ts#L9) · [전송 재시도 시각](../../worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts#L648) |
| 전송 실패 직후 관리자 결과 조회 | DB 전송 기록은 `failed`였고 관리자 DTO는 `retryPending=false`, `nextRetryAt=null`이었다. | 실행 시도 횟수와 전송 실패를 각각 판단한다. [재시도 표시 조회](../../worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts#L1170) |
| 링크 전용 인용 20건의 최종 관리자 결과 조회 | D1의 이월 처리와 상위 `previewDeferred`는 20건이었다. 관리자 DTO의 중첩 인용 결과는 검토·이월 각각 2건으로 마지막 실행분만 표시했다. | 전체 실행의 인용 건수를 합산하고 마지막 상태 및 다음 재시도 예정 시각을 따로 보존한다. [결과 누적](../../worker/features/scheduled-operations/infrastructure/scheduled-job-executor.ts#L342) · [관리자 화면](../../src/features/member-posts/ui/admin/x-collection-monitoring.tsx#L135) |
| 좋아요 수와 이미지 너비가 문자열인 X 응답 | 문자열이 D1에 저장됐고 공식 확인점이 100에서 110으로 이동했다. | 수치 필드를 저장 전 검증하거나 계약에 맞는 값으로 정규화한다. [타임라인 응답 검증](../../worker/features/x-posts/infrastructure/x-timeline-gaps.ts#L52) · [수치 저장 형식](../../worker/features/x-posts/infrastructure/x-api.ts#L1881) |

기존 토큰 만료 테스트에는 같은 구간을 다시 열 때 이미 저장한 글 130·125가 다시 반환되는 경로가 있다. 만료된 토큰은 버리고 미완료 구간 안에서 현재 저장한 ID들을 새 경계로 삼으면 재반환을 피할 수 있다. 원래 구간의 상한과 공식 확인점은 유지한다. 숫자 ID의 엄격한 페이지 순서를 가정해 가장 작은 ID 아래만 읽는 방법은 X가 시간 역순을 문서화한 것만으로는 정당화하기 어렵다. [토큰 만료 테스트](../../worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts#L167) · [경계 선택](../../worker/features/x-posts/infrastructure/x-timeline-gaps.ts#L110) · [X 페이지 순서](https://docs.x.com/x-api/fundamentals/pagination)

## 개선 후보

### 인용 원문과 접근 상태를 묶어서 읽기

`readStoredXPreview`는 원문과 캐시가 모두 없을 때 가림 확인, 사이트 저장 글 조회, 캐시 조회를 순서대로 실행한다. 캐시가 있으면 작성자의 보관 상태를 확인하는 조회가 추가된다. 먼저 배치에 들어온 원문 ID에 한해 이 조회들을 한 번에 가져오고, 기존 가림 판정과 로컬 글 우선순위로 결과를 해석한다. 호출만 줄이는 최소 변경은 기존 SQL을 `db.batch()`로 묶는 것이고, 읽는 행까지 줄일 때는 제한된 ID 집합으로 인덱스 조회를 하며 작성자 보관 목록을 한 번만 읽는 방식을 비교한다. 보통의 캐시 미스 20건에 대해 조회 단계만 60회에서 20회로 줄이는 것은 건당 3회가 1회로 바뀐다는 계산이다. 실행 전체의 절감량이나 운영 비용 실측은 아니다. [원문 조회](../../worker/features/x-posts/infrastructure/x-reference-store.ts#L109) · [D1 배치와 트랜잭션](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) · [쿼리 계획 확인](https://developers.cloudflare.com/d1/best-practices/use-indexes/#test-an-index)

현재 인용 대상 잠금과 보류 업데이트는 선택된 인용 행 수와 별개로 같은 원문 ID의 다른 인용 행까지 갱신할 수 있다. 한 원문을 수많은 글이 인용하면 호출 한도 안에서도 쓰기 행이 커질 수 있다. 원문 ID의 독점 권한을 보존하면서 실제 인용 행 갱신을 현재 처리 범위로 제한하는 방법을 검증한다. 원문 전체가 가려진 경우의 전파와 다른 인용 행의 작성자 상태는 각각 보존해야 한다. 검증 시 `rows_read`, `rows_written`, 최대 호출 수, 큐 실행 횟수를 따로 기록한다. [원문 잠금](../../worker/features/x-posts/infrastructure/x-reference-hydration.ts#L71) · [보류 상태 갱신](../../worker/features/x-posts/infrastructure/x-reference-hydration.ts#L348) · [D1 결과 메타데이터](https://developers.cloudflare.com/d1/platform/pricing/#how-can-i-estimate-my-eventual-bill)

### 재개 메시지의 우선순위와 저장 응답 수명

현재 재개는 진행 결과와 같은 항목의 outbox를 한 D1 배치로 저장한다. 재전달되면 항목의 상태와 lease를 확인하며, 전송 결과는 outbox lease에 맞을 때만 반영한다. 다만 동일 실행 내 순위는 기한·마지막 시도 시각·키로 정해지고 재개할 때 순위가 유지된다. 상위 계정이 바로 재등록되면 하위 계정은 앞선 계정이 끝날 때까지 기다릴 수 있다. 시급한 기한 우선순위는 유지하고, 비슷한 기한의 두 계정이 동시에 준비됐을 때만 일정 횟수 이후 한 차례 양보하는 방식은 별도 검증할 가치가 있다. 짧은 후속 작업과 긴 작업을 함께 넣어 첫 실행 대기, 중복 배달, 전송 실패 후 복구를 함께 측정한다. 정상 흐름의 메시지 17개는 작은 메시지와 재시도 없음 가정에서 쓰기·읽기·삭제 51개 작업에 해당한다. 이전 방식도 큐를 쓰므로 이 수치를 이전 대비 추가 비용으로 해석할 수 없다. [재개 저장](../../worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts#L839) · [실행 순위 조건](../../worker/platform/scheduled-jobs/item-execution-priority.ts#L1) · [전달 보장](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) · [큐 요금](https://developers.cloudflare.com/queues/platform/pricing/)

예산 또는 백오프가 걸린 계획 단계에서 후보별로 저장 응답을 한 번씩 확인한다. 미완료 계정이 많이 쌓이면 동시에 실행하더라도 후보 수만큼 D1 또는 서비스 바인딩 호출을 소비한다. 우선순위를 계산한 뒤 제한된 묶음으로 영수증 상태를 조회하는 것이 개선 방향이다. 양 사이트의 식별자·요청 경로 검증을 동일하게 적용하고, 본문을 읽을 때 현재의 가림 재검증을 거쳐야 한다. [후보별 영수증 확인](../../worker/features/x-posts/infrastructure/x-hybrid-policy.ts#L51) · [영수증 조회와 가림 검사](../../worker/features/x-posts/infrastructure/x-shared-budget.ts#L71) · [사이트별 게이트웨이](../../worker/app/x-gateway.ts#L20)

영수증 정리는 직전 UTC 날짜보다 오래된 결과를 대상으로 한다. 완료 응답이 정리되면 같은 요청 ID도 새로 실행될 수 있고, 공급자 과금 결과가 불명확한 요청은 10분 후 새 시도로 이어질 수 있다. 현재 X의 같은 UTC 일자 중복 과금 제거는 예외가 있으며 자정에 초기화된다. 장기 복구를 개선할 때는 사이트의 진행 기록 확인과 아직 적용하지 않은 결과의 보관을 함께 다룬다. 가림 응답을 복원하거나 과금이 불명확한 요청의 예약액을 곧바로 해제하지 않도록 검증한다. [정리 규칙](../../worker/features/x-posts/infrastructure/x-activity-coordinator.ts#L362) · [공유 게이트웨이의 미확정 요청 처리](../../worker/features/x-posts/infrastructure/x-shared-budget.ts#L137) · [X 중복 과금 정책](https://docs.x.com/x-api/getting-started/pricing#deduplication)

### 글이 몰린 한 구간의 페이지 크기

X 사용자 타임라인의 `max_results`는 5–100이다. 현재 구간 조회는 5를 사용한다. 한 구간에 누락 글 25건이 있고 공급자가 각 페이지를 채운다는 가정에서 5·10·25개 페이지는 각각 5·3·1회의 조회가 필요하다. 일반 게시글 읽기만 계산하면 세 방식 모두 `$0.125`다. 첨부 확장을 포함한 현재 코드의 한 요청당 공유 예산 예약액은 각각 `$0.125`·`$0.250`·`$0.625`다. 빈 구간에는 현재 크기를 유지하고, 가득 찬 페이지가 관찰된 범위나 과거 누락 밀도가 높은 범위에서만 더 큰 값을 시험할 수 있다. 토큰이 걸린 페이지는 기존 요청 조건을 고정하고, 선택한 크기와 경로를 저장해 재개 시 같은 요청 ID를 보존한다. [X 조회 크기](https://docs.x.com/x-api/users/get-posts#parameter-max-results) · [X 페이지 토큰](https://docs.x.com/x-api/fundamentals/pagination) · [내부 예약 계산](../../worker/features/x-posts/infrastructure/x-api.ts#L614) · [요청 ID 저장과 재사용](../../worker/features/x-posts/infrastructure/x-api.ts#L2218)

한 요청에 인접 구간을 합치면 그 안쪽의 저장 경계 글도 반환된다. Recent Search는 여러 작성자를 묶을 수 있으나 문서에 개별 게시글 ID 제외 또는 구간별 별도 범위를 지정하는 연산이 없고, Post Counts는 건수를 반환하므로 ID 일치나 누락 여부를 증명할 수 없다. 저장 글 재조회 금지와 정확한 보완 범위가 필요한 현재 정책에서는 조회 엔드포인트 교체보다 D1 왕복 축소의 비용과 효과를 먼저 확인하는 편이 합리적이다. [X 타임라인 경계](https://docs.x.com/x-api/posts/timelines/introduction#time-based-filtering) · [검색 연산자](https://docs.x.com/x-api/posts/search/integrate/operators) · [Post Counts](https://docs.x.com/x-api/posts/counts/introduction)

제품 코드, 운영 설정, 배포는 변경하지 않았고 신규 유료 X 호출은 0회였다. 대안의 D1 행 수 절감량, 실운영 완료 시간 및 실제 청구액은 미측정이다.
