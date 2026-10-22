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
