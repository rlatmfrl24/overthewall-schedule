# OTW Play 카탈로그 벌크 수집·제안 수정/철회 조사 보고서

상태: 2026-08-21 권장안 채택, 구현 전

조사일: 2026-08-20

결정일: 2026-08-21

상위 문서: `otw-play-product-requirements.md`

연계 문서:

- `otw-play-channel-subscription-automation-research.md`
- `otw-play-detailed-credits-and-member-songbook-research.md`
- `otw-play-system-design.md`
- `otw-play-implementation-guide.md`

## 1. 결론

카탈로그 정비의 최우선 구현은 다음 두 흐름을 하나의 운영 프로그램으로 제공하는
것이다.

1. 관리자가 YouTube playlist URL을 입력하고 전체 영상을 읽어 중복·채널·재생 상태를
   미리 확인한 뒤, 선택한 행을 벌크로 OTW Play 검수 후보에 적재한다.
2. 로그인 회원은 자신의 `pending_review` 공식 커버 제안을 수정하거나 철회할 수 있다.

playlist 영상은 YouTube metadata만으로 곡명, 원곡 가수, 참여자와 공개 정책을 확정할
수 없으므로 자동 publish하지 않는다. playlist 수집과 후속 채널 자동화는 별도
`system ingestion candidate`를 만들고, 관리자가 필수 metadata를 보완한 뒤 기존
catalog-entry command로 `draft`를 생성한다. 회원 proposal은 submitter가 있는 별도
aggregate로 계속 유지한다.

채택된 운영값은 다음과 같다.

- API가 익명 조회할 수 있는 `public`·`unlisted` playlist만 지원하고 `private`와
  사용자 OAuth는 제품 범위에서 제외한다.
- 한 job 5,000개, API·영상 batch 50개, D1 job + Queue/DLQ, 기본 retry 3회를 사용한다.
- active candidate는 90일, ignored/blocked는 180일을 상한으로 하며 YouTube API data는
  30일 안에 refresh하거나 삭제한다.
- 식별자·API 사실만 자동 적용하고 곡·원곡 가수·참여자·분류는 추천값으로만
  제공한다.

## 2. 현재 구조와 gap

현재 OTW Play는 다음 기반을 이미 가진다.

- song–performance–source–channel 분리 모델과 YouTube video ID 중복 제약
- 관리자 단건 catalog-entry preflight·등록·수정·publish command
- 회원 공식 커버 proposal 생성·내 제안 조회와 관리자 승인·거절
- proposal `pending_review|approved|rejected|withdrawn` 상태와 version CAS
- 최대 50개 영상의 `videos.list` batch metadata·source-health 판정
- 승인된 공식 channel allowlist와 catalog/read-model revision

현재 빠진 것은 다음과 같다.

- playlist URL/ID 정규화, pagination, import progress와 항목별 결과
- 후보별 필수값을 보완하고 실제 적용값을 즉시 확인하는 작업 화면
- import와 채널 자동화가 공유할 system candidate·origin·처리 이력
- 회원 proposal의 owner-only update/withdraw command와 UI
- 대량 작업의 재시도·부분 성공·idempotency·감사 readback

## 3. YouTube API 조사 결과

### 3.1 playlist 읽기

- `playlists.list(part=snippet,contentDetails,id=...)`로 playlist 제목, 소유 channel과
  `itemCount`를 확인한다.
- `playlistItems.list`는 한 요청에 최대 50개를 반환하므로 `nextPageToken`을 끝까지
  따라가야 한다. playlist 순서는 `snippet.position`으로 보존한다.
- 각 playlist item의 `contentDetails.videoId`를 모은 뒤 `videos.list`를 최대 50개씩
  호출해 최신 title, channel ID, 게시 시각, duration, privacy, embed, region 상태를
  다시 확인한다.
- `playlistItems.list`, `playlists.list`, `videos.list`는 각각 현재 1 quota unit이다.
  `search.list`는 playlist 수집에 필요하지 않으므로 사용하지 않는다.
- API key로 익명 조회 가능한 public·unlisted playlist를 읽는다. private playlist
  지원은 사용자 OAuth와 동의·token 보관·삭제 흐름이 필요하므로 제품 범위에서
  제외한다.

근거: [PlaylistItems: list](https://developers.google.com/youtube/v3/docs/playlistItems/list),
[Playlists resource](https://developers.google.com/youtube/v3/docs/playlists),
[Videos: list](https://developers.google.com/youtube/v3/docs/videos/list),
[quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost).

### 3.2 데이터 보관 정책

YouTube API의 non-authorized metadata는 30일을 넘겨 보관할 경우 삭제하거나
refresh해야 한다. active candidate는 최대 90일, ignored/blocked candidate는 최대
180일을 보존하되 30일마다 API data를 다시 확인한다. 보존 상한을 넘기면 YouTube
title·thumbnail·channel title 같은 API data를 삭제하고 내부 처리 결과만 감사 event로
남긴다. OTW Play가 자체 검수로 확정한 곡·credit·분류는 내부 catalog
권위 데이터지만, YouTube title·thumbnail·channel title·availability는 API data로
구분해 source-health 또는 별도 refresh에서 30일 안에 갱신해야 한다. 영상 파일이나
오디오를 다운로드·저장·프록시하지 않는다.

근거: [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies).

### 3.3 compliance 선행 gate

YouTube Developer Policies는 같은 content owner 아래 channel을 제외한 API Data
aggregation을 제한하고, API data를 이용한 YouTube 자체 usage·revenue 파생 지표를
금지한다. OTW Play가 여러 OTW·멤버·협업 channel을 한 catalog에서 보여주는 방식이
해당 조항에서 허용되는 independent-value API Client인지, channel들이 YouTube가
인식하는 동일 content owner인지에 대해서는 기술팀이 임의 해석하지 않는다. playlist
벌크 수집과 channel 자동화의 production 확대 전에 서비스 owner의 정책·법무 검토 또는
YouTube API compliance 확인을 필수 gate로 둔다.

또한 embedded video마다 `status.madeForKids`를 조회하고 해당 영상의 tracking·data
collection이 관련 법과 정책을 만족하도록 player mode를 적용해야 한다. 영상·thumbnail·
playlist 등 YouTube content를 표시하는 화면은 YouTube가 출처임을 명확히 표시한다.

근거: [Developer Policies의 Data Aggregation, Made for Kids와 Branding 조항](https://developers.google.com/youtube/terms/developer-policies),
[Videos resource](https://developers.google.com/youtube/v3/docs/videos).

## 4. 권위 모델

### 4.1 세 종류의 입력을 분리한다

| 입력 | aggregate | actor | 공개 가능 조건 |
| --- | --- | --- | --- |
| 회원 공식 커버 제안 | `music_cover_proposals` | 실제 로그인 회원 | 관리자 승인으로 published performance 생성 |
| playlist·channel 자동 발견 | 신규 ingestion candidate | `system` 또는 실행 관리자 | 관리자가 draft로 전환한 뒤 기존 publish command 수행 |
| 관리자 단건 등록 | 기존 catalog command | 실제 관리자 | draft 검수 뒤 publish |

system candidate에 가짜 `submitted_by_user_id`를 넣지 않는다. 자동 발견은 회원 제출
rate limit, 내 제안 목록, 반려 사유 계약에도 섞지 않는다.

### 4.2 candidate 상태

권장 상태는 다음과 같다.

- `discovered`: metadata 수집 완료, 아직 triage하지 않음
- `needs_input`: 곡·원곡 가수·참여자 등 필수값 부족
- `ready`: draft 변환에 필요한 검증 완료
- `converted`: catalog draft와 연결됨
- `ignored`: 관리자가 명시적으로 제외
- `blocked`: private/deleted/정책 불일치 등 현재 처리 불가

`ignored`와 `blocked`는 삭제하지 않는다. 같은 영상이 다른 playlist나 channel
notification으로 다시 발견될 때 기존 판단을 보여주기 위해 보존한다.

### 4.3 origin

하나의 video candidate는 여러 origin을 가질 수 있다.

- `playlist_import`: playlist ID, item ID, position, import job ID
- `channel_websub`: channel ID, notification 발생 시각
- `channel_reconcile`: uploads playlist와 발견 시각
- `admin_manual`: 관리자 preflight

video identity는 `(provider='youtube', external_video_id)`로 dedupe하고 origin은
append-only로 추가한다.

## 5. Playlist 벌크 입력 화면

관리자 catalog의 새 `가져오기` section에서만 실행한다.

### 5.1 1단계 — playlist 확인

입력:

- YouTube playlist URL 또는 playlist ID
- import mode: 기본 `전체 새 항목`, 선택 `최근 N개`
- 선택적 공통값: channel owner, 관계 유형, release 유형, 기본 참여자

preflight 결과:

- playlist 제목, 소유 channel, 항목 수
- public 접근 가능 여부
- 예상 API page·video batch 수
- 이전 import와 마지막 동기화 시각
- 처리 상한을 넘는 경우 전체 건수와 분할 계획

### 5.2 2단계 — 수집 progress

화면은 다음 수치를 별도로 표시한다.

- 발견, metadata 확인, eligible, 기존 catalog, 기존 candidate/proposal
- unapproved channel, unavailable/private/deleted, 중복 playlist item
- API 재시도 대기, 영구 오류

요청을 닫아도 job은 계속되고 재진입 시 권위 D1 상태를 읽는다. progress를 브라우저
메모리나 `waitUntil()` 완료 여부에 의존시키지 않는다.

### 5.3 3단계 — 검수 grid

desktop은 table, mobile은 card를 사용하며 다음 기능을 제공한다.

- classification filter와 job 전체 ready 일괄 저장
- thumbnail, YouTube title, channel, 게시일, duration, playlist position
- 분류 badge와 제외 이유
- 기존 song 검색·연결 또는 새 song 후보 입력
- 원곡 제목·원곡 가수, OTW original 여부
- 참여자·역할, relation/release/participation type
- 행별 sticky form과 영상 아래 가로 영역에 표시되는 실제 저장 draft 기준의 변경 예정 항목
- `channel_review` 후보의 공식 역할·소유 주체 확인, 채널 승인·활성화와 metadata 재분류
- job 전체의 확인된 숨김·삭제·embed 차단·지역 차단·재생 불가 후보 일괄 제외
- YouTube 원문 링크와 metadata refresh
- 누락 필드·중복·policy 오류의 행 단위 표시

YouTube title parsing 결과는 `추천값`으로만 표시한다. title pattern이나 LLM 결과가
곡명·원곡 가수·참여자를 권위값으로 확정하지 않는다.

### 5.4 4단계 — 벌크 변환

- 일괄 제외는 현재 화면이나 classification filter와 무관하게 `status=blocked` 전체 page를
  조회한 뒤 확인된 non-playable availability만 선택한다. `unknown`과 정책 검토 후보는
  자동 제외하지 않는다.
- 제외 명령은 100건 단위로 job 소속과 candidate version을 재검증하고 항목별
  `ignored|stale|failed` 결과를 반환해 부분 성공을 보존한다.
- job 전체의 `ready` candidate를 100건 단위로 catalog `draft`로 변환한다.
- 변환된 `converted`와 제외된 `ignored` candidate는 기본 작업 목록에서 숨기되,
  운영 확인용 명시적 status 조회는 유지한다.
- 항목별 기존 catalog-entry validation과 channel allowlist를 그대로 사용한다.
- 한 영상 실패가 전체 job을 rollback하지 않는다. 각 행은 자체 D1 batch로 원자 처리한다.
- 완료 결과는 `created|duplicate|stale|validation_failed|retryable_failed`로 남긴다.
- 생성된 draft, 실패 행 재시도와 원본 YouTube 링크로 즉시 이동할 수 있어야 한다.
- 벌크 변환은 publish가 아니며 catalog/read-model revision은 공개 영향이 생길 때만
  기존 정책대로 증가한다.

## 6. 항목 분류 규칙

| 조건 | 분류 | 기본 선택 | 조치 |
| --- | --- | --- | --- |
| 같은 video ID가 published/draft source에 존재 | `existing_catalog` | 해제 | 기존 항목 열기 |
| 같은 video ID의 pending 회원 proposal 존재 | `existing_proposal` | 해제 | proposal 검수로 이동 |
| 같은 video ID의 active candidate 존재 | `existing_candidate` | 해제 | candidate에 origin만 추가 |
| channel이 승인·활성 allowlist | `eligible` | 선택 | 필수 metadata 보완 |
| channel이 미등록·pending | `channel_review` | 해제 | channel 검수 후 재평가 |
| channel이 revoked/inactive | `policy_blocked` | 해제 | 자동 우회 금지 |
| `playable`이 아닌 source | `unavailable` | 해제 | 상태별 next check 제공 |
| Shorts/live/broadcast 등 현재 MVP 외 release | `scope_review` | 해제 | 명시적 관리자 분류 필요 |
| 같은 playlist 안 중복 video | `playlist_duplicate` | 해제 | 첫 position만 대표, origin 보존 |

## 7. 권장 내부 계약

### 7.1 관리자 API

| method | route | 역할 |
| --- | --- | --- |
| `POST` | `/api/play/admin/imports/playlist/preflight` | URL 정규화와 playlist summary |
| `POST` | `/api/play/admin/imports/playlist` | import job 생성, idempotency key 요구 |
| `GET` | `/api/play/admin/imports/:jobId` | progress·counts·최근 오류 |
| `GET` | `/api/play/admin/imports/:jobId/items` | cursor 기반 filter·항목 조회 |
| `PATCH` | `/api/play/admin/import-candidates/:id` | expectedVersion 기반 metadata 보완·ignore |
| `POST` | `/api/play/admin/imports/:jobId/convert` | 선택 candidate의 draft 변환 시작 |
| `POST` | `/api/play/admin/imports/:jobId/retry` | retryable 실패만 재처리 |

모든 route는 `requireAdminUser`, `Cache-Control: no-store`, strict body/query, exact route
manifest와 request ID를 사용한다. list는 offset 대신 `(created_at,id)` 또는
`(playlist_position,id)` keyset cursor를 사용한다.

### 7.2 데이터 모델

권장 additive table:

- `music_ingestion_jobs`: source kind/ID, status, counts, cursor, actor, idempotency key,
  시작·완료 시각과 safe error code
- `music_ingestion_candidates`: video ID, authoritative metadata snapshot, 상태,
  연결 song/performance, version, first/last discovered/checked 시각
- `music_ingestion_candidate_origins`: candidate, job/subscription, origin kind,
  playlist item/position와 발견 시각
- `music_ingestion_candidate_inputs`: 관리자 검수 중인 song·artist·participant mapping
  또는 기존 command DTO와 동일한 normalized staging

원격 API body, API key, 관리자 cookie/token은 저장하지 않는다. metadata raw JSON 전체를
보관하기보다 실제 사용하는 정규화 필드와 safe diagnostic code만 저장한다.

### 7.3 비동기 실행

채택안은 D1 job state + Cloudflare Queue다.

1. HTTP command가 job을 만들고 첫 `playlist_page` message를 enqueue한다.
2. consumer가 한 page 최대 50개를 읽고 item upsert와 다음 page/video batch message를
   생성한다.
3. video batch consumer가 기존 `readVideos()` 판정을 재사용해 candidate를 갱신한다.
4. 모든 message는 `(jobId,kind,pageToken|batchKey)` idempotency key를 가진다.
5. Queue의 at-least-once delivery를 전제로 unique constraint와 CAS로 중복 효과를 막는다.
6. 반복 실패는 DLQ와 job partial 상태로 이동하고 관리자가 재시도한다.

Queue message는 최대 50개 video ID와 내부 job key만 가지며 raw metadata를 싣지 않는다.
기본 retry는 3회다. Workers Free에서는 main/DLQ retention 24시간, Paid에서는 main 4일,
DLQ 14일을 사용한다. 장기 quota 대기는 D1 `next_retry_at`에 기록하고 scheduled task가
재enqueue하므로 Queue retention을 권위 복구 수단으로 사용하지 않는다.

### 7.4 후보 검수와 metadata 갱신의 동시성

후보 version은 Queue video batch의 metadata 갱신과 관리자 검수 저장이 함께 증가시킨다.
따라서 version만 비교하면 행을 편집하는 동안 정상 완료된 metadata batch도 검수 충돌로
오판한다. 검수 form은 행을 열 때의 `candidateVersion`, `reviewInput`, `status`를 baseline으로
보존하고 저장 command에 전달한다. Queue와 단건 refresh는 review input과 수동 결정
`ready|ignored|converted`를 보존한다. 저장소는 version이 다르면 key order와 optional null
차이를 제거한 review state의 의미상 동등성을 확인한 후 최신 version으로 다시 CAS한다.
실제 관리자 저장·제외는 409를 유지하고, 기존 catalog·proposal 또는 channel/policy gate는
validation으로 분리한다. origin 관점의 `existing_candidate` 분류와 candidate 자체 분류를
DTO에서 분리해 UI가 편집 가능 여부를 실제 candidate 기준으로 판단한다. UI는 진짜 409에서만
최신 항목을 refetch하며 작성 중인 form 값은 버리지 않는다.

Cloudflare는 Queue가 at-least-once delivery이며 중복 효과를 idempotency key로 방지할
것을 권고한다. [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)

## 8. 회원 제안 수정

### 8.1 정책

- 실제 submitter 본인만 `pending_review`에서 수정할 수 있다.
- YouTube URL, 원곡 제목, 기존 song 연결, 원곡 가수, 참여자·역할과 note를 모두
  수정할 수 있다.
- URL 변경 시 video ID 정규화, catalog/pending duplicate preflight를 다시 수행한다.
- `expectedVersion`이 다르면 `409 PLAY_SUBMISSION_STALE_WRITE`로 최신 제안을 다시
  읽게 한다.
- 관리자 approve/reject와 동시 실행되면 먼저 성공한 CAS만 유효하다.
- 수정은 신규 제출 일일 5회 count를 증가시키지 않지만 별도 edge abuse limit을 둔다.
- 승인·거절·철회 이후에는 수정할 수 없고 새 proposal을 만들어야 한다.

### 8.2 계약

- `PATCH /api/play/submissions/:id`
- request: `expectedVersion` + create request에서 `clientRequestId`를 제외한 전체 editable
  snapshot
- response: 최신 `OtwPlayMemberSubmissionDto`
- DTO additive field: `version`, `editable`, `withdrawable`
- event: `proposal.updated`; audit detail에는 변경된 field 이름만 기록하고 note 원문은
  telemetry에 넣지 않는다.

부분 PATCH보다 전체 editable snapshot을 권장한다. 참여자·원곡 가수 배열의 삭제와
순서를 명확히 하고 server가 create와 동일한 validation을 재사용할 수 있기 때문이다.

### 8.3 UI

- `내 제안`의 pending card/detail에 `수정`과 `철회`를 동등한 보조 action으로 제공한다.
- 수정은 기존 3단계 wizard를 현재값으로 채워 재사용한다.
- 저장하지 않은 변경 경고, duplicate preflight, 제출 전 변경 요약을 제공한다.
- 저장 성공 뒤 detail/list/admin review query를 갱신한다.
- stale write는 입력을 버리지 않고 최신 서버 상태와 충돌 안내를 보여준다.

## 9. 회원 제안 철회

### 9.1 정책과 계약

- `POST /api/play/submissions/:id/withdraw`
- request: `expectedVersion`; 자유 텍스트 사유는 수집하지 않는다.
- 본인의 `pending_review`만 `withdrawn`으로 전이한다.
- 철회는 해당 proposal에서 되돌리지 않는다. 다시 제출하려면 새 proposal을 만든다.
- 철회 후 pending-only video unique가 해제되므로 같은 영상의 새 제안은 가능하지만
  submission rate limit과 idempotency는 그대로 적용한다.
- event: `proposal.withdrawn`, actor kind `member`.
- 공개 catalog revision은 변경하지 않는다.

### 9.2 UI

confirm dialog에 다음을 명시한다.

- 관리자 검수 목록에서 제거됨
- 기존 제안은 이력으로 남음
- 철회 취소는 불가하며 필요하면 새로 제출해야 함

성공 뒤 focus를 원래 action으로 돌리고 `철회됨` 상태와 처리 시각을 표시한다.

## 10. 보안·무결성·운영 요구사항

- playlist URL에서 playlist ID만 추출하고 임의 URL fetch를 금지한다.
- YouTube channel ID와 video ID는 API 응답을 다시 검증하며 payload title을 HTML로
  해석하지 않는다.
- video observation에 `madeForKids`를 포함하고 embed 전에 해당 player privacy·tracking
  처리를 적용한다.
- YouTube title·thumbnail·playlist를 표시하는 import UI에 YouTube 출처를 명확히
  표시한다.
- candidate 생성은 approved channel policy를 우회하지 않는다.
- import/convert/retry는 명시적 admin actor와 event를 남긴다.
- 원문 title·description을 telemetry에 넣지 않는다.
- 한 job의 hard safety cap은 5,000개로 시작하고 초과 playlist는 범위 선택 또는
  이어받기 job을 요구한다. UI는 잘린 성공으로 표시하지 않는다.
- page와 video batch는 각각 50개, D1 write batch는 repository가 정한 작은 단위로
  제한한다.
- YouTube retryable 오류는 기존 candidate 판단을 삭제하지 않고 retry schedule만
  갱신한다.
- 동일 playlist 재실행은 새 origin snapshot을 만들되 기존 candidate/catalog를
  중복 생성하지 않는다.
- active candidate는 90일, ignored/blocked는 180일 뒤 정리한다. 보존 중 API data는
  최대 30일마다 refresh하고 converted candidate는 source-health 책임으로 넘긴다.

## 11. 단계별 전달 권장안

| slice | 범위 | 선행 조건 |
| --- | --- | --- |
| PR-9A | 회원 proposal 수정·철회 contract, CAS, audit, UI | 별도 migration 필요 여부 검증 |
| PR-9B | ingestion job/candidate schema, Queue, playlist preflight·수집 | Queue·DLQ 운영 승인 |
| PR-9C | 관리자 검수 grid, 행별 sticky 보완·공식 채널 승인, 영상 아래 가로 변경 예정 항목, 재생 불가 일괄 제외, job 전체 ready draft 변환·재시도 | PR-9B |
| PR-9D | approved 노래 clip channel의 `singing_clip` candidate inbox | PR-9B candidate pipeline, clip channel 승인 |

PR-9A와 PR-9B는 같은 우선순위 프로그램이지만 migration·failure boundary가 다르므로
별도 PR을 권장한다. PR-9C는 실제 관리자가 playlist를 끝까지 처리하는 대표 흐름을
완성해야 완료다.

## 12. 수용 기준

- 0, 1, 50, 51, 5,000개 playlist를 끝까지 수집하고 5,001개는 명시적으로 분할한다.
- playlist pagination 누락·중복 없이 원래 position을 보존한다.
- 50개 단위 videos metadata 확인과 quota/retry 분류가 동작한다.
- catalog/proposal/candidate/channel/source 상태 분류가 정확하다.
- 브라우저를 닫아도 job이 완료되거나 partial/retry 상태로 readback된다.
- Queue duplicate delivery가 candidate나 catalog를 중복 생성하지 않는다.
- 일부 행 실패 뒤 성공 행은 유지되고 실패 행만 재시도할 수 있다.
- 벌크 작업만으로 published 콘텐츠나 public revision이 바뀌지 않는다.
- 제안 수정·철회는 owner + pending + expectedVersion 조건에서만 성공한다.
- 관리자 승인과 회원 수정/철회 경쟁에서 한 command만 성공한다.
- 철회 proposal은 회원 이력에 남고 public/admin pending 목록에서는 분리된다.
- API data refresh가 30일 정책을 만족하며 영상 파일을 저장하지 않는다.

## 13. 채택 결과와 남은 운영 gate

| ID | 상태 | 확정값 |
| --- | --- | --- |
| GATE-INGEST-01 | 해결 | 한 job 5,000개, 50개 batch, D1 job + Queue/DLQ, retry 3회 |
| GATE-INGEST-02 | 해결 | public·unlisted만 지원하고 private·OAuth 제외 |
| GATE-INGEST-03 | 해결 | active 90일, ignored/blocked 180일, API data 30일 refresh/delete |
| GATE-INGEST-04 | 해결 | channel/API 사실만 자동 적용, 음악적 의미는 추천값 + 관리자 명시 적용 |
| GATE-COMPLIANCE-01 | 운영 전 확인 | Made for Kids, YouTube branding과 실제 수집 channel 범위를 production에서 readback |

DEC-054의 본인 `pending_review`만 version CAS 수정·불가역 철회 정책도 확정된
불변식이다. 자동 publish 금지, 실제 actor 보존, approved channel 검증과 CAS는
구현 과정에서 완화하지 않는다.
