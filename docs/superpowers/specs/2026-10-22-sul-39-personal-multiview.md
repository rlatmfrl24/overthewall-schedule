# SUL-39 — 사이트별 개인 멀티뷰 채널 설계

상태: **2026-10-22 사용자 구현 승인, 로컬 구현·대표 흐름 검증, 전체 수용은 일부 미검증**. 2026-10-22 KST.

## 확정 범위

- 사용자가 확정한 범위: OTW와 LuvDia, 로그인한 일반 회원, 치지직 채널, 사이트별 독립 저장. 유료 회원 조건이나 두 사이트 사이의 목록 동기화는 없다.
- 2026-10-22 사용자가 사이트별 30개 저장·동시 선택 8개·비회원 흐름 유지를 조건으로 로컬 구현을 승인했다. 원격 migration·외부 게시·배포는 포함하지 않는다.
- 검토 기준 소스: `f6be40ba40a9a305224a40d209e2cebb2e940082`. 기존 `codex/worker-teardown-20261022` 작업은 보존한다. 실행 시 최신 소스와 [현재 작업](../../current-work.md)을 다시 대조한다.
- 30개 저장·8개 선택은 사용자가 확정했다. 나머지 세부 동작은 승인된 계획을 따르며 구현 중 판정은 ledger와 검증 보고서에 남긴다.

## 사용자 동작

`/multiview` → `신규 채널 추가하기` 버튼 → 같은 제목의 팝업에서 치지직 URL/채널 ID 입력 → `추가하고 저장` → 서버가 채널 확인 후 저장 → 팝업 닫힘·목록 선택 안내 → 목록에서 선택 → 기존 `Mul.Live에서 보기`로 새 탭 이동. 비회원은 팝업의 설명을 본 뒤 Clerk 로그인하며, 돌아온 화면에서 같은 추가 버튼으로 진행한다. 팝업이나 입력 폼을 자동으로 열지 않는다. 기본 목록에 없는 치지직 방송도 사이트별로 저장해 다음 방문에 재사용할 수 있음을 화면의 짧은 안내와 팝업 설명에 명시한다.

1. **회원 1명당 사이트별 30개 저장**. OTW 30개와 LuvDia 30개를 각각 허용한다. 기본 제공 멤버는 자동으로 개인 목록에 저장하지 않으며 한도를 소비하지 않는다. 회원이 명시적으로 저장한 채널만 센다.
2. **동시 선택 8개 유지**. 저장 한도와 시청 선택 한도는 별개다. 기존 `MAX_MULTIVIEW_CHANNELS`/8개로 잘라내는 URL helper를 저장 목록에 사용하지 않는다.
3. 기본 멤버와 저장 채널의 ID가 같아도 선택 카드는 하나다. 기본 멤버의 공개 프로필을 우선하며 기본 멤버에는 삭제 메뉴를 제공하지 않는다. 개인 저장 행과 겹쳐도 삭제 메뉴를 숨긴다. 직접 저장한 행은 기본 목록과 겹쳐도 개인 저장 1개로 센다.
4. 목록 순서는 추가 시각 오름차순, 동률이면 채널 ID 오름차순이다. 선택 화면의 기존 방송 상태·유닛 순서는 유지한다. 개인 채널에 가짜 멤버 UID나 소속을 만들지 않는다.
5. 저장 목록을 읽어도 현재 선택을 자동 변경하지 않는다. 반복 `c=` URL과 브라우저 뒤로 가기, 직접 연 공유 링크가 선택의 기준이다. URL이 없으면 기존처럼 미선택으로 시작한다.
6. 기본 멤버가 아닌 직접 추가한 개인 채널만 카드 안의 더보기 메뉴에서 `저장 목록에서 삭제`할 수 있다. 선택 버튼과 메뉴 버튼은 중첩하지 않는다. 삭제는 본인 북마크만 제거한다. 이미 선택한 채널은 URL에 남아 계속 시청할 수 있고 기존 ‘목록에 없는 선택 채널’에서 선택 해제할 수 있다. 삭제 확인창·전체 삭제 기능은 추가하지 않는다.
7. 로그아웃/계정 전환 시 이전 계정의 저장 목록·사진·이름·방송 상태가 남지 않는다. URL의 공개 채널 ID 선택은 개인 저장과 구분해 유지한다. 미저장 공유 ID의 메타데이터를 개인 API로 조회하지 않는다.
8. 비회원에게 기존 멤버 선택은 계속 제공한다. `신규 채널 추가하기` 버튼을 누르면 팝업에서 로그인 필요·사이트별 저장·다음 방문 재사용을 설명하고 로그인 버튼을 표시한다. Clerk를 열 때 기존 팝업을 닫아 초점 함정이 겹치지 않게 한다. 로그인 전 개인 API는 호출하지 않는다.
9. 30개 도달 시 `채널은 사이트별로 최대 30개까지 저장할 수 있어요. 기존 채널을 삭제한 뒤 추가해 주세요.`를 표시한다. 삭제·기존 채널 선택·시청은 계속 가능하다. 중복 추가는 한도 도달 상태에서도 기존 행을 반환한다.
10. 실제 저장 성공 응답 전에는 성공을 표시하지 않는다. 추가/삭제 요청 실패 시 입력과 기존 목록을 보존한다. 저장은 성공했으나 후속 GET이 실패하면 `저장됐지만 목록을 다시 불러오지 못했어요. 다시 불러와 주세요.`와 재조회 제어를 표시하며 저장 실패로 오인시키지 않는다. 목록 자체를 읽지 못한 상태를 ‘저장 0개’ 성공 화면으로 표시하지 않는다. 방송 상태 조회 실패는 해당 채널의 `상태 확인 불가`이며 휴방 판정이나 북마크 삭제가 아니다.

30개는 기본 멤버 외에 여러 시청 조합을 보관할 여유를 주면서, 개인 목록을 팔로우 전체 수집기로 확장하지 않는 초기 한도다. 사용량 통계로 산정한 수치는 아니다. 운영 후 한도 도달 비율과 외부 호출량을 관측해 조정하며 이번에 무제한·등급별 한도·설정 UI를 만들지 않는다.

## 데이터·권한

각 Worker가 기존 `otw_db` 바인딩으로 자신의 DB만 사용한다: OTW `otw-db`, LuvDia `luvdia-db`. 클라이언트가 사이트·소유자를 지정하는 API는 없다. Clerk 사용자 ID의 사이트 간 동일성도 가정하지 않는다.

새 `multiview_channels` 테이블은 `owner_user_id TEXT NOT NULL`, `channel_id TEXT NOT NULL`, `channel_name TEXT NOT NULL`, `channel_image_url TEXT NULL`, `added_at INTEGER NOT NULL`을 갖는다. 복합 PK는 `(owner_user_id, channel_id)`이고 `(owner_user_id, added_at, channel_id)` 인덱스로 목록을 읽는다. ID는 소문자 32자리 hex, 소유자·이름은 비어 있지 않아야 한다. `members` FK·전역 설정·다른 사이트 데이터 복사를 사용하지 않는다.

추가 한도는 JS의 사전 COUNT만으로 판정하지 않는다. 소유자 범위 COUNT를 포함한 **한 INSERT 문장**으로 30개 미만일 때만 저장하고 중복 키는 무시한 뒤 소유자/채널로 재조회한다. 29개에서 다른 채널 동시 추가 시 하나만 성공해야 한다. 중복은 기존 행 반환, 실제 가득 찬 신규 추가는 409다. 삭제 역시 항상 소유자와 채널을 함께 조건으로 사용한다.

기존 공개·보관 정책은 [현행 공개 정책](../../operations/site-publication.md)을 따른다. 사용자가 직접 입력한 외부 공개 치지직 정보만 개인 북마크로 취급한다. 사이트 비공개 멤버·보관 콘텐츠를 조회해 이름·프로필·내부 링크를 보충하거나 공용 CHZZK/VOD/일정 허용 목록을 넓히지 않는다. 개인 채널을 일정·VOD 수집 대상에 등록하지 않는다.

## API 계약

모든 개인 API는 서버의 `authenticateRequest`로 인증하며, 성공·실패 모두 `Cache-Control: no-store`, `Vary: Authorization, Cookie`를 적용한다. route manifest의 기존 `member-policy` 표기를 쓰되 개인 API는 **두 사이트 모두 항상 로그인 필수**다. manifest 표기만으로 권한 검사가 실행된다고 가정하지 않는다.

| 메서드·경로 | 입력 | 200 응답 |
| --- | --- | --- |
| GET `/api/multiview/me/channels` | 없음 | `{ items: SavedMultiviewChannel[], limit: 30 }` |
| POST `/api/multiview/me/channels` | `{ input: string }` | `{ item: SavedMultiviewChannel }`; 중복도 동일한 200 |
| DELETE `/api/multiview/me/channels/:channelId` | 정규화된 채널 ID | `{ deleted: true }`; 없는 본인 행도 동일 |
| GET `/api/multiview/me/live-status` | 없음 | `{ items: MultiviewLiveStatusItemDto[], updatedAt: string }` |

`MultiviewChannelMetadata = { channelId: string; channelName: string; channelImageUrl: string | null }`, `SavedMultiviewChannel = MultiviewChannelMetadata & { addedAt: number }`. 시각은 서버 epoch ms이며 `updatedAt`만 ISO 문자열이다. `MultiviewLiveStatusItemDto.content: null`은 확인 불가다. 실제 polling 응답의 channelId/status/liveTitle/concurrentUserCount만 필수이고 이름/사진은 생략될 수 있다. 기존 공개 CHZZK DTO는 변경하지 않는다.

- 입력: trim 후 1~2,048자. 32자리 hex ID 또는 **HTTPS·정확한 `chzzk.naver.com`·자격증명/비기본 포트 없는** URL의 `/{id}`, `/live/{id}`, `/channel/{id}`만 허용한다. HTTPS 기본 포트 443, 마지막 `/`, query, fragment는 허용하고 ID만 정규화한다. 서버가 입력 URL 자체를 fetch하지 않는다. 저장 입력의 검증을 기존 공개 URL 선택 parser 변경으로 대체하지 않는다.
- POST body는 UTF-8 최대 4,096 bytes. `input` 외 필드, 잘못된 JSON, 예기치 않은 query는 거절한다. DELETE의 path ID도 검증한다.
- 오류는 기존 `{ error: { code, message } }` 형태: 400 `MULTIVIEW_INVALID_INPUT`, 401 `MULTIVIEW_AUTH_REQUIRED`, 404 `MULTIVIEW_CHANNEL_NOT_FOUND`, 409 `MULTIVIEW_CHANNEL_LIMIT`, 413 `MULTIVIEW_BODY_TOO_LARGE`, 429 `MULTIVIEW_RATE_LIMITED`, 503 `MULTIVIEW_UNAVAILABLE`.
- 일반 목록 GET·DELETE는 외부 API가 실패해도 동작한다. live-status는 서버가 **본인 저장 목록**에서 조회 대상을 얻으며 임의 `channelIds`·`ownerUserId`·`siteId`를 받지 않는다. 한 채널의 upstream 실패가 다른 채널 상태를 없애지 않는다.

## 외부 정보·비용

추가 시 이름·사진은 기존 수집 코드에서도 사용하는 `GET https://api.chzzk.naver.com/service/v1/channels/{channelId}`의 공개 채널 조회로 확인한다. 사용자 지적 후 실제 무인증 요청에서 HTTP/code 200, 요청과 같은 channelId, 이름·사진·openLive를 확인했다. 이 조회를 추가의 정상 경로로 직접 사용하며 수집기의 9004 fallback 발생을 전제로 하지 않는다. 응답 ID·이름을 검증하고 HTTPS 이미지 URL만 저장한다. 명확한 채널 없음만 404; 429·네트워크·잘못된 응답은 503이며 저장하지 않는다.

새 Client key나 사용자의 치지직 OAuth는 필요하지 않다. 공개 웹 API의 구조 변경 위험은 존재하므로 엄격한 응답 검증·timeout·503 보존 처리를 둔다. 이름·사진은 추가 시의 snapshot이며 정상 live 응답의 최신 이름을 화면에서 쓸 수 있다. 정기 메타데이터 갱신 작업은 추가하지 않는다.

방송 상태는 기존 CHZZK polling reader를 재사용하되, 새 개인 경로는 debug 오류·stale 응답·채널 ID 불일치·invalid content를 `content: null`로 처리한다. 개인 조회는 동시 4개, 채널당 5초 timeout, 화면 표시 중 90초 간격, 백그라운드 refetch 없음이다. 기존 public/수집용 9004 처리의 의미를 변경하지 않는다. 임의 채널 확장으로 기존 메모리 캐시가 무제한 증가하지 않도록 live 캐시를 512개로 제한하며 TTL 60초를 유지한다.

추가와 개인 상태 조회에 전용 `MULTIVIEW_RATE_LIMITER`를 적용한다: 각 동작별 `(siteId,userId,action)` 키에 60초당 6회. Cloudflare의 분산 burst 완화 수단이며 전역 강제 quota라고 설명하지 않는다. 바인딩 실패는 해당 두 경로만 503으로 처리하고 목록/삭제/공개 선택은 유지한다. 저장 한도는 DB가 별도로 보장한다.

30개 전체를 90초마다 조회하면 캐시가 전혀 없을 때 개인 채널 polling은 탭당 분당 약 20회다. 기존 재시도는 이 상한 계산에 포함하지 않았다. 실제 quota·캐시 효과·동시 사용자 부하는 미측정이므로 출시 전 정상 계정 최소 표본으로 확인한다. Cron·D1 캐시 쓰기·관측용 ledger 쓰기는 추가하지 않는다.

## 완료 판정과 제외

양 사이트 각각 일반 회원으로 실제 UI 추가 → 목록 API 재조회 → 새로고침/재로그인 복원 → 기본 멤버와 함께 최대 8개 선택 → Mul.Live 새 탭 이동 → 저장 삭제·재조회가 확인되어야 한다. A/B 계정 격리, 양 사이트 독립 저장, 29→30 경합, 중복, 외부 오류, 공유 URL 보존을 함께 확인한다. 로컬 증거와 운영 반영 증거를 구분한다. 실재 외부 채널·정상 인증 경로가 안 되면 기능 검증 완료로 올리지 않는다.

검색어 기반 스트리머 검색, 플랫폼 확장, 폴더·순서 편집·프리셋, 목록 동기화·공유, 내장 재생·전용 확장 프로그램, 관리자 채널 등록·자동 수집은 제외한다. Node `>=24.20.0 <25`, pnpm `11.7.0`, 기존 의존성·React/TanStack Query·Worker/D1/Drizzle 구조를 사용한다. 2026-10-22 사용자가 이 계획의 구현을 승인했다. 원격 작업·배포 승인은 포함하지 않는다.
