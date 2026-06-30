# 회원 전용 뮤직 플레이어 구현 검토

작성일: 2026-06-29

## 결론

뮤직 플레이어는 회원 전용 기능으로 구현 가능하지만, "Spotify처럼 보이는
YouTube 기반 음악 라이브러리"로 접근해야 한다. 오디오 추출, 백그라운드 전용
재생, 숨겨진 YouTube 플레이어는 범위에서 제외한다.

권장 MVP는 `/music` 회원 전용 라우트, D1 기반 승인된 음악 카탈로그, 관리자
수동 등록/검수, 보이는 YouTube IFrame Player, 클라이언트 큐/셔플/반복 기능이다.
자동 수집은 공개 즉시 반영하지 않고 후보 생성만 수행한다.

## 현재 프로젝트 재사용 포인트

- `/multiview`의 Clerk 로그인 게이트를 `/music`에도 재사용한다.
- `members.youtube_channel_id`, `members.url_youtube`, `member_links`를 출처 데이터로
  재사용한다.
- `worker/services/youtube.ts`의 `channels.list -> playlistItems.list -> videos.list`
  수집 흐름과 캐시 전략을 후보 스캐너에 재사용한다.
- `src/features/youtube/*`, `src/features/vods/*`의 카드, 멤버 필터, 스켈레톤
  패턴을 뮤직 라이브러리 UI에 맞게 재해석한다.
- `worker/auth.ts`의 `authenticateRequest`, `requireAdminUser`를 각각 회원 API와
  관리자 API에 적용한다.

## 정책 및 기술 제약

- YouTube IFrame Player API는 JavaScript로 재생/일시정지/큐/이벤트 제어를 지원한다.
- 임베드 플레이어는 최소 200x200 viewport가 필요하고, 16:9 플레이어는 480x270
  이상이 권장된다.
- `enablejsapi=1` 사용 시 `origin` 파라미터를 포함해야 한다.
- YouTube 정책상 YouTube 플레이어 기능/광고/브랜딩을 수정하거나 가리면 안 된다.
- 오디오와 비디오를 분리하거나, 오디오만 별도로 홍보하거나, 사용자가 보고 있지
  않은 숨겨진 background player에서 재생하는 기능은 금지된다.
- 회원 전용 게이트 자체는 가능하다. YouTube 정책도 일반 앱 기능에 필요한 로그인
  같은 동작은 허용하지만, YouTube 시청을 조건으로 별도 보상/강제 액션을 두면 안
  된다.

## MVP 범위

### 사용자 기능

- `/music` 라우트는 로그인 사용자만 접근 가능하다.
- 승인된 트랙 목록을 검색, 멤버, 타입, 태그, 길이 기준으로 필터링한다.
- 트랙 클릭 시 보이는 YouTube 플레이어가 있는 우측 또는 하단 플레이어 패널을 연다.
- 큐, 다음/이전, 셔플, repeat-one, repeat-all을 지원한다.
- `start_seconds`, `end_seconds`로 긴 영상 안의 노래 구간 재생을 지원한다.
- 현재 큐와 플레이어 환경설정은 우선 `localStorage`에만 저장한다.

### 관리자 기능

- YouTube URL/ID로 트랙을 수동 등록한다.
- 제목, 아티스트명, 멤버, 타입, 태그, 시작/종료 시간, 공개 상태를 수정한다.
- 후보 트랙을 승인/거절/숨김/업데이트 필요 상태로 관리한다.
- 자동 스캐너는 후보만 생성하고 public/member-visible 상태로 바로 공개하지 않는다.

### 제외 범위

- YouTube 오디오 다운로드, 추출, 변환, 프록시, 재호스팅.
- 화면에서 사라진 hidden iframe으로 음악만 재생하는 기능.
- YouTube 플레이어 UI/브랜딩/광고 제거.
- 완전 자동 노래 인식, 가사 싱크, 저작권 곡 메타데이터 추론.
- 사용자별 서버 저장 플레이리스트와 좋아요. 필요하면 MVP 이후에 추가한다.

## 권장 데이터 모델

정확한 migration은 구현 시 Drizzle workflow로 생성한다.

### `music_tracks`

| 필드 | 설명 |
| --- | --- |
| `id` | 내부 PK |
| `title` | 표시 제목 |
| `artist_name` | 표시 아티스트. 기본값은 멤버/유닛명 |
| `primary_member_uid` | 대표 멤버. 그룹/유닛이면 nullable |
| `source_type` | `cover`, `original`, `singing_clip`, `karaoke_stream`, `short`, `fan_clip` |
| `youtube_video_id` | YouTube video ID. active track 기준 unique |
| `youtube_channel_id` | 출처 채널 |
| `thumbnail_url` | YouTube 메타데이터 기반 썸네일 |
| `duration_seconds` | 영상 길이 |
| `published_at` | YouTube 게시 시각 |
| `start_seconds` | 선택 재생 시작점 |
| `end_seconds` | 선택 재생 종료점 |
| `visibility` | `members`, `hidden` |
| `review_status` | `candidate`, `approved`, `rejected`, `needs_update` |
| `tags_json` | mood, language, event 등 작은 태그 배열 |
| `source_note` | 관리자 메모 |
| `created_at` | 생성 시각 |
| `updated_at` | 수정 시각 |

### `music_track_members`

그룹곡, 듀엣, 유닛곡을 위해 초기에 같이 두는 편이 좋다.

| 필드 | 설명 |
| --- | --- |
| `id` | 내부 PK |
| `track_id` | `music_tracks.id` |
| `member_uid` | 멤버 UID |
| `role` | `vocal`, `guest`, `unit` 등 |
| `sort_order` | 표시 순서 |

### `music_playlists`, `music_playlist_items`

MVP에서는 시스템 필터 기반 목록으로 시작해도 된다. 다만 "추천 플레이리스트"를
초기 화면에 넣고 싶다면 같이 추가한다.

## API 설계

회원 API:

| Method | Route | 인증 | 목적 |
| --- | --- | --- | --- |
| `GET` | `/api/music/tracks` | `authenticateRequest` | 승인된 회원용 트랙 목록 |
| `GET` | `/api/music/tracks/:id` | `authenticateRequest` | 트랙 상세 |
| `GET` | `/api/music/playlists` | `authenticateRequest` | 회원용 시스템/큐레이션 목록 |
| `GET` | `/api/music/playlists/:slug` | `authenticateRequest` | 플레이리스트 상세 |

관리자 API:

| Method | Route | 인증 | 목적 |
| --- | --- | --- | --- |
| `GET` | `/api/music/admin/tracks` | `requireAdminUser` | 후보/숨김 포함 목록 |
| `POST` | `/api/music/admin/tracks` | `requireAdminUser` | 수동 등록 |
| `PUT` | `/api/music/admin/tracks/:id` | `requireAdminUser` | 메타데이터 수정 |
| `POST` | `/api/music/admin/candidates/scan` | `requireAdminUser` | 후보 생성 스캔 |
| `POST` | `/api/music/admin/candidates/:id/approve` | `requireAdminUser` | 후보 승인 |
| `POST` | `/api/music/admin/candidates/:id/reject` | `requireAdminUser` | 후보 거절 |

회원 전용 API는 `Authorization` header를 쓰므로 public CDN cache에 올리지 않는다.
대신 Worker 내부 메모리 캐시나 D1 기반 결과 캐시를 사용한다.

## 후보 스캐너 전략

처음부터 자동 공개하지 않는다. 스캐너는 `candidate`만 만든다.

추천 신호:

- 멤버 공식 YouTube 채널, VOD/서브 채널, 승인된 키리누키 채널.
- 제목에 `cover`, `covered by`, `song`, `singing`, `karaoke`, `노래`, `커버`,
  `불러보았다`, `歌ってみた` 같은 신호가 있음.
- 일반 영상은 90초-8분 범위를 우선 후보로 둔다.
- Shorts는 제목/채널 신호가 강한 경우만 후보로 둔다.
- 긴 노래방/라이브 영상은 자동 트랙이 아니라 수동 타임스탬프 후보로 둔다.

쿼터 관점:

- 현재 구현처럼 known channel의 uploads playlist를 조회하는 방식이 적합하다.
- `search.list`는 별도 제한이 있으므로 MVP 스캐너에서는 사용하지 않는 편이 안정적이다.
- `channels.list`, `playlistItems.list`, `videos.list`는 각각 1 quota point지만,
  모든 요청은 실패해도 최소 1 point가 든다.

## 플레이어 UI 설계

데스크톱:

- 좌측: 필터/플레이리스트.
- 중앙: 트랙 테이블 또는 밀도 높은 카드 목록.
- 우측: now playing + 보이는 YouTube iframe + 큐.

모바일:

- 첫 화면은 트랙 탐색 우선.
- 재생 시작 후 하단 sheet로 YouTube player를 표시한다.
- 하단 mini bar만 남기고 실제 player를 숨기는 방식은 피한다. player를 접으면
  재생도 pause하는 쪽이 안전하다.

제품 톤:

- "음악을 재생한다"보다 "YouTube 기반 음악 모아듣기"로 안내한다.
- YouTube 출처와 외부 열기 링크를 명확히 표시한다.
- unembeddable, private, deleted 상태는 부드럽게 skip/비활성 처리한다.

## 구현 순서

1. `/music` 로그인 게이트와 빈 화면 추가.
2. Drizzle schema/migration: `music_tracks`, `music_track_members`.
3. Worker route: 회원용 track list, 관리자 CRUD.
4. 관리자 수동 등록/수정 UI.
5. 사용자 목록/필터 UI.
6. YouTube IFrame Player wrapper와 queue controller.
7. onStateChange ended/error 처리와 unavailable fallback.
8. 후보 스캐너 추가.
9. 큐레이션 playlist 추가.

## 테스트 계획

- URL parser: YouTube watch, youtu.be, shorts URL에서 video ID 추출.
- API auth: 회원 API는 비로그인 401, 관리자 API는 admin allowlist 필요.
- catalog validation: invalid video ID, end <= start, hidden/rejected 필터링.
- candidate scanner: 중복 video ID dedupe, title/duration rule, candidate-only 생성.
- player controller: ended event에서 next, repeat-one/all, shuffle order.
- UI: 로그인 게이트, 빈 카탈로그, 필터, queue add/remove, unavailable track.

## 난이도 및 일정

| 범위 | 난이도 | 예상 |
| --- | --- | --- |
| 회원 전용 수동 카탈로그 + YouTube player queue | 중간 | 6-9일 |
| 관리자 후보 스캐너 | 중간 | +3-5일 |
| 큐레이션 플레이리스트 | 중간 | +2-4일 |
| 긴 영상 타임스탬프 운영 | 중상 | +5-10일 |
| 자동 노래 인식/가사/싱크 | 높음 | MVP 제외 |

## 권장 의사결정

1차는 "회원 전용 Music Library"로 작게 출시한다. 핵심은 많은 자동화가 아니라
관리자가 믿을 수 있는 목록을 만들고, 사용자는 그 목록을 편하게 이어 들을 수 있게
하는 것이다.

구현 착수 전 확정해야 할 것:

- `/music` 라우트명과 네비게이션 노출 위치.
- 팬 클립을 포함할지, 공식/승인 채널만 포함할지.
- MVP에 플레이리스트 테이블을 포함할지.
- player가 접힐 때 재생을 유지할지 pause할지. 정책 안정성 기준으로는 pause가 낫다.

## 참고

- 기존 분석: `docs/archive/music-player-multiview-analysis.md`
- YouTube IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- YouTube Player Parameters: https://developers.google.com/youtube/player_parameters
- YouTube Data API Quota: https://developers.google.com/youtube/v3/determine_quota_cost
- YouTube API Services Developer Policies: https://developers.google.com/youtube/terms/developer-policies
