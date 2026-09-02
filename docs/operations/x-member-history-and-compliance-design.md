# X 멤버 게시물 장기 기록·Compliance 설계

## 문서 상태

- 상태: canonical
- 갱신일: 2026-09-02
- 범위: 소스 활성화 이후 신규 게시물 기록, 원문 redaction, 저빈도 Batch Compliance
- 제외: 참여 지표 재조회·스냅샷·멤버별 engagement 분석

## 1. 제품 경계

- X는 과거 archive가 아니라 소스 활성화 이후 작성된 신규 게시물 피드다.
- 공개 화면은 D1에 저장한 최근 피드만 읽으며 사용자 요청에서 X API를 호출하지
  않는다.
- 관리자 기록 조회는 `GET /api/x/history/posts`의 안정적인 cursor를 사용한다.
- 게시물 ID, 멤버, 유형, 게시 시각, 최초 확인 시각, 미디어·링크 존재 여부와
  redaction tombstone은 장기 보존한다.
- 본문과 미디어 URL은 `x_posts`에 보존하되 Compliance 또는 관리자 redaction 시
  제거한다.

수집 응답에 이미 포함된 좋아요·답글·재게시 수는 공개 피드 카드 표현을 위해
`x_posts.value`에 함께 저장할 수 있다. 별도 API 호출로 이를 갱신하거나 분석용
snapshot으로 복제하지 않는다.

## 2. 참여 지표 기능 제거

비용을 줄이고 신규 피드·장기 기록에 집중하기 위해 다음 기능을 운영 계약에서
제거한다.

- `x_metrics_refresh` scheduled job과 수동 실행 유형
- `x_metrics_snapshot_enabled`, `scheduled_v2_x_metrics_refresh_enabled` 설정
- 24시간 Post lookup과 `metrics:scheduled` 비용 이벤트
- `x_post_metric_snapshots`, `x_member_daily_metrics` 테이블
- `x_post_facts`의 snapshot 완료·다음 조회·오류 컬럼
- `GET /api/x/history/summary`와 history 응답의 snapshot 상태
- 관리자 작업 화면의 X 참여 지표 갱신 항목

기존 snapshot·집계·관련 scheduled run은 제거 migration에서 삭제한다. 일반 X
게시물, 원문, facts, cursor, 수집 원장과 Compliance 이력은 유지한다.

### 2026-09-02 구현 Closeout

- 런타임 제거: [PR #103](https://github.com/rlatmfrl24/overthewall-schedule/pull/103),
  merge `c0fbedb4883e8103a0791245c107f9def702ac83`
- production Worker: `0948db90-1d51-48ae-84a6-f43822047819`
- contract 제거: [PR #104](https://github.com/rlatmfrl24/overthewall-schedule/pull/104),
  migration `0077_ambiguous_post.sql`
- production 적용·readback: `2026-09-02T02:58:29Z`

운영에서 snapshot 227건, 일별 집계 48건, 관련 run 15건, item·outbox 각 9건,
usage event 3건과 두 setting을 제거했다. 전용 table·index·setting·run·usage event는
모두 0건이고 `x_post_facts` 127건, `x_posts` 198건은 보존됐다. facts는 아래에서
정의한 13개 column만 가지며 `PRAGMA foreign_key_check`와 pending migration은 모두
0건이다.

## 3. 데이터 권위

### `x_posts`

공개 피드 원문 저장소다. `value`, `hidden_at`, `hidden_reason`,
`content_removed_at`을 통해 redaction을 수행한다.

### `x_post_facts`

원문을 복제하지 않는 장기 식별 기록이다. 다음 필드만 유지한다.

- Post ID와 안정적인 멤버 UID·멤버명 snapshot
- post/reply/quote 유형
- 게시·최초 확인 시각
- 미디어·링크 개수
- edit 계보와 superseded 관계
- 숨김 시각·사유와 갱신 시각

### `x_compliance_jobs`

공급자 job ID, 입력 ID 묶음, create/upload/poll/download/apply 상태와 오류·다음
확인 시각을 저장하는 영속 상태 머신이다. signed URL query는 로그나 관리자
응답에 노출하지 않는다.

## 4. 저빈도 Compliance

- 정상 cycle은 마지막 성공 또는 마지막 신규 job 시도 후 24시간이 지났을 때만
  시작한다.
- 진행 중 job의 upload/poll/download 단계는 24시간을 기다리지 않고
  `next_check_at`에 따라 이어받는다.
- 한 cycle은 본문을 보유한 ID를 최대 5,000개까지 한 shard로 제출한다.
- create와 provider status poll만 X 비용 원장에 요청당 `$0.005`로 보수 예약한다.
- 일일 Compliance subledger 상한은 `$0.05`를 유지한다.
- 인증·계약 오류와 upload/download 400·401·403·404는 같은 URL로 재시도하지
  않는 terminal 오류다.
- terminal job 뒤에도 새 job을 매시간 만들지 않고 마지막 시도로부터 24시간을
  기다린다.
- 네트워크·5xx는 15분 지수 backoff, 최대 5회·6시간으로 제한한다.

redaction 결과는 `x_posts.value`를 비우고 공개 노출을 중지하며 `x_post_facts`에는
최소 tombstone만 남긴다. 관리자 `DELETE /api/x/posts/{postId}`도 같은 경로를
사용한다.

## 5. 운영 플래그와 현재 공급자 게이트

- `x_history_analytics_enabled`: 장기 facts 기록
- `x_compliance_enabled`: Compliance 기능 권한
- `scheduled_v2_x_compliance_enabled`: 자동 scheduler rollout

2026-09-02 canary에서 X는 job create를 성공시켰지만 `api.x.com` upload URL에
공식 `PUT text/plain`을 수행하면 두 개의 독립 job 모두 HTTP 404를 반환했다.
`api.twitter.com` 생성·업로드도 같은 프록시 URL과 404로 귀결됐고 resumable은
공급자가 지원하지 않는다고 거절했다. 따라서 코드·기능 플래그는 유지하되 자동
rollout은 공급자 전체 상태 전이 성공 전까지 `false`로 둔다.

같은 날 확장 canary는 공식 Quickstart처럼 create body에서 `resumable`을 완전히
생략하고 현재 보관 ID 1개를 제출했다. 반환 URL은 다시
`api.x.com/2/compliance/jobs/{id}/upload`였고 다음 요청이 모두 빈 body의 HTTP
404였다.

- 공식 형식의 인증 없는 `PUT`, `Content-Type: text/plain`
- 동일 URL에 Bearer를 추가한 `PUT`
- 지원 method 확인용 `OPTIONS`(응답 `Allow` 없음)

X가 공개한 `xdevplatform/compliant-client`도 인증 없는 `requests.put`과
`text/plain`을 사용하므로 현재 구현 형식과 일치한다. Compliance stream은 공식상
Enterprise 전용이어서 현재 저비용 배포의 대체 경로로 사용하지 않는다. 이 장애는
애플리케이션 URL 치환이나 재시도로 정상화할 수 없으며 X 측 upload route 복구 또는
계정별 entitlement 수정이 필요하다.

지원 요청에는 App/Project, UTC create 시각, provider job ID, upload hostname·path,
upload expiry, PUT/OPTIONS의 404와 resumable 400을 포함한다. signed URL의 `token`
query와 Bearer token은 첨부하지 않는다.

활성화 조건은 다음과 같다.

1. 새 job create와 ID upload 성공
2. provider status `complete` 확인
3. 결과 download와 멱등 apply 성공
4. 테스트 redaction의 원문 제거·tombstone 유지 확인
5. 같은 cycle 중복 job 0건과 비용·D1 원장 일치
6. 성공 후 `scheduled_v2_x_compliance_enabled=true` readback

공급자 incident 동안 `x_compliance_enabled=true`,
`scheduled_v2_x_compliance_enabled=false`를 유지한다. 관리자 수동 redaction은 계속
사용할 수 있지만 Batch Compliance 수동 실행은 같은 공급자 404를 만들 수 있으므로
canary 외에는 실행하지 않는다.

## 6. 관리자 API

- `GET /api/x/history/posts`: 관리자 전용, 기본 50·최대 100, `(created_at, id)` cursor
- `GET /api/x/history/health`: 마지막 수집 성공, 당일 X 예산, 최신 Compliance 상태
- `DELETE /api/x/posts/{postId}`: 관리자 수동 redaction
- `POST /api/operations/runs`: `x_collection`과 `x_compliance`만 지원

모든 관리자 history 응답은 `Cache-Control: no-store`를 사용한다.

## 7. 완료 기준

- 공개 신규 피드·장기 history cursor가 참여 지표 제거 전과 동일하게 동작
- 운영·설정 API 어디에서도 metrics refresh job이나 snapshot flag를 허용하지 않음
- remote D1에서 전용 테이블·컬럼·설정·작업·usage event가 0건
- 공개 요청 전후 X API 사용 이벤트 증가 0
- Compliance 24시간 gate와 terminal 실패 24시간 backoff 검증
- 공급자 canary 전체 상태 전이 후에만 자동 rollout 활성화

정책 근거는 [X Developer Policy](https://docs.x.com/developer-terms/policy)와
[Batch Compliance Quickstart](https://docs.x.com/x-api/compliance/batch-compliance/quickstart)를
따른다.
