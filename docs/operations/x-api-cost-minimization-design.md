# X API 최소화·조건부 30분 수집 설계 및 구현 Closeout

## 문서 상태

- 상태: 2026-09-02 rollout 기록 유지. 2026-09-04 답글·인용 원문 복구 수정은 구현·로컬 검증 완료이며 운영 적용 전이다.
- 구현일: 2026-09-02
- Closeout readback: 2026-09-02 15:02 KST
- 관찰 기간: 2026-09-02 ~ 2026-10-02
- rollout 현재값(2026-09-02): `x_cost_optimizer_enabled=true`, `x_collection_interval_hours=2`
- production authority: PR #107, merge `d1f93638390ad7a02d1ca43e38fb8f65035a33f8`, Worker `be965267-b4b1-4583-9bd7-84af77802260`
- 제품 계약: 소스 활성화 이후 신규 게시물만 수집하고 D1에 영구 보존하며 공개 요청은 D1만 읽는다.
- 현재 수정 기준: 신규 수집 2시간, UTC 전체 `$1` / 원문 보강 `$0.10`. 과거 Closeout의 5센트는 당시 snapshot이다. 이번 수정에서 30분 주기나 운영 설정을 자동 활성화하지 않는다.

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
- preview 예산 기본값은 UTC 10센트다. 소진 시 게시물은 정상 저장하고 참조는 직접
  X 링크로 남긴다. 기존 운영의 5센트 설정은 배포 후 별도 변경하기 전까지 유지된다.
- `linked_post`와 `linked_user` cache는 30일, 영구 삭제·비공개 판정은 terminal로
  처리한다. 개별 리소스의 명확한 접근 불가만 terminal이며, 네트워크·5xx·429는 재시도한다.
  인증 오류·불완전 응답·일괄 요청 실패를 원문 삭제로 판정하지 않는다.

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

2026-09-04 이후 즉시 비용 중지는 `link_only`로 유료 보강만 차단한다. 신규 수집과
무료 D1 연결은 유지한다. 공개 context에서 유료 조회하던 구버전으로 되돌리지 않는다.

## 7. 구현·운영 Closeout

| 항목                   | 상태         | 근거                                                                                                       |
| ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| schema·migration       | 구현 완료    | `x_post_references`, 일별 resource/usage 원장, source lease, run 관측 필드와 generated migration `0079`    |
| 신규행 전용 5→25 수집  | 구현 완료    | optimizer 경로에서 신규 응답만 저장하고 continuation은 25건으로 재개                                       |
| 작성자 30일 cache      | 구현 완료    | Post/User lookup 분리, `linked_user` D1 cache, `cached_author/post_only/link_only`                         |
| 30/60분 scheduler      | 구현 완료    | 23·53분 Cron, 30분 bucket, 70%·provider backoff 실효 60분 전환                                             |
| 공개 API 호환          | 구현 완료    | 공개 route·DTO·D1-only reader 변경 없음                                                                    |
| 운영 migration·flag    | 완료         | migration `0079`, FK·pending migration 0, optimizer=`true`, preview=`cached_author`/5센트                  |
| PR·Worker version      | 완료         | PR #107, merge `d1f9363`, production Worker `be965267-b4b1-4583-9bd7-84af77802260` 100%                    |
| 운영 데이터 보존       | 완료         | post/facts 199/199, source/watermark 8/8, continuation 0, 공개 GET 200                                     |
| reference backfill     | 운영 관찰 중 | invalid JSON 0, 관계 보유 post 112, Closeout 시점 reference 0; 다음 eligible 수집부터 100건씩 D1-only 처리 |
| 30분 주기 전환         | 운영 관찰 중 | 최소 24시간 동안 interval=`2` 유지 후 안정성·70% guard를 통과할 때만 `0.5`로 변경                          |
| 7일·30일 비용 Closeout | 운영 관찰 중 | 내부 원장과 Developer Console 실제 청구를 대조한 뒤 확정                                                   |

구현 Closeout은 완료됐지만 운영 효과 검증은 별도다. 관찰 기간에는 빈 poll write 0,
cache hit/miss, coalesced 수, 70% fallback canary와 실제 비용을 누적한다. 관측 전에는
`$9.50` 목표 달성이나 30분 주기 안정화를 완료로 표현하지 않는다.

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

### 2026-09-02 구현 Closeout 및 관찰 handoff

- PR #107은 `2026-09-02T05:57:28Z`에 merge `d1f9363`으로 병합됐다.
- 병합 커밋의 Cloudflare Workers Build가 성공했고 production Worker
  `be965267-b4b1-4583-9bd7-84af77802260`이 100% 활성 상태다.
- migration `0079` 이후 pending migration과 FK 위반은 0이다. D1 크기는
  16,322,560 bytes이고 post/facts 199/199, source/watermark 8/8, continuation 0이다.
- 운영 설정은 optimizer=`true`, interval=`2`, preview=`cached_author`, preview 일일
  예산 5센트다. 즉 비용 최소화 로직은 활성화됐지만 수집 빈도 증가는 아직 보류한다.
- UTC 2026-09-02 원장은 X 635,000/1,000,000 micros(63.5%), D1 read
  84,700/2,000,000(4.2%), D1 write 6,510/40,000(16.3%)다. 모두 rollout guard
  70% 미만이지만 X는 경계에 가까우므로 최소 24시간 관찰을 우선한다.
- 공개 `/feed`와 parameterized `/api/x/posts`는 최종 Worker에서 200을 반환했다.
- 관찰 automation `x-30`은 매일 15:30 KST에 이 스레드에서 실행한다. 최소 24시간
  이후 gate가 정상이면 interval을 `0.5`로 전환하고, 7일째 중간 비용 판정과 30일째
  최종 운영 Closeout을 작성한 뒤 스스로 일시중지한다.

이 문서 변경 이후 관찰 기간에는 결함 수정이나 안전 rollback을 제외한 수집 런타임
변경을 하지 않는다. 실제 X Developer Console 청구는 자동 읽기가 불가능할 수 있으므로
7일·30일 판정 시 운영자가 Console 금액만 확인해 내부 원장과 대조한다.

## 8. 2026-09-04 답글·인용 원문 보강 복구

### 결함과 수정 범위

최적화 수집은 신규 응답만 저장하는 반면, 기존 참조의 `pending` 상태를 소비하는 경로가
없었다. 따라서 최초 원문 조회 실패 후 source cursor가 전진하면 이후 신규 0건 실행에서
원문을 복구하지 못했다. 별개로 공개 context 재확인이 공급자 조회를 수행할 수 있었다.
이번 변경은 관찰 중 발견한 이 결함을 수정하며 신규 수집·영구 보존·2시간 주기는 바꾸지 않는다.

- 브랜치: `codex/fix-x-reply-context-hydration`
- 기반: `origin/master` `2abcb2a3ddfc3e4f478b02c6d94525b02db3c710` (PR #117)
- 작업 공간: `C:\Develop\overthewall-schedule-x-reply-context`
- 기존 OTW Play 작업 공간의 변경은 포함하지 않는다.
- 앞서 확인한 원문 누락 22건은 과거 진단 snapshot이며 이번 수정 후 운영 검증 수치가 아니다.

### 실행 및 저장 계약

기존 `x_collection`의 `runXCollectionForHandles`에서 신규 timeline 저장을 먼저 마친 뒤
`hydrateXReferences`를 실행한다. Cron·Queue job 유형을 추가하지 않는다. 신규 0건 또는
source cooldown 실행에서도 처리 시각이 된 참조는 별도로 확인한다.

1. 실행당 due reference 최대 100행을 다음 시도·생성 시각 순으로 읽고 target Post ID를 중복 제거한다.
   본문 갱신도 선택된 100개 관계로 제한한다. 같은 원문을 참조하는 나머지 shard는 다음 실행에서
   공유 D1 cache를 사용하므로 원문 Post를 다시 구매하지 않는다.
2. 원문 ID 단위 CAS lease를 획득한다. 같은 원문을 가리키는 기존 참조 모두에 token과 5분
   만료 시각을 부여하며, 다른 shard/manual은 병합 처리한다. 새 참조도 기존 lease를 우회하지 않는다.
3. 보이는 `x_posts` → 유효한 `linked_post` cache → 유료 Post 순서로 처리한다.
   `link_only`와 예산 소진 상태도 무료 D1 연결은 허용한다.
4. Post 응답은 먼저 cache와 source의 reply/quote JSON에 보존한 뒤 User 정보를 보강한다.
   작성자는 30일 cache를 먼저 읽고 `cached_author`일 때만 필요한 ID를 조회한다.
5. User 실패 시 본문·미디어는 유지하고 작성자 상태만 pending으로 둔다. 다음 실행에서는
   User만 조회하며 화면에는 `작성자 정보 확인 중`과 원문/직접 링크가 표시된다.
6. 변경된 preview JSON과 참조 상태를 D1 batch로 반영한다. 기존 게시물·facts를 전부 재저장하지
   않는다. source와 원문의 숨김/본문 제거 상태 및 lease 소유권을 갱신 직전 다시 검사한다.
7. 보강 성공 시 해당 handle의 D1 피드 cache 및 실행 인스턴스의 memory cache를 무효화한다.
   공개 D1 reader가 최신 JSON을 읽으며 context 재확인 성공 시 클라이언트 피드 query도 무효화한다.

`0083_youthful_norman_osborn.sql`은 기존 참조에 lease token/만료, author ID/상태,
author 시도/다음 시도/오류 7개 필드와 author due index를 추가하는 generated migration이다.
이전 migration은 수정하지 않는다. backfill은 quote/reply 각각의 누락을 검사하며 D1만 사용한다.

### 예산 및 오류 계약

- 공용 `scheduled_usage_daily`의 `all/x_api_cost_micros`와 신규
  `all/x_reference_preview_cost_micros`를 단일 조건부 UPDATE에서 함께 예약한다.
  두 행 모두 `used + reserved + 요청 예상치 <= limit`일 때만 외부 호출한다.
- 전체 한도는 최대 1,000,000 micros, 보강 기본 한도는 100,000 micros다. Post·Media·User를
  모두 포함한다. 새 이벤트의 `purpose=collection|reference_preview`로 timeline User 조회와 구분한다.
- 원문 요청은 최대 100 IDs이며 실제 예약 가능한 크기로 축소한다. 내부 보수 단가로 Post당
  최대 4개 Media를 포함한 25,000 micros, User당 10,000 micros를 예약하고 실제 반환 리소스로 정산한다.
  따라서 남은 예산이 최소 안전 예약보다 작으면 잔액이 있더라도 다음 UTC 일로 이월할 수 있다.
- 새 ledger가 없는 적용 당일은 기존 usage event를 합산해 시작한다. purpose 없는 기존
  tweet/user lookup은 보수적으로 보강 비용에 포함하여 이미 지출한 예산을 재사용하지 않는다.
- 로컬 admission 거절은 외부 호출/비용 0이다. 실제 실패 요청은 예약한 보수 비용을 정산한다.
  자정을 걸친 요청은 예약 UTC 일에 정산하고, 다음 UTC 일의 예산을 차감하지 않는다.
- 원장·D1·lease 실패는 fail-closed하고 기존 Queue 인프라 재시도에 맡긴다. 공급자 실패와 예산
  대기는 reference에 다음 시각을 저장한 뒤 정상 반환하여 Queue 폭주를 막는다.
- network/5xx는 30분부터 최대 6시간 backoff, 429는 공급자 전역 backoff,
  예산은 다음 UTC 자정 + 30~90초 jitter, auth/invalid response는 별도 오류/운영 주의로 남긴다.
  실제 재개는 해당 시각 이후의 정규 수집 실행에서 이루어진다.

Post와 User를 최대 100 IDs로 분리 조회하는 계약은 X의
[Post Lookup](https://docs.x.com/x-api/posts/lookup/introduction)과
[User Lookup](https://docs.x.com/x-api/users/lookup/introduction)을 참고한다.
단가는 공급자 확정 청구가 아니라 기존 내부 안전 예약 정책이다.

### 공개 API와 관리자 관측

- `/api/x/posts/{postId}/context`는 기존 인증·허용 source 검사를 통과한 뒤 D1만 읽는다.
  공급자 호출·D1 write·enqueue는 모두 금지한다. 성공 DTO `{ sourcePostId, replyTo }`는
  동일하고 성공/404 모두 `no-store`로 즉시 저장 결과를 다시 확인한다.
- 버튼은 `저장된 원문 다시 확인`; 미확보 시 안내와 X 직접 링크를 제공한다.
  일반 피드 HTTP/client cache의 기존 유효 기간은 유지하므로 열린 화면은 다음 refetch 시 반영된다.
- history health는 원문/작성자 대기, 가장 오래된 대기, 다음 시도, terminal, 오류,
  UTC preview used/reserved/limit을 읽기 전용으로 반환한다. 관리자 X 설정 영역에 표시한다.
- 기존 scheduled item result JSON의 `referenceHydration`에 scanned/hydrated/authorsResolved/
  deferred/failed/terminal/coalesced/retryAt/errorCode를 신규 수집 카운터와 분리해 보존한다.
  예산 이월은 신규 수집 실패가 아니며 실제 보강 오류는 partial/failed로 드러낸다.

### 검증 및 운영 Closeout 게이트

| 항목                    | 상태           | 증거/남은 작업                                                                                                                           |
| ----------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 격리 브랜치·구현        | 구현 완료      | 신규/기존 참조 분리, D1 우선, target lease, Post/User 단계 분리, 이중 예산, 공개 D1-only                                                 |
| 생성 migration          | 로컬 검증 완료 | 0083, 전체 83개 migration 실제 적용 validate-only 및 작업 worktree 로컬 초기화 통과                                                      |
| D1 회귀                 | 로컬 검증 완료 | 26개 통합 테스트: 기존 18건 및 검토 후 추가 회귀 8건. 실제 수집 진입점, 페이지 재처리, 관계별 무료 복구, 원문 제거 전파·rollback·경합 등 |
| Worker·React·preflight  | 로컬 검증 완료 | 검토 수정 후 `pnpm preflight` PASS: 단위 1,532 + Worker 통합 210 = 1,742건, 커버리지 기준·프로덕션 build·D1 doctor·mirror 통과           |
| PR·운영 Worker          | 미적용         | 현재 요청에서 commit/push/배포하지 않음. PR 번호와 Worker version은 배포 시 기록                                                         |
| 운영 migration·10센트   | 미적용         | 승인 후 additive migration → Worker 배포 → preview 설정 `10` 순서                                                                        |
| 운영 D1·대표 `/feed`    | 미검증         | 운영 누락 수 재조회, 정상 pipeline에서 무료 D1 복구부터 진행; 유료 일괄 수동 조회 금지                                                   |
| 로컬 브라우저           | 부분 검증      | `localhost:5184/feed` 실제 진입 및 로그인 보호 확인. 인증된 피드/관리자 화면은 테스트 계정 세션이 없어 미검증; 접근 제어를 우회하지 않음 |
| 두 정규 실행·UTC 초기화 | 미검증         | 대표 답글 표시, cursor 불변, used/reserved 정합성, 공개 호출의 공급자/write 0 확인                                                       |

배포 후 `PR / merge SHA / Worker version / 적용 시각 / D1 누락·대기·terminal / 공개 피드 확인`
을 기록한다. 2026-09-04 로컬 검증은 `git diff --check`, 문서/신규 파일 formatter,
전체 migration chain과 `PRAGMA foreign_key_check` 위반 0까지 확인했다.
빌드는 기존 production Clerk 공개 키만 프로세스 환경으로 전달했으며 secret/config 파일은 복사하지 않았다.
검증 중 기존 OTW Play 테스트 한 건의 5초 timeout은 단독 24건 및 최종 전체 재실행에서 해소됐고,
테스트 제한이나 관련 구현은 변경하지 않았다. 공급자 네트워크는 통합 테스트에서 대체했으므로
이를 실제 X 응답 및 운영 완료의 증거로 해석하지 않는다. 최종 운영 증거
을 이 절에 추가해야 운영 Closeout이다. 공급자가 제공하지 않는 삭제·비공개 원문과 일일 예산에
따른 지연은 복구 보장 범위에서 제외한다. 긴급 중지는 `x_reference_preview_mode=link_only`이며
신규 수집과 무료 D1 연결은 중단하지 않는다.

### 2026-09-04 코드 검토 발견 사항 보완

- 관리자 원문 제거는 원본·facts tombstone, 답글/인용/링크 복사본 제거, 참조 terminal 및
  lease 해제, 관련 X cache 정리를 같은 D1 batch로 처리한다. 중간 실패 시 전체를 rollback하고
  동일 ID 재요청은 멱등하게 처리한다. 제거 직후 실행 중이던 유료 응답도 cache 저장 시점에
  tombstone을 검사하여 본문을 다시 보존하지 않는다.
- 공개 피드 reader는 isolate memory 또는 수집용 JSON cache를 우회하고 D1 게시물 행을 읽는다.
  따라서 다른 isolate의 오래된 수집 cache가 원문 제거·보강 결과를 덮지 않는다. 공개 DTO,
  인증, 노출 상한 및 HTTP/client cache 유효 기간은 변경하지 않는다.
- continuation 페이지 재처리 시 같은 reply/quote ID의 기존 미리보기와 보강 상태를 보존한다.
  과거 불일치로 `hydrated_at`만 있고 미리보기가 없는 관계도 최대 100행 보강 대상에 포함한다.
- 원문 ID별 조회는 계속 중복 제거하지만 본문 연결 여부는 각 관계별로 판단한다. 한 관계의
  작성자 대기가 다른 답글의 무료 D1 연결을 막지 않으며, 이미 본문이 있는 작성자 재시도는
  본문과 기존 대기 상태를 불필요하게 덮지 않는다.
- 일반 외부 링크의 제목·이미지 보강은 유지하고 유료 X 답글/인용 조회만 뒤로 미룬다.
- 검증: 먼저 추가한 회귀 5건에서 모두 실패를 확인한 뒤 수정했다. 이후 D1 통합 26건이
  통과했으며 제거 rollback, 제거와 cache 저장의 경합, stale cache 공개 읽기,
  완료 표시만 남은 legacy 참조 복구까지 검증했다. 공급자 응답은 테스트에서 대체했다.
- 이번 보완은 기존 0083 이후의 추가 schema/migration이나 운영 데이터·설정을 변경하지 않는다.
  실제 운영 canary와 두 정규 실행·UTC 초기화 확인은 위 운영 게이트에 그대로 남는다.
- 수정 후 전체 `pnpm preflight`를 재실행하여 통과했다. 247개 테스트 파일/1,742건,
  coverage statements 79.28%·branches 66.20%·functions 82.88%·lines 80.78%,
  Worker/client build, 로컬 D1 doctor, 설정 mirror 16개 일치까지 확인했다.

### 2026-09-04 병합 전 추가 검토

- 부분 페이지의 게시물 저장 후 source의 최신 ID를 먼저 쓰고 continuation을 따로 쓰던
  경로에서 두 번째 D1 쓰기가 실패하면 미처리 구간을 건너뛸 위험을 확인했다. source의
  watermark·continuation·성공 시각을 단일 UPSERT로 기록하도록 변경했다. 실패는 공급자
  오류가 아니라 저장 오류로 반환하여 기존 Queue 인프라 재시도를 사용한다.
- 초기 활성화의 `NULL` watermark는 아직 확인을 끝내지 않았다는 권위 있는 상태다.
  이미 저장된 부분 페이지나 cache의 최신 ID로 대체하지 않는다. 신규 전용 pipeline은
  과거 relation marker 유무와 관계없이 기존 cursor 또는 활성화 시각을 사용한다.
- 기존 cursor와 초기 `NULL` cursor 각각에서 D1 trigger로 실패를 먼저 재현하고,
  수정 후 같은 수집 진입점을 재실행하여 구간 보존·continuation 저장을 확인했다.
  답글 보강 D1 통합 테스트는 총 28건이며 공급자 응답은 테스트에서 대체한다.
- 배포 전 운영 snapshot: 게시물 295건, source 8건, 참조 161건, invalid JSON 0건,
  `PRAGMA foreign_key_check` 위반 0건. migration 대기는 0083 한 건이다.
  UTC 2026-09-04 Cloudflare Metrics는 읽기 280,964행·쓰기 4,015행이며,
  내부 scheduled 쓰기 원장은 6,930/40,000행이다. 둘은 다른 지표이고 시점 snapshot이다.
- 운영 설정은 수집 활성, optimizer 활성, 2시간, `cached_author`, 전체 100센트,
  preview 5센트다. 기존 production은 Worker `7bafc85d-f2df-4a70-ab3e-0ff15ef80bc9`이며
  master `2abcb2a`의 Workers Builds 성공과 일치한다. 원격 0083 적용 확인 전에는
  자동 배포를 유발하는 PR 병합을 진행하지 않는다.
