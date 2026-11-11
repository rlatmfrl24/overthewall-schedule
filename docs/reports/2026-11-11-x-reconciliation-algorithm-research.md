# 공식 X 12시간 대조 방식 조사

2026-11-11 KST · 비교 기준 `236fd349` 위의 로컬 변경

저장 글 재조회 금지와 공식 사용자 타임라인의 확인 범위를 함께 유지하려면 현재의 ID 구간 조회가 적합하다. 공개 X API는 타임라인 요청당 ID 구간 한 쌍을 받고, 검색 연산자로 개별 게시글 ID를 제외하는 기능을 문서화하지 않았다. 로컬 리뷰에서 재현된 D1 한도 초과와 재개 결함을 보완한 뒤, 기존 Queue와 outbox로 정상 진행 시 다음 실행의 대기를 줄이는 것이 가장 유망하다. 같은 구간을 처리하므로 X 조회 횟수나 게시글 읽기 비용을 유지할 수 있다. [타임라인 매개변수](https://docs.x.com/x-api/posts/timelines/introduction#time-based-filtering) · [검색 연산자](https://docs.x.com/x-api/posts/search/integrate/operators) · [Cloudflare Queue 지연](https://developers.cloudflare.com/queues/configuration/batching-retries/#delay-messages)

## 현재 경로와 측정 근거

- FxEmbed 등으로 시작 시각 이전에 저장된 ID를 경계로 선택한다. 공식 조회는 `since_id`와 `until_id` 양끝을 제외하며, 인접한 정수 ID 사이의 빈 구간은 외부 호출 없이 닫는다. 대조 도중 FxEmbed가 새로 저장한 글은 같은 대조에서 X가 반환할 수 있다. 각 실행은 최대 두 범위 또는 페이지를 처리한다. 게시물과 진행 상태를 저장한 뒤 다음 범위를 처리하며, 마지막 범위 확인 전까지 공식 확인 ID를 유지한다. [ID 구간 및 진행 상태](../../worker/features/x-posts/infrastructure/x-timeline-gaps.ts#L1) · [페이지 실행과 완료 처리](../../worker/features/x-posts/infrastructure/x-api.ts#L2253) · [X 사용자 타임라인](https://docs.x.com/x-api/posts/timelines/introduction#time-based-filtering)
- 로컬 Worker Queue 표본에서 저장 글 32개와 누락 글 1개를 대상으로 X 타임라인 요청 33개가 모두 서로 다른 경로였다. 비용 원장에는 5,000 마이크로달러, 실행당 D1 호출은 최대 46회였다. 30분씩 시각을 전진시켜 480분에 마쳤다. D1 무료 한도는 실행당 50회이며 `db.batch()`는 이 한도에서 한 번으로 센다. 과거 공식 보완 ID 4개는 조건을 반영한 X 응답 재생으로 모두 다시 발견했다. [Queue 프로파일](../../worker/features/scheduled-operations/infrastructure/x-hybrid.integration.test.ts#L36) · [기존 보완 4건 재생](../../worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts#L46) · [Cloudflare D1 한도](https://developers.cloudflare.com/d1/platform/limits/)
- X 공개 요금 기준으로 일반 게시글 읽기는 반환 리소스당 `$0.005`다. 같은 UTC 일자의 재조회는 X가 통상 중복 과금을 제거하지만 보장에는 예외가 있다. 현재 내부 공유 예산은 첨부 확장 포함 5개 페이지에 `$0.125`를 먼저 예약한다. 예약액은 해당 페이지의 추정 정산액과 다르며, 게시글이 없는 구간도 이 예약을 거친다. [X 가격과 UTC 중복 제거](https://docs.x.com/x-api/getting-started/pricing) · [내부 공유 예약 계산](../../worker/features/x-posts/infrastructure/x-api.ts#L604)

## 이번 리뷰에서 재현한 실패

| 조건 | 로컬 결과 | 보완 방향 |
| --- | --- | --- |
| 인용 글 보강 대기 20건, `link_only`, 공식 조회 한 페이지 | 정상 Worker Queue 경로가 상한 없이 D1 144회를 사용했다. 50회 한도 적용 시 한도 거부 4회가 기록되고 작업이 `running`으로 남았다. | 인용 보강에 실행당 작업량을 제한하고 큐 정리에 필요한 D1 여유를 남긴다. 인용 적체 표본도 50회 한도로 검증한다. [완료 분기](../../worker/features/x-posts/infrastructure/x-collection.ts#L374) · [인용별 처리](../../worker/features/x-posts/infrastructure/x-reference-hydration.ts#L387) |
| 첫 X 응답의 `includes.media`가 배열 대신 객체 | 게이트웨이가 성공 응답을 저장했다. 첫 실행은 `budget_unavailable`, 재개는 `x_api_error`로 실패했다. 공급자 테스트 응답을 정상으로 바꾼 뒤에도 X 요청은 총 1회였으며 공식 확인점은 100에 머물렀다. | 정산과 정규화가 사용하는 필드를 성공 저장 전에 검증한다. 유효하지 않은 응답을 별도 오류로 남겨 해당 구간에서 다시 확인한다. [성공 저장](../../worker/features/x-posts/infrastructure/x-shared-budget.ts#L151) · [리소스 정산](../../worker/features/x-posts/infrastructure/x-api.ts#L808) |
| X 응답 저장 뒤 사이트 진행 기록 실패, 공유 예산 잔여 `$0.124999` | 스케줄러가 공식 항목을 만들지 않았다. 동일 상태에서 수집 함수를 직접 호출하니 X 추가 요청과 추가 비용 없이 완료했다. | 사이트·요청·가림 상태를 검증하는 저장 응답 재생을 제공한다. 새 X 호출은 기존 예산·백오프 조건을 적용한다. [플래너](../../worker/features/x-posts/infrastructure/x-hybrid-policy.ts#L51) · [응답 재사용](../../worker/features/x-posts/infrastructure/x-shared-budget.ts#L137) |
| 전환 전 구형 `sync_pagination_token` 만료 | 두 번의 실행이 동일 토큰을 전송하고 진행 상태와 공식 확인점을 유지했다. | 기존 범위와 가장 최근에 저장한 ID를 보존하면서 구형 토큰을 새 재개 방식으로 전환한다. [구형 토큰 경로](../../worker/features/x-posts/infrastructure/x-timeline-gaps.ts#L45) · [구형 페이지 실행](../../worker/features/x-posts/infrastructure/x-api.ts#L2321) |

네 사례는 로컬 D1과 제어한 X 응답으로 확인했다. 인용 적체 시험의 50회 한도 적용 실행은 호출 거부 예외로 종료됐다. 33구간 프로파일의 최대 46회는 해당 표본에 대한 실측이다.

## 대안의 비용과 확인 범위

| 방식 | 이점 | 비용과 적용 조건 |
| --- | --- | --- |
| 기존 타임라인 구간을 유지하고 다음 실행을 바로 예약 | 완료 대기 단축, 동일 범위·X 요청 수·게시글 읽기 비용 유지 | 정상 진행과 오류·예산·429 대기를 구분한다. Queue 중복 배달, D1 사용량, 다음 계정의 공정한 처리와 재예약 실패 시 Cron 복구를 검증해야 한다. [Queue 재시도·지연](https://developers.cloudflare.com/queues/configuration/batching-retries/) |
| 같은 계정의 연속 구간을 넓게 묶기 | 같은 타임라인에서 왕복 감소 | 구간 안으로 들어온 저장 경계 글도 X가 반환한다. 저장 글 재조회 금지 조건 아래에서는 도입할 수 없으며, 명시적으로 허용하면 최대 추가 읽기 수를 제어할 수 있다. [타임라인 ID 경계](https://docs.x.com/x-api/posts/timelines/introduction#time-based-filtering) · [X 요금](https://docs.x.com/x-api/getting-started/pricing) |
| Recent Search로 여러 계정 묶기 | `(from:a OR from:b) -is:retweet`로 공통 범위를 한 번에 검색 | `since_id`·`until_id` 또는 시간 경계는 요청 전체에 한 쌍만 적용된다. 서로 다른 계정별 구간을 합치려면 넓은 공통 범위로 읽고 로컬에서 나눈다. 이미 저장한 글도 반환된다. 최근 7일, 페이지당 10–100개, 셀프서비스 쿼리 512자이고 타임라인과 결과 집합의 동등성은 확인되지 않았다. [Recent Search](https://docs.x.com/x-api/posts/search-recent-posts) · [검색 연산자와 접근별 쿼리 길이](https://docs.x.com/x-api/posts/search/integrate/operators#query-limitations) |
| Recent Post Counts로 우선 확인할 시간대 선택 | 한 요청으로 여러 분·시간 버킷의 집계 수신 | `$0.005`는 요청당이다. 집계에는 ID가 없고, 로컬 `{A,B}`와 공급자 `{B,C}`처럼 건수가 같아도 누락 `C`가 있다. 삭제·노출·검색 색인 범위·시점 차이가 있어 동일 건수로 공식 확인 ID를 옮기면 안 된다. 양수 차이는 우선순위로만 활용할 수 있으며 공식 검증까지 수행하면 요청과 비용이 추가된다. [Recent Counts](https://docs.x.com/x-api/posts/get-count-of-recent-posts) · [집계 응답](https://docs.x.com/x-api/posts/counts/introduction#recent-counts) · [Counts 요금](https://docs.x.com/x-api/getting-started/pricing) |
| Filtered Stream 또는 X Activity | 새 글 도착을 수 초 내 처리하는 목적에 적합 | 스트림은 연결·재연결이 필요하고 일반 `backfill_minutes` 요청 값은 최대 5분이다. X Activity의 `post.create`는 전달 이벤트당 `$0.005`이므로 이미 FxEmbed가 발견할 글까지 이벤트 비용이 생길 수 있다. 장기 중단 복구를 위한 별도 확인이 필요하며 웹훅 보류 조건에 영향을 준다. [Filtered Stream](https://docs.x.com/x-api/posts/filtered-stream/introduction) · [스트림 복구 매개변수](https://docs.x.com/x-api/stream/stream-filtered-posts) · [Activity 이벤트 가격](https://docs.x.com/x-api/activity/event-pricing) |

Recent Search의 표준 앱 한도는 15분당 450회, Recent Counts는 300회, 사용자 타임라인은 10,000회로 안내된다. 로컬 33회 표본의 지연은 이 공개 한도에 닿아서 생긴 것이 아니다. 타임라인의 최근 3,200개 범위나 Recent Search의 7일 범위를 넘은 복구에는 다른 권위와 정책 결정이 필요하다. 여러 요청을 `Promise.all`로 보내도 조회 수와 과금 리소스 수는 줄지 않으며, 호출을 한 Worker로 모으면 D1 한도와 공유 예약 경합이 커질 수 있다. [X API 한도](https://docs.x.com/x-api/fundamentals/rate-limits) · [사용자 타임라인의 제공 범위](https://docs.x.com/x-api/posts/timelines/introduction#user-posts-timeline) · [Cloudflare D1 한도](https://developers.cloudflare.com/d1/platform/limits/)

### 연속 구간을 묶었을 때의 계산

로컬 테스트와 같은 ID 배열을 메모리에서 재생했다. 구간은 양끝을 제외하고, 빈 구간도 X에 한 번 요청하며, 결과는 최대 5개씩 받는다고 가정했다. 각 대안이 누락 ID 1개를 찾는지 확인했다. 시간 열은 매번 두 페이지를 처리하고 재개까지 30분씩 기다린다는 산술값이다. 추가 게시글이 많으면 D1 가드 때문에 실제 시간은 더 길어질 수 있다. 첨부 및 사용자 조회 비용과 UTC 내 중복 과금 제거는 포함하지 않았다. [표본 ID와 페이지 한도](../../worker/features/scheduled-operations/infrastructure/x-hybrid.integration.test.ts#L36) · [X 게시글 가격](https://docs.x.com/x-api/getting-started/pricing)

| 한 요청 범위에 합친 인접 구간 수 | X 페이지 요청 | 재조회한 저장 글 | 게시글 읽기 비용 | 30분 재개 대기 합 |
| ---: | ---: | ---: | ---: | ---: |
| 1, 현재 | 33 | 0 | $0.005 | 480분 |
| 최대 2 | 17 | 16 | $0.085 | 240분 |
| 최대 4 | 9 | 24 | $0.125 | 120분 |
| 최대 5 | 7 | 26 | $0.135 | 90분 |
| 전체 | 7 | 32 | $0.165 | 90분 |

두 구간을 합치면 이 표본에서 요청 16개를 줄이는 대신 저장 글 16개를 다시 읽는다. **같은 구간 안에서 페이지 크기만 키우면 반환 집합을 유지하면서 호출을 줄일 수 있다.** 누락 25건이 한 구간에 몰렸다면 한도 5와 25의 이론상 최소 요청 수는 각각 5회와 1회다. 게시글 비용은 둘 다 `$0.125`이고, 페이지 한 번의 공유 예약은 각각 `$0.125`와 `$0.625`다. 이 최적화는 누락이 밀집한 구간에 효과가 있으며, 예산·D1 여유와 재개 시 요청 크기 고정이 검증 조건이다. [사용자 타임라인 페이지 범위](https://docs.x.com/x-api/users/get-posts#parameter-max-results) · [내부 예산 계산](../../worker/features/x-posts/infrastructure/x-api.ts#L604)

## 재개 안전성과 다음 검증

1. **정상 진행 뒤 Queue 재개를 먼저 검증한다.** 정기 대조 자격은 기존처럼 마지막 공식 완료 후 12시간으로 유지하고, 새 실행은 같은 대조의 남은 구간만 소비한다. 계정·대조 시작 시각·진행 상태를 기준으로 다음 작업을 한 번만 등록하고, 기존 outbox와 lease를 재사용한다. 예산 소진, 429, 공급자 오류는 기존 대기 규칙을 지킨다. 33구간에서는 16번의 30분 슬롯 대기가 단축 대상이다. 같은 33개 요청과 `$0.005` 원장, D1 50회 이하, 동일 메시지 재전달 및 전송 실패 시 공식 확인점 유지, 다음 계정 진행을 검증 조건으로 삼는다. [대조 주기 계약](../superpowers/specs/2026-11-03-x-free-first-collection-design.md#L49) · [기존 outbox](../../worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts#L453) · [Cloudflare Queue 재시도](https://developers.cloudflare.com/queues/configuration/batching-retries/)
2. **저장된 응답 재생의 예산 진입 조건을 확인한다.** 현재 플래너는 일반적인 미완료 구간에 새 유료 페이지 예산을 먼저 요구한다. 로컬 진행 기록만 실패했고 공유 응답은 저장된 경우에도 예산이 부족하면 다음 기회까지 재개가 밀릴 수 있다. 이 사례는 공유 게이트웨이에서 동일 요청 ID·경로와 가림 상태를 검사하는 읽기 전용 재생을 검토할 가치가 있다. 실제 X 호출에는 원래 입장 검사를 적용하고, 이미 저장된 응답만 재생했을 때 신규 비용 원장·예약 증가가 0인지 확인한다. [플래너의 예산 검사](../../worker/features/x-posts/infrastructure/x-hybrid-policy.ts#L51) · [공유 응답 조회](../../worker/features/x-posts/infrastructure/x-shared-budget.ts#L133)
3. **ID만으로 토큰을 대체하는 최적화에는 순서 증명이 필요하다.** 지금은 페이지 토큰을 우선 재사용하고 만료되면 해당 범위 전체를 다시 요청한다. `until_id=저장한 페이지의 최소 ID`로 재개하면 이전 페이지 재조회가 줄지만, 숫자 ID 기준으로 모든 반환 페이지가 엄격히 내려간다는 보장이 있어야 페이지 경계의 글을 빠뜨리지 않는다. X 일반 문서는 시간 역순과 토큰 만료 가능성을 안내하며, Snowflake ID의 시각 순서는 근사값으로 설명한다. Recent Search 가이드는 해당 검색 토큰의 재사용을 별도로 설명하지만, 타임라인의 순서·토큰 수명이나 7일 밖 검색을 보장하지 않는다. [공식 페이지 처리](../../worker/features/x-posts/infrastructure/x-api.ts#L2271) · [X 페이지 토큰 문서](https://docs.x.com/x-api/fundamentals/pagination) · [X Snowflake ID](https://docs.x.com/resources/fundamentals/x-ids) · [Recent Search 페이지 문서](https://docs.x.com/x-api/posts/search/integrate/paginate)

로컬 회귀, 추가 실패 재현과 메모리 계산을 근거로 비교했다. 대안별 실계정의 결과 집합, X 청구액 및 Queue 완료 시간은 미측정이며 운영 설정·배포·신규 유료 호출은 수행하지 않았다.
