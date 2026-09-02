# X 멤버 신규 피드·영구 아카이브 설계

## 문서 상태

- 상태: canonical
- 갱신일: 2026-09-02
- 제품 정의: 소스 활성화 이후 신규 게시물을 수집해 최근 피드와 관리자 전용 영구 기록을 제공
- 제외: 활성화 이전 게시물 소급 수집, 공개 archive, 참여 지표 재조회, 공급자 일괄 삭제 동기화

## 1. 수집 계약

- `x_collection_enabled=true`인 동안 2시간마다 수집 가능 여부를 확인한다.
- 신규 소스는 `collection_started_at` 이후 게시물만 수집한다. 비활성화 후 다시 켤
  때도 재활성화 시각을 새 기준점으로 삼아 중지 기간을 소급하지 않는다.
- 첫 요청은 `start_time`, 이후 요청은 `since_id`를 사용한다. 페이지당 25개이며
  다음 페이지가 있으면 pagination token과 기준 watermark를 저장한다.
- 공급자 오류, 부분 페이지, D1 저장 실패에서는 정상 cursor를 전진시키지 않는다.
  continuation 전체가 확인된 뒤에만 이번 실행의 최신 ID로 watermark를 바꾼다.
- 공개 요청은 D1만 읽는다. 사용자 요청으로 유료 X API를 호출하지 않는다.
- 인용·답글 원문 preview lookup은 유지하지만 timeline 수집보다 낮은 우선순위로
  예약한다. 실패나 예산 부족이면 참조 ID와 X 링크를 저장하고 게시물 저장 및 cursor
  전진은 계속한다.

UTC 일일 비용 상한은 `$1`, 30일 절대 상한은 `$30`이다. 최근 관측량이 반복되면
일 약 `$0.735`, 30일 약 `$22.05`로 추정한다. 실제 비용은 신규 게시물 수와
인용·답글 preview 수에 따라 달라진다.

## 2. 데이터 권위와 보존

### `x_posts`

수집 당시 원문 DTO와 미디어 URL, 참여 수치를 영구 보존하는 권위 저장소다. 일반
TTL과 건수 기준 prune 대상이 아니다. 이미 저장한 행은 upsert해도
`hidden_at` 또는 `content_removed_at`이 있으면 원문을 복원하지 않는다.

### `x_post_sources`

소스별 활성화 시각, 정상 watermark, 진행 중 pagination, 마지막 시도·성공,
다음 실행과 오류 상태를 보존한다. 장애는 비활성화로 간주하지 않는다.

### `x_post_facts`

관리자 archive 색인과 tombstone 저장소다. 원문은 복제하지 않고 다음 값만 둔다.

- 게시물 ID, 멤버 UID와 이름 snapshot
- post/reply/quote 유형
- 게시 시각과 최초 확인 시각
- 미디어·링크 개수
- 숨김 시각·사유와 갱신 시각

`x_history_analytics_enabled=false`이면 facts 신규 기록과 관리자 archive 조회를
중지하지만 `x_posts` 수집·보존은 계속한다. 다시 켜면 외부 API 호출 없이 아직
facts가 없는 `x_posts`를 실행당 100건씩 멱등 보충한다.

## 3. 공개 피드와 관리자 archive

- 공개 `/feed`, `/api/member-posts`, `/api/x/posts`는 기존 DTO와 최근 피드 상한을
  유지한다. 공개 archive cursor는 제공하지 않는다.
- `GET /api/x/history/posts`는 관리자 전용이며 기본 50, 최대 100건을
  `(created_at, post_id)` cursor로 반환한다.
- `memberUid`, `from`, `to`, `status=visible|redacted` 필터를 지원한다.
- visible 행은 `post: XPostDto`, redacted 행은 `post: null`과 tombstone을 반환한다.
- 관리자 API는 Clerk 관리자 인증과 `Cache-Control: no-store`를 적용한다.

`/admin/member-posts`에서 위 필터와 페이지 이동, 원문·미디어·인용/답글·수집 시각,
상태를 확인할 수 있다.

## 4. 관리자 단건 원문 제거

`DELETE /api/x/posts/{postId}`는 다음 작업을 하나의 멱등 경로로 수행한다.

1. 존재하지 않는 ID만 404로 거부한다.
2. `x_posts.value='{}'`, `hidden_at`, `hidden_reason='admin'`,
   `content_removed_at`을 기록한다.
3. `x_post_facts`에도 같은 숨김 tombstone을 기록한다.
4. 공개 피드에서 제외하고 감사 로그를 남긴다.
5. 같은 ID를 다시 요청하면 원문을 변경하지 않고 성공한다.

hard delete와 복원 API는 제공하지 않는다. 관리자 화면은 실행 전에 복원 불가를
명시해 확인받는다. 실제 운영 canary는 제거해도 되는 게시물 ID를 운영자가 지정한
경우에만 수행한다.

## 5. 2026-09-02 구현 Closeout

| 영역 | 판정 | 근거 |
| --- | --- | --- |
| 신규 수집 | 완료 | 8개 source, watermark 8/8, continuation 0, 2시간 incremental 경로 유지 |
| 영구 저장 | 완료 | `x_posts`가 일반 TTL에서 제외되고 숨김 행 복원 방지 적용 |
| 관리자 archive | 완료 | 필터·50/100 cursor·원문/상태 표시·no-store 관리자 API와 UI 적용 |
| 단건 원문 제거 | 완료 | 원문·미디어 제거, 공개 숨김, facts tombstone, 감사 로그, 멱등 재호출 구현 |
| 분석 킬스위치 | 완료 | 원본 수집과 분리하고 재활성화 시 D1-only 100건 보충 구현 |
| 공급자 삭제 동기화 배치 | 제거 완료 | 공급자 upload route의 반복 HTTP 404로 런타임·설정·scheduler·원장·테이블에서 제거 |

런타임 선배포 버전은 `fcf12304-a291-4280-92f0-3e15892ff5b9`, migration 이후 최종
Worker는 `26d325ac-6ab2-41a2-8d36-24e3d1cc53c1`이다. `2026-09-02T04:15Z` 운영
readback에서 migration `0078`이 누락 facts 71건을 D1 원문에서 보충해 게시물 198,
facts 198이 일치했다. source 8, watermark 8, continuation 0과 공용 X 비용 원장은
유지됐고 제거 대상 schema·setting·run/item/outbox·usage event·전용 원장은 모두
0이다. D1 크기는 16,199,680 bytes이며 FK 위반과 pending migration도 0이다.

같은 배포의 `/admin/member-posts`에서 첫 50건과 다음 cursor 페이지의 원문·미디어·
인용·답글 preview·유형·시각을 실제 관리자 세션으로 확인했다. 공개 X API 호출 전후 usage event는
1,620건·max ID 7,180·14,875,000 micros로 같아 공급자 호출 0회도 확인했다.

## 6. 완료 조건

- 운영 D1의 게시물·source·watermark 수가 migration 전보다 감소하지 않는다.
- facts 수가 게시물 수와 일치하고 invalid JSON·작성 시각·멤버 매핑 오류가 0이다.
- 제거된 job type의 수동 실행은 `400 jobType is invalid`다.
- cron 33분에는 `source_health`만 생성되며 제거된 공급자 작업과 비용 이벤트는
  증가하지 않는다.
- 공개 API 호출 전후 X 공급자 사용 이벤트가 증가하지 않는다.
- 승인된 테스트 게시물로 단건 제거의 공개 제외·원문 제거·tombstone·재수집 방지를
  확인한다.
