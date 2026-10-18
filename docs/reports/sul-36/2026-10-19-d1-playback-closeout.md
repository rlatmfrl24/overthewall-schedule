# 2026-10-19 D1·Play 점검 및 정리

기준 소스는 OTW PR164 merge `006d835b33fa79b8a981a0c277ae4aafb92895ea`다. 현재 작업 브랜치는 `codex/d1-cost-playback-closeout`이며 기존 원본/X WIP와 분리했다. 운영 배포·마이그레이션·수집/AI 설정 변경 없이 기존 로그와 격리 로컬 검증을 우선했다.

## D1: 확인된 원인과 귀속 한계

10/19 05:10~05:19 KST 계정 증가227,431행 읽기·35행 쓰기의 정확한 요청별 귀속은 확정할 수 없다. 중간/최종 스냅샷은 계정 합계이며 집계 지연도 미상이다. 기존 저장 로그의 제한된 시간 창을10회 검색한 결과:

- 05:13:30에 양 Worker의 자연 Cron 각1건이 확인됐고 해당 창 저장 Queue 로그는 각0건이다. 빈 Queue나 wrapper 성공을 모든 업무 성공으로 확대하지 않았다.
- OTW Operations status/job-summaries 각1건, 자동 일정 보정 성공2건, LuvDia 자동 일정 보정 성공3건/409거절1건이 있었다. UI의 정상 자동 effect는 updated=0이어도 감사 INSERT를 수행하므로 쓰기 증가의 후보이나 실제 행수는 미기록이다.
- 정확한 개별 D1 비용 로그는 OTW `GET /api/play/config`의 cache miss/200/12행 읽기1건이다. sampling 로그의 부재를 요청 부재로 해석하지 않는다.
- Observability 검색 응답의 `statistics.rows_read`는 로그 저장소의 검색 비용이며 D1 사용량이 아니다. 개별 확인 비용을 집계 증가에서 빼서 나머지 원인을 확정하지 않는다.

별도로 `handleAsset`→`D1AssetAccessReader.readAccess`의 실제 쿼리에서 반복 전체 순회를 확인했다. 수정 전에는 모든 프로필·공지·카페 행을 순회하며 correlated EXISTS로 요청 파일을 찾았다. 캐시된 바이트와 별개로 GET/HEAD마다 권한 판단에서 발생한다.

수정은 기존 `idx_asset_file_reference_path`로 요청 경로와 R2 prefix를 제거한 경로의 후보만 먼저 찾고, 소유 행을 PK로 조회한다. 현재 raw URL·row key·origin·선정 소유자·공유 정상 참조·공개 시간 정책을 그대로 검증한다. 데이터·schema·마이그레이션·파일 보존 규칙·캐시 권한을 변경하지 않았다.

격리된 실제 workerd D1에서 무관한 공지10개→1,000개의 동일 요청을 비교했다. 비용에는 접근 revision 조회가 포함되며 모든 측정 쓰기는0행이다.

| 요청 | 수정 전10개→1,000개 | 수정 후10개→1,000개 |
| --- | --- | --- |
| 정적 프로필 | 64→4,024행 | 23→23행 |
| 참조된 공지 R2 파일 | 62→4,022행 | 27→27행 |
| 존재하지 않는 R2 파일 | 56→4,016행 | 16→16행 |

EXPLAIN에서 `SCAN p/n`이 사라지고 기존 경로 인덱스와 소유 행 PK를 사용한다. 이것은 재현한 반복 비용의 수정 근거이며 계정 증가 전체가 이 쿼리였다는 증거나 운영 반영 후 실측은 아니다.

06:30 KST 기존 계정 집계는 읽기2,090,069/500만행(41.80%), 쓰기23,111/10만행(23.11%)이었다. 사용량 조회 자체는 GraphQL 집계이며 직접 D1 SQL이 아니다. 이번 조사는 원격 SQL·전체 스캔·수집 강제 실행을 하지 않는다.

## Play: 실제 재현과 원인 분리

정상 로그아웃으로 게스트 메뉴를 확인한 뒤 실제 운영 `/play`에서 공식 곡 Bye Summer를 선택했다. IAB에서는 실제 영상과 진행 시간0:13→0:41을 확인했다. 같은 Chrome에서는 영상 영역과 큐가 표시되지만 수분간0:00/불러오는 중에 머물렀다. 일반 재생 버튼 재클릭과 큐 비우기→새 플레이어 생성으로도 재현됐다.

Chrome의 iframe은 연결돼 있고 영상 영역은 보이나 `src=/embed/?…`로 초기 영상 ID가 없고 실제 frame document는 about:blank였다. console error/warn은 없었다. 따라서 비회원 API 인증 실패로 단정하지 않았다.

DB/API를 사용하지 않는 localhost 진단 페이지에서 **실제 기존 TS helper를 그대로 로드**하고 생성 옵션의 초기 videoId만 비교했다. 이 진단은 원인 분리를 위한 보조 근거이며 실제 앱 사용자 흐름의 완료를 대신하지 않는다.

- A, videoId 없음: 06:42:13~06:42:43 이후에도 onReady 없음, elapsed=null/about:blank.
- B, `videoId=x5b61QNSshU`: 06:42:52.400 onReady→06:42:53.323 playing. 실제 진행3.63→8.63→13.64→23.64초. origin·playerVars·helper는 동일하다.
- [공식 YouTube API 계약](https://developers.google.com/youtube/iframe_api_reference)의 초기 videoId·onReady·명시적 재생 호출을 따른다. videoId 없는 생성이 모든 브라우저에서 금지됐다고 주장하지 않는다.

이후 사용자는 **직접 연 일반 Chrome에서 정상 재생**을 확인했다. IAB의 정상 비회원 재생과 함께 실제 사용자 흐름의 근거로 우선한다. 자동화 Chrome의 정지를 운영 장애로 확정하거나 API 인증을 완화하지 않는다.

초기 ID·준비 취소·재시도 등을 검토한 후보는 단위 회귀를 통과했지만 실제 앱 자동화 재생은 여전히 준비 단계에서 멈췄다. 단독 helper 실험의 성공을 앱 전체 수정 완료로 확대하지 않는다. 후보6개 파일과 patch를 `play-candidate-preserved/`에 보존하고, 이 작업 시작 시 깨끗했던 해당 파일만 기준 `006d835b`로 복원했다. **이번 PR에는 Play 코드 변경이 없다.** 자동화 환경에서만 나타난 차이의 원인은 미확정이다.

## 검증 기록

- 파일 비용 회귀: 수정 전 RED, 수정 후 실제 D1 파일 회귀20 PASS. profile/Cafe 텍스트 PK·공유 파일·현재 raw 참조·origin rebasing을 포함한다.
- 실제 Worker 파일 경로3개 PASS: 일반/초안 외부 파일·변조 참조, 관리자 보관 원본의 실제 바이트, GET/HEAD/조건부 응답과 공유 공개 바이트. 익명·일반 회원·관리자 경계를 포함한다.
- 변경된 assets2파일 ESLint·Worker 타입·architecture PASS. 독립 정적 리뷰의 material finding 없음.
- X 비용은 기존 빈 작업11행·미래 재시도7행을 유지한다. 20개 중19 PASS/1 FAIL은 공개일 이전 초기 참조를 만들려는 기존 시간 가정이다.
- 전체 preflight의 architecture·테스트/Worker/Node 타입·전체 lint는 PASS다. 테스트는2,877 PASS/51 FAIL로 중단돼 이후 단계는 그 실행에서 수행되지 않았다. 이는 Play 후보가 포함된 중간 스냅샷 결과이며 최종 PR 전체 suite PASS로 표시하지 않는다.
- 정확한 기준 `006d835b`의 소스를 추출해 실패한6개 파일을 한 번 비교 실행했다.197개 중146 PASS/51 FAIL이고 실패 이름의 추가·누락은0개다. archive23·ingestion3·public catalog2·X hydration10·X cost1·CHZZK12개로 동일하다. 소스·설정·lockfile 해시는 실행 전후 같다.
- 기존 실패에는 실제 공개일 경계, 고정 revision14와 현재15의 차이, active member fixture 불일치가 포함된다. CHZZK12개는 날짜와 무관하게 캐시 mock이 현재 members allowlist 조회를 제공하지 않는 fixture 불일치다. 전체 실패를 하나의 날짜 문제로 묶지 않는다. SQL 최종 보호의 `max(unixepoch(), …)`나 권한을 완화하지 않았으며 테스트 제외도 하지 않았다.
- 최초 Worker 회귀는 공유 의존성의 gsap 최상위 링크 부재로 import FAIL했다. 설치돼 있던 실제 gsap 경로 alias로 직접 경로 회귀를 검증했다. 이후 원본 dependency junction은 보존하고 릴리스 작업 공간에 Node24/pnpm11.7 frozen offline install을 완료했다. lockfile/원본 의존성은 변경하지 않았다. 최종 소스에서 별도 alias 없이 정식 설정으로 파일20개와 Worker 파일 경로3개를 다시 통과했다. 후자의79개는 명시한 변경 범위 밖으로 필터됐으며 전체 suite 통과와 구분한다.

최종 소스에서 Node24의 `scripts/build-site.mjs --site=otw`와 `--site=luvdia`가 각각 종료0·산출물 manifest 검증을 통과했다. 기존500kB 초과 chunk 경고는 남아 있다. agent mirror 검사27개와 변경된 Markdown11파일의 로컬 링크108개도 통과했다. Play·X·drizzle의 기준 소스 대비 diff가 없는 것을 확인했다. 기존51개 실패를 해결하기 전에는 전체 릴리스 gate가 통과한 것으로 보지 않는다.

## 문서와 Git 정리

완료된 공개 전환·자연 X·양 사이트 자연 자동 일정을 `docs/current-work.md`에 반영하고 기존 미커밋 관측 보고서4개를 현재 문서에서 연결했다. 이전 보호 보고서3개 원문은 수정하지 않았다. 정각 관측·9004 fallback 실제 발동·R2 사고 전체 복구의 미확인 한계를 완료로 바꾸지 않았다.

PR164의 exact head `44491af3…`와 merge `006d835b…`, 현재 원격 master 포함 관계, open PR 없음, 깨끗한 작업 트리와 사용 중인 프로세스 부재를 확인했다. ignored 비의존성193파일/21,848,551바이트를 복사하고 SHA256을 전부 대조했다. 재현 가능한 node_modules를 제외한 env·로컬 DB/WAL·산출물은 별도 보존했다.

일반 `git worktree remove`는 Windows 긴 파일명에서 오류를 반환했지만 Git 등록은 제거했다. 남은 디렉터리는 파일을 강제 삭제하지 않고 `.tmp/d1-playback-closeout-20261019/play-worktree-residual`로 보존 이동했다. 이후 예상 OID 조건으로 병합된 local ref `codex/otw-play-public-access`를 삭제했다. 해당 원격 branch는 이미 없으며 다른 remote ref를 삭제하지 않았다.

원본 WIP·X 작업 트리·현재 호출 작업 트리·master는 보존한다. master/origin/master는 `006d835b…`로 같다. 미완료 새 task branch는 삭제하거나 자동 병합하지 않는다.

정리 후 원본412개·X16개 상태 항목의 파일 SHA256, HEAD, staged/unstaged diff와 status 해시가 최초 스냅샷과 모두 같다. 기존 미커밋 관측 보고서4개도 원문을 보존한다. 이 수치는 보호 대상409개 WIP·별도 X10개 변경에 다른 기존 보고서/상태 항목을 포함한 실제 status 전체 수다.

## 반영 상태와 다음 작업

D1 수정과 회귀, 완료 관측 보고서 및 현재 문서만 Draft PR로 준비한다. 이번 작업에서 새 병합·배포·원격 SQL·마이그레이션·운영 설정 변경은 하지 않았다. 현재 운영 버전에는 이 비용 수정이 아직 없다. 원격 계정 증가 전체의 귀속과 배포 후 감소는 미확인이다.

다음 순서는 기존 실패51개의 fixture/공개 경계 기대를 보호 정책 변경 없이 정리→최종 gate→승인된 배포→기존 사용량 집계와 최소 표본으로 감소 확인이다. 대량 이관·백필·전수 검증과 Play/AI 자동화는 재개하지 않는다. Play 후보 패치는 사용자의 정상 재생 확인을 뒤집을 새로운 실제 사용자 근거가 없으면 반영하지 않는다.

로컬 증거: `.tmp/d1-playback-closeout-20261019/`의 preservation-before/after/final.json, log-attribution-summary.json, log-*.json, d1-asset-measurements.json, d1-asset-red/green.log, d1-worker-asset-entry.log, d1-x-cost-regression.log, final-assets-tests.log, final-worker-assets-tests.log, build-otw/luvdia.log, play-ab-evidence.json, play-candidate-preserved/, play-backup-manifest.json, dependency-install.log, preflight.log, baseline-tests.json, baseline-source-identity.json. API 토큰·env 원문·관리자 원본 화면은 PR에 업로드하지 않는다.
