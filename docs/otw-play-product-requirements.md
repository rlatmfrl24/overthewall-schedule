# OTW Play 제품 요구사항

상태: Living Baseline

단계: PR-8 구현·병합·배포 완료, 운영 공개 `0/0` 유지

최종 갱신일: 2026-08-21

문서 역할: 차후 개발을 위한 현재 요구사항 기준선

## 1. 문서 목적

이 문서는 OTW Play의 현재 제품 방향, 확정된 결정, 기능 요구사항,
데이터 개념, 운영 정책과 후속 확장 범위를 정리한다.

아이디어 검토 과정에서 요구사항은 변경될 수 있다. 따라서 이 문서는 완결된
고정 명세가 아니라 변경 이력을 갖는 살아 있는 기준서로 관리한다. 구현 착수
전에는 본문의 미결정 항목과 MVP 범위를 다시 검토해야 한다.

이 문서 자체는 구현, 데이터베이스 변경, API 추가 또는 배포를 승인하지 않는다.

### 1.1 문서 체계

- 현재 제품 범위와 결정: `otw-play-product-requirements.md` (이 문서)
- Clean Architecture, Cloudflare와 DB 설계: `otw-play-system-design.md`
- 공개·회원·관리자 UI/UX 설계: `otw-play-ui-ux-design.md`
- 구현 순서, 검증과 출시 계획: `otw-play-implementation-guide.md`
- playlist 벌크 수집·제안 수정/철회 조사:
  `otw-play-catalog-bulk-ingestion-and-proposal-lifecycle-research.md`
- YouTube 노래 클립 channel 신규 영상 자동 후보 조사:
  `otw-play-channel-subscription-automation-research.md`
- 상세 크레딧·멤버별 노래책 조사:
  `otw-play-detailed-credits-and-member-songbook-research.md`

제품 아이디어가 바뀌면 이 문서의 결정, 범위와 수용 기준을 먼저 갱신한 뒤
하위 설계와 구현 계획에 영향을 반영한다.

## 2. 제품 정의

OTW Play는 오버더월 멤버들의 오리지널곡과 공식 커버곡을 곡 단위로 모아
검색하고 이어 들을 수 있는 YouTube 기반 음악 아카이브이자 큐레이션
플레이어다.

첫 구현은 공식 오리지널곡과 공식 커버곡에 집중한다. 방송 가창 기록은
제품의 장기 범위에는 포함하지만 MVP 이후 별도 확장으로 다룬다.

단순한 최신 영상 피드가 아니라 다음 질문에 답할 수 있어야 한다.

- 특정 멤버가 어떤 노래를 불렀는가?
- 한 곡을 누가, 언제, 몇 번 불렀는가?
- 같은 곡에 연결된 여러 공식 가창 버전은 무엇인가?
- 어떤 단체곡과 외부 스트리머 협업곡이 있는가?
- 원하는 조건으로 찾은 가창 기록을 어떻게 연속해서 들을 수 있는가?

후속 확장에서는 같은 곡의 여러 방송 가창과 키리누키도 함께 탐색할 수
있도록 한다.

## 3. 현재 확정된 제품 결정

| ID | 결정 | 상태 | 비고 |
| --- | --- | --- | --- |
| DEC-001 | 제품명은 OTW Play로 한다. | 확정 | 내비게이션 라벨과 라우트는 별도 결정한다. |
| DEC-002 | 방송 가창의 기본 재생 소스는 승인된 키리누키 영상으로 한다. | 확정 | 후속 방송 가창 확장에 적용하며 원본 방송은 출처와 대체 소스로 보존한다. |
| DEC-003 | 오리지널곡과 공식 커버곡은 OTW 공식 채널 또는 각 멤버의 공식·노래 채널 영상을 우선한다. | 확정 | 키리누키 우선 정책은 방송 가창에 적용한다. |
| DEC-004 | 현재 OTW 소속이 아닌 전 소속 멤버는 외부 인원으로 간주한다. | 확정 | 화면에서 오시마크를 표시하지 않는다. |
| DEC-005 | 저장형 플레이리스트는 MVP에서 제외하고 후속 확장 범주로 둔다. | 확정 | 현재 재생 대기열은 MVP에 포함한다. |
| DEC-006 | 요구사항은 아이디어 변경에 따라 갱신할 수 있다. | 확정 | 변경 시 결정표, 범위, 수용 기준과 변경 이력을 함께 갱신한다. |
| DEC-007 | 첫 구현은 공식 오리지널곡과 공식 커버곡 중심으로 제한한다. | 확정 | 방송 가창과 키리누키 재생은 후속 확장으로 이동한다. |
| DEC-008 | 공식 커버곡은 관리자가 직접 등록하거나 로그인 회원이 등록 제안할 수 있다. | 확정 | 회원 제안은 관리자 승인 전까지 공개하지 않는다. |
| DEC-009 | OTW 오리지널곡 여부는 곡의 권위 속성으로 보존한다. | 확정 | `music_songs.is_otw_original`은 기본값 없는 필수 입력이며 가창 관계나 채널에서 추론하지 않는다. |
| DEC-010 | 채널과 entity의 연결은 연결 row 자체가 소유·소속 관계를 뜻한다. | 확정 | 별도 관계 종류를 두지 않고 같은 쌍을 중복 저장하지 않는다. |
| DEC-011 | 재생 소스 관계는 방향이 있는 관계로 저장한다. | 확정 | 역방향 관계를 암묵적으로 생성하거나 같은 관계로 간주하지 않는다. |
| DEC-012 | 가창의 dedupe identity는 생성 후 불변이며 동일 source segment는 한 가창에만 연결한다. | 확정 | 참여자·표시 metadata 수정으로 identity를 다시 만들지 않는다. |
| DEC-013 | alias 종류는 선택적 운영 metadata다. | 확정 | `alias_kind`는 nullable 자유 텍스트이며 enum이나 필수 입력으로 제한하지 않는다. |
| DEC-014 | 공개 조회용 performance partial index는 PR-3에서 추가한다. | 확정 | PR-2는 catalog 무결성 제약과 기반 관계에 집중한다. |
| DEC-015 | 회원 제안 row에는 channel identity를 저장하지 않으며 제출 시점에는 검수 결과를 저장하지 않는다. | 확정 | 회원 제출은 YouTube ID 형식과 중복만 확인하고 채널은 후속 관리자 승인 과정에서 검증한다. |
| DEC-016 | catalog event의 aggregate·event 이름과 비공개 review result는 확정되지 않은 운영 vocabulary다. | 확정 | non-empty 자유 텍스트로 보존하며 PR-3에서 임의 enum을 만들지 않는다. |
| DEC-017 | 곡 검색 projection의 term 종류는 `title`, `title_alias`, `original_artist`, `participant`로 한다. | 확정 | normalized term은 표시값과 분리하고 canonical song에 귀속한다. |
| DEC-018 | catalog meta는 공개 읽기와 내비게이션을 모두 끈 singleton으로 시작한다. | 확정 | revision 증가는 후속 catalog command의 같은 D1 batch가, event append-only는 insert-only repository가 소유한다. PR-3 DB trigger는 만들지 않는다. |
| DEC-019 | 공개 catalog API는 익명 GET으로 제공하되 `public_read_enabled`가 꺼져 있으면 config를 제외한 조회를 공개하지 않는다. | 확정 | config는 항상 flag와 revision을 `200`으로 반환하고, 나머지 공개 조회는 `404 PLAY_PUBLIC_READ_DISABLED`로 fail closed한다. |
| DEC-020 | 공개 catalog query는 입력 상한과 vocabulary를 strict contract로 검증한다. | 확정 | member UID, limit, 중복 parameter, 알 수 없는 enum과 malformed cursor를 clamp하거나 무시하지 않고 `400`으로 거부한다. |
| DEC-021 | 검색어가 있으면 검색 relevance를 첫 정렬 기준으로 사용하고 사용자가 고른 정렬은 동점 해소에 사용한다. | 확정 | 응답은 exact total이나 facet count를 계산하지 않고 현재 page와 `nextCursor`만 제공한다. |
| DEC-022 | 공개 cache는 revision과 canonical query로 격리하고 인증·cookie 요청은 저장하지 않는다. | 확정 | 구조화된 첫 catalog page, config/facets와 detail만 Cache API에 저장하며 자유 검색과 cursor page는 저장하지 않는다. |
| DEC-023 | 공개 검색·참여자 정렬의 성능 projection은 canonical catalog와 같은 D1에 두되 권위 데이터로 사용하지 않는다. | 확정 | 공개 read가 활성일 때 파생 read model revision이 catalog revision과 다르면 config 이외 공개 조회를 cache 전에 `503`으로 중단한다. flag-off `404`가 우선이며 config는 항상 현재 flag와 catalog revision을 제공한다. |
| DEC-024 | 관리자 카탈로그는 DB aggregate별 선행 등록 화면이 아니라 YouTube 영상 등록 작업을 중심으로 구성한다. | 확정 | `song`, `performance`, `entity`, `channel` 분리는 내부에 유지하되 현재 멤버와 권위 채널은 자동 추천·연결하고 외부 인물·그룹과 미등록 채널은 같은 흐름에서 명시적으로 확인한다. |
| DEC-025 | 새 영상 등록은 metadata 확인 직후 `오리지널곡`, `공식 커버곡`, `노래방송`으로 유형을 먼저 확정한다. | 확정 | 오리지널·커버는 수동 곡 연결 화면을 건너뛴다. 오리지널은 검증한 영상 제목과 선택한 참여자로 song을 만들고, 커버는 관리자가 원곡 제목과 원곡 가수명을 구분해 입력해 song을 만든다. 다곡·구간 연결이 필요한 노래방송은 후속 범위로 표시하고 현재 command로 저장하지 않는다. |
| DEC-026 | 관리자 hard delete는 테스트·오입력 catalog를 정리하는 용도로 `draft`와 `withdrawn`에 허용한다. | 확정 | draft·withdrawn 가창은 개별 삭제할 수 있고, 곡은 연결된 가창에 `published`가 없을 때 함께 삭제할 수 있다. 현재 게시 중인 가창, 승인 proposal 참조와 merge 대상은 삭제하지 않으며 삭제 event와 revision은 남긴다. |
| DEC-027 | 곡 정보 수정의 일상 입력은 곡명·원곡 가수·OTW 오리지널 여부에 집중한다. | 확정 | 원곡 공개일은 수정 form에서 노출하지 않고 기존 값을 보존한다. 원곡 가수는 등록과 동일한 자동완성·재사용 identity·새 외부 칩으로 편집하며 identity 생성과 song/revision 갱신을 한 D1 batch로 처리한다. |
| DEC-028 | 가창 정보 수정은 일부 분류만 고치는 축약 form이 아니라 가창의 모든 운영 metadata를 한 흐름에서 교정한다. | 확정 | 연결 곡, 현재 멤버·외부 참여자와 역할·표시 credit, 관계·공개 형태·참여 형태·품질, 가창 공개일시, YouTube source·채널·구간·source 역할과 내부 메모를 수정한다. 공개 상태 전이는 별도 게시·철회 command로 유지하고, 새 identity와 projection·event·revision은 같은 D1 batch에 포함한다. |
| DEC-029 | 공개 OTW Play는 `/play` 안에서 Discover, 곡 목록, 곡 상세와 단일 YouTube player를 하나의 연속 경험으로 제공한다. | 확정 | 내비게이션 라벨은 `OTW Play`이며 두 공개 flag가 모두 켜졌을 때만 표시한다. player는 `/play/*` 안에서만 유지하고 카탈로그 복귀 동작은 DEC-041의 폭별 visible player 정책을 따르며 Play 이탈 시 stop·destroy한다. 대기열은 versioned `sessionStorage` 세션 상태이며 외부 참여자는 공개 프로필 없이 정확한 catalog filter만 제공한다. |
| DEC-030 | 현재 `/play/*` UI는 운영 공개 전 관리자 preview로 제한한다. | 확정 | 비로그인·비관리자는 config와 catalog 요청을 시작하지 않고 로그인 또는 권한 안내만 본다. 관리자는 Worker가 다시 인증한 전용 `no-store` preview 요청으로 공개 flag가 꺼진 상태에서도 실제 UI를 검증한다. 이 우회는 read-model revision 일치 조건을 유지하고 익명 public GET의 flag-off 계약을 바꾸지 않는다. 관리자 내비게이션은 preview config 확인 후 표시한다. |
| DEC-031 | 공개 Play의 첫 화면과 탐색 화면을 분리하고 재생 조작은 셸에 지속한다. | 대체됨 | Home과 Discover의 기능 중복을 제거하는 DEC-033으로 정보 구조를 단순화한다. player 지속 범위는 유지한다. |
| DEC-032 | Play 상단 chrome은 기존 좌측 메뉴의 기준선에 맞추고 대표 배너는 명시적 사용자 조작으로 전환한다. | 확정 | 상단 Play header는 64px 기준선에 맞춘다. 대표 배너는 화살표·indicator·키보드·마우스 drag·가로 wheel로 수동 전환하며 자동 순환하지 않는다. player chrome은 DEC-034·037을 따른다. |
| DEC-033 | 공개 Play의 중복 탐색 진입점을 `발견`과 `곡 검색` 두 개로 통합한다. | 확정 | 발견은 기존 Home·Discover의 대표곡, 멤버와 최근 곡 탐색 역할을 함께 소유한다. `/play/discover`는 `/play`로 호환 redirect한다. `전체 곡`, `오리지널`, `커버` 상단 탭은 `곡 검색` 하나로 합치고 관계 구분은 `/play/songs`의 URL 동기화 필터로 제공한다. |
| DEC-034 | Play는 한 viewport 안의 음악 앱 프레임을 사용하며 player와 queue를 하나의 우측 작업면에서 구분한다. | 확정 | 상단 검색·발견·곡 검색, 중앙 독립 스크롤과 우측 380px `PlayerQueuePanel`을 사용한다. 단일 YouTube iframe은 panel 상단에서 356×200px로 보이고 플레이큐는 그 아래 남은 높이를 독립 스크롤한다. 하단 재생바, player 접기·펼치기와 overlay 상세 panel은 만들지 않으며 player 영역에 재생·반복·셔플·볼륨과 상세 진입을 제공한다. |
| DEC-035 | 발견은 반복 card surface보다 기준 이미지의 평면적인 music app 정보 밀도를 따른다. | 확정 | 대표곡은 겹친 카드가 아닌 하나의 넓은 배너로 표시하고, 최근 공개곡은 구분선 기반 table, 멤버 진입점은 compact grid로 배치한다. 데스크톱에서는 hero와 하단 탐색을 한 viewport 안에 우선 수용하고 table 자체의 불필요한 가로·세로 scroll을 만들지 않는다. |
| DEC-036 | 세션 플레이큐는 같은 performance를 한 번만 보유한다. | 확정 | 이미 있는 항목의 `재생`은 그 항목을 선택하고, `다음에 재생`은 현재 항목 뒤로 이동시키며, `마지막에 추가`는 중복을 만들지 않고 이미 추가됨을 표시한다. 의도적인 반복은 queue duplicate가 아니라 repeat-one/all로 표현한다. |
| DEC-037 | 1280px 미만 Play 재생 경험은 별도 전체 화면 `Now Playing`으로 제공한다. | 부분 대체됨 | 첫 재생 의도에서 단일 16:9 iframe, 곡·참여자 정보, previous/play/next, 반복·셔플·볼륨과 세션 플레이큐를 한 화면에 표시한다. 카탈로그 복귀 후 표현과 pause 경계는 DEC-041이 대체한다. 하단 재생바, 두 번째 iframe과 보이지 않는 재생은 허용하지 않는다. |
| DEC-038 | 우측 player 정보 계층은 재생 조작, source attribution, 재생 진행 순으로 고정한다. | 부분 대체됨 | `재생 중`·`재생 대기` 상태 문구와 단일 control row, seekable progress 계약은 유지한다. 참여자·작업·게시 채널의 상세 계층은 DEC-042가 대체한다. |
| DEC-039 | YouTube iframe chrome은 공식 player parameter가 허용하는 범위에서 최소화한다. | 확정 | OTW Play 자체 transport·progress를 사용하므로 native controls, fullscreen button, iframe keyboard control과 annotation을 끄고 related video는 같은 channel로 제한한다. 폐기된 `showinfo`·`modestbranding`이나 iframe을 덮는 overlay는 사용하지 않는다. CC 강제 비활성 parameter는 공식 지원되지 않으므로 `cc_load_policy=1`을 설정하지 않고 사용자 YouTube caption preference를 따른다. |
| DEC-040 | 데스크톱 우측 player rail은 화면 높이에 따라 정보를 압축하되 iframe과 queue 조작 가능성을 함께 보존한다. | 확정 | 높이 720px 미만에서는 게시 채널 출처 행을 먼저 숨기고 참여자 identity와 이름은 한 줄 말줄임으로 유지한다. 참여자 옆 YouTube·곡 상세 action과 iframe 200px, queue 최소 144px은 보존한다. 높이 640px 미만은 단일 iframe을 계속 보인 채 `현재 재생`과 `플레이큐` 상세 영역을 전환하며, 전환은 pause·재마운트·두 번째 iframe을 만들지 않는다. rail과 queue는 `min-height: 0` 내부 스크롤 경계를 가진다. |
| DEC-041 | 640–1279px에서 전체 `Now Playing`을 닫으면 같은 player를 우측 하단 visible miniplayer로 축소한다. | 확정 | miniplayer는 216px card 안에 200×200px 단일 iframe과 곡명·play/pause·전체 화면 확장 action을 제공한다. 카탈로그 복귀, full↔mini 전환과 queue 항목 변경은 pause·자동 resume·host 재마운트를 만들지 않는다. 폭이 640px 미만으로 줄어들면 전체 player를 다시 열어 숨은 재생을 막고, 그 폭에서 카탈로그 복귀는 기존처럼 pause 후 launcher를 표시한다. 1280px 이상 rail과 `/play` 이탈 stop·destroy는 유지한다. |
| DEC-042 | player 정보 계층은 영상 다음에 곡명과 메인 참여자를 먼저 식별하고, 분류·재생 조작·출처를 단계적으로 제공한다. | 확정 | 현재 멤버는 권위 profile image와 이름, 외부 인물은 중립 person icon, 그룹은 group icon으로 표시한다. YouTube 외부 링크와 곡 상세 action은 참여자 이름 옆에 둔다. 음악 분류와 가창 분류는 identity 아래 보조 metadata로 두고, seek progress와 transport를 연속 배치한다. 게시 채널은 transport 아래에 YouTube icon·`게시 채널` label·channel 이름만 표시하며 참여자 profile image를 channel avatar처럼 재사용하지 않는다. 긴 참여자·channel 이름은 한 줄 말줄임과 title을 제공한다. |
| DEC-043 | 로그인 회원은 운영 공개 flag와 분리된 인증 경로에서 공식 커버만 제안하고 자신의 제안만 조회한다. | 확정 | `/play/submit`, `/play/submissions`는 관리자 catalog preview와 다른 member shell을 사용한다. 제출 단계에서는 YouTube API를 호출하거나 외부 identity를 생성하지 않고, status·submitter·reviewer·publication은 서버가 소유한다. |
| DEC-044 | 공식 커버 승인은 `official_cover_v1` 정책을 만족할 때만 proposal과 published catalog를 같은 D1 batch로 전이한다. | 확정 | 승인·활성 상태의 OTW·유닛·멤버 음악·멤버 메인·승인 프로젝트 공식 채널, 최신 YouTube video/channel·playable 일치와 관리자의 실제 가창 credit 확인을 모두 요구한다. |
| DEC-045 | 회원 제출 제한과 반려 정보 노출을 최소 권한으로 운영한다. | 확정 | KST 기준 사용자당 일 5회와 Cloudflare edge 60초당 3회를 적용한다. 회원에게는 반려 상태와 일반 안내만 표시하고 review code·내부 note는 노출하지 않는다. 수정·철회 권한은 DEC-054를 따른다. |
| DEC-046 | 회원 공식 커버 제안 진입점은 별도 제품 메뉴가 아니라 OTW Play 경험 안에 통합한다. | 확정 | 전역 콘텐츠 메뉴는 역할과 관계없이 `OTW Play` 하나만 사용한다. 관리자 catalog header의 `발견`·`곡 검색` 옆과 회원 제안 shell에 `곡 제안` 메뉴를 두고 `새 곡 제안`·`내 제안`으로 이동한다. 회원 route는 같은 brand frame을 공유하지만 public config·catalog·player를 마운트하지 않는다. |
| DEC-047 | 가창 credit은 메인 보컬·피처링 보컬·코러스·기타 참여 역할을 제안부터 공개 조회까지 보존한다. | 부분 대체됨 | 회원 제출과 관리자 검수의 역할 보존은 유지한다. 공개 화면의 표시·검색 계층은 DEC-048이 대체한다. |
| DEC-048 | 보조 가창 credit은 곡 상세에서만 전체 표시하고 검색에서는 독립 역할 조건으로 제공한다. | 확정 | 발견·곡 목록·Player·queue는 `vocal` 이름만 표시하며 tooltip이나 보조 역할 칩을 만들지 않는다. 곡 상세는 메인 보컬·피처링 보컬·코러스·기타 참여를 역할별로 펼쳐 표시한다. `participantRole` 필터는 선택한 멤버·외부 참여자·그룹 credit과 같은 published performance row에서 동시에 만족해야 한다. 필터가 없으면 기존 검색 의미를 유지하고, 메인 보컬이 없는 기존 데이터의 compact 표시는 credit order 첫 참여자를 사용한다. |
| DEC-049 | 곡의 음악 분류는 가창 상태·형태와 분리된 확장형 다중 태그로 관리한다. | 확정 | `K-POP`, `J-POP`, `보컬로이드`를 빠른 입력값으로 제공하되 자유 태그를 허용한다. 공개 화면에서는 음악 분류를 1차 chip으로, 오리지널·공식 커버·공식 영상·솔로 등 performance metadata는 작은 보조 정보로 표시한다. `/play` 내부 탭 전환은 동일 player host를 유지한다. |
| DEC-050 | 운영 공개는 public read와 navigation을 분리한 단계적 전환으로 수행한다. | 확정 | PR-8A 직접 경로·SEO, PR-8B source health, PR-8C 관측·운영 switch가 모두 검증된 뒤 `public_read_enabled=1`로 익명 직접 경로를 먼저 확인하고 마지막에 `navigation_visible=1`을 적용한다. 검색 색인과 sitemap 포함은 `navigation_visible=1`에서만 허용한다. 코드 병합이나 배포만으로 두 flag를 자동 활성화하지 않는다. |
| DEC-051 | PR-8C 관측과 공개 switch는 PR-8B source-health 위에 stack하고 운영 관측 backend를 분리한다. | 확정 | Workers Logs는 개별 진단, Analytics Engine `otw_play_events`는 24시간 집계와 관리자 화면을 담당한다. 요청별 지표는 D1에 저장하지 않으며, 모든 공개·rollback 전환은 감사 가능한 단일 관리자 command만 사용한다. |
| DEC-052 | PR-8 이후 최우선 프로그램은 playlist 벌크 catalog 수집과 회원 proposal 수정·철회다. | 확정 | P0-A로 두 흐름을 함께 추진하고, P0-B 노래 clip channel 후보함, P0-C 운영 공개 지속 검증, P1 멤버 참여 정보·노래책·SEO 순으로 진행한다. 권리·개인정보·외부 API gate는 각 slice 전에 확정한다. |
| DEC-053 | playlist와 channel 자동화는 회원 proposal이 아닌 공유 system ingestion candidate를 생성한다. | 확정 | video identity와 discovery origin을 dedupe한다. playlist candidate만 관리자 검수 뒤 catalog draft로 전환할 수 있으며 `singing_clip` 변환은 DEC-057을 따른다. 자동 publish, 가짜 submitter와 title 기반 권위 확정은 금지한다. |
| DEC-054 | 회원은 자신의 `pending_review` proposal만 version CAS로 수정하거나 철회할 수 있다. | 확정 | URL을 포함한 editable snapshot 변경은 duplicate preflight를 다시 수행한다. 철회는 불가역이며 승인·거절·철회 뒤에는 새 proposal을 사용한다. 공개 catalog revision은 수정·철회로 변경하지 않는다. |
| DEC-055 | 상세 credit은 작품·가창/녹음·영상·발매 scope와 출처를 분리하고 멤버 노래책은 verified published 관계에서 파생한다. | 부분 대체됨 | 전체 음악 관계자 credit graph는 채택하지 않는다. scope 분리 원칙 중 OTW 멤버 참여 정보에 필요한 부분만 DEC-058이 대체한다. |
| DEC-056 | playlist 벌크 입력은 API가 익명 조회할 수 있는 `public`·`unlisted`만 지원하고 `private`와 OAuth는 범위에서 제외한다. | 확정 | 한 job 5,000개, page·영상 batch 50개, D1 job + Queue/DLQ, 3회 retry와 idempotency를 적용한다. active candidate 90일, ignored/blocked 180일을 상한으로 두고 YouTube API data는 30일 안에 refresh 또는 삭제한다. 식별자·API 사실만 자동 적용하며 음악적 의미는 추천값으로 둔다. |
| DEC-057 | channel 자동화는 OTW·멤버 공식 channel이 아니라 관리자가 승인한 노래 방송 clip channel의 신규 upload를 `singing_clip` system candidate로 수집한다. | 확정 | OTW·멤버 공식 영상은 관리자 단건·playlist로 직접 추가한다. clip candidate는 WebSub + 6시간 reconciliation, backfill 0, title 기반 triage만 사용하며 자동 publish하지 않는다. 방송·키리누키 모델과 channel 권리·승인 gate 전에는 catalog draft로도 변환하지 않는다. |
| DEC-058 | 추가 credit 범위는 OTW 멤버의 가창과 작품·편곡·제작 참여로 제한하고 외부 음악 관계자용 상세 credit·contributor graph는 만들지 않는다. | 확정 | 기존 원곡 가수와 외부 가창 참여자 표시는 유지하되 새 범용 credit 대상이 아니다. 멤버 노래책은 published 관계에서 파생하며 1곡부터 직접 URL, 3곡부터 navigation·SEO를 허용한다. current member를 우선하고 대표 오리지널곡은 관리자 최대 5곡 pin + 최신순 fallback으로 정한다. |
| DEC-059 | playlist 후보 검수는 공통값 일괄 설정 대신 행별 보완과 즉시 적용 미리보기를 사용한다. | 확정 | 선택 checkbox는 사용하지 않는다. sticky 검수 form은 곡 연결·신규 생성, 원곡 가수, 가창자·역할과 공개 분류를 편집하고, 실제 저장 draft와 필수 누락 미리보기는 각 영상 아래의 가로 배치 영역에서 편집 중에도 즉시 갱신한다. ready 완료 후보는 job 전체에서 일괄 변환한다. |
| DEC-060 | playlist 후보 검수 CAS는 background metadata 갱신과 실제 관리자 검수 충돌을 구분한다. | 확정 | 행을 열 때의 version·review input·status를 baseline으로 보존한다. Queue·단건 metadata refresh는 수동 결정인 `ready`, `ignored`, `converted`와 review input을 덮어쓰지 않는다. version만 달라지고 review state가 의미상 같으면 현재 channel·실제 candidate 분류 정책을 다시 검증한 뒤 저장을 허용한다. 실제 동시 검수는 `409 PLAY_ADMIN_STALE_WRITE`, 기존 catalog·proposal·channel/policy 상태로 저장할 수 없는 경우는 validation으로 구분한다. 목록의 origin 분류 `existing_candidate`는 실제 candidate 분류와 함께 표시한다. |
| DEC-061 | playlist job의 숨김·삭제·재생 불가 영상은 관리자가 한 번에 제외할 수 있다. | 확정 | 현재 화면이나 분류 filter가 아니라 job 전체의 `blocked` 후보를 조회하고 `private`, `embed_disabled`, `deleted`, `region_blocked`, `unavailable`만 대상으로 한다. `unknown`과 정책 검토 후보는 자동 제외하지 않는다. 최대 100건 단위 명령으로 job 소속과 candidate version CAS를 재검증하며 성공과 stale·실패를 항목별로 분리한다. |
| DEC-062 | playlist 후보 검수는 공식 채널 승인과 완료 항목 정리를 같은 작업 흐름에 포함한다. | 확정 | `channel_review` 후보는 sticky form에서 공식 역할과 소유·연결 주체를 확인해 채널을 승인·활성화하고 metadata를 다시 분류한다. 변환은 화면 선택이 아니라 job 전체 `ready` 후보를 100건 단위로 처리하며 `converted|ignored`는 기본 후보 목록에서 제외하되 명시적 status 조회는 유지한다. |
| DEC-063 | playlist 후보의 상태와 채널 승인 경계는 운영자가 의미와 다음 행동을 바로 판단할 수 있게 표시한다. | 확정 | 상태 열은 내부 code 대신 후보 workflow 단계, 현재 권위 분류, 다음 조치와 origin 가져오기 기록을 분리해 한국어로 표시한다. 신규 채널 승인의 기본 소유 유형은 OTW 공식 또는 catalog member identity 공식으로 제한하고, 두 유형은 가용 폭을 채우는 2열 카드로 표시한다. archive되지 않은 OTW 멤버는 중첩 스크롤 없이 모두 표시하며, 외부 채널은 별도 모드를 열어 기존 외부 주체 연결과 명시적 승인 확인을 모두 거쳐야 한다. |

## 4. 제품 원칙

### 4.1 곡 중심

사용자가 보는 기본 단위는 YouTube 영상이 아니라 곡이다. 같은 곡을 여러 번
부른 경우 하나의 곡 아래에 여러 가창 기록을 제공한다.

### 4.2 가창 기록 보존

같은 멤버가 같은 곡을 여러 번 불러도 각각 별도 가창 기록으로 보존한다.
가창일, 참여자와 재생 구간이 다르면 서로 다른 기록이다.

MVP에서는 공식 공개 버전만 등록한다. 방송에서 반복해서 부른 기록을 구분하는
규칙은 후속 방송 가창 확장에 적용한다.

### 4.3 출처 투명성

MVP의 모든 재생 항목은 공식 게시 채널, 공개일과 YouTube 외부 링크를
확인할 수 있어야 한다. 후속 방송 가창 항목은 키리누키 채널과 원본 방송
출처까지 함께 확인할 수 있어야 한다.

### 4.4 큐레이션 우선

관리자는 공식 커버곡을 직접 등록하고 검수하여 게시할 수 있다. 로그인 회원은
공식 커버곡 등록을 제안할 수 있지만 공개 상태를 결정할 수 없다.

회원 제안과 자동 수집 결과는 곧바로 공개하지 않는다. 곡 연결, 참여자,
공개일, 출처와 중복 여부를 관리자가 확인하고 승인한 뒤에만 게시한다.

### 4.5 현재 소속 기준 표시

OTW 소속 표시는 현재 멤버 상태를 기준으로 계산한다. 과거 활동 기록은
보존하지만, 전 소속 멤버는 외부 참여자와 동일한 중립 표시를 사용한다.

## 5. 분류 체계

오리지널, 커버, 방송 가창은 하나의 상호 배타적인 종류로 취급하지 않는다.
다음 세 축을 독립적으로 관리한다.

| 분류 축 | 값 예시 | 적용 대상 |
| --- | --- | --- |
| 곡 관계 | 오리지널, 커버 | 해당 가창 버전과 곡의 관계 |
| 공개 형태 | 공식 MV, 공식 영상, 방송 가창, 라이브·콘서트, Shorts | 가창 기록이 공개된 맥락 |
| 참여 형태 | 솔로, 듀엣, 유닛, 단체, 외부 협업 | 해당 가창 기록의 참여 구성 |

참여 인원 수만으로 참여 형태를 확정하지 않는다. 유닛곡, 전체 단체곡,
프로젝트 협업처럼 제품상 의미가 다른 구성을 관리자가 선택할 수 있어야 한다.

MVP에서 공개하는 범위는 곡 관계가 오리지널 또는 커버이고, 공개 형태가
공식 MV 또는 검수된 공식 영상인 항목이다. 방송 가창, 라이브 구간과
키리누키는 분류 체계에는 보존하되 후속 범위로 취급한다.

## 6. 핵심 개념 모델

### 6.1 곡

동일한 음악 작품을 묶는 기준 정보다.

- 대표 제목
- 제목 별칭, 다른 언어 또는 표기
- 원곡 가수
- 원곡 공개 연도 또는 공개일
- OTW 오리지널곡 여부
- 검색용 정규화 정보

원곡 가수와 실제 가창 참여자는 서로 다른 개념으로 관리한다.

`music_songs.is_otw_original`이 OTW 오리지널곡 여부의 단일 권위다. 이 값은
가창 기록의 `relation_type`, 게시 채널 역할 또는 영상 제목에서 추론하지 않는다.
등록 주체가 `true` 또는 `false`를 명시해야 하며 NULL이나 암묵적 기본값을
허용하지 않는다.
곡과 entity의 `alias_kind`는 필요할 때만 쓰는 nullable 자유 텍스트이며, 현재
schema에서 고정 enum으로 제한하지 않는다.

### 6.2 가창 기록

누가 언제 어떤 형태로 불렀는지를 나타낸다.

- 연결된 곡
- 가창일 또는 방송일
- 곡 관계
- 공개 형태
- 참여 형태
- 참여자 목록과 역할
- 운영 메모
- 공개 상태와 품질 상태

같은 곡, 같은 멤버라도 가창일이나 방송이 다르면 별도 기록이다.

가창의 dedupe key는 생성 시 확정한 identity로 보존한다. 참여자, 표시 제목,
대표 source 우선순위 같은 수정 가능한 metadata가 바뀌어도 다시 계산하지 않는다.
동일한 source와 시작 시각 조합은 둘 이상의 가창에 연결할 수 없다.

### 6.3 참여자

가창에 참여한 사람 또는 활동 주체다.

- 현재 OTW 멤버
- 외부 스트리머
- 전 소속 멤버
- 필요 시 프로젝트성 외부 참여자

외부 참여자는 최소한 표시명과 출처 채널 식별 정보를 보존한다.
동명이인을 구분할 수 있어야 하지만 MVP에서 외부 참여자 전용 공개
프로필 페이지는 요구하지 않는다.

### 6.4 재생 소스

가창 기록을 실제로 재생할 수 있는 YouTube 영상과 구간 정보다.

- YouTube 영상 ID와 URL
- 게시 채널
- 소스 종류
- 시작 및 종료 시각
- 게시일
- 대표 재생 소스 여부
- 원본 또는 관련 영상 연결
- 재생 가능, 삭제, 비공개, 임베드 불가 등의 상태

하나의 가창 기록은 여러 재생 소스를 가질 수 있고, 하나의 긴 영상은 여러
곡의 재생 구간을 포함할 수 있다.

source 관계는 `source_id`에서 `related_source_id`로 향하는 directed relation이다.
반대 방향 row를 자동으로 만들지 않으며 방향이 바뀐 관계를 같은 row로 취급하지
않는다.

### 6.5 채널

재생 소스의 출처와 신뢰 수준을 판단하기 위한 채널 정보다.

- OTW 공식 채널
- 멤버 메인 공식 채널
- 멤버 노래 채널
- 멤버 보조 채널
- 유닛 또는 프로젝트 공식 채널
- 승인된 키리누키 채널
- 기타 검수 대상 채널

채널은 소유 주체, 역할, 승인 상태와 활성 상태를 구분할 수 있어야 한다.

채널과 entity의 연결 row가 곧 해당 채널의 소유·소속 관계를 뜻한다. 관계 종류
열을 별도로 두지 않고 `(channel_id, entity_id)` 쌍을 유일하게 유지한다.

## 7. 재생 소스 정책

### 7.1 오리지널곡과 공식 커버곡

대표 소스 우선순위는 다음과 같다.

1. OTW 또는 유닛 공식 채널
2. 참여 멤버의 공식 노래 채널
3. 참여 멤버의 메인 공식 채널
4. 관리자가 승인한 기타 공식 프로젝트 채널

공식 영상이 삭제되거나 임베드 불가인 경우에만 검수된 대체 소스를 사용한다.

### 7.2 후속 확장: 방송 가창

대표 소스 우선순위는 다음과 같다.

1. 승인된 키리누키 영상의 정확한 곡 구간
2. 원본 방송의 정확한 타임스탬프
3. 관리자가 승인한 기타 공개 영상

키리누키가 대표 소스여도 원본 방송을 확인할 수 있다면 출처로 연결한다.
동일한 한 번의 가창이 원본 방송과 여러 키리누키 영상에 존재해도 가창 기록을
중복 생성하지 않는다.

### 7.3 후속 확장: 키리누키 승인

방송 가창 확장에서도 등록된 모든 키리누키 채널의 모든 영상을 자동 승인하지 않는다.
채널 승인과 개별 가창 기록 게시 승인을 구분한다.

승인 시 최소한 다음을 확인한다.

- 실제 가창자와 곡명이 일치하는가?
- 영상이 해당 가창 구간을 충분히 포함하는가?
- 방송일 또는 원본 방송을 확인할 수 있는가?
- 중복 등록된 동일 가창이 아닌가?
- 영상이 공개 상태이며 임베드 가능한가?
- 게시 채널과 원본 출처를 표시할 수 있는가?

## 8. 참여자 칩 표시 규칙

| 참여자 상태 | 표시 | 동작 |
| --- | --- | --- |
| 현재 OTW 소속 멤버 | 오시마크와 활동명 | 기존 멤버 프로필 연결 가능 |
| 외부 스트리머 | 활동명만 표시하는 중립 칩 | 기본적으로 링크 없는 단순 칩 |
| 전 소속 멤버 | 외부 스트리머와 동일한 중립 칩 | 오시마크와 현 소속 표시는 사용하지 않음 |
| 유닛 또는 그룹 | 보조 라벨 | 실제 참여 멤버 칩을 대체하지 않음 |

색상만으로 소속 상태를 전달하지 않는다. 오시마크, 텍스트와 접근성 레이블을
함께 사용한다.

전 소속 멤버의 과거 가창 기록은 삭제하지 않는다. 표시 시점의 현재 소속
상태만 외부 인원으로 처리한다.

## 9. 사용자 기능 요구사항

별도 표시가 없는 요구사항은 MVP 대상이다. 후속 표시가 있는 요구사항은
초기 구현과 수용 기준에서 제외한다.

### 9.1 탐색과 검색

- FR-001: 곡명, 제목 별칭, 원곡 가수와 참여자명으로 검색할 수 있어야 한다.
- FR-002: 검색 결과는 기본적으로 동일한 곡을 하나로 묶어 보여야 한다.
- FR-003: 곡을 선택하면 연결된 모든 공식 가창 버전을 공개일과 참여자별로 확인할 수 있어야 한다.
- FR-004: 최근 공개된 오리지널곡과 공식 커버곡을 구분해 탐색할 수 있어야 한다.
- FR-005: 특정 멤버, 그룹 또는 외부 협업곡을 빠르게 탐색할 수 있어야 한다.
- FR-026 [후속]: 최근 방송 가창을 공식 공개곡과 구분해 탐색할 수 있어야 한다.

### 9.2 필터와 정렬

- FR-006: 멤버를 복수 선택할 수 있어야 한다.
- FR-007: 그룹, 오리지널·커버 관계와 참여 형태로 필터링할 수 있어야 한다.
- FR-008: 원곡 가수와 공식 영상 공개일 범위로 필터링할 수 있어야 한다.
- FR-009: 최신 공개순, 곡명순과 참여자순 정렬을 제공해야 한다.
- FR-010: 멤버 복수 선택의 기본 의미는 선택한 멤버 중 한 명 이상 포함으로 한다.
- FR-011: 선택한 멤버가 모두 함께 참여한 기록만 보는 조건을 별도로 제공할 수 있어야 한다.
- 공개 API의 멤버 filter는 기존 numeric member UID를 사용한다. 원곡 가수는 공개
  entity slug를 사용하고, 그룹은 facets가 발급한 versioned opaque key를 그대로
  다시 보낸다. opaque key의 kind는 `entity` 또는 `unit`이며 client가 내부 값을
  조립하거나 해석하지 않는다.
- 검색 결과는 exact total을 제공하지 않는다. UI는 현재 불러온 항목과 다음 page
  존재 여부만 표현한다.
- FR-027 [후속]: 방송일과 키리누키 공개 형태로 필터링할 수 있어야 한다.
- FR-029 [후속]: 방송 가창을 포함한 뒤 많이 부른 순 정렬을 제공해야 한다.

### 9.3 곡과 가창 기록

- FR-012: 같은 곡에 연결된 공식 MV와 공식 가창 버전을 함께 확인할 수 있어야 한다.
- FR-013 [후속]: 한 멤버가 같은 곡을 방송에서 여러 번 부른 기록을 각각 구분해야 한다.
- FR-014: 각 공식 가창 기록에 참여자, 원곡 가수, 공개일과 출처를 표시해야 한다.
- FR-015: 동일한 가창의 여러 재생 소스를 하나의 기록 아래에 연결해야 한다.
- FR-016: 단체곡은 실제 참여 멤버를 가능한 범위에서 모두 기록해야 한다.
- FR-028 [후속]: 같은 곡의 공식 버전과 방송 가창 버전을 함께 확인할 수 있어야 한다.

### 9.4 재생과 대기열

- FR-017: 사용자가 선택한 가창 기록을 화면 내 YouTube 플레이어로 재생해야 한다.
- FR-018 [후속]: 긴 방송 또는 키리누키 영상은 등록된 시작 시각부터 재생해야 한다.
- FR-019 [후속]: 종료 시각이 있으면 해당 시점에 다음 대기 항목으로 이동해야 한다.
- FR-020: 다음, 이전, 반복, 셔플과 대기열 편집을 지원해야 한다.
- FR-021: 현재 재생 중인 곡, 가창자, 원곡 가수와 가창일을 표시해야 한다.
- FR-022: YouTube에서 직접 열 수 있는 링크를 제공해야 한다.
- FR-023: 재생 불가 소스는 상태를 안내하고 사용자가 다음 항목으로 이동할 수 있어야 한다.

재생 대기열은 현재 감상 세션을 위한 기능이며 저장형 플레이리스트가 아니다.
대기열은 versioned `sessionStorage`에 식별자와 순서·현재 index·repeat·shuffle만
보존한다. 같은 performance는 하나의 항목으로 유지하며 복원 시 기존 중복도 첫
항목으로 정리한다. 복원 항목은 공개 performance API로 다시 검증하며 자동 재생하지
않는다.

MVP는 공식 영상을 처음부터 끝까지 재생한다. 구간 재생은 방송 가창 확장과
함께 도입한다.

### 9.5 공유

- FR-024: 특정 곡을 다시 열 수 있는 URL을 제공해야 한다.
- FR-025: 가능하면 특정 가창 기록 또는 버전을 직접 여는 URL을 제공해야 한다.

### 9.6 회원 공식 커버 등록 제안

- FR-030: 로그인 회원은 공식 커버곡 등록을 제안할 수 있어야 한다.
- FR-031: 제안 시 YouTube URL, 곡명, 원곡 가수와 가창 참여자를 입력할 수 있어야 한다.
- FR-032: 제안자는 선택적으로 출처 또는 확인에 필요한 메모를 추가할 수 있어야 한다.
- FR-033: 회원 제안은 관리자 승인 전 공개 검색, 곡 목록과 플레이어에 노출되지 않아야 한다.
- FR-034: 회원은 자신의 제안 상태를 확인할 수 있어야 한다.
- FR-035: 회원은 승인 상태나 공개 상태를 직접 변경할 수 없어야 한다.
- FR-036: 제출 전에 동일 YouTube 영상 또는 유사한 기존 곡이 있음을 안내할 수 있어야 한다.
- FR-037: 회원은 OTW Play 상단의 곡 제안 메뉴에서 새 제안과 내 제안으로 이동할 수 있어야 한다.
- FR-038: 제출 wizard는 확인한 영상, 곡 연결 방식, 참여자와 제출 snapshot을 단계별로 명확히 보여주고 오류 후에도 입력·단계·idempotency key를 유지해야 한다.
- FR-039: 작성 중 route 이탈은 입력 손실을 확인하고, 성공 후에는 권위 제출 결과와 다음 행동을 보여준 뒤 사용자가 명시적으로 새 양식을 시작해야 한다.
- FR-040: 회원은 자신의 `pending_review` 제안을 기존 wizard에서 수정할 수 있어야 한다.
- FR-041: 회원은 자신의 `pending_review` 제안을 명시적 확인 뒤 철회할 수 있어야 한다.
- FR-042: 수정·철회가 관리자 검수와 충돌하면 먼저 성공한 version만 유지하고 최신 상태를 다시 보여줘야 한다.

회원 제안 대상은 공식 커버곡으로 제한한다. 오리지널곡 등록은 현재 MVP에서
관리자 전용이다.

제출 단계에서는 YouTube 채널 metadata를 조회하거나 proposal에 channel ID를
저장하지 않는다. 채널과 공개일의 권위 검증은 후속 관리자 승인 과정에서만
수행한다. 제안 메모, 내부 검수 메모와 review result는 공개 catalog나 event
detail로 자동 복사하지 않는다.

### 9.7 멤버별 노래책과 참여 정보 [후속]

- FR-043: current member의 published song이 1곡 이상이면 `/play/members/{memberCode}`
  직접 URL에서 멤버 노래책을 제공해야 한다.
- FR-044: 노래책은 distinct 곡 수와 published 가창 version 수를 구분하고 `부른 곡`,
  `오리지널`, `커버`, `협업`, `만든 곡`을 같은 권위 관계에서 계산해야 한다.
- FR-045: `만든 곡`과 `전체 참여`는 verified OTW member contribution만 사용하고
  외부 음악 관계자 정보를 추론하거나 새 profile로 만들지 않아야 한다.
- FR-046: published song 1~2곡인 page는 direct `200`·`noindex`·sitemap 제외를
  유지하고, 3곡 이상 current member page만 `navigation_visible=1`과 revision 일치에서
  navigation·index·sitemap에 포함해야 한다.
- FR-047: 대표 오리지널곡은 관리자 pin 최대 5곡을 우선하고 부족분은 최신 published
  original로 채워야 한다.
- FR-048: 로그인 회원은 근거 URL이 있는 멤버 참여 정보 정정 제안을 제출할 수 있지만
  관리자 승인 전 public DTO와 노래책에 반영되지 않아야 한다.

## 10. 관리자 기능 요구사항

### 10.1 등록과 검수

- ADM-001: YouTube URL 또는 영상 ID로 후보를 등록할 수 있어야 한다.
- ADM-002: 기존 곡을 검색해 가창 기록을 연결하거나 새 곡을 생성할 수 있어야 한다.
- ADM-003: 참여자와 역할을 복수로 지정할 수 있어야 한다.
- ADM-004: 곡 관계, 공개 형태와 참여 형태를 각각 지정할 수 있어야 한다.
- ADM-005: 공식 공개일을 입력하거나 YouTube 메타데이터에서 확인할 수 있어야 한다.
- ADM-006: 대표 재생 소스와 대체 소스를 지정할 수 있어야 한다.
- ADM-007: 동일 영상 또는 동일 가창으로 추정되는 항목에 중복 경고를 제공해야 한다.
- ADM-014: 관리자는 공식 커버곡을 직접 등록하고 검수 완료 후 게시할 수 있어야 한다.
- ADM-015: 로그인 회원이 제출한 공식 커버곡 제안을 승인 대기 목록에서 확인할 수 있어야 한다.
- ADM-016: 관리자는 회원 제안의 영상, 곡, 원곡 가수, 참여자, 채널과 공개일을 검수할 수 있어야 한다.
- ADM-017: 관리자는 회원 제안을 승인하거나 거절할 수 있어야 한다.
- ADM-018: 관리자 승인만 회원 제안을 공개 카탈로그 항목으로 전환할 수 있어야 한다.
- ADM-019: 오리지널곡은 관리자만 등록하고 게시할 수 있어야 한다.
- ADM-020: 관리자 최상위 작업은 카탈로그와 제안 검수로 제한하고, 곡 아래에 모든 가창 버전과 상태·참여자·채널·source를 함께 확인할 수 있어야 한다.
- ADM-021: 현재 멤버는 `members` 권위 데이터를 자동완성하고, 검색되지 않는 외부 인물·그룹은 칩으로 추가하되 기존 identity와 자동 병합하지 않아야 한다.
- ADM-022: 공식 채널은 별도 선행 등록을 요구하지 않는다. 권위 멤버 채널은 자동 연결하고 미등록 채널은 인라인 승인 또는 pending draft를 선택해야 한다.
- ADM-023: 통합 등록은 metadata 재검증, entity·channel·song·performance·event·projection과 두 revision을 하나의 D1 batch로 반영해야 한다.
- ADM-024: 관리자는 YouTube playlist URL에서 전체 항목을 page 단위로 수집하고 진행률과 항목별 결과를 다시 열어볼 수 있어야 한다.
- ADM-025: playlist 항목을 기존 catalog·proposal·candidate, channel review, unavailable과 eligible로 분류해야 한다.
- ADM-026: 각 playlist 후보의 sticky 검수 form에서 필수 metadata를 보완하고, 실제 저장될 곡·원곡 가수·가창자·역할·공개 분류와 누락값을 해당 영상 아래의 가로 배치 영역에서 즉시 미리 본 뒤, job 전체의 ready 완료 후보를 catalog draft로 일괄 변환할 수 있어야 한다.
- ADM-027: 일부 항목 실패는 성공 항목을 되돌리지 않고 실패 항목만 재시도할 수 있어야 한다.
- ADM-028: 관리자가 별도로 승인한 노래 방송 clip channel을 구독해 신규 upload를 `singing_clip` system candidate로 만들고 lease·notification·reconciliation 상태를 확인할 수 있어야 한다. OTW·멤버 공식 channel은 이 자동 구독 범위가 아니다.
- ADM-029: 자동 수집 후보는 실제 관리자 검수와 기존 publish command 없이는 공개될 수 없어야 한다.
- ADM-030: `singing_clip` candidate는 방송·키리누키 foundation, 원본 방송·가창자·곡·
  segment와 clip 게시 승인 검수가 끝나기 전 catalog draft로 변환할 수 없어야 한다.
- ADM-031: 관리자는 OTW 멤버의 작사·작곡·편곡·연주·제작 참여와 공식 근거를
  song/performance scope에 입력·수정할 수 있어야 한다.
- ADM-032: 관리자는 current member별 대표 오리지널곡을 최대 5곡까지 pin·정렬할 수
  있어야 한다.
- ADM-033: 관리자는 playlist job 전체에서 숨김·삭제·embed 차단·지역 차단·재생 불가로 확인된 후보를 일괄 제외하고, 동시 변경되었거나 실패한 후보 수를 별도 확인할 수 있어야 한다.
- ADM-033: 멤버 참여 정보 정정 제안을 승인·거절할 수 있고 승인 변경은 event와
  catalog/read-model revision을 같은 D1 batch에서 반영해야 한다.
- ADM-034: playlist 후보를 편집하는 동안 metadata 수집이 version을 갱신해도 검수
  baseline이 변하지 않았다면 저장할 수 있어야 하며, 실제 검수 충돌에서는 입력값을
  잃지 않고 최신 권위 상태를 다시 보여 줘야 한다.
- ADM-035: `channel_review` 후보는 별도 화면으로 이탈하지 않고 공식 채널 역할과
  소유·연결 주체를 확인해 승인·활성화한 뒤 후보 분류를 갱신할 수 있어야 하며,
  `converted|ignored` 후보는 기본 작업 목록에서 제거되어야 한다.
- ADM-036: playlist 후보 상태는 workflow 단계, 현재 candidate 판단, 다음 조치와
  origin 가져오기 기록을 구분해 표시해야 한다. 신규 채널 승인은 OTW 공식 또는
  archive되지 않은 catalog member identity 공식 흐름을 기본으로 하고 외부 채널은 별도 추가·승인 확인과
  non-member 주체 연결을 요구해야 한다.
- ADM-013 [후속]: 방송일, 시작 시각과 종료 시각을 입력하고 구간을 미리 확인할 수 있어야 한다.

### 10.2 상태 관리

서로 다른 수명주기를 하나의 상태 열에 섞지 않는다. 최소 상태 축은 다음과
같다.

| 상태 축 | 값 | 적용 대상 |
| --- | --- | --- |
| 제안 심사 | `pending_review`, `approved`, `rejected`, `withdrawn` | 로그인 회원의 공식 커버 제안 |
| 카탈로그 공개 | `draft`, `published`, `withdrawn` | 검수된 가창 기록 |
| 카탈로그 품질 | `ok`, `needs_update` | 가창 기록의 메타데이터 품질 |
| 소스 가용성 | `unknown`, `playable`, `private`, `embed_disabled`, `deleted`, `region_blocked`, `unavailable` | 개별 YouTube 재생 소스 |
| 자동 수집 후보 | `discovered`, `needs_input`, `ready`, `converted`, `ignored`, `blocked` | playlist에서 발견한 catalog candidate 또는 clip channel에서 발견한 `singing_clip` candidate |

회원 제안의 승인과 카탈로그 게시는 같은 상태값이 아니다. 승인 작업은 제안을
`approved`로 전환하면서 별도의 검수된 가창 기록을 `published`로 만들 수 있다.
모든 소스가 재생 불가여도 가창 기록은 `published` 상태를 유지할 수 있다.

| 입력 주체 | 제안 심사 | 카탈로그 공개 | 비고 |
| --- | --- | --- | --- |
| 관리자 직접 등록 | 해당 없음 | `draft`에서 검수 후 `published` | 오리지널곡과 공식 커버곡 등록 가능 |
| 로그인 회원 제안 | `pending_review`에서 `approved` 또는 `rejected` | 승인 작업에서 별도 `published` 기록 생성 | 공식 커버곡만 제안 가능 |

자동 수집 candidate는 회원 제안이나 카탈로그 공개 상태에 추가하지 않는다. playlist와
clip channel discovery는 별도 candidate aggregate를 공유하되 `candidate_kind`로
구분한다. playlist candidate는 관리자 검수 뒤 catalog draft로 변환할 수 있지만,
`singing_clip`은 방송·키리누키 모델과 승인 정책이 준비되기 전에는 draft 변환을
허용하지 않는다.

### 10.3 운영

- ADM-008: 잘못 연결된 곡과 참여자를 수정할 수 있어야 한다.
- ADM-009: 중복 가창 기록을 병합할 수 있어야 한다.
- ADM-010: 대표 재생 소스를 교체할 수 있어야 한다.
- ADM-011: 변경자, 변경 시각과 주요 변경 내용을 추적할 수 있어야 한다.
- ADM-012: 자동 수집 후보가 검수 없이 공개되지 않아야 한다.
- ADM-020: 회원 제안의 제출자, 제출 시각, 검수자, 검수 시각과 최종 결과를 추적할 수 있어야 한다.
- ADM-021: 거절된 회원 제안은 공개 카탈로그와 분리하여 운영 이력으로 보존해야 한다.

## 11. MVP 범위

### 포함

- 곡, 가창 기록, 참여자, 재생 소스와 채널의 분리된 카탈로그
- 관리자 수동 등록과 검수
- 로그인 회원의 공식 커버곡 등록 제안
- 회원 제안에 대한 관리자 승인 및 거절
- 오리지널곡과 공식 커버곡
- OTW, 유닛, 멤버 및 검수된 협업 프로젝트의 공식 채널 소스
- 곡명, 원곡 가수와 참여자 검색
- 멤버, 그룹, 공개일, 오리지널·커버와 참여 형태 필터
- 동일한 곡에 연결된 여러 공식 버전 표시
- 현재 OTW 멤버와 외부 인원의 칩 구분
- 공식 YouTube 영상 전체 재생
- 세션 재생 대기열, 반복과 셔플
- 곡 및 가창 기록 직접 링크
- 삭제, 비공개, 임베드 불가 소스 대응

### 제외

- 사용자 저장 플레이리스트
- 좋아요와 개인 라이브러리
- 공동 플레이리스트
- 방송에서 부른 노래
- 키리누키를 이용한 방송 가창 재생
- 방송일 및 시작·종료 타임스탬프 관리
- YouTube 음원 다운로드, 추출, 변환, 프록시 또는 재호스팅
- 전체 가사 제공과 가사 싱크
- AI만으로 곡명을 확정하여 자동 게시
- 회원 제안의 검수 없는 즉시 공개
- 일반 사용자의 기존 공개 항목 직접 편집
- Spotify, Apple Music 등 외부 음원 서비스 동시 재생
- 조회 이력 기반 개인화 추천

## 12. 후속 확장

### 12.1 방송 가창과 키리누키

- 방송에서 부른 노래의 개별 가창 기록
- 동일 곡의 날짜별 반복 가창
- 승인된 키리누키 우선 재생
- 원본 방송 출처와 대체 재생 소스 연결
- 방송일 및 시작·종료 타임스탬프
- 방송별 세트리스트
- 신규 키리누키 영상 후보 자동 수집
- 승인된 노래 clip channel의 WebSub·uploads reconciliation 후보함

### 12.2 플레이리스트와 개인화

- 사용자 저장 플레이리스트
- 운영자 큐레이션 플레이리스트
- 공개 또는 비공개 플레이리스트
- 플레이리스트 공유
- 좋아요와 즐겨찾기
- 최근 들은 곡
- 멤버 라디오와 랜덤 재생

### 12.3 카탈로그 확장

- YouTube playlist 벌크 수집·검수·draft 변환
- approved 노래 clip channel 신규 영상의 `singing_clip` system candidate 자동화
- 회원 pending proposal 수정·철회
- OTW 멤버의 가창·작사·작곡·편곡·제작 참여 정보
- 멤버별 `부른 곡·오리지널·커버·협업·만든 곡` 노래책과 SEO
- 언어, 장르, 분위기와 이벤트 태그

후속 확장 항목은 MVP 데이터 모델을 불필요하게 복잡하게 만들지 않는 범위에서
확장 가능성만 보존한다.

### 12.4 PR-8 이후 권장 우선순위

| 우선순위 | 범위 | 완료 또는 착수 gate |
| --- | --- | --- |
| P0-A | catalog 입력 효율·proposal lifecycle | playlist 벌크 candidate 수집·검수·draft 변환과 owner-only pending proposal 수정·철회를 구현한다. 두 흐름은 같은 우선순위 프로그램이지만 failure boundary별 PR로 전달한다. |
| P0-B | 노래 clip channel 자동 후보함 | P0-A ingestion candidate·Queue를 재사용해 approved clip channel의 WebSub 신규 upload와 uploads reconciliation을 `singing_clip` 후보로 제공한다. 공식 channel은 직접 입력하고 clip 후보의 draft 변환·공개는 방송·키리누키 foundation 전까지 금지한다. |
| P0-C | 운영 공개·안정화 지속 확인 | 인증 관리자 스모크, source-health readback, catalog 정비, `0/0 → 1/0 → 1/1`과 rollback rehearsal을 공개 전후 지속 확인한다. |
| P1 | 멤버 참여 정보·멤버별 노래책·SEO | existing participant와 최소 member contribution을 사용해 current member의 부른 곡·오리지널·커버·협업·만든 곡 page를 제공한다. 외부 음악 관계자 상세 credit, contributor·album graph는 범위에서 제외한다. |
| P2 | 큐레이션·저장 경험 | 운영자 큐레이션 playlist를 먼저 제공하고 사용자 저장·공개/비공개·공유, 좋아요·최근 들은 곡·멤버 라디오를 순차 검토한다. |
| P3 | 방송 가창·키리누키 | 날짜별 가창 기록, 방송 타임스탬프, setlist, 승인된 키리누키와 원본 방송 fallback을 추가하고 P0-B `singing_clip` 후보의 draft 변환을 연다. TBD-004·005를 먼저 해결한다. |
| P4 | 개인화·외부 생태계 | 행동 기반 추천과 Spotify·Apple Music 등 외부 서비스 연동은 권리·개인정보·API 비용과 사용자 가치가 확인된 뒤 검토한다. 자동 공개나 AI 단독 곡 확정은 계속 금지한다. |

P0-A가 다음 구현 최우선이며 P0-B는 그 candidate pipeline에 의존한다. P0-C는 개발
순서와 무관하게 계속 수행한다. P1 이후는 별도 schema·API·UI 설계와 gate를 거쳐야
한다. 우선순위를 바꾸면 DEC-052와 이 표를 함께 갱신한다.

## 13. 품질 및 정책 요구사항

- NFR-001: YouTube IFrame Player를 사용하고 오디오를 별도로 추출하지 않는다.
- NFR-002: YouTube 플레이어의 브랜딩, 광고와 기본 조작 UI를 가리지 않는다.
- NFR-003: 자동 재생은 사용자 조작과 브라우저 및 YouTube 정책을 준수한다.
- NFR-004: 플레이어가 화면에서 제거되거나 정책상 유효하지 않은 상태에서 숨은 재생을 지속하지 않는다.
- NFR-005: 키보드만으로 검색, 필터, 곡 선택과 대기열 조작이 가능해야 한다.
- NFR-006: 오시마크 또는 색상 하나만으로 참여자 상태를 전달하지 않는다.
- NFR-007: 공개 카탈로그는 검수 완료 상태만 반환해야 한다.
- NFR-008: 삭제된 영상이 곡 및 가창 메타데이터 전체를 삭제하게 해서는 안 된다.
- NFR-009: 외부 채널 데이터와 사용자 입력은 API 경계에서 검증하고 정규화해야 한다.
- NFR-010: 공식 커버 등록 제안은 로그인 회원만 제출할 수 있어야 한다.
- NFR-011: 회원은 제출자 권한으로 승인, 거절 또는 공개 상태를 변경할 수 없어야 한다.
- NFR-012: 공개 카탈로그 조회와 승인 대기 제안 조회의 권한 및 캐시 경계를 분리해야 한다.
- NFR-013: 반복 제출과 자동화된 스팸을 제한할 수 있는 운영 보호 장치를 마련해야 한다.
- NFR-014: 일반 회원은 자신의 제안과 상태만 조회할 수 있어야 한다.
- NFR-015: 승인, 거절과 공개 상태 변경은 관리자 권한에서만 수행할 수 있어야 한다.
- NFR-016: 공개 catalog API는 로그인 상태와 무관하게 Authorization을 보내지 않는
  동일한 public DTO를 사용해야 하며, Authorization 또는 Cookie가 있는 직접 요청은
  shared Cache API를 우회하고 `no-store`로 응답해야 한다.
- NFR-017: 공개 검색·정렬 projection은 canonical song과 published performance를
  대체하지 않아야 한다. 공개 read가 활성인 경우 projection revision이 catalog
  revision과 일치할 때만 config 이외 공개 응답과 cache를 허용하며, 최종 조회에서도
  canonical·non-archived song과 published official performance predicate를 다시
  적용해야 한다.

## 14. 수용 기준

MVP는 최소한 다음 대표 시나리오를 실제 사용자 흐름에서 만족해야 한다.

1. 사용자가 멤버 한 명을 선택하고 그 멤버가 부른 곡 목록을 확인한다.
2. 사용자가 오리지널곡과 공식 커버곡을 구분해 탐색한다.
3. 사용자가 곡명을 검색하고 연결된 공식 버전과 참여자를 비교한다.
4. 사용자가 곡을 선택하면 우선순위에 맞는 공식 YouTube 영상이 처음부터 재생된다.
5. 단체곡에서 현재 멤버는 오시마크 칩으로, 외부 및 전 소속 멤버는 중립 칩으로 표시된다.
6. 여러 공식 가창 기록을 대기열에 넣고 다음, 이전, 반복과 셔플을 사용할 수 있다.
7. 관리자가 공식 영상의 출처 채널, 원곡 가수, 참여자와 공개일을 검수한 뒤 게시한다.
8. 미검수 후보는 공개 사용자 화면에 노출되지 않는다.
9. 비로그인 사용자는 공식 커버곡 등록 제안을 제출할 수 없다.
10. 로그인 회원이 제출한 공식 커버곡은 `pending_review` 상태로 저장되고 공개 목록에 나타나지 않는다.
11. 관리자가 회원 제안을 승인하면 검수된 정보가 공개 카탈로그에 나타난다.
12. 관리자가 회원 제안을 거절하면 공개되지 않고 제출 및 검수 이력이 보존된다.
13. `public_read_enabled=1`이면 `/play`와 published 곡 직접 URL은 익명 `200`과 self-canonical을 제공하되 `navigation_visible=0` canary에서는 `noindex`와 sitemap 제외를 유지한다. `navigation_visible=1`에서만 `/play`와 published 곡을 색인·sitemap에 포함하며, `/play/songs`, unknown·withdrawn 곡과 회원·관리자 전용 경로는 sitemap에 포함하지 않는다.
14. source 점검 장애가 곡·가창 metadata를 삭제하지 않으며 quota·429와 확정된 재생 불가 상태를 구분한다.
15. public read를 먼저 활성화해 익명 검색·상세·재생을 검증한 뒤에만 navigation을 노출할 수 있다.

## 15. 기존 프로젝트와의 관계

재사용 가능한 현재 자산:

- members의 오시마크, 소속 유닛과 YouTube 채널 정보
- member_links의 멤버별 YouTube 보조 채널 정보
- 기존 멤버 필터 칩의 시각 및 접근성 패턴
- 공식 YouTube 영상 조회 기능
- 후속 방송 가창 확장에서 재사용할 키리누키 채널 조회 기능
- YouTube API 캐시 및 예열 운영 기능
- Clerk 로그인 상태와 관리자 권한 경계
- ContentPageShell 기반 공개 콘텐츠 화면 구조

현재 기능은 채널별 최신 영상 피드이며 곡, 가창 기록, 원곡 가수와 재생
타임스탬프를 권위 있게 보존하지 않는다. 따라서 VOD 및 클립 기능을 OTW Play로
이름만 변경하지 않고 별도 음악 카탈로그 capability로 설계해야 한다.

과거 문서인 archive/music-player-member-mvp-review.md의 회원 전용, 단일 트랙
중심 모델과 MVP 플레이리스트 가능성은 현재 요구사항으로 간주하지 않는다.

## 16. 구현 착수 전 미결정 사항

| ID | 항목 | 현재 권장안 |
| --- | --- | --- |
| TBD-004 | 후속 키리누키 채널 승인 기준과 해제 절차 | 관리자 allowlist와 개별 게시 승인 분리 |
| TBD-005 | 후속 단계에서 키리누키가 없는 방송 가창의 공개 여부 | 원본 방송 타임스탬프로 공개 권장 |
| TBD-009 | 첫 오리지널곡·공식 커버곡 데이터 입력 범위와 우선 멤버 | 운영 비용 산정 후 결정 |
| TBD-011 | 전 소속 멤버의 과거 OTW 공식곡 포함 범위 | 현재 표시 정책과 별도로 카탈로그 보존 범위 결정 필요 |
| TBD-012 | 회원이 승인 전 제안을 수정하거나 철회할 수 있는지 | DEC-054로 해결: 본인 `pending_review`만 version CAS로 전체 수정·불가역 철회 |
| TBD-013 | 거절 사유 및 승인 결과를 회원에게 알리는 방식 | DEC-045로 해결: 상태와 일반 문의 안내만 표시, 내부 code·note 비공개 |
| TBD-014 | 회원별 제출 빈도와 중복·스팸 제한 | DEC-045로 해결: KST 일 5회, edge 60초당 3회, 동일 pending/catalog video 차단 |
| TBD-015 | playlist import의 private playlist OAuth 지원 | DEC-056으로 해결: private는 제품 범위에서 제외하고 public·unlisted만 지원 |
| TBD-016 | channel 자동화 canary와 과거 backfill 범위 | DEC-057로 기본 정책 해결: approved 노래 clip channel 1개, backfill 0, 필요 시 최근 20개 수동 import. 실제 channel ID는 운영 전 지정 필요 |
| TBD-017 | 상세 credit 최초 role·출처 범위 | DEC-058로 해결: OTW 멤버의 가창·작사·작곡·편곡·제작 참여만 공식 출처로 검수하고 외부 음악 관계자 상세 credit은 제외 |
| TBD-018 | 다채널 YouTube API Data aggregation·Made for Kids·branding compliance | approved clip channel production 확대 전 채널 권리·운영 관계와 YouTube API compliance 확인 필수 |
| TBD-019 | 최초 자동 구독 노래 clip channel | 실제 channel URL/ID, 운영 주체, clip 사용·게시 승인 범위를 운영 전에 확인 |

기존 TBD-002는 DEC-019로 해결되었다. TBD-001·003·006·007·008은 DEC-029로,
TBD-010은 DEC-044로, TBD-013·014는 DEC-045로, TBD-012는 DEC-054로,
TBD-015·017과 TBD-016의 기본 정책은 DEC-056~058로 해결되었다.
공개 catalog API는 익명이고 회원 제안은 로그인, 검수와 공개 상태 변경은 관리자
권한을 사용한다.

## 17. 변경 관리

요구사항을 변경할 때 다음 순서를 따른다.

1. 변경 이유와 사용자 가치를 기록한다.
2. 관련 결정 ID의 상태를 확정, 변경 또는 폐기로 갱신한다.
3. MVP 범위, 기능 요구사항과 수용 기준에 미치는 영향을 함께 수정한다.
4. 기존 구현이 있는 경우 데이터 마이그레이션과 호환성 영향을 별도로 검토한다.
5. 아래 변경 이력에 요약을 추가한다.

상충하는 아이디어는 기존 확정 결정을 조용히 덮어쓰지 않고, 결정 상태와
대체 관계를 명시한다.

## 18. 변경 이력

| 날짜 | 변경 |
| --- | --- |
| 2026-08-10 | OTW Play 초기 요구사항 기준선 작성 |
| 2026-08-10 | 방송 가창은 승인된 키리누키를 기본 재생 소스로 확정 |
| 2026-08-10 | 전 소속 멤버를 외부 인원으로 표시하도록 확정 |
| 2026-08-10 | 저장형 플레이리스트를 후속 확장 범위로 확정 |
| 2026-08-10 | 첫 구현 범위를 오리지널곡과 공식 커버곡 중심으로 축소하고 방송 가창·키리누키를 후속 범위로 이동 |
| 2026-08-10 | 관리자 직접 등록과 로그인 회원 제안 후 관리자 승인 방식의 공식 커버곡 입력 절차 확정 |
| 2026-08-11 | Clean Architecture, Cloudflare, DB, UI/UX 설계와 단계별 구현 가이드 문서 연결 |
| 2026-08-11 | 제안·공개·품질·소스 가용성 상태 축과 PR-1 계약·순수 domain 경계 명시 |
| 2026-08-11 | PR-2 catalog foundation 권위·관계·dedupe 경계 확정, published partial index는 PR-3으로 연기하고 API·UI·원격 적용은 제외, GATE-01~06은 변경하지 않음 |
| 2026-08-11 | PR-3 proposal·event·search/meta exact schema 경계 확정, proposal channel 제외, fail-closed meta와 application-owned revision·append-only 채택, API·UI·원격 적용 제외, GATE-01~06 유지 |
| 2026-08-11 | PR-5 관리자 catalog command의 인증·YouTube metadata 대조·atomic event/projection/revision 경계를 구현 기준으로 기록. GATE-01은 미확정 상태를 유지하고 proposal approve만 명시적 policy-unresolved 409로 fail closed |
| 2026-08-12 | DEC-024 workflow-first admin catalog 확정. 인물·그룹과 채널의 선행 등록 탭을 제거하고 4단계 YouTube 영상 등록과 통합 atomic command를 기준선으로 변경 |
| 2026-08-12 | DEC-025 영상 유형 우선 등록 흐름 확정. 오리지널·공식 커버는 수동 곡 연결을 생략하고 영상 metadata로 내부 곡을 생성하며, 노래방송의 다곡·구간 연결은 후속 범위로 유지 |
| 2026-08-12 | DEC-025 보완. 공식 커버 등록은 영상 제목을 원곡 정보로 대체하지 않고 원곡 제목과 원곡 가수명을 별도 필수 입력으로 수집 |
| 2026-08-12 | DEC-026 관리자 삭제 정책 보완. 테스트·오입력 정리를 위해 draft·withdrawn 가창과 published가 없는 곡은 확인 후 삭제할 수 있게 하되 현재 게시·승인 proposal·merge 관계는 보호 |
| 2026-08-12 | DEC-027 곡 수정 입력 단순화. 원곡 공개일 입력을 제거하고 원곡 가수를 기존 identity 추천 또는 새 외부 칩으로 직접 수정하도록 확정 |
| 2026-08-12 | DEC-028 가창 전체 수정 확정. 연결 곡, 멤버·외부 참여자와 credit, 모든 분류·품질, 공개일시, YouTube source·채널·구간·역할과 메모를 한 atomic correction으로 편집하고 공개 상태 전이는 별도 command로 유지 |
| 2026-08-11 | PR-4 익명 public endpoint, fail-closed flag, strict query, relevance 우선 정렬, count 없는 cursor 응답, revision cache·ETag와 auth/cookie cache 격리 계약 확정 |
| 2026-08-11 | PR-4 상한 fixture 성능 문제를 파생 participant sort key와 Unicode 2·3 code point 검색 gram으로 보완하고, 공개 read 활성 상태에서 read-model revision 불일치 시 config 이외 조회를 cache 전에 `503`으로 차단하도록 확정. 기존 flag-off `404`, API·DTO·cursor 계약, UI·원격 D1·배포 범위는 변경하지 않음 |
| 2026-08-18 | DEC-029 공개 Play 경험 확정. `/play`, 조건부 `OTW Play` 내비게이션, Play-scoped 단일 player, 접기·이탈 cleanup, versioned session queue와 외부 참여자 exact filter를 채택하고 TBD-001·003·006·007·008을 해결 |
| 2026-08-18 | DEC-030 운영 공개 전 `/play/*` UI를 관리자 preview로 제한. 비로그인·비관리자는 config/catalog 요청을 시작하지 않고, 인증된 관리자 preview만 flag-off catalog를 `no-store`로 읽으며 read-model revision과 익명 public GET 계약은 유지 |
| 2026-08-18 | DEC-031 공개 Play 정보 구조 재배치. `/play` Home과 `/play/discover`를 분리하고 데스크톱 우측 플레이큐·하단 재생바, 모바일 하단 재생바·플레이큐 sheet를 PlayShell에 유지 |
| 2026-08-18 | DEC-032 Play chrome 정렬 및 조작 보강. 상단·하단 64px 기준을 좌측 메뉴와 맞추고, 발견 대표 배너 수동 전환과 재생바의 현재 곡 상세 펼치기를 추가 |
| 2026-08-18 | DEC-033 공개 Play 탐색 단순화. Home과 Discover를 `/play`로 통합하고, 전체 곡·오리지널·커버 진입점을 `/play/songs`의 `곡 검색`과 관계 필터로 통합 |
| 2026-08-18 | DEC-034 음악 앱 프레임 재정리. `/play` 라벨을 `발견`으로 바꾸고 헤더 검색, 중앙·queue 내부 스크롤, iframe 없는 우측 플레이큐와 단일 iframe을 소유하는 하단 확장 player를 채택 |
| 2026-08-18 | DEC-035 발견 밀도 보강. 겹친 hero card를 단일 full-width 배너로 평면화하고 최근 공개곡 card list를 compact table로 교체해 데스크톱 viewport 안의 탐색 밀도를 높임 |
| 2026-08-18 | DEC-034·036 player/queue UX 보정. 재생은 상세 panel을 자동 확장하지 않고 정책 크기를 지킨 미니 player를 유지하며, 상세 접기 중에도 재생을 지속한다. 같은 performance의 queue duplicate는 방지하고 기존 항목 선택·이동과 repeat로 의도를 분리함 |
| 2026-08-18 | DEC-034 player chrome 재보정. 접힌 상태의 미니 iframe과 플레이큐 하단 시각 안내를 제거하고 64px 재생바만 유지함. 재생바에 음소거·볼륨 slider를 추가하고, YouTube iframe은 펼친 상세에서만 표시하며 접을 때 pause하도록 정책 경계를 명확히 함 |
| 2026-08-18 | DEC-034 재생 지속 우선순위 재확정. 첫 재생에서 상세 metadata는 자동 확장하지 않고 정책 크기의 미니 player만 표시하며, 상세 접기는 같은 iframe을 유지해 재생을 계속함. 최근 공개곡은 hero 포함 최신 5곡을 모두 표시함 |
| 2026-08-18 | DEC-037 모바일·태블릿 player 재구성. 1024px 미만은 첫 재생 시 전체 화면 Now Playing에서 영상·재생 조작·볼륨·세션 queue를 제공하고 카탈로그 복귀 전에 pause함. 데스크톱은 접기·펼치기 없는 216px dock과 356×200px 단일 iframe으로 고정함 |
| 2026-08-18 | DEC-034·037 player 배치 단순화. 데스크톱 하단 재생바를 제거하고 356×200px 단일 player를 우측 380px panel의 플레이큐 위에 배치함. 1280px 미만은 하단 bar 없이 전체 화면 Now Playing과 원형 재진입 버튼만 사용함 |
| 2026-08-19 | DEC-038 우측 player 정보 계층 정리. 상태 문구를 제거하고 모든 재생 조작을 한 row로 통합했으며, 게시자 avatar·channel·곡 상세 row와 실제 재생 위치 기반 progress·진행/남은 시간을 추가함 |
| 2026-08-19 | DEC-039 YouTube iframe chrome 최소화. 공식 parameter로 controls·fullscreen·keyboard·annotation을 끄고 related video를 같은 channel로 제한했으며, 지원되지 않는 CC 강제 해제나 overlay 가림은 사용하지 않음 |
| 2026-08-19 | DEC-040 낮은 데스크톱 화면 대응. 640–719px에서는 player 정보를 압축해 queue 최소 높이를 보장하고, 640px 미만에서는 iframe을 계속 보인 채 현재 재생 정보와 플레이큐를 전환해 queue가 화면 밖으로 밀리지 않도록 함 |
| 2026-08-19 | DEC-040·041 정보 우선순위와 태블릿 재생 지속 보완. 높이 720px 미만에서는 참여자를 유지하고 게시자 identity만 먼저 숨기며, 640–1279px 카탈로그 복귀는 같은 200×200px iframe의 우측 하단 miniplayer로 전환하도록 확정 |
| 2026-08-19 | DEC-042 player identity 계층 보완. iframe 아래 곡명·참여자 profile/name을 가장 먼저 두고 음악/가창 분류·progress·transport·게시 채널 순으로 재배치해 가창자와 업로드 주체를 분리 |
| 2026-08-19 | DEC-043~045 회원 공식 커버 제안 E2E 확정. 회원 전용 private route, `official_cover_v1` 승인 정책, KST 일 5회·edge 분 3회 제한과 반려 상태만 공개하는 경계를 채택하고 GATE-01·05·06을 해결 |
| 2026-08-19 | DEC-046 회원 제안 진입 통합. 전역 `곡 제안` 메뉴를 `OTW Play` 하나로 합치고 shared Play header의 `새 곡 제안`·`내 제안` 메뉴, 입력 보존형 wizard와 권위 성공 결과를 채택 |
| 2026-08-19 | DEC-047 가창 credit 역할. 회원 제안 역할 입력과 관리자 승인값 편집, 공개 표시의 메인 보컬 우선 기준을 확정 |
| 2026-08-19 | DEC-048 공개 credit 계층 조정. 발견·목록·Player·queue는 메인 보컬만 표시하고 곡 상세는 역할별 전체 credit, 곡 검색은 독립 `participantRole` 조건을 제공하도록 확정 |
| 2026-08-19 | DEC-049 곡 음악 분류와 표시 계층 확정. 확장형 song tag를 관리자 등록·수정과 공개 DTO에 추가하고 performance 분류는 보조 metadata로 낮추며 Play 탭 전환 중 단일 player를 유지 |
| 2026-08-20 | PR-7.1 회원 제안·관리자 승인과 PR-7.2 곡 태그·player 지속성, 리뷰 보완 및 YouTube 재생 안정화를 완료하고 원격 migration 0053–0055 적용 뒤 PR-8 운영 공개 준비로 전환 |
| 2026-08-20 | DEC-050 단계적 공개 확정. PR-8을 직접 경로·SEO, source health, 관측·운영 switch로 분리하고 public read 검증 뒤 navigation을 노출하도록 명시 |
| 2026-08-20 | DEC-051 PR-8C 전달·관측 경계 확정. source-health 계측을 위해 PR-8B 위에 stack하고 Workers Logs와 Analytics Engine을 개별 진단·24시간 집계로 분리하며 공개 전환을 단일 감사 command로 제한 |
| 2026-08-20 | PR-8A/B/C 병합·production 배포와 migration 0056 적용을 완료하고 flag `0/0`을 유지한 채 운영 closeout으로 전환. DEC-052와 P0~P4 후속 우선순위를 확정하고 인증 스모크·catalog 정비·단계적 공개는 지속 운영 항목으로 분리 |
| 2026-08-20 | DEC-052를 변경하고 DEC-053~055 확정. playlist 벌크 candidate와 pending proposal 수정·철회를 P0-A, channel WebSub 자동 후보를 P0-B, 운영 검증을 P0-C, 상세 credit·멤버 노래책을 P1로 재배치하고 세 개의 별도 조사 보고서 연결 |
| 2026-08-21 | DEC-056~058 확정. public·unlisted playlist와 Queue 운영안을 채택하고 private OAuth를 제외. channel 자동화 대상을 공식 channel이 아닌 approved 노래 clip channel의 `singing_clip` 후보함으로 변경. credit을 OTW 멤버 참여 정보와 멤버 노래책·SEO로 축소하고 외부 음악 관계자 graph를 제외 |
| 2026-08-24 | DEC-059 확정. playlist 후보의 공통값 일괄 설정 UI를 제거하고, 행별 sticky 검수 form에 실제 저장 draft 기준의 즉시 적용 미리보기를 추가. 선택은 ready 후보의 draft 변환 범위에만 사용 |
| 2026-08-24 | DEC-060 확정. 수집 중 metadata 갱신으로 인한 version 상승은 review input·status baseline이 같을 때만 저장을 이어가고, 실제 동시 검수는 409로 차단하면서 행 입력값을 유지하도록 후보 CAS를 분리 |
| 2026-08-24 | DEC-061 확정 및 DEC-059 보완. 적용 미리보기를 sticky 편집 form에서 영상 목록 행으로 이동하고, job 전체의 확인된 숨김·삭제·embed·지역 차단·재생 불가 후보를 CAS 기반 100건 단위로 일괄 제외하되 unknown·정책 검토 후보는 보존 |
| 2026-08-24 | DEC-060 보완. 반복 metadata 수집이 ready·ignored·converted 수동 결정을 되돌리지 않게 하고, origin의 existing_candidate와 실제 candidate 분류를 분리해 기존 catalog·channel/policy 거부를 동시 검수 409가 아닌 validation으로 안내 |
| 2026-08-24 | DEC-062 확정 및 DEC-059 보완. 후보 검수에 공식 채널 인라인 승인·재분류를 포함하고, 선택 checkbox 대신 job 전체 ready 완료 항목을 일괄 draft 저장하며 converted·ignored 항목은 기본 목록에서 제외. 변경 예정 값은 영상 아래 가로 항목으로 재배치 |
| 2026-08-24 | DEC-063 확정. 후보 상태를 workflow 단계·현재 권위 판단·다음 조치·가져오기 기록으로 분리해 한국어로 표시하고, 신규 채널 승인은 OTW 공식·catalog member identity 공식을 기본으로 제한. 소유 유형 카드는 2열로 폭을 채우고 archive되지 않은 OTW 멤버는 내부 스크롤 없이 모두 표시하며, 외부 채널은 별도 모드에서 non-member 주체 연결과 명시적 승인 확인을 모두 요구 |

## 19. 참고

- YouTube IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- YouTube Player Parameters: https://developers.google.com/youtube/player_parameters
- YouTube API Services Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- Musicdex: https://github.com/HolodexNet/Musicdex
- VTuber Songlist: https://vtuber.song-db.com/
- 과거 검토 기록: archive/music-player-member-mvp-review.md
