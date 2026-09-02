# X API 최소화·조건부 30분 수집 설계

## 문서 상태

- 상태: canonical implementation contract
- 구현일: 2026-09-02
- rollout 현재값(2026-09-02): `x_cost_optimizer_enabled=true`, `x_collection_interval_hours=2`
- 제품 계약: 소스 활성화 이후 신규 게시물만 수집하고 D1에 영구 보존하며 공개 요청은 D1만 읽는다.

## 1. 비용 기준선과 목표

구현 직전 내부 usage event 7일 기준 보수적 추정은 `$2.77`, 같은 패턴의 30일
환산은 `$11.87`이다. `tweet_lookup`이 62.1%로 가장 큰 비중을 차지했다. 이 수치는
공급자 청구서가 아닌 기존 내부 단가 기반 관측값이며 rollout 후 Developer Console과
반드시 대조한다.

목표는 누락 없이 정상 상태 30분 수집을 제공하면서 월 내부 run-rate를 `$11.87`
이하, 목표 `$9.50` 이하로 유지하는 것이다. 절대 admission 상한은 UTC `$1/일`,
30일 `$30`이다. 비용이 증가하지 않는 빈 timeline 응답은 더 자주 확인할 수 있지만,
D1·Queue 70% guard를 넘겨 수집 빈도를 유지하지 않는다.

## 2. 신규행 전용 수집

- 정상 첫 timeline 요청은 `since_id`와 `max_results=5`를 사용한다.
- 5건을 모두 반환하거나 `next_token`이 있으면 source에 continuation을 저장하고 다음
  실행은 최대 25건으로 이어받는다.
- API 응답의 신규 게시물만 `x_posts`, `x_post_facts`, `x_post_references`에 기록한다.
  빈 poll은 기존 게시물·facts를 다시 쓰지 않는다.
- 게시물 저장과 참조 기록이 모두 성공한 뒤에만 continuation/watermark를 전진한다.
  중간 실패는 같은 기준점에서 중복 안전하게 재시도한다.
- scheduled와 manual은 source lease CAS를 공유한다. 같은 handle을 동시에 소유하지
  못한 실행은 공급자를 호출하지 않고 coalesced 수로 관측한다.
- `x_cost_optimizer_enabled=false`에서는 schema만 사용하고 기존 2시간·25건 경로를
  유지한다.

## 3. 인용·답글 비용 절감

`x_post_references`는 source/target ID, reply/quote 유형, resolution 상태와 재시도
시각을 보존한다. 신규 원문 저장은 preview보다 우선하며 preview 실패는 cursor를
막지 않는다.

- D1의 기존 `x_posts` 또는 `linked_post` cache가 있으면 공급자 lookup을 생략한다.
- Post lookup은 `author_id` 필드만 받고 `expansions=author_id`를 사용하지 않는다.
- 처음 보는 author ID만 `/users?ids=...`로 묶어 조회하고 `linked_user` cache에서
  30일 재사용한다.
- `cached_author`가 기본 모드다. 관리자는 `post_only`와 `link_only`로 즉시 비용을
  낮출 수 있다.
- preview 예산 기본값은 UTC 5센트다. 소진 시 게시물은 정상 저장하고 참조는 직접
  X 링크로 남긴다.
- `linked_post`와 `linked_user` cache는 30일, 영구 삭제·비공개 판정은 terminal로
  처리한다. 네트워크·5xx·429만 재시도 대상으로 본다.

## 4. 비용 원장과 보존

- `x_api_resource_daily`는 `(utc_day, resource_type, resource_id)`를 유일키로 삼아
  같은 UTC 일의 Post/User/Media를 한 번만 등록한다.
- `x_api_usage_daily`는 operation별 요청·응답 리소스·고유 리소스와 공개 가격표 및
  보수적 내부 비용을 장기 집계한다.
- Media는 Console 확인 전 admission과 보수적 비용에서 기존 `$0.005`를 유지한다.
  공개 가격표 추정에서는 별도 Media 비용을 0으로 표시한다.
- 상세 usage event, 고유 resource registry, collection run은 30일 뒤 삭제한다.
  일별 집계는 장기 보존한다.
- 외부 호출 전 예약은 보수적 요청 비용으로 fail-closed한다. 응답 후 일별 고유
  리소스 원장을 별도로 기록하므로 운영 화면에서 과금 추정과 안전 admission 값을
  혼동하지 않는다.

## 5. 30분 스케줄과 자동 완화

단일 Cron은 `3,13,23,33,53 * * * *`이며 X Workflow는 매시 23분과 53분에
시작한다. X idempotency bucket은 30분이다. optimizer 활성화와 interval `0.5`가
모두 설정된 정상 상태에서는 모든 활성 source의 다음 확인을 성공 시각 +30분으로
설정한다.

아래 조건 중 하나면 저장 설정은 바꾸지 않고 해당 UTC 일의 실효 주기만 60분으로
완화한다.

- X 비용 원장의 `used + reserved`가 일일 한도의 70% 이상
- scheduled D1 read/write 또는 Queue 원장이 내부 목표의 70% 이상
- 전역 X rate-limit/backoff가 활성

용량 guard는 다음 UTC 일에 자동 해제되고 공급자 backoff는 만료 직후 30분 주기로
복귀한다. source별 오류는 해당 source의 오류 backoff만 적용한다. 8개 source의
2시간 대비 최대 추가 예약은 Queue item 72, D1 read 36,000행, write 3,600행/일이며
70% guard 안에서만 허용한다.

## 6. 운영 전환과 rollback

1. migration `0079`를 적용한다.
2. optimizer 비활성 상태로 Worker를 배포하고 기존 2시간 수집을 확인한다.
3. D1-only reference backfill을 100건씩 수행해 invalid 0을 확인한다.
4. `x_cost_optimizer_enabled=true`, `cached_author`, preview 5센트를 설정하고 24시간은
   2시간 주기로 관측한다.
5. 정상 readback 후 `x_collection_interval_hours=0.5`로 전환한다.
6. 신규 게시물, quote/reply, manual/scheduled coalescing canary를 확인한다.
7. 7일간 Developer Console, D1 고유 원장, Queue·D1 사용량을 대조한다.

즉시 비용 rollback은 `link_only` → interval `2` → optimizer `false` 순서다. 모든
단계에서 저장 게시물과 watermark는 유지되며 공개 DTO는 변하지 않는다.

## 7. 구현 Closeout

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| schema·migration | 구현 완료 | `x_post_references`, 일별 resource/usage 원장, source lease, run 관측 필드와 generated migration `0079` |
| 신규행 전용 5→25 수집 | 구현 완료 | optimizer 경로에서 신규 응답만 저장하고 continuation은 25건으로 재개 |
| 작성자 30일 cache | 구현 완료 | Post/User lookup 분리, `linked_user` D1 cache, `cached_author/post_only/link_only` |
| 30/60분 scheduler | 구현 완료 | 23·53분 Cron, 30분 bucket, 70%·provider backoff 실효 60분 전환 |
| 공개 API 호환 | 구현 완료 | 공개 route·DTO·D1-only reader 변경 없음 |
| 운영 migration·flag | 1단계 완료 | 2026-09-02 migration `0079` 적용, FK 오류 0, optimizer=`true`, preview=`cached_author`/5센트, 24시간 관찰을 위해 interval=`2` 유지 |
| PR·Worker version·운영 readback | 배포 완료·병합 대기 | PR #107 head `f1d7ad0`, Worker `9bb27081-6bb4-4fe6-a34c-ffe5f03f3774`, posts=199, sources/watermarks=8/8, continuation=0 |
| 7일 비용 Closeout | 대기 | Developer Console 실제 청구와 월 run-rate 대조 후 기록 |

운영 Closeout에는 PR, Worker version, migration 적용 시각, source/watermark/
continuation, 빈 poll write 0, cache hit/miss, coalesced 수, 70% fallback canary와 7일
실제 비용을 추가한다. 관측 전에는 `$9.50` 목표 달성을 완료로 표현하지 않는다.

### 2026-09-02 운영 rollout readback

- 원격 migration 적용 후 pending migration과 `PRAGMA foreign_key_check` 결과는 모두 0이다.
- 배포된 Cron은 `3,13,23,33,53 * * * *`이며 공개 X API는 필수 handle을 포함한
  기존 요청에서 D1 저장 게시물을 정상 반환했다.
- optimizer는 활성화했지만 수집 간격은 2시간으로 유지한다. 24시간 이상 신규행,
  cursor, reference backfill, 예산·D1·Queue guard를 관찰한 뒤 조건을 만족할 때만
  `0.5`로 전환한다.
- 30일 관찰 기간에는 일별 내부 원장과 7일·30일 Developer Console 실제 청구를
  구분해 기록한다. 공급자 실제 청구 확인 전에는 내부 추정치를 확정 비용으로
  표현하지 않는다.
