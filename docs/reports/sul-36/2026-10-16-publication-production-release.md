# OTW 스키마·PR·19일 공개 운영 반영

## 현재 판정

2026-10-16 실행 중. 로컬 구현·회귀 및 독립 리뷰의 수정 확인 단계다. 원격 마이그레이션, PR 병합, 새 Worker 배포와 실제 19일 전환을 아직 완료로 판정하지 않는다.

승인 계약: **2026-10-19 00:00 KST**에 LuvDia 공개 및 OTW `bing_hayu`, `u_lili`, `yang_mei` 일반 노출·신규 수집 종료. OTW D-day **4 러브다이아 데뷔, 9 빙하유 생일, 10 양메이 생일, 11 유리리 생일**도 운영자가 명시 확인했다. 원본과 관리자 열람, 다른 멤버와 정당한 공유 콘텐츠를 유지한다. 실제 전환은 서버 시간 정책이며 예약은 관측만 담당한다.

## 보존과 리뷰 범위

- 원본 작업 트리 HEAD `d27f26a4628dff34b9eb06628b957b26c3b3aa11`, staged/unstaged/untracked **409파일**을 SHA256 manifest·파일 사본·binary patch로 보존했다. 원본 앱 코드는 이 실행에서 편집하지 않았다.
- 관리 작업 트리 `otw-publication-release`, 브랜치 `codex/otw-publication-release`에서 보존 사본을 사용한다. 운영 X 전용 작업 트리는 별도로 보존한다.
- 전체 변경을 사이트/권한·파일·DB·예약/Queue/AI·보존·비용의 연결 흐름으로 독립 리뷰했다. 모든 생성 snapshot과 미관련 문서를 개별 줄 단위로 감사했다는 의미는 아니다.
- 현재 일반 writer가 참조하는 이관 모듈과 schema는 폴더 단위로 빼면 계약을 깨므로 필수 연결 범위에 포함한다. 지속 이관 플랫폼을 초기 공개의 새 요구로 확대하지 않는다.
- 별도 사고용 `scripts/maintenance` 네 파일은 정상 런타임에서 사용하지 않는다. 원본과 SHA256 일치를 확인해 release source 밖 ignored 보존 경로에 둔다. 공개 릴리스에는 포함하지 않는다.

## 차단 결함과 수정

| 경계 | 원인과 수정 | 확인 |
| --- | --- | --- |
| 산출물·사이트 | 커밋 표기만으로 같은 HEAD의 수정 파일과 잘못된 D1 UUID를 놓쳤다. source/artifact SHA256, migration head, D1/R2/Workflow/Analytics binding 및 dashboard 변수 보존을 검증한다. | 변조 RED→GREEN, 환경 파일 제외 |
| 원격 사전 검사 | 수기 schema 목록에서 content_transitions/X 의존성이 누락됐다. canonical Drizzle column registry를 사용하고 `--schema-only`는 migrations/schema만 검사한다. | unit26 PASS, 실제 로컬 CLI120테이블 PASS |
| Feed·CHZZK | source 재연결 뒤 과거 글 소유자 노출, 정각을 넘긴 cache 덮어쓰기. own-row predicate와 최종 cache SQL guard·site 전달로 수정했다. | 실제 Worker/D14 PASS |
| 회원 POST | metadata 대기 후 제목·썸네일을 공개 경계 재확인 없이 반환했다. 신규 관측 channel까지 다시 확인한다. | 일반 회원 POST 및 양 사이트 회귀 |
| AI 신규 발행 | 대기/재시도가 정각 뒤에도 새 분석을 발행할 수 있었다. start 전후·create SQL·claim·paid POST 직전 owning guard를 연결한다. 기존 발행 응답의 retain/finish와 unknown 복구를 차단하지 않는다. | 실제 D1 queued/lease/issued response 및 관리자 진입 회귀 |
| 일반 수집 | 늦은 page/video 관측이 후보/소속을 갱신했다. 알려진 선택 ID는 신규 GET에서 제외한다. 정각 이후 미확인 ID는 원본 page/message 증거에 보관하고 channel 관측 뒤 허용 후보·origin만 반영한다. 응답을 보존하며 거절은 failed/publication_cutoff, job partial로 남긴다. | 실제 Queue, 첫 발견 전후·혼합/재전달 회귀 |
| 관리자 새로고침 | 미이관 일반 경로에 정책 guard가 없었다. 신규 요청과 최종 UPDATE를 보호하고 일반 원본 응답을 owning event에 보관한다. 이미 접수된 이관 요청은 기존 journal을 유지한다. | 선택/비선택·늦은 응답 HTTP 회귀 |
| 작업 묶음 | 정책 거절만 있는 partial이 다른 멤버의 검수도 막았다. cutoff-only partial만 허용하고 선택 항목은 제외 사유를 보존한다. 다른 오류 partial을 성공으로 바꾸지 않는다. | 전체 회귀에서 판정 |
| 점검 시험 | terminal item 완료만으로 미해결 reconcile 책임까지 사라졌다고 가정했다. 실제 Queue finalization 후 다시 점검 정지한다. 보호 조건을 완화하지 않았다. | Workerd/Workflow2 PASS |

채널의 현재 공유 예외에는 정상 비대상 멤버와 활성 링크/승인 채널 관계만 인정한다. 과거 비활성 링크만으로 선택 전용 채널의 수집을 재개하지 않는다.

## 스키마 승격

- OTW는0101+0137/0138에서 미적용0102~0136 및0139~0140, LuvDia는0136에서0137~0140를 적용한다. 적용된 SQL 파일은 변경하지 않는다.
- Drizzle custom으로 생성한0140은 발행된 ingestion 응답 보존 계약과 DB의 `content_transition_json_roots` view를 일치시킨다. DROP/CREATE VIEW 두 문장이고 데이터 재구성·백필은 없다. immutable0134 보존 및 현재 canonical SQL parity 단위2 PASS, 전체 적용 재검증은 진행 중이다.
- fresh 격리 로컬139 migration chain PASS. populated 양 사이트 실제 순서 재현에서 FK·제안 원본/자식·X raw 및 작업 상태·기존 SQL 쓰기와 새 Worker 일반 읽기2 PASS.
- 비용은 D1 `meta.rows_read/rows_written`으로 측정했다. OTW 시험에서는 metadata DDL을 포함한 승격 읽기가 약249만 행이었다. fixture 규모가 운영 비용 상한을 증명하지 않으므로 원격 직전 합산 예산과 영향 테이블 규모를 재확인한다.
- 0137/0138 OTW 기존 파일명·내용을 보존하고 중복 적용하지 않는다. 전수 데이터 정합성·과거 백필·재귀 음악 검사는 실행하지 않는다.

## 배포 경로

기존 OTW Workers Builds의 master 연결을 유지한다. dashboard 배포 명령을 `node scripts/deploy-workers.mjs --site=otw`로 변경·저장하고 재조회했다. build 명령은 `pnpm run build`다. 구형 공개 Clerk 빌드 입력을 보존하면서 사이트별 `OTW_VITE_CLERK_PUBLISHABLE_KEY`, `OTW_CLERK_ISSUER` 입력을 같은 앱으로 추가·저장하고 페이지 재조회로 확인했다. 값과 토큰은 문서에 남기지 않는다.

양 사이트 canonical config는 `keep_vars:true`로 기존 dashboard 관리자 인증 변수를 보존한다. 생성 config도 이를 유지해야 배포할 수 있다. [Cloudflare 변수 보존 계약](https://developers.cloudflare.com/workers/wrangler/configuration/)에 따른 호환 조치다.

순서: 최종 검증/정확한 PR HEAD → 예산·복구 지점 → 호환 migration/readback → merge → OTW 자동 배포 → 같은 병합 소스의 검증 산출물로 LuvDia 배포. OTW 중복 수동 배포를 하지 않는다. 복구 시 데이터는 유지하고 schema·공개 정책에 호환되는 버전만 사용한다.

## 남은 증거

13:45 KST: 전체 preflight의 architecture/typecheck/lint는 통과했으나 통합 test 종료가 지연되어 전체 통과 판정은 없다. 단위2329개 중83 실패를 원인별 수정·재검증 중이며 최신 남은9파일과 영향받은 metadata/error/view 회귀79개는 모두 통과했다. 메뉴 이동 뒤 달력 날짜가 Play 요청에 남던 실제 회귀도 해당 흐름에서 RED→GREEN으로 확인했다. Worker 전체48파일은 실행 중이고 미해결 실패가 있어 운영 반영을 차단한다. 실패·무효화·미실행 gate만 보완하여 합성한 최종 검증 기록을 남긴다.

양 사이트 build·최신 app/test/Worker/Node 타입·lint·architecture·mirror check 및 sync 시험5개는 통과했다. 격리 로컬0140 apply·full doctor도 통과했다. Catalog의 나머지 실패6개 재검증은 통과했고 이전64개 통과와 합성한다(필터 재실행을 전체70개 재실행으로 보고하지 않는다).

19일00:01 KST 단일 관측 예약 `otw-luvdia-19`를 기존 목록 확인 후 생성·재조회했다. API/화면의 실제 전환을 읽기 전용으로 관측하고 완료·실패만 알린 뒤 중지한다. 실제 공개는 이 예약에 의존하지 않는다. 이전 `otw-9-d1`는 PAUSED를 유지한다.

리뷰 최종 OID, Worker 미해결 회귀·0140 populated upgrade, 원격 승격 비용/readback, 배포 버전/산출물 해시, 정상 도메인/관리자 인증, 자연 예약 실행, 19일 실제 결과, 병합 증명된 branch 정리가 남았다. 로컬 fake clock·provider fixture를 실제 정각·운영 관리자 로그인·유료 AI 성공으로 대신하지 않는다. 운영 결과는 이 기록과 owning PR ledger에 실제 상태로 갱신한다.

고비용 후속 작업은 [통합 작업 목록](2026-10-16-work-register.md)의 보류·재개 조건을 유지한다.
