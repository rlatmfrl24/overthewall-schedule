# X 멤버 게시물 장기 기록·Compliance 설계

## 문서 상태

- 상태: 코드·additive migration·운영 flag 활성화 완료, Compliance canary 후속 조치 필요
- 제품 정의: 활성화 이후의 멤버 신규 게시물을 지속적으로 보존하는 피드와
  관리자 전용 기록·기초 통계
- 공개 범위: 최근 피드만 공개, 누적 기록·통계·운영 상태는 관리자 전용
- 구현 기준선: `e652d21` X 자동화 구현, `aad06c8` 로컬 migration 체인 보강
- 운영 기준선: Worker `07c1de88-f6ba-4bf5-86b5-eebd69857dd4`, D1 migration
  `0075`·`0076`
- 정책 게이트: X Developer Console use-case 확인 완료

이 문서는 X의 과거 timeline을 가져오는 archive를 설계하지 않는다. 소스의
`collection_started_at` 이후 게시물을 누락 없이 따라가면서, 공개 피드와 장기 기록,
Compliance, 제한된 기초 통계를 한 데이터 수명주기로 관리하는 것이 목적이다.

2026-09-01 구현 변경은 이 설계의 additive schema, 관리자 history API, metrics
refresh 및 Compliance 상태 머신을 추가했다. 운영 D1에 migration을 적용했고
X Developer Console use-case 확인 뒤 analytics·snapshot·Compliance와 두 scheduled
lane flag를 모두 활성화했다. 첫 Compliance create는 fail-closed URL 검증에서
중단됐으므로 전체 상태 전이 성공은 아직 Closeout하지 않는다.

## 1. 제품·정책 경계

### 1.1 수집 권위

- 소스 최초 활성화 시각을 `collection_started_at`으로 저장한다.
- 첫 수집은 `start_time=collection_started_at` 이후 게시물만 대상으로 한다.
- 최초 정상 동기화 뒤에는 `since_id`를 사용하고 pagination continuation을 영속화한다.
- 채널 비활성화 기간은 소급하지 않는다. 재활성화 시각을 새 시작점으로 삼고 기존
  cursor를 원자적으로 초기화한다.
- API 장애는 비활성화가 아니므로 cursor와 continuation을 유지한다.
- 기존 D1 `x_posts`는 정규화 facts 생성에만 사용한다. X API로 과거 게시물을 추가
  조회하지 않는다.

### 1.2 노출 경계

- 공개 `/feed`, `/api/member-posts`, `/api/x/posts`는 현재 DTO와 최근 피드 제한을
  유지한다.
- 공개 archive cursor, 전체 export, 누적 통계 API를 추가하지 않는다.
- 전체 기록·통계·Compliance health는 Clerk 관리자만 `/admin/member-posts`에서
  접근한다.
- 공개 GET은 D1 저장 데이터만 읽으며 사용자 요청이 X API 호출을 유발하지 않는다.
- 이미지 파일은 D1이나 R2에 복제하지 않고, 게시물이 공개 상태인 동안 X가 반환한
  URL만 `x_posts.value` 안에 보관한다.

### 1.3 허용 분석

관리자 분석은 다음 기초 지표로 제한한다.

- 멤버·KST 일자별 게시물 수
- `original | reply | quote | repost` 게시물 유형
- 미디어·링크 포함 여부와 개수
- 수집 시점과 게시 후 약 24시간 시점의 공개 like, reply, repost, quote 수
- 스냅샷 coverage와 삭제·비공개 처리 건수

본문 분류, 감정·성향 분석, 민감 특성 추론, 위치 이력, 외부 고객·기기·프로필과의
결합, 광고 타기팅, X 데이터 기반 AI 모델 학습은 하지 않는다. 원문 텍스트와 URL은
통계 테이블에 복제하지 않는다.

### 1.4 X 정책 게이트

[X Developer Policy](https://docs.x.com/developer-terms/policy)는 저장한 X Content를
현재 상태와 일치시키고, 삭제·변경·비공개·정지된 내용을 가능한 한 빨리 제거하거나
수정하도록 요구한다. 이 설계는 12시간 Compliance 주기와 관리자 즉시 redaction으로
24시간 대응 여유를 확보한다.

같은 정책은 승인된 use-case의 실질적 변경을 사전에 알리고 승인을 받도록 요구하며,
X 성능을 벤치마킹하기 위한 게시량·engagement 집계를 제한한다.
[Restricted Uses](https://docs.x.com/developer-terms/restricted-use-cases)의 익명 aggregate
예외는 개인 식별자를 저장하지 않는 분석에만 적용된다. 이 설계는 멤버별
`member_uid`를 사용하므로 해당 예외에 의존하지 않는다.

따라서 운영자는 X Developer Console의 use-case 설명에 다음 목적이 포함되어 있고
허용된 범위인지 확인해야 한다.

1. 등록된 멤버의 활성화 이후 공개 게시물을 최근 피드로 표시
2. 게시물 ID와 공개 내용의 장기 보존 및 Compliance 갱신
3. 관리자 전용 멤버별 게시 활동·공개 engagement 기초 통계

확인 전에는 `x_history_analytics_enabled`, `x_metrics_snapshot_enabled`,
`x_compliance_enabled`를 활성화하지 않는다. 승인 범위가 불명확하면 분석 flag는
계속 끄고 최근 피드와 수동 redaction만 유지한다.

## 2. 데이터 모델

모든 원본 시각은 UTC epoch millisecond로 저장한다. 일별 집계의 경계와 API의
`from`·`to` 날짜만 `Asia/Seoul`로 해석한다. 신규 Drizzle migration은 기존 migration을
수정하지 않는 additive migration으로 작성한다.

### 2.1 기존 권위 테이블

`x_posts`는 공개 가능한 원문과 tombstone의 권위다.

- `id`, `handle`, `user_id`, `username`, `created_at`, `first_seen_at`은 장기 보존한다.
- 공개 상태에서는 `value`에 본문·미디어·링크 preview를 보관한다.
- redaction 시 `value='{}'`, `hidden_at`, `hidden_reason`,
  `content_removed_at`을 같은 mutation에서 기록한다.
- `hidden_reason IN ('admin', 'compliance')`인 행은 재수집으로 복구하지 않는다.

`x_post_sources`는 수집 시작점·watermark·continuation·attempt/success/next check와
오류 상태의 권위다. 분석 테이블이 수집 cursor를 소유하지 않는다.

### 2.2 `x_post_facts`

본문 JSON을 scan하지 않고 기록·집계 대상을 찾는 정규화 테이블이다.

| 필드                                           | 계약                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `post_id`                                      | `x_posts.id`를 참조하는 PK                                 |
| `member_uid`                                   | 수집 당시의 안정적인 멤버 UID. 멤버 비활성화로 지우지 않음 |
| `member_name_snapshot`                         | 당시 표시명. 이름 변경 뒤에도 과거 attribution 유지        |
| `post_kind`                                    | `original`, `reply`, `quote`, `repost` CHECK               |
| `edit_root_post_id`                            | edit history 최초 ID. 미편집 게시물은 `post_id`와 같음     |
| `superseded_by_post_id`                        | 새 편집본이 확인된 이전 버전에서만 최신 Post ID            |
| `published_at`, `first_seen_at`                | UTC epoch millisecond                                      |
| `media_count`, `link_count`                    | 0 이상 정수                                                |
| `has_media`, `has_link`                        | 0/1 CHECK, count와 일관성 유지                             |
| `snapshot_eligibility`                         | `eligible`, `legacy_no_snapshot`, `redacted` CHECK         |
| `initial_snapshot_at`, `after_24h_snapshot_at` | 각 스냅샷 완료 시각                                        |
| `metrics_refresh_next_at`                      | 24시간 조회 대상의 다음 실행 시각                          |
| `metrics_refresh_error_code`                   | 마지막 분류된 오류. 성공 시 NULL                           |
| `created_at`, `updated_at`                     | 행 생성·갱신 시각                                          |

인덱스는 `(member_uid, published_at DESC, post_id DESC)`,
`(edit_root_post_id, superseded_by_post_id)`,
`(snapshot_eligibility, metrics_refresh_next_at, post_id)`를 둔다. 원문·미디어 URL·링크
대상은 저장하지 않는다.

기존 `x_posts` backfill은 facts만 생성하고 `snapshot_eligibility`를
`legacy_no_snapshot`으로 둔다. 당시 저장된 최신 engagement를 initial 또는 24시간
값으로 재해석하지 않으며 유료 API backfill도 하지 않는다. migration 전 scan에서
정규화한 `x_posts.handle`이 정확히 한 `members.url_twitter`와 매핑되는지 확인하고,
미매핑·중복 매핑이 한 건이라도 있으면 analytics rollout을 중단한다. `member_uid`는
NOT NULL이며 멤버 비활성화·이름 변경·보관으로 cascade 삭제하지 않는다.

`post_kind`는 persisted DTO의 참조 관계로 결정한다. repost가 있으면 `repost`, 그다음
reply 대상이 있으면 `reply`, quote 대상이 있으면 `quote`, 어느 것도 없으면
`original`을 사용한다. 숨겨진 기존 행은 콘텐츠 facts를 생성하지 않고
`snapshot_eligibility='redacted'`로 만든다.

### 2.3 `x_post_metric_snapshots`

| 필드                                                       | 계약                          |
| ---------------------------------------------------------- | ----------------------------- |
| `post_id`                                                  | `x_post_facts.post_id` 참조   |
| `snapshot_kind`                                            | `initial`, `after_24h` CHECK  |
| `captured_at`                                              | 공급자 조회가 성공한 UTC 시각 |
| `like_count`, `reply_count`, `repost_count`, `quote_count` | 0 이상 정수                   |

PK는 `(post_id, snapshot_kind)`이며 upsert는 같은 kind를 중복 생성하지 않는다.
Compliance 또는 관리자 redaction은 해당 게시물의 스냅샷을 모두 삭제한다.

### 2.4 `x_member_daily_metrics`

PK는 `(kst_date, member_uid)`다. 멤버 UID와 `member_name_snapshot`은 과거 attribution을
유지하고 멤버 비활성화나 이름 변경으로 과거 행을 삭제하지 않는다.

다음 값을 보관한다.

- 현재 노출 가능한 전체·유형별 게시물 수
- 미디어·링크 게시물 수와 총 개수
- initial·24시간 공개 engagement 합계와 delta
- `eligible`, `initial_captured`, `after_24h_captured`, `pending` coverage
- 해당 일자 redaction 건수
- 마지막 재계산 시각

게시물 ingest, snapshot 저장, redaction이 발생하면 영향받은 KST 일자와 멤버 행만
원본 facts·snapshot에서 멱등 재계산한다. redacted 게시물은 게시·engagement 합계에서
제외하고 `removed_count`에만 반영한다.

### 2.5 `x_compliance_jobs`

| 필드군 | 계약                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| 식별   | local ID, provider job ID, UTC 12시간 bucket                                                   |
| 상태   | `planned`, `created`, `uploaded`, `processing`, `applying`, `succeeded`, `failed`, `throttled` |
| 입력   | `input_count`, 최대 5,000개 ID의 검증된 JSON, 입력 hash                                        |
| 진행   | create/upload/poll/download/apply 시각, `next_check_at`, attempt 수                            |
| 결과   | event·redaction·geo scrub·unchanged 수, 비용, 오류 코드                                        |
| 감사   | 생성·갱신·완료 시각                                                                            |

`(bucket, input_hash)`를 unique로 두어 동일 shard를 중복 제출하지 않는다. 공급자가
수백만 ID를 지원하더라도 Worker 메모리·응답 크기를 제한하기 위해 local shard는
5,000개를 넘기지 않는다. job과 입력 JSON은 완료 후 30일 보존하고, 일별 비용·상태
집계만 장기 보존한다.

## 3. 실행 흐름

### 3.1 신규 게시물과 initial snapshot

1. 기존 X 수집이 `collection_started_at` 또는 `since_id`로 최대 25개 페이지를 읽는다.
2. 아직 공개 상태인 게시물만 `x_posts`와 `x_post_facts`에 중복 안전하게 저장한다.
3. 수집 응답에 포함된 `public_metrics`로 `initial` snapshot을 같은 item에서 저장한다.
4. `metrics_refresh_next_at`을 `published_at + 24시간`으로 설정한다.
5. 모든 페이지가 완료되기 전에는 source watermark를 전진시키지 않는다.
6. redaction된 기존 post ID가 다시 나타나도 본문과 snapshot을 복구하지 않는다.

### 3.2 약 24시간 engagement snapshot

- `x_metrics_refresh`는 `metrics_refresh_next_at <= now`이고 `after_24h`가 없는 게시물을
  오래된 순서로 선택한다.
- [Post Lookup](https://docs.x.com/x-api/posts/get-posts-by-ids)의 요청 상한에 맞춰 최대
  100개 ID를 한 item으로 처리하고 `public_metrics`만 요청한다.
- 신규 피드 수집을 먼저 admission한 뒤 남은 `$0.70` 수집 예산에서 실행한다.
- 예산 부족은 `throttled`이며 대상 행과 다음 시각을 유지한다. 완료되지 않은 항목을
  건너뛰는 전역 cursor는 두지 않는다.
- 누락·삭제 응답은 즉시 내용이 사라졌다는 권위 신호로 단정하지 않고 Compliance
  확인 대상으로 올린다. 명시적인 protected/deleted 응답이면 공통 redaction 경로를
  사용한다.
- 네트워크·5xx는 30분부터 최대 6시간 지수 backoff, 429는 `Retry-After`, quota는 다음
  UTC 일자 이후 jitter를 사용한다. auth·invalid request는 terminal 운영 경고다.

### 3.3 Batch Compliance

[Batch Compliance](https://docs.x.com/x-api/compliance/batch-compliance/introduction)의
비동기 계약을 그대로 따른다.

1. 매시 planner가 마지막 정상 Compliance가 12시간 이상 지났는지 확인한다.
2. `hidden_at IS NULL`이고 본문을 보유한 전체 `x_posts` ID를 5,000개씩 계획한다.
3. provider job을 만들고 upload URL이 HTTPS이며 hostname이 공식 응답 계약의
   `storage.googleapis.com`인지 검증한 뒤 newline ID를 업로드한다. 다른 host가
   반환되면 자동 추종하지 않고 운영 경고와 함께 fail-closed한다.
4. job 상태와 `next_check_at`을 저장하고 Queue 메시지는 정상 ack한다.
5. 다음 due 실행에서 poll하고, 완료되면 download URL도 같은 HTTPS·hostname 규칙으로
   다시 검증해 결과를 bounded stream으로 처리한다.
6. `deleted`, `bounced`, `protected`, `suspended`는 본문·미디어 URL·snapshot을 제거하고
   숨김 상태와 삭제 건수를 반영한다.
7. 편집 event에 `edit_tweet_ids`가 있으면 마지막 ID를 authoritative replacement로
   lookup한다. author가 기존 source와 같을 때만 새 `x_posts`·facts를 저장하고 이전
   버전은 `hidden_reason='compliance'`로 비우며 `superseded_by_post_id`를 기록한다.
   같은 `edit_root_post_id`에서는 최신 visible 행 하나만 피드·집계에 포함하고 편집
   교체는 `removed_count`를 올리지 않는다. lookup·author 검증 실패 시 이전 버전을
   공개 상태로 두지 않고 운영 경고를 남긴다.
8. `scrub_geo`는 저장된 geo 필드만 제거한다. 별도 위치 통계는 생성하지 않는다.
9. 일부 shard 실패는 run `partial`, 전체 실패는 `failed`, admission 거부는
   `throttled`로 기록한다.

공급자 처리 대기는 source/job `next_check_at`으로 관리하며 Queue retry를 사용하지
않는다. Queue retry는 D1, lease, dispatch 같은 인프라 장애에만 사용한다. redaction
mutation은 게시물 숨김, snapshot 삭제, 당일 집계 재계산을 재실행 가능하게 분리하고
모두 완료된 뒤 job을 `succeeded`로 전환한다.

### 3.4 관리자 redaction

현재 `DELETE /api/x/posts/{postId}`를 유지하되 후속 구현에서는 Compliance와 같은
application service를 호출한다. 관리자 인증·감사 로그를 유지하고 다음 결과를 한
계약으로 보장한다.

- 공개 노출 즉시 중지
- `x_posts.value` 제거와 tombstone 유지
- metric snapshot 제거
- facts의 `snapshot_eligibility='redacted'`
- 영향 일별 집계 재계산
- 재수집에 의한 자동 복구 금지

## 4. 비용·원장

UTC 일일 hard cap은 `$1.00`이다.

| 원장 resource              |    상한 | 포함 작업                                        |
| -------------------------- | ------: | ------------------------------------------------ |
| `x_collection_cost_micros` | `$0.70` | 신규 피드와 약 24시간 snapshot                   |
| `x_compliance_cost_micros` | `$0.05` | Compliance create·poll·result 처리의 공급자 비용 |
| `x_enrichment_cost_micros` | `$0.05` | 링크·인용 보강                                   |
| 호출 불가 reserve          | `$0.20` | 가격 변동·정산 오차와 장애 격리 여유             |
| `x_api_cost_micros`        | `$1.00` | 모든 workload의 전역 hard cap                    |

workload subledger와 전역 원장을 외부 호출 전에 원자 예약한다. D1·원장 실패는
fail-closed다. 실제 외부 요청은 실패·잘못된 요청이어도 환불하지 않으며, local
admission 거부만 비용 0으로 기록한다. X Developer Console의 월 지출 한도 `$30`은
별도 사람 관리 hard stop으로 유지한다.

## 5. 관리자 API·화면 계약

세 API는 Clerk 관리자 인증과 `Cache-Control: no-store`를 적용한다.

### `GET /api/x/history/posts`

- query: `memberUid`, KST `from`, KST `to`, `cursor`, `limit`
- `limit`: 기본 50, 최대 100
- 정렬: `published_at DESC, post_id DESC`
- cursor: 위 정렬 키를 담은 opaque base64url 값
- 응답: 게시물 DTO, 멤버 snapshot, `visible | redacted`, redaction 시각·사유,
  edit root·replacement ID, 다음 cursor
- redacted 행은 ID·출처·시각·상태만 반환하고 본문·미디어·engagement는 반환하지 않음

### `GET /api/x/history/summary`

- query: `memberUid`, KST `from`, KST `to`
- 기본 최근 30일, 최대 366일
- 응답: `timezone='Asia/Seoul'`, 범위 totals, 일별 행, 멤버별 행,
  initial/24시간 coverage, pending·removed 수
- 원문 `x_posts.value`를 읽지 않고 facts·snapshot·daily metrics만 사용

### `GET /api/x/history/health`

- Compliance 마지막 attempt/success, 현재 provider 상태, next check, 입력·redaction 수
- 24시간 snapshot eligible·pending·oldest due와 최근 오류
- workload별 UTC 예산 used/reserved/limit과 다음 reset
- 세 feature flag와 Developer Console use-case 확인 상태

관리자 UI는 `/admin/member-posts`에 `기록`, `통계`, `Compliance 상태` 영역을 추가한다.
수동 실행은 기존 `POST /api/operations/runs`에 `x_metrics_refresh`, `x_compliance` job
type을 추가해 scheduled pipeline과 같은 admission·결과 계약을 사용한다.

## 6. 보존·삭제

| 데이터                                    | 보존                                     |
| ----------------------------------------- | ---------------------------------------- |
| X post ID·source·게시·최초 확인·숨김 상태 | 장기                                     |
| 공개 상태의 본문·미디어 URL               | Compliance 또는 관리자 제거 전까지       |
| facts                                     | 장기, redaction 후 비콘텐츠 facts만 유지 |
| metric snapshot                           | 공개 상태 동안 장기, redaction 시 삭제   |
| KST 일별 집계                             | 장기, redaction을 반영해 재계산          |
| Compliance job·입력·poll 상세             | 완료 후 30일                             |
| 수집·snapshot·API usage 상세              | 30일                                     |
| scheduled item                            | 30일                                     |
| scheduled run summary                     | 90일                                     |
| 일별 사용량·상태 집계                     | 장기                                     |

소스 비활성화는 공개 피드 노출과 신규 수집만 멈추며 저장 기록은 보존한다. 소스
삭제 요청은 먼저 비활성·보관 처리하고, X 정책 또는 관리자 삭제 요청에 해당하면
공통 redaction을 수행한다.

## 7. Rollout·완료 조건

### 7.1 순서

1. additive migration과 전체 migration chain·FK·CHECK 검증
2. 기존 D1 `x_posts` facts backfill, provider 호출 0회 확인
3. 관리자 history API와 UI 배포, `x_history_analytics_enabled=false`
4. use-case 승인 범위 확인 후 analytics flag 활성화
5. 신규 게시물 initial snapshot canary
6. `x_metrics_snapshot_enabled` 활성화와 24시간 canary
7. 운영 bearer의 실제 Batch Compliance preflight 성공
8. `x_compliance_enabled` 활성화와 create→upload→poll→download→redaction canary

각 단계는 독립 rollback flag를 사용한다. 공개 피드 DTO와 수집 cursor는 analytics
flag와 무관하게 유지한다.

### 7.2 테스트

- 기존 게시물 facts 변환이 X API를 호출하지 않고 `legacy_no_snapshot`이 되는지 검증
- 신규 게시물 initial·24시간 snapshot 중복 안전성과 budget backlog 재개 검증
- KST 자정·DST 비영향, UTC 예산 reset 검증
- redaction 시 원문·미디어·snapshot 제거, tombstone·removed count 유지 검증
- Compliance shard·재시작·poll·부분 실패·URL 검증·lease CAS 검증
- history cursor 안정성, 최대 범위·limit, 관리자 인증·`no-store` 검증
- 공개 API DTO·5~20 제한과 공급자 fetch 0회 회귀 검증

### 7.3 운영 완료 조건

- 신규 게시물 1건의 initial 및 약 24시간 snapshot 권위 readback
- 관리자 history·summary 조회와 공개 API shape 불변 확인
- 실제 Compliance job 전체 상태 전이 성공
- 테스트용 redaction의 본문·미디어·snapshot 제거와 삭제 건수 반영
- UTC 전역 원장과 세 workload subledger 합계 일치
- Compliance 3회 연속, snapshot 시간 작업 3회 연속 정상
- 공개 요청 전후 X API usage event 증가 0

## 8. 2026-09-01 구현·활성화 Closeout

운영 D1과 Worker를 `2026-09-01T11:40:17Z`에 읽기 전용으로 재확인했다. 수치와
상태는 해당 시점 snapshot이며 이후 실행으로 달라질 수 있다.

| 영역 | 판정 | 권위 readback | 남은 조치 |
| --- | --- | --- | --- |
| 코드·schema | 완료 | `e652d21`, additive migration `0075`·`0076` 적용, `PRAGMA foreign_key_check` 0건 | 없음 |
| 로컬 migration 체인 | 완료 | 전체 chain validate 통과, 로컬 `0075`·`0076` 적용, doctor pending 0건, Windows Wrangler `bad port`만 1회 제한 재시도하도록 `aad06c8` 반영 | SQL·CHECK·FK 오류는 계속 fail-closed |
| Worker 배포 | 완료 | production version `07c1de88-f6ba-4bf5-86b5-eebd69857dd4` 100% | 없음 |
| 정책·rollout flag | 완료 | use-case 확인 완료. `x_history_analytics_enabled`, `x_metrics_snapshot_enabled`, `x_compliance_enabled`, `scheduled_v2_x_metrics_refresh_enabled`, `scheduled_v2_x_compliance_enabled` 모두 `true` | 정책 범위 변경 시 재검토 |
| 기존 기록 보존 | 완료 | `x_posts` 160건·8 handle·숨김 0건 유지 | 과거 X API backfill 없음 |
| facts·snapshot | 활성화·관찰 중 | `x_post_facts` 0건, snapshot 0건, 일별 집계 0건. 기존 행을 metric snapshot으로 위조하지 않으며 활성화 이후 신규 게시물이 canary를 생성해야 함 | 신규 게시물 initial·24시간 snapshot readback |
| Batch Compliance | 운영 canary 실패 | 160개 입력 job 1건이 create 단계에서 `compliance_storage_url_invalid`로 실패. provider job ID·redaction 0건이며 저장 콘텐츠 변경 없이 안전 중단 | 공식 signed storage URL host 계약 수정 후 create→upload→poll→download→apply 재실행 |
| scheduled 결과 | 부분 완료 | `x_metrics_refresh`는 due facts가 없어 `skipped`, `x_compliance`는 위 URL 검증 오류로 `failed` | 정상 실행 3회 연속 전에는 자동화 완료 판정 금지 |

따라서 구현·migration·배포·활성화는 Closeout한다. X 장기 기록 자동화의 최종 운영
완료는 7.3의 신규 snapshot, 실제 Compliance 전체 상태 전이, 테스트 redaction 및
3회 연속 정상 실행을 충족한 뒤 별도로 판정한다.

### 8.1 2026-09-02 Compliance 운영 hold와 비용 재검토

`2026-09-01T21:24:17Z`에 `x_compliance_enabled`와
`scheduled_v2_x_compliance_enabled`를 `false`로 전환했다. Queue에 전달되지 않은
`queued` run 3건은 `operator_disabled_x_compliance` 사유로 `skipped` 처리했고,
실행 가능한 Compliance item·outbox는 모두 0건임을 확인했다. background Queue는
X·네이버·auto-update·retention이 공유하므로 전체 purge하지 않는다.

같은 UTC 일자 원장에서 X API 예상비용은 총 `$0.630`이었고, 이 중 Compliance는
`POST /2/compliance/jobs` 성공 3회 `$0.015`였다. 나머지 `$0.615`는 수동 신규
수집·보강 및 reply context 조회였다. 따라서 Compliance가 당일 X 비용의 주원인은
아니지만, 동일한 `compliance_storage_url_invalid` 실패로 provider job을 세 번
생성한 것은 불필요한 비용이다.

다음 최적화를 적용하고 실제 전체 상태 전이 canary 전까지 두 flag를 다시 켜지
않는다.

- Cron bridge가 rollout flag를 먼저 읽어 꺼진 lane의 Workflow instance와 D1 run을
  만들지 않는다.
- Compliance는 진행 중 job이 due이거나 마지막 정상 cycle로부터 12시간이 지난
  경우에만 Workflow를 시작한다.
- signed storage URL·인증·응답 계약 오류는 terminal로 저장하고 자동 재시도하지
  않는다. 네트워크·5xx는 15분 지수 backoff, 최대 5회·6시간으로 제한한다.
- provider job ID와 민감하지 않은 URL protocol·hostname 진단만 보존하고 signed
  path·query는 오류 로그에 남기지 않는다.
- 일일 Compliance 상한은 `$0.15`에서 `$0.05`(유료 요청 최대 10회)로 낮춘다. 160개
  규모에서 12시간 cycle 2회, cycle당 create와 1~2회 poll을 수용하는 값이다.
- D1 dispatch 쓰기 예약은 입력 ID 5,000개를 쓰기 행으로 계산하던 5,500에서 실제
  단일 shard·상태·인덱스 갱신 여유 100행으로 낮춘다. 입력 ID 읽기 상한 5,500은
  유지한다.

여기서 `scheduled_usage_daily.d1_rows_written`은 Cloudflare D1의 실제
`rows_written`가 아니라 dispatch 전에 차감하는 보수적 추정 원장이다. 기존에는
Compliance item 5건이 `5 × 5,500 = 27,500`을 차감해 내부 일일 목표 40,000의
68.75%를 점유했지만, D1에 27,500행을 쓴 것은 아니다. 변경 후 정상 12시간 cycle
2회가 create·upload·poll·download 4단계씩 실행되면 800행을 예약한다. 유료 API
호출 10회 상한에 upload·download 4단계를 더한 보수적 최악치도 1,400행으로 내부
목표의 3.5%, Workers Free 실제 100,000 writes/day의 1.4%다.

운영 query insight에서 Compliance 고유 write는 API usage event insert 평균 4행,
job state update 평균 2행이었다. 최근 6시간 top-200 query의 전체 실제 write 합계는
835행, Compliance와 `music_search_gram_stats` write는 각각 0행이었다. 반면 이동
24시간 `rows_written`은 408,039행으로 Free 일일 상한을 넘었으며, 4,000행 전후로
보인 대량 query는 과거 `music_search_gram_stats` 전체 재구축(실행당 평균 3,870행)과
migration table copy였다. 전체 재구축은 PR #97에서 증분 갱신으로 교체됐고 최근
6시간에는 재발하지 않았다.

장기 본문과 미디어 URL을 D1에서 공개 피드로 제공하는 현재 제품 계약에서는
Compliance 자체를 제거하지 않는다. X에서 삭제·비공개·정지·수정된 콘텐츠를
로컬 저장소와 공개 화면에서도 반영해야 하기 때문이다. 대안은 본문을 장기
저장하지 않고 매 공개 요청마다 재조회하는 방식이지만, 이는 공개 read의 공급자
호출 0회와 비용 안정성 계약을 깨므로 채택하지 않는다.
