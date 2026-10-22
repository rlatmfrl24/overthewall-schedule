# SUL-39 개인 멀티뷰 구현·검증 기록

2026-10-22 KST. 사이트별 저장 30개·동시 선택 8개·기존 비회원 흐름 유지로 승인된 로컬 구현이다.
서버 저장과 실제 브라우저 흐름을 확인했으며, 운영 반영 및 아래 미검증 항목까지 완료했다고 주장하지 않는다.

## 변경과 실행 위치

- 브랜치: `codex/sul-39-personal-multiview`.
- 시작: `f6be40ba40a9a305224a40d209e2cebb2e940082`.
- 최종 기능 소스: `2ca7b14f3ead6cd2420e7fca72fac7f36e147333`.
- 격리 worktree: `C:/Users/rlatm/.codex/worktrees/sul-39-personal-multiview/overthewall-schedule`.
- Node 24.20.0·pnpm 11.7.0. 새 의존성 없음.
- OTW: `pnpm dev`, `http://localhost:5173/multiview`; LuvDia: `pnpm dev:luvdia`, `http://localhost:5174/multiview`.
- 기존 ignored 개발/운영 환경 파일을 격리 worktree에 복사했다. 기존 로컬 D1은 읽기 전용 연결의 SQLite backup으로 사본을 만들고 해당 사본에만 증분 migration을 적용했다. 원본 checkout·DB를 reset/seed하지 않았다.
- 두 dev 실행에서 해당 사이트 AI review를 false로 유지했다. 운영 자동화는 재개하지 않았다.

일반 Clerk 인증의 서버 사용자 ID가 소유자다. 각 사이트의 독립 D1 `multiview_channels`에 저장하고, 단일 조건부 INSERT와 복합 PK로 30개 상한·중복 재시도를 처리한다. 공개 멤버와 개인 채널은 ID로 병합하며 저장과 URL 선택은 독립이다. 개인 GET/쓰기/405 응답은 no-store이며, 상태 조회 대상은 서버의 본인 목록에서만 구한다.

## 실제 정상 진입 검증

다음 PASS는 실제 Chrome→정식 `/multiview`→Clerk→Worker→각 사이트 로컬 D1의 관측이다. mock 통과를 옮긴 값이 아니다. 로컬 기본 멤버 데이터는 Local Mina/Local Sora fixtures이므로 운영 멤버 카탈로그 검증과 구분한다. 추가한 외부 채널은 실재 치지직 채널 `0a2020b09b8cc7f2285b7ae5de2ce4d3`(테리 눈나)다.

| 수용 항목 | OTW | LuvDia | 실제 증거와 한계 |
|---|---|---|---|
| 비회원 접근·기본 멤버 선택 | PASS | PASS | 게스트 상태의 체크박스 클릭→`c=bbbb…`와 같은 Mul.Live 주소, 로그인 강제 없음 |
| 정상 Clerk 로그인·실재 채널 추가 | PASS | PASS | 기존 정상 계정 세션으로 주소/ID 추가→이름 표시·저장 1/30. 관리자 여부를 바꾸거나 임시 권한을 만들지 않음 |
| 새로고침 후 서버 저장 복원 | PASS | PASS | 브라우저 reload 후 같은 채널/1/30 표시 |
| 로그아웃·정상 Google 재로그인 복원 | PASS | 미검증 | OTW에서 저장 1/30과 기존 선택 `c=` 동시 복원 |
| 사이트 목록 독립 | PASS | PASS | OTW 1개 저장 상태에서 LuvDia 최초 0개; LuvDia 추가 후 삭제해도 OTW 1개 유지 |
| 북마크 삭제·선택 유지 | PASS | PASS | 삭제 후 0/30, 선택 1/8·같은 `c=`/Mul.Live 링크 유지. OTW는 키보드 Return으로 삭제·주소 입력 후 Return으로 재추가도 확인 |
| Mul.Live 새 탭 이동 | 링크 일치 | PASS | LuvDia 정식 링크 클릭→`https://mul.live/0a202…`, 해당 치지직 채널의 휴방 화면까지 실제 도착 |
| 실제 방송 재생 | 미검증 | 미검증 | 선택 채널이 휴방이며 Mul.Live 안에서도 다음 라이브 안내 표시. 확장 설치·내장 재생 복구는 수행하지 않음 |
| 상태 부분 장애 보존 | PASS | PASS | 로컬 기본 멤버 upstream 실패에도 공개 선택 유지, 실재 개인 채널은 정상 CLOSE/휴방 표시 |
| 별도 실제 계정·다른 기기 | 미검증 | 미검증 | Worker/D1 계정·사이트 격리와 issuer 거부 테스트는 별도 아래에 기록 |
| 실제 모바일·8명 동시 조작 | 미검증 | 미검증 | 현재 브라우저 대표 흐름만 확인. 8개 상한·URL·혼합 선택은 회귀 테스트로 검증 |

추가 후 서버 목록 GET을 사용하는 새로고침·재로그인으로 정상 orchestration을 검증한 뒤 로컬 Wrangler 읽기 SQL로 교차 확인했다. OTW는 같은 `channel_id`/`channel_name`과 `saved_count=1`, LuvDia는 UI 삭제 후 `saved_count=0`이었다. 이 SELECT는 UI 저장의 대체 경로가 아니다. 사용자 ID·세션 토큰·비밀값은 보고서에 싣지 않는다.

```sql
SELECT channel_id, channel_name, COUNT(*) OVER() AS saved_count FROM multiview_channels;
SELECT COUNT(*) AS saved_count FROM multiview_channels;
```

## 테스트와 검토

- 최종 변경 범위 회귀: 20개 파일, **150/150 PASS**. DTO·입력·provider·HTTP·기존 공개 CHZZK·route registry·사이트 설정·seed guard·개인 UI·세션·기존 URL 선택을 포함한다.
- 실제 Worker/D1 통합: 2개 파일, **9/9 PASS**. 서명 JWT의 정상 Worker 진입, 비회원 거부, 다른 사용자/사이트 격리, 다른 issuer 거부, 저장·조회·삭제, 29개에서 동시 추가·30개 한도·가득 찬 중복을 검증한다. 테스트 JWT와 upstream stub은 실재 Clerk/치지직 관측으로 주장하지 않는다.
- 양 사이트 full-chain validate-only: 각 **149 migrations PASS**. 임시 D1에서 전체 체인을 검증하고 원본 DB는 보존했다. Drizzle 생성 `0149_multiview_channels.sql`은 추가형이다. 격리 개발 DB 사본에도 증분 적용했다.
- `pnpm typecheck:test`, 변경 파일 ESLint, `pnpm architecture:check`: PASS. 최종 provider 수정 후 타입·해당 파일 ESLint를 재확인했다. `pnpm build`, `pnpm build:luvdia`도 최종 기능 소스에서 종료 코드 0이며 각 artifact manifest 검증 PASS다. 기존 대형 chunk 경고는 남는다.
- 독립 읽기 전용 검토: `f6be40ba..080c2b26`에서 Important/P2 1건, Critical/Minor/검토 제외 항목 없음. 잘못된 optional 이름이 React child로 전달돼 전체 선택 화면이 중단되는 낮은 가능성의 결함을 재현했다. 객체·빈값·공백·숫자·null 이름 및 잘못된 이미지/날짜의 6개 사례가 RED인 것을 확인하고, 검증한 필드만 반환하도록 수정해 150/150 GREEN. 두 번째 리뷰로 테스트를 대체하지 않았다.

실제 로그인에서 선택 URL 유실도 발견했다. Clerk 복귀 주소를 렌더 시점 window URL 대신 현재 선택 상태로 계산해 회귀 테스트 RED→GREEN 후 실제 재로그인에서 같은 `c=` 복원을 확인했다. 실제 polling 응답은 이름/사진이 생략되므로 private DTO를 수정했으며, upstream 장애로 오판했던 초기 관측을 정정했다. 하위 테스트·기존 타입을 실제 외부 계약보다 우선시키지 않았다. 남은 AUTHORITY INVERSION 또는 TEST DRIFT는 확인되지 않았다.

## 실행 중 판정

1. 새 공식 Client 인증 대신 기존 공개 채널 API를 정상 추가 경로에 직접 재사용했다. 새 비밀값은 필요 없다. 잘못되면 upstream 변경 시 추가가 503으로 실패할 수 있으나 기존 저장은 보존된다.
2. 저장소 검증 규칙을 우선해 task마다 전체 suite/preflight를 반복하지 않고 영향 범위를 검증했다. 잘못되면 무관 영역 회귀를 놓칠 수 있으며 최종 병합 준비가 preflight를 소유한다.
3. Task 1의 독립 전체 migration 검증 중 Task 2의 RED 테스트만 준비했다. Task 1 완료·의존성 통과 전 Task 2 운영 코드를 완료 처리하지 않았다. 잘못되면 의존성 계약 불일치 비용이 생긴다.
4. 실재 polling 응답에 맞춰 private `MultiviewLiveStatusItemDto`의 metadata를 optional로 했다. 공개 DTO는 유지하고 선택 필드도 검증한다. 잘못되면 비정상 core 응답은 확인 불가로 남으며 북마크는 보존된다.

보류한 Minor는 없다. 실제 관측과 ledger를 이 문서에 옮겼으며 미검증 수용 항목은 PASS로 올리지 않았다.

## 최종 판정과 다음 경계

로컬 기능 구현과 대표 저장·선택·삭제·복원은 확인했다. 별도 계정/기기, 모바일 실기기와 실제 방송 재생을 포함한 전체 수용 완료·운영 완료 판정은 하지 않는다. 해당 확인은 Task 4에 남겨 두며 plan scratch ledger도 보존한다.

운영 반영 시 양 사이트 로그인 설정·rate namespace(OTW 1003/LuvDia 1004)·계정 합산 D1 예산을 확인하고, 동일 소스의 각 DB에 추가 migration→정상 배포→최소 실제 저장/readback 순서를 따른다. 테이블 DROP rollback은 하지 않는다. 이번에는 push/PR/merge·원격 SQL/migration·배포·확장 설치·운영 장애 주입·대량 데이터 생성·전체 preflight를 수행하지 않았다.

## 후속 UI 요청: 신규 채널 추가하기

사용자 요청에 따라 `내 채널`의 상시 입력 영역을 짧은 발견 안내와 `신규 채널 추가하기` 버튼으로 바꿨다. 입력은 사용자가 여는 같은 제목의 공용 Radix 팝업에 둔다. 기본 목록에 없는 **치지직** 방송을 이 사이트의 계정에 저장하고 다음 방문에도 재사용할 수 있음을 명시한다. 팝업에서 로그인할 때 기존 팝업을 닫고 Clerk로 이어지며 공개 멤버 선택·30/8 상한은 유지한다.

- 사전 RED: 새 팝업 진입·저장·비회원 안내를 요구하는 10개 사례가 기존 상시 폼에서 실패했다. 구현 후 기존 멀티뷰·공개 URL·세션을 포함한 9개 파일 **39/39 PASS**다. 저장 후 GET 실패도 팝업 밖에서 오류·재조회로 처리한다.
- 저장 직후 private 상태 조회가 끝나면 `상태 확인 중` 제목이 바뀌며 section key가 달라져 선택 버튼이 분리되는 문제를 재현했다. 실제 `isConnected=false`와 선택 실패를 확인한 뒤 key를 상태 그룹의 고정 식별자로 바꾸어 같은 테스트에서 연결·선택·URL·삭제까지 GREEN을 확인했다.
- 실제 OTW Chrome: 첫 진입 시 입력·팝업 없음→버튼 클릭→설명과 주소 입력→기존 실제 채널의 중복 저장→개수 2/30 유지·팝업 닫힘·저장 안내·추가 버튼으로 초점 복귀. 다른 시점에 저장된 기존 두 행을 보존했으며 이번 중복 요청을 신규 행 생성으로 주장하지 않는다. 채널 선택 후 팝업 열기/Escape로도 같은 `c=`/Mul.Live 주소를 유지한다.
- 실제 LuvDia Chrome 비회원: 기본 멤버 선택→추가 팝업의 기능·저장·로그인 설명→정상 Clerk 창→로그인 취소 후 동일 선택 URL 유지. 개인 입력 폼이나 강제 로그인을 공개 흐름에 넣지 않았다.
- 밝은/어두운 테마의 실제 팝업을 확인하고 원래 시스템 테마로 복원했다. 좁은 브라우저 viewport에서 DOM 폭/scrollWidth가 모두 433px, 팝업 폭 약 401px·좌우 여백 약 16px이며 가로 넘침 없이 입력·작업 버튼이 한 열로 배치된다. viewport도 원복했다. 이는 모바일 실기기 검증이 아니다.
- `pnpm typecheck:test`, 변경 파일 ESLint, `pnpm architecture:check`, `pnpm build`, `pnpm build:luvdia` 모두 PASS. 양쪽 artifact manifest를 확인했다. 서버 API·DB·migration 변경은 없으므로 해당 경로의 이전 증거를 재사용하며 전체 preflight는 반복하지 않았다.

기존 브랜드·공용 컴포넌트·키보드 초점·모션 감소 처리를 유지했다. 요청된 두 디자인 스킬의 제품 UI에 맞는 위계·문구·대비·반응형 기준을 적용했으며 랜딩용 히어로·AIDA·GSAP 스크롤 연출·장식 이미지는 추가하지 않았다. 별도 계정·기기와 실제 재생 등 기존 미검증 수용 항목 및 운영 반영 경계는 그대로다.

## 후속 UI 요청: 기본 멤버 보호·카드 안 삭제 메뉴

사이트 기본 멤버에는 삭제 메뉴를 제공하지 않는다. 같은 채널의 개인 저장 행이 있어도 기본 멤버 카드가 우선한다. 기본 멤버가 아닌 본인 저장 채널에만 카드 테두리 안의 더보기 메뉴와 `저장 목록에서 삭제`를 제공한다. 선택 버튼과 메뉴는 형제로 유지하고, 삭제로 시청 선택이나 Mul.Live 주소를 바꾸지 않는다. 서버는 계속 본인 북마크 행만 삭제하며 기본 멤버 테이블을 수정하는 경로는 없다.

- 기존 구현에서 기본 멤버+개인 저장 중복의 삭제 버튼이 보이는 실패와 새 카드 메뉴 부재를 RED로 확인했다. 수정 후 멀티뷰·공개 URL·세션 회귀 9개 파일 **40/40 PASS**다. 중복 기본 멤버가 남고 개인 채널만 삭제되며 선택 URL도 유지되는 흐름을 검증한다.
- 실제 OTW Chrome에서 기본 Local Mina/Local Sora에는 메뉴가 없고 기존 개인 채널에는 카드 안 메뉴가 있는 것을 확인했다. 정상 추가 팝업으로 임시 실재 채널을 저장해 1→2/30, 기본 멤버와 함께 선택→더보기 삭제→1/30을 확인했다. 새로고침한 서버 목록에서도 기존 사용자 저장 채널은 남고 임시 채널만 사라졌으며 기본 멤버·두 선택 ID·Mul.Live 주소는 유지됐다. 원래 사용자 저장 행을 삭제하지 않았다. 로컬 기본 멤버가 fixtures인 기존 한계는 유지한다.
- 좁은 브라우저 화면에서 카드 내부 버튼과 메뉴를 직접 확인하고 viewport를 복원했다. 실제 모바일 기기 검증은 아니다.
- 변경 파일 ESLint, `pnpm architecture:check`, `pnpm typecheck:test`, 양 사이트 production build/artifact manifest 모두 PASS. API/DB/migration 변경은 없으며 기존 서버 격리 증거를 재사용했다. 이번에는 배포·원격 작업·전체 preflight를 실행하지 않았다.

## PR·운영 반영 준비 — 2026-10-22

사용자가 전체 검토 후 PR 생성·병합과 양 사이트 배포를 승인했다. 위의 로컬 단계에서 하지 않았던 원격 작업을 이번 단계에서 진행하며, 최종 배포·실제 운영 흐름 판정은 [PR #188](https://github.com/rlatmfrl24/overthewall-schedule/pull/188)의 댓글에 남긴다.

- 최신 master `5d907f90cbee618f94bee8e5633551d6ede3fa14`를 반영한 `36bedf3c2b9b5aae44e7715c1a1183b2c5176b81`에서 전체 49개 변경 파일을 검토했다. 남은 Critical/Important 지적은 없다. 기본 멤버 보호, 본인 추가 채널만 카드 내부 삭제, 사이트별 30개·동시 8개·비회원 흐름 유지가 최종 계약이다.
- 공식 `pnpm preflight` 전체가 종료 코드 0이다. 391개 파일·3,208개 테스트와 동기화 스크립트 10개 검사, 구조·타입·린트·OTW build/artifact manifest·로컬 D1 doctor·정책 동기화가 PASS다. 시간 제한·병렬 worker·검증 조건을 완화하지 않았다.
- GitGuardian incident 38841344는 입력 URL의 인증 정보를 거부하는 조건에서 `url.port` 속성을 Generic Password로 감지했다. 실제 비밀값이 없어 해당 단일 incident를 `Not a secret (false positive)`로 분류하고 대시보드 readback을 확인했다. 탐지 규칙이나 전체 보안 검사를 끄지 않았다. Cloudflare PR build `c36261de-dd60-409c-9be9-7cdb33bc98f2`는 SUCCESS이며 운영 master 배포와 구분한다.
- 05:14 UTC 계정 합산 D1 읽기는 153,869행으로 배경 상한 4,000,000행 아래였다. 양 DB의 대기 migration이 0149 하나임을 확인한 뒤 정식 Wrangler migration 경로로 각각 적용했다. 양쪽 migration head·새 테이블·복합 PK·인덱스·빈 저장 목록을 SELECT로 확인했다. 기존 행 변경·backfill·DROP은 없으며 양쪽 Play 자동화 중지 `true`를 보존했다.

OTW는 master 병합 자동 배포, LuvDia는 같은 병합 소스의 정상 수동 배포를 따른다. 별도 실제 계정/기기·모바일 실기기·실제 방송 재생은 여전히 미검증이며 위 테스트를 해당 실제 수용 결과로 바꾸지 않는다.
