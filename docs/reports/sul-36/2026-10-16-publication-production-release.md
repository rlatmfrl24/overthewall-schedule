# OTW 스키마·PR·19일 공개 운영 반영

## 현재 판정

**2026-10-16 15:52 KST: 최소 운영 스키마 승격·PR160 병합·양 사이트 운영 배포 완료.** 검토 HEAD `6da550fc4da1577ef13a92f80617027a47764ccd`, 병합 소스 `037d4252278f17950b10be9af8b33a525027a9e6`다. 실제 19일 정각은 아직 관측 전이며 예약으로 확인한다. 전체 test suite PASS를 뜻하지 않는다. [PR160](https://github.com/rlatmfrl24/overthewall-schedule/pull/160)의 ledger와 아래 운영 결과를 최신 판정으로 사용한다.

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
| 점검 경합 오류 | 카탈로그의 최종 SQL 직전에 점검 정지가 이기면 일반 constraint 정규식이 이를 입력 오류422로 바꿨다. 공통 decoder가 알려진 점검 오류·cause를 보존해 기존 HTTP503/재시도 계약으로 전달한다. | 실제 Worker RED1, 단위 RED2→GREEN3; 최종 Worker 재검증 중 |

채널의 현재 공유 예외에는 정상 비대상 멤버와 활성 링크/승인 채널 관계만 인정한다. 과거 비활성 링크만으로 선택 전용 채널의 수집을 재개하지 않는다.

## 스키마 승격

- OTW는0101+0137/0138에서 미적용0102~0136 및0139~0140, LuvDia는0136에서0137~0140를 적용한다. 적용된 SQL 파일은 변경하지 않는다.
- Drizzle custom으로 생성한0140은 발행된 ingestion 응답 보존 계약과 DB의 `content_transition_json_roots` view를 일치시킨다. DROP/CREATE VIEW 두 문장이고 데이터 재구성·백필은 없다. immutable0134 보존 및 현재 canonical SQL parity 단위2 PASS, 격리 로컬 전체 적용·doctor 및 populated 재검증2 PASS다.
- populated 양 사이트 실제 순서 재현에서 FK·제안 원본/자식·X raw 및 작업 상태·기존 SQL 쓰기와 새 Worker 일반 읽기를 보존했다. 추가로 현재 배포된 X 최적화 Worker의 동일 빌드 산출물(SHA256 `db92e7ba9d6ef256fa9440ee308fd0786638331d4db4c0dd1a1868ad7a6858f0`)을 정상 Wrangler dev로 실행해, 별도 로컬0140 DB에서 멤버 조회·실제 일정 저장·저장 결과 재조회 모두 HTTP200 및 DB의 원래 제목/상태를 확인했다. 공개 GET을 DB 직접 쓰기로 대체한 검증이 아니다. 신규 fixture 멤버만 SQL로 준비했고 실제 일정 변경은 기존 Worker HTTP 진입점을 사용했다.
- 비용은 D1 `meta.rows_read/rows_written`으로 측정했다. OTW 승격은 metadata DDL을 포함하여 **2,494,665행 읽기·5,562행 쓰기**, LuvDia는 **979행 읽기·29행 쓰기**였다. fixture 규모가 운영 비용 상한을 증명하지 않으므로 원격 직전 합산 예산과 영향 테이블 규모를 재확인한다.
- 0137/0138 OTW 기존 파일명·내용을 보존하고 중복 적용하지 않는다. 전수 데이터 정합성·과거 백필·재귀 음악 검사는 실행하지 않는다.

## 배포 경로

기존 OTW Workers Builds의 master 연결을 유지한다. dashboard 배포 명령을 `node scripts/deploy-workers.mjs --site=otw`로 변경·저장하고 재조회했다. build 명령은 `pnpm run build`다. 구형 공개 Clerk 빌드 입력을 보존하면서 사이트별 `OTW_VITE_CLERK_PUBLISHABLE_KEY`, `OTW_CLERK_ISSUER` 입력을 같은 앱으로 추가·저장하고 페이지 재조회로 확인했다. 값과 토큰은 문서에 남기지 않는다.

첫 branch build `8491b6a9-98f9-4a1e-aae0-cfca7952252c`는 authorized-parties 빌드 입력 누락으로 실패했다. 같은 앱의 정확한 사이트 origin을 `OTW_CLERK_AUTHORIZED_PARTIES`로 저장·재조회한 뒤, 동일 HEAD build `a555e15d-de85-46ac-a807-0e00a6b413a5`는 성공했다. 기존 non-production `versions upload` 경로가 inactive preview `f5476d15-898a-45ea-8665-37cb2d643512`를 만들었으며 production 활성화가 아니다. 14:17 KST authoritative deployment readback에서 OTW는 `3a95078a-1ef5-4c44-91d0-9ece742620b2`, LuvDia는 `f4df03db-0692-4506-a736-52857ca60a1d`를 유지했다.

양 사이트 canonical config는 `keep_vars:true`로 기존 dashboard 관리자 인증 변수를 보존한다. 생성 config도 이를 유지해야 배포할 수 있다. [Cloudflare 변수 보존 계약](https://developers.cloudflare.com/workers/wrangler/configuration/)에 따른 호환 조치다.

순서: 최종 검증/정확한 PR HEAD → 예산·복구 지점 → 호환 migration/readback → merge → OTW 자동 배포 → 같은 병합 소스의 검증 산출물로 LuvDia 배포. OTW 중복 수동 배포를 하지 않는다. 복구 시 데이터는 유지하고 schema·공개 정책에 호환되는 버전만 사용한다.

## 남은 증거

전체 preflight의 architecture/typecheck/lint는 통과했으나 전체 명령 통과 판정은 없다. 단위2329개 중83 실패를 원인별 수정했고 최신 남은9파일과 영향받은 metadata/error/view 회귀79개는 모두 통과했다. 메뉴 이동 뒤 달력 날짜가 Play 요청에 남던 실제 회귀도 해당 흐름에서 RED→GREEN으로 확인했다. 최초 전체 Worker48파일은813개 중473 PASS /334 FAIL /6개 beforeAll 미실행이었다. 공개 관련 실패는 수정·재검증하며, 아래 범위 결정에 따라 과거 이관 전용 실패는 FAIL 그대로 후속 분리한다. 전체 suite PASS를 주장하지 않는다.

267개 연속 실패에는 앞선 시험의 task-owned settings가 다음 시험의 명시적 분류 경계를 오염시킨 격리 결함이 있었다. task-owned 기준 설정을 복원했다. 남은 구형 시험은 현 maintenance 정책이 금지한 최종 정지 후 새 source 작업·비활성 target 접수를 기대한다. 이 플랫폼 전체의 시험 계약 정비는 후속이다. 설정 복원과 독립 launch·실제 HTTP 오류 회귀만 현재 변경에 남기며, 별도 정리분은 SHA256 검증 사본으로 보존했다. 시험 제외 설정이나 보호 조건 완화로 실패를 숨기지 않는다.

직렬 재검증13파일185개가 전체 PASS(exit0, 미실행0)로 완료됐다. 공개/보관 경계68, catalog17(기존 읽기 비용 상한 유지), ingestion22, AI batch12, 자동 갱신 거절27, AI review9, release repository6, 사이트 인증6, SEO storage4, member pagination2, D-day schema2, settings8, populated upgrade2개다. [최초 FAIL 기록](https://github.com/rlatmfrl24/overthewall-schedule/pull/160#issuecomment-6208413837), [추가 PASS/FAIL 및 preview 식별 기록](https://github.com/rlatmfrl24/overthewall-schedule/pull/160#issuecomment-6208767331)을 owning PR에 남겼다.

양 사이트 build·최신 app/test/Worker/Node 타입·lint·architecture·mirror check 및 sync 시험5개는 통과했다. 격리 로컬0140 apply·full doctor도 통과했다. Catalog의 나머지 실패6개 재검증은 통과했고 이전64개 통과와 합성한다(필터 재실행을 전체70개 재실행으로 보고하지 않는다).

19일00:01 KST 단일 관측 예약 `otw-luvdia-19`를 기존 목록 확인 후 생성·재조회했다. API/화면의 실제 전환을 읽기 전용으로 관측하고 완료·실패만 알린 뒤 중지한다. 실제 공개는 이 예약에 의존하지 않는다. 이전 `otw-9-d1`는 PAUSED를 유지한다.

리뷰·0140 populated upgrade·원격 승격/readback·양 사이트 배포·정상 도메인/관리자 인증·증명된 branch 정리·X 배포 후 자연 실행은 아래 결과로 완료했다. 실제19일 전환과 고비용 후속은 남아 있다. 로컬 fake clock·provider fixture를 실제 정각이나 유료 AI 성공으로 대신하지 않는다.

고비용 후속 작업은 [통합 작업 목록](2026-10-16-work-register.md)의 보류·재개 조건을 유지한다.

## 15:24 KST 범위 재확정과 최소 운영 조회

사용자는 LuvDia 데이터 이관 완료를 재확인하고, 재이관·재복사·대량 백필 및 공개와 무관한 과거 이관 플랫폼 전체 완성을 이번 공개의 선행 조건에서 제외했다. 남은 이관 전용 실패는 후속으로 유지한다. 공개 경계·정상 관리자 접근·원본 보존·다른 멤버 운영·최소 스키마 호환성은 계속 필수 검증이다.

운영 최소 조회에서 양 사이트 `content_transitions` 제어 레코드는 모두 없었다(OTW는 테이블 자체가 미적용, LuvDia는 빈 테이블). 따라서 이관 상태를 준비/정지/활성으로 전이해야만 실행되는 구형 writer·receipt·file transfer 시험 실패는 현재 독립 공개/정상 운영을 재현한 실패가 아니다. 정상 파일/권한·정각 경계는 별도 실제 Worker 시험이 소유한다. 이 판단이 틀리는 조건은 운영에 새 이관 제어 레코드를 만들거나 이관 플랫폼을 다시 실행하는 경우다. 이번 작업에서는 둘 다 하지 않는다.

승격 전 기록: OTW migration103개(0101+0137/0138), LuvDia136개, 제안 원본/참여자/원작자3/4/3행. 양 사이트 복구 북마크를 확보했고 합계1,549행 읽기·0행 쓰기였다. private 원본은 ignored 증거 파일에만 보관했다. 15:05 집계 계정236,004행 읽기에 로컬 승격 예상2,495,644행을 합하면 약273만 행이다. 실제 적용 직전 집계와 이력을 다시 확인한다.

점검 경합의 공통 decoder 수정만으로는 HTTP handler의 일반500 변환을 통과하지 못하는 것을 실제 Worker에서 추가 확인했다. handler도 알려진 점검 오류를 원형 전파하도록 수정했고 단위 RED2→GREEN17을 확인했다. 실제 정상 HTTP 진입점에서 song/entity 마지막 SQL 경합2개는503·Retry-After·no-store 및 원본 전체 보존으로 PASS, 독립 LuvDia launch(일반 회원 저장·관리자 catalog 저장/공개·일반 readback·파일)는 별도1개 PASS다. 요청 fixture 수정 후 동일 계약을 재검증한 합성 결과이며 전체 CT280개 통과가 아니다. 최종 architecture·lint·test/Worker/Node 타입과 배포 manifest8시험도 PASS다. 과거 플랫폼 정리 시도 중 중단한 실행은 완료 PASS로 계산하지 않는다.

## 운영 반영 결과

| 항목 | 실제 결과 |
| --- | --- |
| GitHub | PR160은2026-10-16 06:38:42Z 병합. 검토6da550fc와 병합037d4252의 전체 tree 차이0. 독립 공개 범위 리뷰에 미해결 Critical/Important 없음. |
| DB | OTW37개/LuvDia4개 최소 승격 완료, 양 사이트 migration140개와 canonical 목록 일치. aborted_at 및0140 view SQL 정확 일치. OTW 기존 제안3/참여4/원작자3행의 모든 기존 컬럼 보존. remote schema-only doctor 양 사이트 PASS. 전수 정합성 검사·재이관·백필 없음. |
| OTW 배포 | 기존 master 자동 Build `7c97f79b-2c39-41f1-97e7-eb5b90772a3f` 성공. 활성100% version `0e140a70-3574-4af4-8b4f-261477ed766a`, deployment `213414a3-bc94-4504-a999-d12790e7b4b2`. 수동 중복 배포 없음. |
| LuvDia 배포 | 동일 병합037d4252에서 재빌드하고 검증 스크립트로 배포. 활성100% version `16fb230c-210c-4501-a8e2-cb367614fa30`, deployment `88cf3054-8c48-4084-97ca-99e74e594681`. |
| 소스 일치 | 양 사이트 Git commit037d4252, Git tree `ca454f34fd996220e35ef2d9edcd5620d1544c20`. canonical source SHA256 `3a5925d98e14e318d2507cfba35b9931b84479dc4d52f45c828eddb1762abf52`. Windows 실파일 hash `8277921c1262aa5d610a5fec46cb576acbd8e2b4f0993ee7a74351a918c61256`와 차이는1,431파일 CRLF/LF뿐임을 Git blob batch로 확인했고 canonical hash는 실제 OTW CI log와 정확히 일치했다. |
| 산출물 | OTW 실제 CI artifact SHA256 `5852b857a09cd1d81414a2b2a6a49b9afa52dd082f18bc21e93546a8382d9526`; LuvDia `97fc99e09b26332ca8446fe380fdca44e5943963349e88dc674599d305a6b3f9`. 사이트별 branding/Clerk/config 때문에 artifact는 별도다. |
| 리소스·인증 | OTW D1 `133b980d-1701-427e-93fd-8c9dcca1132e`/R2 `otw-schedule`, LuvDia D1 `ce8eec7f-0922-4119-ab75-f67133b94312`/R2 `luvdia-schedule`을 활성 버전 binding에서 재조회했다. 양 사이트 Clerk 관리자/issuer/authorized-parties secret binding 유지. 실제 도메인의 정상 Clerk 로그인과 관리자 대시보드 접근 확인. 값·토큰 출력 없음. |
| 예약·Queue | 양 사이트 Cron `3,13,23,33,53 * * * *` 유지. 사이트별 Queue6개 모두 unpaused, 사고 전 snapshot과 Queue 설정·consumer ID/설정·retry·retention 모두 동일. 메시지 purge나 강제 실행 없음. LuvDia Play 자동화의 기존 의도적 중지는 유지. |
| 실제 공개 흐름 | 익명 LuvDia `/` 카운트다운·정확한10/19 00:00 KST·관리자 링크 표시. 멤버/D-day/공지 API, profile/R2 직접 파일, 인코딩 경로403; HEAD body0; private/no-store와 Authorization/Cookie Vary 확인. status 기존 GET/HEAD200 계약 유지. 정상 Google 로그인→관리자 대시보드→사이트로 돌아가기→멤버3명 미리보기와 `멀티뷰`, 빙하유 이미지 실제480px 로드 확인. |
| OTW 실제 흐름 | 공개 status=open, 멤버8명(정각 전 이관3명 포함), D-day4/9/10/11 정상 조회. 새 배포 화면에서 기존 관리자 세션→관리자 대시보드 정상 진입. 실제 숨김은 아직 미래인19일 서버 시간 정책에 따라 적용한다. |
| D1 예산 | 06:46Z 기존 Cloudflare 집계 account3,127,313 reads/19,595 writes. 승격·schema 검사·정상 운영이 함께 포함된 값이며 migration 단독 비용이라고 주장하지 않는다. 원격 대량 작업은 계속 보류한다. |
| 보존·정리 | 원본 WIP409파일 재해시 변경0. GitHub가 제거한 remote 릴리스 branch의 부재와 merge OID/포함 관계를 증명한 뒤 local codex/otw-publication-release6da550fc와 그 stale remote ref만 제거했다. master=origin/master037d4252. 원본397love 작업 branch·X 작업 트리·공개 관측용 작업 트리 모두 유지한다. |

운영 readback은 ignored `.tmp/publication-release-20261016/`의 `promotion-readback.json`, `public-production-readback.json`, `production-operations-readback.json`, `otw-ci-provenance.json`, `source-parity-proof.json`, `branch-cleanup.json`에 보관했다. 카운트다운 실제 화면은 `luvdia-countdown-production.png`다. 운영 완료 후 이 문서와 통합 목록에 추가한 증거는 로컬 문서 갱신이며, 이를 배포 소스의 새 코드 변경이나 두 번째 운영 배포로 취급하지 않는다.

기존 `otw-9-d1` 확인 예약은 중복 생성 없이10/16 15:55 KST 배포 후 X 자연 실행의 읽기 전용 확인으로 갱신했다. 15:55:27 최소 표본에서 새 버전의 정규 실행 **2310·2311 모두 success**, 각4개·총8개 handle 점검/갱신, error=null을 확인했다. 새 게시물 저장은0건이며 이를 새 데이터 저장 성공으로 확대 해석하지 않는다. 최신3행 읽기·0행 쓰기였고 강제 수집 없이 실제 scheduled 결과를 확인한 뒤 예약을PAUSED로 되돌렸다. 로컬 빈 작업11행·미래 재시도7행은 전체 X 비용 회귀9개에서 유지됐다. 운영 표본3행은 수집 job 전체의 총 읽기량이라는 뜻이 아니다.

`otw-luvdia-19`는10/19 00:01 KST 관측 예약을 유지한다. 공개 전환 자체는 예약에 의존하지 않는다. 공개 배포 뒤 과거 이관 전용 코드 제거는 공개 정책·일반 저장·파일/과거 자료 보존을 담당 기능으로 먼저 분리하는 별도 후속이며 데이터·이력 삭제를 포함하지 않는다.
