# SUL-36 코드·로컬 검증 기록

상태: 구현 진행 중. 이 문서는 공개·운영 이관의 완료 보고서가 아니다.

사용자가 허용한 범위는 공통 코드·사이트별 분리 구현과 로컬 검증이다. 도메인 의존 작업, 운영 데이터 이관, Cloudflare/Clerk 자원 생성, 배포·push·PR·merge는 실행하지 않는다. 별도 LuvDia Clerk development 앱은 없으며 실제 로그인 검증은 설정 준비 뒤로 미뤘다.

설계와 전체 작업 범위는 [확정 설계](../../superpowers/specs/2026-10-13-luvdia-independent-deployments-design.md)와 [구현 계획](../../superpowers/plans/2026-10-13-luvdia-independent-deployments.md)을 따른다. 아래 커밋은 완료된 검증의 코드 범위를 식별하며, 이후 미완료 변경의 검증을 대신하지 않는다.

## 완료된 코드 범위

### Task 1: 명시적 사이트 선택과 로컬 데이터 분리

- 커밋 범위: `bf0c8159..f75dc5b6`.
- `otw`/`luvdia` 선택, 사이트별 환경 입력·설정·build 출력·D1 persistence·포트·지원 도구를 연결했다. 누락·불명확한 사이트 선택은 실패하며 LuvDia가 OTW 설정으로 대체되지 않는다.
- 일반 지원 명령을 통해 OTW의 실제 로컬 migration 101개, fixture seed, home와 `/api/members`의 HTTP200, 재시작·중지·사용자 지정 포트를 검증했다. LuvDia의 설정·D1 유지보수는 Clerk 앱 없이 사용할 수 있음을 확인했다.
- Windows 경로의 대소문자 별칭·중첩·junction으로 두 사이트가 같은 데이터 트리를 사용할 수 있는 문제를 독립 리뷰에서 발견했다. 수정 후 관련 실제 경로와 임시 junction 회귀, 영향 범위 55개 테스트 및 타입·lint 검사를 통과했고 재리뷰에서 해결을 확인했다.
- 이 단계 종료 시 기존 legacy DB/WAL/SHM 4개 파일의 byte 동일성을 확인했다. 전체 구현 종료 시 다시 확인한다.

### Task 2: 공통 UI·브랜드·SEO·내보내기

- 커밋 범위: `f75dc5b6..65ee9ad8`.
- 같은 화면과 기능이 선택한 사이트명·음악 기능명·소속 문구·로고·문의처·링크 정책을 사용한다. Worker HTML/JSON-LD·canonical·sitemap·snapshot의 사이트 설정도 연결했다. LuvDia production origin은 실제 도메인이 제공될 때까지 비워 둔다.
- 정상 OTW 브라우저 동선에서 home→주간 화면을 확인하고 기존 내보내기 메뉴의 grid·poster·legacy PNG 3개를 실제 저장했다. 이미지가 로드되지 않은 경우의 snapshot 오류를 기존 공통 컴포넌트에서 수정하고 회귀 검증했다.
- 익명 LuvDia Play에 남은 OTW 회원 문구를 독립 리뷰에서 발견했다. 양쪽 반응형 화면을 수정하고 20개 shell 테스트와 타입·lint 검사, 재리뷰를 통과했다.
- 원래 42개 테스트 파일의 한 회차에는 submission-page 5초 timeout 1건이 있었다. 코드를 바꾸거나 timeout을 늘리지 않은 같은 파일 재실행은 21/21 통과했다. 원래 회차를 전체 PASS로 표시하지 않으며 마지막 공통 검증에서 다시 확인한다.
- 실제 LuvDia 로그인·화면 동선·PNG는 새 Clerk 설정 뒤 확인한다.

### Task 3: Worker 자원·인증·Queue·cache 분리

- 커밋 범위: `65ee9ad8..944d9f73`.
- HTTP·scheduled·Queue·Workflow 구성은 같은 명시적 사이트와 자원 검사를 사용한다. Queue/DLQ 이름·Analytics dataset·cache identity·Clerk app/issuer/JWKS/authorized parties를 사이트별로 검증한다. 알 수 없는 Queue는 성공 ACK 대신 retry한다.
- 독립 리뷰에서 일부 HTTP 경로의 자원 검사 우회와 빈 authorized-parties 허용을 발견했다. 공통 진입 검사와 인증 경계를 수정하고 영향 범위 138개 unit/유지보수 테스트와 실제 Worker/D1 10개 검증, 재리뷰에서 해결을 확인했다.
- 실제 Worker/D1 인증 회귀에서 상대 issuer/origin 거부, 잘못된 관리자 ID 거부와 무변경, 해당 관리자 정상 조회, JWKS 불일치 거부를 확인했다. 이 fixture 인증은 실제 사용자 로그인 증거로 사용하지 않는다.
- 정상 OTW의 기존 로그인 세션으로 관리자 대시보드→사이트→Play를 확인했다. 익명 보호 API는401/no-store였다.
- 지원되는 로컬 Workflow manager에서 실제 binding을 두 번 실행하고 durable step의 완료를 확인했다. 로컬 자동 갱신이 비활성이어서 business run/item/outbox는0→0이었다. 실제 수집·Cron·Queue 소비 완료의 증거는 아니다.
- canonical config만 사용하는 타입 생성은 private 환경 metadata를 놓치는 문제가 남아 있다. 실제 선택된 OTW local config를 사용하는 지원 명령은 통과했으며 Task5에서 재현 가능한 절차와 소비 경로를 정리한다. 생성 타입에는 키의 이름·타입만 포함한다.

## 진행 중인 범위

Task4는 ① schema·출처·원자적 포착과 인계 기반, ② 관리자 보관의 전체 reader 경계, ③ 보존·파일, ④ 모든 저장·수집 경로와 무중단 인계, ⑤ 도구·통합 검증으로 나눠 순서대로 구현·리뷰한다. ①은 `944d9f73..1e886c86`, ②는 `e2a6b2f4..50ea41a9`의 코드·영향 범위 검증·독립 리뷰를 완료했다. ③–⑤는 남아 있으므로 Task4 전체는 미완료다.

①은 빈 대상 DB의 준비→세 사람의 baseline 생성, 같은 batch의 변경 포착·재생·실패 rollback, 미소유 대상 행의 충돌 거부, 부분 page 재개, 출처 자료의 기존 관리자 DTO 열람을 연결했다. source의 보관 접근 정책은 business 복제에서 제외하고 target은 원래 공개·회원·관리자 제한을 유지한다. 다른 멤버는 새 roster에 추가하지 않고 봉인한 원본 사실에서 과거 크레딧을 보존한다. 이관 접수 ACK와 최종 저장 결과, 양쪽의 파일 관측은 각각 구분한다.

2026-10-14 13:55 실제 임시 D1 control·populated schema 33개와 이후 수정된 입력 경계의 후속 검사를 통과했다. 타입·영향 범위 lint·architecture 검사, 양 사이트의 numbered migration 103개 전체 재생, 생성 SQL의 byte 일치와 schema no-diff, 이전 migration artifact 201개·journal 101개·legacy 파일 4개의 보존도 확인했다. 이 결과는 내부 D1 포트 증거이며 실제 R2 복사·전체 수집 경로·무중단 서비스 전환의 통과를 뜻하지 않는다.

독립 리뷰는 기존 검사가 다루지 않은 재전송·경합 조건 5개를 지적했다. 첫 수정 `a17c6fe7..03a337d6`에서 실제 D1 신규 12개와 기존 32개, domain 9개 및 타입·lint·architecture·legacy hash 검사를 확인했고, 재리뷰는 재전송·readiness 갱신·manifest CAS·attempt/outcome 원자성의 해결을 확인했다. 일정의 늦은 저장 보호는 수정됐지만, 새 precondition이 비대상 멤버의 기존 일정을 대상 멤버로 변경하는 정상 source 편집을 거부하는 회귀가 남아 두 번째 수정으로 처리했다.

두 번째 수정 `03a337d6..1e886c86`은 실제 D1 2개 RED 뒤 관련 6개 검사를 통과했고 재리뷰에서 해결을 확인했다. 원래 source 상태는 source-local guard에 보존하고, 알려진 비대상 멤버의 이전 일정은 target scope의 부재로 판정한다. source90→selected1의 실제 저장→target11 설치, 세 사람 roster·private snapshot 미전송, native target11의 새 편집을 늦은 저장의 conflict로 보존하는 흐름을 함께 확인했다. 미지의 멤버·지원하지 않는 이미지에는 같은 제외 처리를 적용하지 않는다. 리뷰는 내부 포트 범위이며 실제 HTTP·Clerk·원격 효과의 완료 판정은 아니다.

각 실패와 재검사도 보존했다. 리뷰어의 첫 추가 D1 시도는 결과가 없어 FAIL 증거로 표시하지 않는다. 첫 수정 확대 회차의 fixture FK 오류 1건과 수정한 신규 검사 통과는 함께 기록하며 단일 44개 전체 GREEN 회차로 표시하지 않는다. 마지막 6개 scoped 검사를 48개 전체의 새 실행으로 표시하지 않는다.

회귀 검사에서 잘못된 page 뒤 남은 행, 미소유 행 자동 편입, 제외한 개인정보 JSON의 불필요한 참조 포착, 없는 멤버를 SQL NULL 때문에 거부하지 않던 문제를 발견해 수정했다. 현재 행을 고쳐도 봉인된 이전 이미지의 충돌은 남을 수 있어, source fence 전에 초기 자료와 재생에 필요한 과거 이미지도 검증한다. 충돌이 있으면 기존 수집·편집을 유지하고 전환을 거부한다. 운영 자료에서의 발생 가능성은 아직 확인하지 않았으며, 새 초기 기준이나 역사 identity 처리의 검토·승인이 필요할 수 있다. 승인 계보·staging·접수 요청을 자동 초기화하거나 이름으로 사람을 합치지 않는다.

②의 최초 코드·로컬 검증은 `43b5337b`에 기록했다. 실제 Worker 진입점·D1의 핵심 접근 경계 15개, 변경 전 캐시 이후의 SEO·bootstrap·JSON-LD·sitemap·프로필 HTML GET/HEAD, 브라우저의 다음 Play 화면 진입 재검증을 확인했다. 영향 범위 검사는 조합하여 Worker 15파일·221건, unit 16파일·118건, client 10파일·81건과 앱/Worker/test 타입·lint·architecture·legacy 4파일 hash를 확인했으며 그룹 간 중복을 고유 검사 수로 합산하지 않는다. 최초 실패·fixture 오류·수정 뒤 결과는 구분해 보존한다. 누락의 수정·재검토 결과는 아래에 구분해 기록한다.

보관 민감 client query는 다음 mount/focus에서 다시 읽고 inactive snapshot과 이전 화면 placeholder를 재사용하지 않도록 연결했다. 서버의 현재 root 정책·receipt revision 확인과 별도의 경계다. `/profile/bing_hayu`의 HTML404는 실제 이미지·signature·R2 bytes 차단의 증거가 아니며, 이미 전달된 화면·bytes의 즉시 회수나 새 실시간 취소 채널을 추가하지 않았다.

첫 독립 리뷰는 수정 필요 판정이었다. 2–3글자 부분 검색의 보관 참가자 gram, X 정책 조회 실패 시 필터 전 응답 반환, SPA 메타데이터의 화면 재진입 cache 복구, 비 Play YouTube feed/VOD 보관 자료의 관리자 조회 경로 누락을 지적했다. 묶음 수정·회귀 결과를 `50ea41a9`에 기록했고 재리뷰의 spec·fix quality 승인과 중요 문제0을 확인했다. 기존 검사 통과만으로 이 경계들을 완료 처리하지 않는다. 로그에는 Git 줄바꿈 wrapper 경고와 의도한 부정 검사의 오류 telemetry가 있어 ESLint 진단과 구분한다.

추가 재현에서는 짧은 검색 사례가 수정 전부터 GREEN이었다. 구현 담당자가 기존 최종 performance 필터의 차단을 확인했고, 원래 리뷰어는 최종 필터와 실제 회귀 증거를 확인하고 최초 누출 지적을 오탐으로 철회했다. 존재하지 않는 실패를 RED로 기록하지 않는다. X 실패 경로와 SPA 메타데이터 재진입은 실제 RED를 확보했다.

수정 범위의 조합 검증은 Worker/D1 5파일·104건, unit/UI/HTTP 9파일·57건이며 타입·lint·architecture·diff의 실제 종료 코드0과 legacy 4파일 hash 보존을 기록했다. X는 정책 검증이 성공한 chunk만 반환하고 다른 정상 chunk는 유지한다. 메타데이터는 현재 응답을 기다리며 실제 처음 전달된 문서의 검증된 bootstrap만 첫 진입에서 한 번 사용할 수 있다. 실제 OTW 관리자 메뉴에서 비 Play YouTube 공식 영상·Shorts·VOD와 만료된 CHZZK VOD·클립 저장본을 읽기 전용으로 조회하고, 해당 D1 값·만료 timestamp 보존 및 YouTube API 사용0을 확인했다. 신규 이력 조회는 인증 뒤에만 구성되는 D1 전용 경로이며 수집·외부 호출·쓰기 기능이 없다. bytes·보존 hold·최종 인계의 검증으로 확대하지 않는다.

②에서 재시도한 OTW production build는 Task2와 같은 기존 Clerk publishable key·issuer 불일치로 설정 검사에서 exit1이었다. 앱 bundle 생성 전 실패이며 설정·guard를 우회하지 않았다. production artifact·manifest 검증은 통과로 기록하지 않고, 실제 입력 준비·주입과 별도 빌드 검증을 Task5–6에 남긴다.

②의 정상 화면 확인은 실제 기존 OTW Clerk 세션을 사용했다. 새 사이트별 임시 상태 `.tmp/sul36-task42-ui-otw`에서 103개 migration을 재생한 뒤 `/admin/content`로 진입해 보관 일정·프로필 조회, 보관 D-Day의 수정·삭제 비활성화, 일반 D-Day 수정 저장을 확인했다. 실제 해당 D1 읽기에서 일반 항목의 새 제목·`normal`과 보관 항목의 원문·`admin_archive`가 유지됐고 공개 홈에는 일반 항목만 표시됐다. 인증 fixture 결과와 별도로 기록하며 기존 source·legacy 상태나 실제 LuvDia 로그인 검증으로 확대하지 않는다.

Task5의 사이트별 배포/CI guard·schema 호환·유지보수 절차와 최종 공통 검사·전체 변경 독립 리뷰도 남아 있다. 운영 명령은 실행하지 않는다.

## 종료 때 확인할 항목

- 각 코드 범위의 최종 commit·독립 리뷰·영향 범위 검증 결과와 미해결 사항.
- 임시 D1에서 두 사이트의 실제 numbered migration 전체 재생, 이관·변경분·권한·파일의 최종 readback.
- 기존 local DB와 source의 보존, 의도하지 않은 외부 호출·쓰기·배포가 없다는 실행 범위.
- 마지막 공통 타입·lint·unit/Worker·architecture 검사. PR merge용 preflight는 이번 검증 범위와 구분한다.
- 실제 LuvDia Clerk 로그인·도메인·격리 자원·운영 규모/한도·실제 Cron/Queue·운영 이관·배포·공개 readback의 미실행 상태.

목표 공개 시각은2026-10-18 11:00 Asia/Seoul이다. 필수 검증이 끝나지 않으면 공개를 연기하고 기존 OTW 수집·갱신을 유지한다.
