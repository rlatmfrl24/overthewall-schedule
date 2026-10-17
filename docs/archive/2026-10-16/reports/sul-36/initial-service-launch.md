> 2026-10-16 아카이브: 당시 계획·검증 기록입니다. 미완료 표기를 현재 실행 지시로 사용하지 않습니다. 남은 작업과 중단 조건은 [현재 작업](../../../../current-work.md)을 따릅니다.

# SUL-36 초기 서비스 개통 기록

## 초기 서비스 판정

2026-10-15 21:10 KST 기준 **초기 서비스 개통 완료**다. 실제 HTTPS 도메인, 별도 Google/Clerk 로그인·관리자 권한, 세 멤버의 핵심 콘텐츠, 정상 관리자 등록·수정과 자기 D1 readback, 원본 복구 백업과 자원 독립성을 확인했다. 홈의 정상 메뉴에서 Play로 이동해 세 멤버·실제 곡·플레이리스트가 표시됨도 확인했다. 조회·저장 증거는 아래에 구분하며, 전체 Task 4.4나 자동 수집 활성화 완료 판정이 아니다.

사용자는 후속 확인에서 **Chrome의 음악 재생도 정상**이라고 알렸다. 이전 일반 프로필 재생 실패는 당시 관측으로 보존하되 현재 미해결 항목에서는 제외한다. 플레이어의 효과 없던 변경과 임시 진단은 모두 제거됐고, 확장 설정을 변경하거나 특정 확장을 원인으로 확정하지 않았다. 과거 R2 사고의 사고 전 상태·이용자 영향은 별도 미확인 항목으로 유지한다.

## 현행 목표와 허용 범위 (2026-10-15)

사용자는 이전 무중단·완전 이관 선행 조건을 대체하고 **2026-10-17 KST 이내 가능한 빠른 실제 개통**을 우선했다. 필수 운영 자원 생성, 별도 Clerk·도메인 연결, 초기 콘텐츠 복사와 검증된 최초 수동 배포를 허용했다. OTW 쓰기·수집 또는 전체 서비스 중단도 허용하며, OTW 재개는 LuvDia 개통의 선행 조건이 아니다. 원본은 삭제하거나 덮어쓰지 않는다.

- 개통 전 필수: 독립 Worker·D1·R2, 실제 Clerk 로그인·현재 관리자, 실제 도메인 HTTPS, 세 사람의 복사 가능한 프로필·일정·Play 곡/가창/참여 관계·게시물과 우선 파일, 자기 DB 저장/새로고침 확인, 원본 보존·제외 항목 기록.
- 개통 후 보완: 전체 과거 자료·파일 완전성, 복잡한 공동 관계, 전체 수집 상태·재시도 승계, 자동 수집·AI 순차 활성화, 성능·비용 최적화, 두 사이트 자동 배포.
- 중단: Task 4.4 전체/9조건 완료를 개통 선행 조건으로 삼는 작업, 실시간 Worker 간 인계·범용 복구 추가, 실행 중 AI/Queue/lease/outbox 재실행 구조, 관련 없는 일괄 정리.

복사 기준 쓰기를 중지하고 일회성 복사를 사용한다. 공개·회원·관리자 접근을 유지하며 일반 계정·개인 플레이리스트·인증 정보는 복제하지 않는다. 안전하지 않은 관계만 보류하고 원본 증거는 남긴다. 준비되지 않은 자동화는 명시적으로 비활성화한다. 정상 핵심 동선에는 OTW Worker/DB 의존이나 가짜 전환 완료 기록을 두지 않는다.

## 현재 확인한 자원

- 사용자 도메인: `luvdia-schedule.info`, 기존 Cloudflare 계정의 active zone. Zone ID `98afdb876d4fab75f32e9316b4b7475d`.
- Cloudflare account: `46e1801b290196fbec7cfae87710ffcf`.
- 원본 D1: `otw-db`, `133b980d-1701-427e-93fd-8c9dcca1132e`. 원본 R2: `otw-schedule`.
- 신규 D1: `luvdia-db`, `ce8eec7f-0922-4119-ab75-f67133b94312`, APAC, 생성 확인.
- 신규 R2: `luvdia-schedule`, 생성 확인. 기존 런타임 binding `otw_db`/`ASSET_BUCKET`은 공통 코드 계약으로 유지한다.
- 별도 기존 Clerk app `app_3KfDrOsTWZcifcq86ogNbIBAjSZ`, 새 production instance `ins_3KiwTiQouiq8JgIPdb4jFr639hZ`. Frontend API `clerk.luvdia-schedule.info`, portal `accounts.luvdia-schedule.info`, 메일 DNS 5개 Verified. 사용자가 지정한 Google 계정의 verified email·연결 provider·활성 세션을 확인하고 자체 Worker의 `CLERK_ADMIN_IDS`에 연결했다.
- 개통 설정은 Queue/Workflow binding 없음, Cron 없음, AI false다. 수집 설정도 비활성화한다. 수동 일정/게시글/Play 저장은 기존 경로를 사용한다.

## 실제 검증과 진행 기록

새 target DB/control 0행, peer·모든 Queue·Workflow binding 없음에서 핵심 HTTP 로컬 묶음 PASS: 프로필, 일정 권한·저장·조회, 관리자 곡 생성·원가수 FK, 공연 공개·참여/영상 DTO·stale 409, 기존 Play 공개 두 단계 CAS·회원 조회, 공지 생성/조회, 프로필 파일, AI 503·수집 paused, 추가 Queue/AI row 0, FK 검사 0건. `.tmp/sul36-launch-core-owning4.log`, 1 PASS. 실제 Clerk/provider/원격 데이터/사용자 UI 증거와는 구분한다.

배포 설정/manifest/local config/doctor 단위 검증: 4 files, 26 PASS. Queue 없는 구성은 Cron·Workflow·AI가 모두 꺼져야 하며, Queue가 있으면 기존 전체 이름·DLQ·사이트 격리 검증을 유지한다.

해당 배포 script/config 검증의 변경 4파일 ESLint PASS. 실제 배포 설정 API readback에서도 자체 D1·R2 연결, Service/Queue/Workflow binding 0개, Cron 0개를 확인했다. 비밀키의 값은 readback 증거에 저장하지 않았다.

## 운영 실행과 원본 보존

2026-10-15 17:53:49 KST 기준으로 OTW 전체 요청을 별도 점검 Worker로 돌리고, Cron 0개·기존 Queue 6개 delivery paused·실행/대기 Workflow 0개를 확인했다. 원본 D1의 86개 테이블에는 복구 가능한 쓰기 차단 트리거 258개를 추가했다. 실제 동일 값 UPDATE도 `SUL36_LAUNCH_SOURCE_READ_ONLY`로 거부됐다. 이번 최초 복사·배포 실행은 원본 업무 행과 R2 파일을 삭제하거나 덮어쓰지 않았다. OTW 재개는 별도 운영 작업이다.

복구 자료는 scratch 밖 `C:\Users\rlatm\Documents\OTW Backups\SUL-36\2026-10-15T085349Z`에 보관했다. 중단 전 SQL(37,271,983 bytes), 최종 동결 SQL(37,316,413 bytes), 원본 Worker 스크립트·설정·배포·Cron·route·Queue 상태, freeze/unfreeze SQL, 복사 manifest를 포함한다. 최종 동결 SQL SHA-256은 `a5df4caeeece474a0a105b05d24def722e75a2bf8b433d9784041e28608de939`다.

10월 14일의 허용 범위를 넘긴 R2 업로드 사고는 [별도 기록](../../../../reports/sul-36/operational-upload-incident.md)을 유지한다. 사용자 허용으로 이미 읽어 둔 7개 body·metadata 14,215,562 bytes도 복구 자료에 보존한다. 이 자료는 사고 후 관측값이며 사고 전 파일 복원이나 무해함의 증거가 아니다. 최초 개통의 원본 보존 검증으로 이 사고를 종결하지 않는다.

점검 화면은 사용자 요청대로 LuvDia 언급을 제거했고 실제 OTW 응답에서 확인했다. 점검 Worker 현재 version은 `fbdf076b-64c6-4ae4-856f-2dcd2e316f32`다.

## 실제 일회성 복사와 배포

신규 DB에는 기존 migration 0136까지 적용했다. 빈 DB에서 0030이 기존 roster seed를 요구해 실패한 부분은 기존 로컬 초기화의 임시 bootstrap 8명 절차를 재사용하고 적용 뒤 정확한 임시 행을 제거했다. migration을 수정하거나 적용 완료를 조작하지 않았다.

동결 SQL에서 세 사람과 관련 관계를 선택해 실제 target DB에 복사했다.

| 자료 | 복사·readback 수 |
| --- | ---: |
| 멤버 / 프로필 이미지 | 3 / 3 |
| 일정 | 1,100 |
| 카페 게시물 / X 게시물 / 공지 | 152 / 1,033 / 1 |
| 곡 / 가창 / 참여 관계 | 64 / 67 / 128 |

대상 외 공동 참여자 5명은 원래 이름·entity ID·크레딧을 유지하되 `member_uid=null`로 두었다. LuvDia 멤버는 3명이며 잘못된 멤버 관계를 만들지 않았다. FK 검사 0건, 전환 control·개인 playlist·AI/작업 복제 0행을 확인했다. 현재 프로필의 과거 소속 소개만 개인 방송인으로 정리했고 원본 소개는 보존했다.

선택한 콘텐츠에는 R2 첨부 참조가 없었다. 필요한 프로필 3개는 공통 소스의 정적 파일을 LuvDia의 자체 Worker Assets에 배포했고 실제 HTTPS 200과 파일 크기를 확인했다. 카페 외부 이미지 57개는 기존 provider URL을 유지한다. 전체 R2 cache/history 복사는 개통 범위에 포함하지 않았다.

첫 SQL bulk import는 `D1_RESET_DO`로 실패했으며 readback상 핵심 테이블 0행으로 rollback됐다. 이어 literal INSERT batch는 `SQLITE_NOMEM`으로 중단됐다. 기존 target 행의 전체 입력 값을 검증한 뒤 bound parameter INSERT로 남은 행을 복사해 완료했다. 실패 기록과 진행 기록은 `.tmp/luvdia-launch/`에 보존했다. 무조건 ignore/upsert하거나 실패를 성공 처리하지 않았다.

기존 `scripts/deploy-workers.mjs --site=luvdia` 경로로 실제 최초 배포를 완료했다. version `cb84ca68-35df-445e-9a27-56b408aca059`, 도메인은 https://luvdia-schedule.info 이다. 독립 D1·R2·Analytics·rate limit을 사용하며 peer Service binding·Queue·Workflow·Cron이 없다. 서버 비밀 설정은 자체 Clerk issuer/authorized parties·확인된 자체 관리자 ID와 기존 정책에 따른 YouTube metadata 키를 연결했다.

배포 전 실제 build의 HTML asset 처리 순서 오류(`EISDIR`)는 기존 SEO HTML transform을 `pre`로 실행하는 최소 수정으로 해결했다. 실제 build 재실행 PASS, 회귀 6개·해당 3파일 lint PASS다. 배포 내 remote doctor PASS: migration 누락 없음, 가창/정렬 67개 일치, catalog/read model revision 2 일치, posting 2,272개·gram 1,519개와 기대값 일치, missing/unexpected/drift 0건이다.

## 실제 사용자 흐름과 남은 개통 확인

- 실제 HTTPS 홈에서 세 사람의 프로필 이미지·개인 방송인 표기·10월 15일 일정·복사 공지와 CHZZK live 표시를 확인했다. `/feed`에서 복사된 X 게시물이 정상 표시된다. 이 조회는 OTW가 점검 중인 상태에서 수행했다.
- Clerk의 별도 production 앱과 DNS 5개를 연결했다. 계정 포털의 `/sign-in`·`/sign-up`은 실제로 열린다. 포털 root URL은 로그인 진입점으로 사용하지 않는다.
- Google 가입 실패 원인은 production Google 연결의 custom credential 누락이었다. 사용자의 구체적 승인 후 기존 `soulkey-rosemary`에 `LuvDia Schedule` 전용 web OAuth client를 생성하고 해당 Clerk production 연결에 저장·재조회했다. origin은 `https://luvdia-schedule.info`, callback은 `https://clerk.luvdia-schedule.info/v1/oauth_callback`이며 openid/email/profile 범위만 사용한다. Google 프로젝트는 외부 사용자·프로덕션 상태다. OTW OAuth client는 변경하지 않았다. secret은 문서·로그·프런트엔드에 기록하지 않는다.
- 설정 전의 `Missing required parameter: client_id` 오류 페이지에서 가입을 새로 시작해, 전용 client ID·정확한 callback·세 범위의 요청이 Google 계정 선택 화면에 정상 도달함을 확인했다. 실제 계정 선택·가입 완료는 사용자에게 넘겼다.
- 가입 전 운영 `/admin`에 로그아웃 상태로 직접 진입하면 실제 Clerk 로드 후 `로그인이 필요합니다 / 관리자 전용 페이지입니다`와 로그인 버튼이 표시됨을 확인했다. 당시 Users의 `No users yet`는 가입 전 관찰이며 현재 상태가 아니다.
- 19:52 KST 사용자의 실제 Google 가입·로그인 후 지정된 이메일의 verified Google 사용자 `user_3KjCLxLcQQqUTepbJn93l0TkaRk`를 확인했다. 서버 관리자 목록에 연결하고 홈의 정상 관리자 메뉴 → 운영 대시보드 → Play 관리에서 곡 64개·가창 67개를 조회했다. 기존 OTW 관리자 설정은 변경하지 않았다.
- 19:56 KST 정상 일정 수정 dialog에서 유리리의 10월 15일 일정(id 3133) 제목만 `시간변동` → `시간 변동`으로 저장했다. 새로고침 후 표시와 target D1 readback을 확인했다. 다른 target 필드는 동일하며 source D1의 같은 행은 원래 제목을 유지한다.
- 19:58 KST 기존 Play 공개 UI의 확인 절차로 `enable_public_read` 0/0 → 1/0을 수행했다. 실제 동일 Google 로그인 계정의 서버 관리자 목록을 잠시 비워 일반 회원으로 곡 상세·세 멤버의 참여 관계를 조회하고, 관리자 메뉴 없음 및 `/admin`의 `접근 권한이 없습니다`를 확인했다. 이후 원래 관리자 ID를 즉시 복구하고 운영 공개 제어에 다시 접근했다. 가짜 계정·JWT·DB flag 직접 변경은 사용하지 않았다.
- 20:07 KST 관리자 콘텐츠 → 공지 → 새 공지에서 실제 `LuvDia Schedule 이용 안내`(id 34)를 등록했다. 비공식 팬 운영, 현재 자동 수집·AI 중지, 수동 반영, 별도 계정, 기존 문의처를 안내하며 관련 멤버는 3명이다. target D1에서 normal/active/관련 UID 3·4·5와 단일 생성 행을 readback했다. 초기 복사 공지 1개와 별도로 새 운영 공지 1개가 추가됐다. 별도 `/notice` 진입의 서버 요약과 정상 React 화면 모두에서 새 공지 및 LuvDia placeholder를 확인했다.
- **당시 재생 관측:** 일반 Chrome 프로필에서 인앱 공식 영상이 0:00 로딩에 머물렀고 복구된 기존 OTW에서도 같은 곡·동일 iframe 생성 조건으로 재현됐다. 사용 중인 확장은 uBlock Origin Lite와 Improve YouTube!이며, 어느 확장 또는 다른 프로필 상태가 원인인지 확정하지 않았다. 자체 iframe의 origin·referrer policy·표시 크기와 CSP/COEP 차단 여부는 점검했다. 같은 공식 영상의 실제 YouTube Data API 응답은 public/embeddable=true/regionRestriction 없음이다. 이후 사용자가 Chrome 음악 재생 정상을 확인했으므로 이 실패를 현재 상태로 계속 보고하지 않는다.
- 첫 가설인 초기 video ID 전달 변경은 관련 검사 38개·lint·build 후 version `e4f0a46f-cf55-493d-af25-8fc31c3a6a71`에 배포했지만 실제 문제를 해결하지 못했다. 다음 단일 변수인 Google 공식 개인정보 보호 모드 embed host(`youtube-nocookie.com`)도 version `83152cb6-3f1c-4715-8345-67a16b763960`의 실제 재생을 해결하지 못했다. 두 변경과 해당 변경을 강제하던 단언은 source에서 되돌렸다. 새로운 엔진·player wrapper·인증 우회는 추가하지 않았다.
- version `ca4a41c7-dde3-4a4d-a5dd-36099642ca7a`에는 기존 어댑터의 ready/error/iframe-load에 임시 진단만 추가했다. build와 기존 배포 경로의 remote doctor·migration 확인 및 실제 배포는 완료했다. 진단 이벤트의 실제 브라우저 관찰은 아직 수행하지 못했다. 20:39 KST 브라우저 도구가 Chrome ChatGPT 확장 프로그램의 업데이트를 요구하며 연결을 중단했고, 사용자에게 업데이트 완료를 요청했다. 원인이 확인되기 전 추가 가설 수정은 적용하지 않는다. 임시 진단은 원인 확인 후 최종 수정에서 제거해야 한다.
- 20:40 KST Cloudflare API readback에서 위 진단 version의 100% 배포, 자체 D1·R2·Analytics·rate limit 및 서버 관리자 설정 존재를 확인했다. Service/Queue/Workflow binding과 Cron은 0개다. HTTP readback은 LuvDia 홈·피드·공지 200, OTW 점검 페이지 503이다. 이 readback은 실제 영상 재생 성공을 뜻하지 않는다. 증거: `.tmp/luvdia-launch/resources-play-diagnostics-readback.json`.
- 브라우저 업데이트 후 정상 연결을 복구했다. 공식 YouTube demo에서는 동일 곡의 실제 영상과 25초 진행을 확인했다. 임시 DOM 진단 version `c8aae9fb-1291-4981-a9cf-da94dbb9f799`에서도 정상 재생 버튼으로 ready/load, 실제 영상, 33→57초 진행과 일시정지를 확인했으나 일반 프로필의 재현 결과는 일정하지 않았다. 임시 진단은 모두 제거했고 플레이어 소스·호출부·테스트는 원래 동작으로 복원했다. clean build와 manifest·사이트 자원·Clerk client guard를 거쳐 code version `3b1f3b6a-4e44-4b37-aebe-e2c751b3e004`를 배포했다. DB/schema/Worker 코드가 같아 바로 전 배포의 remote doctor·migration PASS를 재사용했다. 이를 전체 preflight 재실행으로 주장하지 않는다.
- clean 배포 뒤 사용자가 Chrome 시크릿 창에서 별도 Google 로그인 후 실제 `구마` 영상과 소리가 재생됨을 확인했다. 일반 프로필의 설정 변경 없는 진행을 선택했으므로 확장 설정은 바꾸지 않았고, 이 호환 조건을 해결됐다고 주장하지 않는다. 시크릿 검증은 실제 운영 도메인·계정·콘텐츠·외부 provider 경로였으며 mock이나 별도 재생 harness를 사용하지 않았다. 브라우저 보안 정책이 `chrome://extensions` 접근을 거부했으므로 해당 화면을 다른 경로로 우회하지 않았다.
- 21:07 KST 실제 관리자 공개 UI의 canary 확인으로 `enable_navigation` 1/0 → 1/1을 수행했다. UI의 활성 상태·실제 Clerk actor 변경 이력과 21:10 KST D1 readback을 확인했다. revision 2, public_read_enabled=1, navigation_visible=1이며 복사 자료 수는 일정 1,100·곡 64·가창 67·참여 128·카페 글 152·X 글 1,033으로 유지됐다. FK 위반 0건, 해당 검증 rows_written=0이다. 일정 3133과 새 공지 34의 저장 결과도 유지된다. 증거: `.tmp/luvdia-launch/initial-launch-final-readback.json`, `live-play-navigation-enabled.jpg`.
- 실제 홈의 정상 React 메뉴 → LuvDia Play로 이동한 뒤 세 멤버, 원곡 1곡·커버 63곡 목록, 가창자 credit과 멤버별 플레이리스트를 확인했다. 서버 요약 fallback이나 DB 조회만으로 이 화면 진입을 대체하지 않았다. 증거: `live-play-launch.jpg`. 일부 `OTW PLAY COLLECTION` 문구는 잔여 브랜드 표기로 기록하며 핵심 조회·권한을 바꾸지 않는다.
- 21:10 KST 실제 배포 identity는 서버 secret 갱신으로 생성된 `2208e298-27ae-40e8-9390-a8934968f0f1` 100%다. code 배포 `3b1f3b6a` 이후 수집 담당 채팅에서 기존 승인에 따라 credential을 연결한 상태이며 이 시점의 Queue/Workflow/Cron binding은 아직 없다. source와 D1·R2·Analytics·rate limit 자원 중복 및 peer Service binding이 없음을 API로 다시 확인했다. 보관된 동결 SQL은 37,316,413 bytes, 기존 SHA-256과 일치한다.

## 병행 운영 작업과 후속 범위

사용자는 별도 `Luvdia 이관 중 OTW 재개 판단` 채팅에서 10월 18일까지 양쪽 수집을 허용하고 LuvDia 수집 준비 및 채팅 간 조정을 승인했다. 해당 채팅이 원래 OTW 배포/DB를 유지한 점검 잠금 해제와 Queue/Cron 복구를 담당하며, LuvDia 전용 수집 자원·flag·배포도 담당한다. 동결 SQL과 최초 복사 증거는 그 시점의 복구 기준으로 유지하며, 재개 후 source 변경분을 target에 다시 덮어쓰지 않는다. 이 문서의 17:53 동결·503 증거는 최초 복사 당시의 상태이며 현재 OTW의 중단 상태를 뜻하지 않는다.

21:10 KST 초기 개통 readback 시 LuvDia 자동 수집(일정·카페·X·YouTube feed), AI, Queue/Workflow/Cron은 꺼져 있었다. 수집 담당 채팅이 관련 경로 검증·활성화를 진행하며, 실제 활성화 뒤 공지 34도 해당 범위에 맞게 갱신한다. AI와 키리누키는 활성화 대상이 아니다. 구형 YouTube warmup은 폐기된 경로이며 다시 켜지 않는다. 과거 AI·Queue·lease·outbox·수집 cursor/실행 이력은 원본 증거로 보존하고 target에서 재실행하지 않는다. 원본 Queue의 기존 retention은 86,400초이며 최초 정지가 메시지의 무기한 보존을 보장한 것은 아니다. 전체 과거 자료 복구·전체 파일/관계 완전성·양쪽 자동 배포는 후속 항목이다. 이 채팅은 전체 preflight·운영 장기 부하·전체 외부 provider 동작을 검증했다고 주장하지 않는다.

## YouTube 다시보기 수집 재개 (후속 요청)

사용자는 Chrome 음악 재생 정상을 확인하면서 YouTube 다시보기 수집 재개와 정상 화면 표시를 요청했다. 기존 `scheduled_v2_youtube_feed_collection_enabled`와 공식 source registry/Queue 경로를 사용한다. 대상은 멤버 본채널 3개와 `youtube_vod` 링크의 다시보기 채널 3개이며, AI·키리누키·Play 음악 채널 감시는 확대하지 않는다. 수집 담당 채팅이 배포·최초 수집 요청·실행 종료와 DB 저장을 담당하고, 이 채팅은 정상 `/vods`의 다시보기 탭 표시를 확인한다. 중복 최초 수집은 제출하지 않는다.

21:24 KST 실제 public API는 HTTP200, `collection.state=initializing`, 영상 0개, 사용 가능 멤버 3·4·5였다. D1에는 본채널 source 3개와 영상 200개가 있었고, 활성 다시보기 링크 3개에는 아직 source registry가 없었다. 수집 flag는 true였다. 이는 수집 완료가 아니라 신규 채널 초기화 전의 기준이며, 증거는 `.tmp/luvdia-launch/youtube-vods-before.json`에 보존했다. 이 조회의 D1 rows_written은 0이다.

수집 담당 채팅이 자체 Queue·Workflow·Cron을 연결한 version `f4df03db-0692-4506-a736-52857ca60a1d`의 100% 배포와 정기 수집 활성화를 readback했다. 정상 관리자 YouTube 수집 UI로 접수한 `43bfa992-f5e1-4f31-b308-86a41d67af75`는 21:28 KST에 succeeded로 종료됐다. wrapper 1/1 외에 실제 내부 결과도 attempted=3, succeeded=3, failed=0, backfillFailed=0, quotaBlocked=false, backoffSources=0이며, 별도로 과거 목록 2페이지를 수집했다.

21:31 KST target D1에서 공식 source 총 6개와 영상 총 450개를 확인했다. 신규 다시보기 채널은 세 멤버 각각 50개씩, 총 150개가 저장·공개됐고 모두 초기화 완료·최근 성공 시각·다음 확인 시각이 있으며 수집 오류와 연속 실패는 0이다. 기존 본채널도 과거 수집이 진행돼 300개가 저장됐다. 모든 source에 과거 수집 cursor가 남아 있으므로 전체 과거 영상 수집 완료를 뜻하지 않는다. 기존 정기 수집이 이어 처리하며, 운영 DB에 재복사하거나 UI 확인을 위해 중복 수집 요청을 내지 않았다.

정상 Chrome `/vods` → `유튜브 다시보기`에서 초기화 안내가 실제 카드로 자동 갱신됐다. 빙하유·양메이·유리리 필터 각각 20개, 빙하유 `다시보기 더 보기` 뒤 중복 없는 40개를 확인했다. 실제 제목·썸네일·재생 시간·멤버 표기와 YouTube 링크가 표시된다. 공개 API도 ready, 멤버 UID 3·4·5, 첫 페이지 20개·다음 페이지 20개이며 페이지 간 중복이 없고 멤버별 채널 ID가 자기 다시보기 채널과 일치한다. DB 검증은 rows_written=0이다. 증거: `.tmp/luvdia-launch/youtube-vods-after.json`, `youtube-vods-ui-readback.json`, `live-youtube-vods-resumed.jpg`.

이번 후속 요청에서 앱 코드 수정은 필요하지 않았다. 기존 수집 설정·실행 경로를 재사용했고 실제 관리자 제출 → Queue 처리 종료 → 자체 D1 저장 → 공개 API → 정상 화면까지 확인했다. AI·키리누키·Play 음악 채널 감시는 활성화하지 않았다. 개별 YouTube 다시보기의 외부 사이트 재생 및 전체 과거 목록의 완전성은 이번 확인 범위에 포함하지 않았다.
