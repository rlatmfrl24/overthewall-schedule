# SUL-36 코드·로컬 검증 기록

상태: 구현 진행 중. 이 문서는 공개·운영 이관의 완료 보고서가 아니다.

사용자가 허용한 범위는 공통 코드·사이트별 분리 구현과 로컬 검증이다. 도메인 의존 작업, 운영 데이터 이관, Cloudflare/Clerk 자원 생성, 배포·push·PR·merge는 실행하지 않는다. 별도 LuvDia Clerk development 앱은 없으며 실제 로그인 검증은 설정 준비 뒤로 미뤘다.

**허용 범위 위반 사고:** Task4.3의 CLI 테스트 import가 기존 최상위 원격 업로드를 실행했다. 로컬 로그에서 운영 `otw-schedule` R2 업로드 완료 6개·완료 여부 미확인 1개를 확인하고 실행을 중단했다. LuvDia 대상 밖의 경로도 포함됐다. 이후 사용자가 허용한 7개 경로의 읽기 전용 GET에서 모두 현재 크기·hash가 입력과 일치했고 마지막 파일도18:55:28 수정 시각을 확인했다. [경로·해시·중단·읽기 결과·미확인 영향](operational-upload-incident.md)을 별도로 기록했다. 추가 업로드·복구·삭제는 하지 않았다. 실제 업로드 version과 사고 전 파일·이용자 영향은 미확인이다. 아래 코드·로컬 검사나 현재 입력 일치가 사고 전 파일 보존·무해함의 증거는 아니다.

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

Task4는 ① schema·출처·원자적 포착과 인계 기반, ② 관리자 보관의 전체 reader 경계, ③ 보존·파일, ④ 모든 저장·수집 경로와 무중단 인계, ⑤ 도구·통합 검증으로 나눠 순서대로 구현·리뷰한다. ①은 `944d9f73..1e886c86`, ②는 `e2a6b2f4..50ea41a9`의 코드·영향 범위 검증·독립 리뷰를 완료했다. ③은 첫 독립 리뷰의 중요4건을 `9d990e41..f37b966b`의 두 코드 커밋과 보고서로 수정·검증한 뒤 첫 재리뷰 중이다. ③의 재리뷰와 ④–⑤가 남아 있으므로 Task4 전체는 미완료다.

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

③은 immutable 파일 version·참조·ACK·미확정 작업 복구와 cleanup claim, 기존15분 해제 유예, 보관 자료의 expiry/registry 보호, 승인 origin·파생 참조 index, 인증 자산 접근을 연결했다. 양 사이트의 실제 numbered migration112개 전체 적용과 지원 증분 적용, 기존6개 business table·legacy4파일의 보존을 확인했다. 최종 schema에서 실제 기존 OTW Clerk 관리자 공지 업로드→draft/saved Blob480×479→공지4 저장→D1/index/ACK→로컬R2 본문31,446bytes·SHA-256 일치까지 도달했다. 이는 새 LuvDia 로그인이나 운영 파일 복사의 증거가 아니다.

③의 영향 범위 검사는 조합 증거다. 파일 복구 실제D1/R2 15건, 최종 projection·image11건, D1 baseline/replay/origin5건과 availability1건, 타입·lint·architecture·sync·양 사이트doctor/typegen을 통과했다. CT/retention/availability 회차는54PASS/1fixture SQL matcher 불일치였고 수정된 관련 race2건이 별도로 통과했다. 원래55건 전체가 한 번에 통과했다고 표시하지 않는다. 독립 ASSETS 증거는 별도3runtime의 실제 body 검증이며 공유 storage 회차의 독립 binding 판정은 철회했다. 실제 runtime·fixture·genuine UI 범위를 구분해 독립 리뷰한다.

③의 production build는 기존 Clerk key·issuer 불일치 guard에서exit1로 종료했고 산출물은 생성되지 않았다. 최종 staged diff 검사도 적용된0112 SQL의 공백 전용513/542행으로exit2였다. 적용된 migration·generator 동일성은 보존했으며 전체 검사가 pristine이라고 표시하지 않는다. 운영 사고는 위 별도 기록대로 미해결이다. 추가 운영 명령은 실행하지 않는다.

③의 첫 독립 리뷰는 spec·quality 모두 수정 필요로 판정했다. 중요 문제는 새 managed reference가 없는 기존R2 파일의 가용성·암묵적 background 목록, 승인된 own 절대URL의 관리자 Blob 경로, 현재 행 수정으로 사라지지 않는 과거 봉인 파일URL의 최종 검증, SQL과 owning parser의 중복·마지막 slash 해석 차이다. 기존의 새 파일·상대URL 긍정 검사만으로 이 범위를 충족했다고 처리하지 않으며 네 건을 수정·실제 검증한 뒤 재리뷰한다. 적용된0112 공백 두 줄은 별도 Minor로 전체 리뷰에 전달한다.

③ 첫 수정은 source의 명시적인 prepared 파일 보호·실제 원래 목록 관찰과 같은 protect transaction의 baseline/inventory seal, target 저장 baseline의 원래 seal 대조를 연결했다. 기존 unmanaged notice·암묵적 background를 새 업로드로 만들지 않고 검증하며15행 초과 목록의 이전 page 재전송은 전체 원본·hash가 같을 때 읽기만 수행한다. 초기 파일 복사는 target의 로컬 수신 준비 뒤 원래 seal 기반 port로 진행한다. source의 정상 일정 저장·live replay를 계속하고 최신 readiness ACK·실제 fence 뒤에만 최종 body 증거·installation을 만든 흐름을 확인했다. 실제 가용성 최종5건과 revision 경합의 행/cursor 전체 rollback이 통과했으며 최종 실행 권한을 초기 복사 단계로 앞당기지 않았다.

③ 첫 수정의 실제 기존 OTW 관리자 화면에서는 보관 공지5의 own 절대URL을 정상 이미지 열기로 진입해 Blob480×479 표시를 확인했다. 해당 D1/index의 raw 절대URL을 유지했고 실제 로컬R2의31,446bytes·SHA-256·own upload-version 및 비인증401/private,no-store를 확인했다. 공지·파일 준비는 로컬 fixture setup이며 UI 저장으로 표현하지 않는다. 외부URL Bearer 미전송·row/resource 거부는 별도 보조 검사이고 실제 LuvDia 로그인을 증명하지 않는다.

③ 첫 수정은 두 사이트의114개 migration 전체 적용, 기존223개 적용 artifact·legacy4파일 보존, no-diff·타입·변경 lint·architecture도 확인했다. 원래98건 회차의96PASS/2진단 오류와 이후 관련60건·seal21건·최신 가용성5건 등은 조합 증거이며 단일98건 모두 PASS로 합산하지 않는다. 적용0114의 공백 전용523/553행도 기록하며, 기존0112 두 줄과 함께 전체 diff-check exit2가 남는다. production build·운영 사고·외부 gate의 기존 미완료 상태는 유지한다.

③ 첫 수정 범위 `9d990e41..f37b966b`의 재검토는 중요3건을 해결로 판정했으나 spec·fix quality 모두 수정 필요였다. `/\\foreign.example/../../profile/bing_hayu.webp`를 owning parser는 외부 authority로 거부하는 반면 SQL은 허용하는 잔여 불일치와, 전환 밖 일반 공지의 외부 이미지까지 manifest를 요구한 새 표시 회귀가 남았다. 경로 반례는 실제 함수와 메모리 SQLite의 보조 진단이며 실제 D1 fence 실패 증거로 확대하지 않는다. 기존 전체 기능과 이동·보관 파일의 권한 경계를 함께 유지하도록 두 번째 수정·실제 검증을 진행한다. binary body를 text로 읽은 테스트 경고도 수정 범위에 포함하고 적용 SQL 공백은 낮은 위험의 별도 Minor로 남긴다.

③ 두 번째 수정 코드는 `0d527b33`, 정정 보고서를 포함한 최종 HEAD는 `a1395bf6`다. SQL이 첫 URL 처리→한 번의 decode→authority·잘못된 escape/UTF-8 거부→두 번째 경로 처리를 owning parser와 맞추도록 새0115–0117을 정상 생성했다. 이미 적용한 이전 SQL을 고치지 않았고, 작은 raw/decoded scalar만 고정 계산하여 실제 저장의 NOMEM도 해결했다. 최종 실제 D1 관련6파일122건, 소비자22건, 현재117 생성 SQL 일치1건과 양쪽 지원 CLI의117개 전체 적용이 통과했다. 기존227개 SQL/snapshot·legacy4파일 보존, no-diff·타입·lint·architecture를 확인했다. 앞선118건과 후속 검사를 새로운 고유 건수로 합산하지 않는다.

③ 두 번째 수정의 실제 기존 OTW 관리자 흐름에서는 전환 기록 없이 새 공지 작성→일반 외부URL 미리보기→정상 저장→목록 열기에 도달했다. 최종117 적용 뒤 일반 공지와 보관 own 절대URL의 Blob이 모두480×479로 표시됐고, D1의 raw URL·참조 index와 보관 파일의 R2본문·hash·size·own version을 확인했다. 통제된 로컬 이미지 서버의19개 요청에 Bearer가 없었다. 설정·fixture 준비는 UI 저장 증거와 구분하며 실제 외부 provider·LuvDia 로그인·운영 bucket 검증으로 확대하지 않는다.

③ 두 번째 수정 중 잘못된 fixture·splitter·NOMEM·타입/lint·읽기 보조 오류, 두 CLI bad-port 실패와 첫 UI 저장의 busy snapshot은 원래 기록을 보존했다. 최종117 UI 저장은 첫 시도에 성공했으나 초기 port·lock의 정확한 원인을 격리한 것은 아니다. 최종 staged diff-check만exit0이며 적용0112/0114의 네 공백과 이전 전체 exit2는 그대로 남는다. 같은 리뷰어의 `f37b966b..a1395bf6` 재검토는 spec·fix quality 승인, 잔여3항목 해결·새 중요 문제0이었다. 낮은 위험의 적용 SQL 공백 두 건과 도구·실제 환경의 열린 gate는 유지한다.

최종117 doctor는 **exit1**이다. 성공 줄만 읽고 작성한 최초 PASS 요약을 철회했다. 실패했던5개 PRAGMA를 동일한 선택 config·persist의 실제 CLI로 실행하여 exit0·필수 열 누락0을 확인했지만 전체 doctor 통과의 증거는 아니다. 기존 진단이 child exit·signal·stderr 대신 stdout 배너만 보여 줬고 최초 실행 실패의 원인은 미확정이다. 실제 schema 차이는 관찰되지 않았으며 이 진단 개선과 실제 전체 doctor gate를 Task5에 연결한다. 진단 보완만으로 실패를 해결로 처리하지 않는다.

③의 코드·허용된 로컬 파일 경계는 검토 완료다. ④ 저장·수집 소유권과⑤ 도구·통합 검증, Task5의 사이트별 배포/CI guard·schema 호환·유지보수 절차, 최종 공통 검사·전체 변경 독립 리뷰는 남아 있다. 부분 완료를 전체 Task4·공개 준비 완료로 표시하지 않는다.

## 종료 때 확인할 항목

- 각 코드 범위의 최종 commit·독립 리뷰·영향 범위 검증 결과와 미해결 사항.
- 임시 D1에서 두 사이트의 실제 numbered migration 전체 재생, 이관·변경분·권한·파일의 최종 readback.
- 기존 local DB와 source의 보존, 실제 실행 범위와 위 운영 R2 사고의 원인 수정·영향 확인·미해결 사항. 외부 쓰기가 없었다고 표시하지 않는다.
- 마지막 공통 타입·lint·unit/Worker·architecture 검사. PR merge용 preflight는 이번 검증 범위와 구분한다.
- 실제 LuvDia Clerk 로그인·도메인·격리 자원·운영 규모/한도·실제 Cron/Queue·운영 이관·배포·공개 readback의 미실행 상태.

목표 공개 시각은2026-10-18 11:00 Asia/Seoul이다. 필수 검증이 끝나지 않으면 공개를 연기하고 기존 OTW 수집·갱신을 유지한다.
