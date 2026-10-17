# 2026-10-17 D1 재개·회귀 수정·운영 최소 관측

## 판정과 승인 범위

사용자가 할당량 초기화 후 남은 테스트·작업 재개를 명시했다. D1 중단은 해제했고 **PR162 병합 대기는 유지**한다. 검토·수정·로컬 검사·PR 반영까지만 진행하며 원격 마이그레이션, master 병합, 운영 배포, 강제 수집, 메시지 소비/purge, 대량 이관·백필은 실행하지 않는다. 의도적으로 중지한 Play 자동화와 LuvDia AI=false도 유지한다.

검증 기준은 PR HEAD `db7288d551cb04d408b47fdf5d1faf45cd9ea5af`와 이번 수정이다. 최종 커밋·검사 상태는 [PR162 ledger](https://github.com/rlatmfrl24/overthewall-schedule/pull/162)에서 확인한다. 운영 소스는 여전히 PR161의 `462779cf1db6b7e06fadc46d0dc3f878762e241b`이다. PR의 수정이 운영 장애를 해결했다고 판정하지 않는다.

## 발견과 수정

1. **공개 정책 SQL의 D1 표현식 깊이 초과.** 실제 archive/AI/catalog 경로에서 공유 채널 소유자의 중첩 OR/EXISTS 확장으로 D1 최대 깊이100을 넘었다. 같은 소유자 선택을 UNION과 member UID 집합으로 평탄화했다. active/approved/enabled, normal/nondeprecated 소유자, 직접 멤버·공연 차단과 공유 원본 보존 조건은 유지한다. 실제 D1 공개·보관 매트릭스81개가 통과했다.
2. **실행 불가능한 fixture와 잘못된 시각 기대값.** pending 채널을 active=1로 만드는 fixture는 실제 CHECK 위반이므로 pending/inactive 조합으로 수정했다. outbox 완료 확인 테스트의 lease 만료 대기 이후에도 최근 성공 시각은 원래 finished_at이어야 하므로 그 값을 보존해 비교했다. 제약조건이나 실제 partial·미완료 판정은 완화하지 않았다.
3. **YouTube/SEO fixture의 schema 의존성 누락.** 공유 채널 정책은 Play 채널/크레딧 테이블도 읽는다. 공용 YouTube fixture에 기존 실제0046 마이그레이션을 연결해 Cron·YouTube·SEO 소비자를 함께 검증했다. 테스트용 가짜 테이블이나 보호 조건 우회를 추가하지 않았다.
4. **프로필 이미지의 중복 인증 요청.** 실제 LuvDia 관리자 미리보기에서 같은 프로필·사인 이미지가 서로 다른 Blob URL로 로드되는 것을 확인했다. 같은 content session·보호 여부·참조 context·원본 URL의 mounted consumer만 요청과 Blob을 공유한다. 마지막 consumer가 떠나면 abort/revoke하고 실패한 요청은 새 consumer가 재시도한다. 세션/권한 분리, bearer의 same-origin 제한, no-store와 redirect:error는 유지한다. 새 회귀에서 요청2회가1회로 감소했다. 실제 배포 후 로딩 시간 개선은 아직 측정하지 않았다.

독립 리뷰는 누적 production diff와 호출자·최종 저장 경계를 확인했고 추가 actionable 결함은 없었다. 이후 추가한 변경은 위 fixture의 실제 마이그레이션 연결뿐이며 production 변경을 추가하지 않았다.

## 로컬 검증과 한계

Node24.20.0, pnpm11.7.0, Vitest4.1.11, Wrangler4.129.1을 사용했다. 원격 D1을 테스트 fixture로 사용하지 않았다.

| 검사 | 실제 결과 |
| --- | --- |
| 최초 feature D1 2파일 | 48 PASS/1 FAIL. outbox 시각 기대값 결함을 기록하고 수정 |
| 최초 공개 D1 매트릭스 | 74 PASS/7 FAIL. 깊이 오류6개와 CHECK fixture1개를 기록하고 수정 |
| 공개 D1 재검증 | archive-access 81/81 PASS |
| outbox 재검증 | d1-scheduled-job-repository 29/29 PASS |
| X 비용 | 초기 전체20개 PASS. 별도 비용 표본2개 PASS에서 빈 작업11행·미래 재시도7행 확인. 표본 명령의18개 비선택을 테스트 제외로 사용하지 않음 |
| 프로필 | 중복 요청 RED 확인 후 authenticated-image 10/10 PASS. 세션·참조 권한·마지막 해제·실패 재시도·늦은 응답 포함 |
| 전체 preflight | architecture·타입·저장소 lint PASS. tests에서355파일/2,852사례 PASS, 4파일/29사례 FAIL, pool 시작 오류1건으로 종료 |
| 전체 실패의 재검증 | YouTube/SEO/Cron 3파일34사례, 프로필10사례 모두 PASS |
| 미실행·실행기 재검증 | retained-content, file-recovery, log-filter, registration-channel 4파일25사례 PASS. retained-content의 기존 bad-port 시작 오류는 재현되지 않음 |
| 조합 결과 | 중복을 제외한 전체360파일·2,889사례에 유효 PASS 근거. 단일 preflight 명령 성공으로 표현하지 않음 |
| 최종 정적 검사 | architecture, tsconfig.test/worker/node, 변경 코드 ESLint, agent sync PASS |
| 양 사이트 build | OTW·LuvDia 모두 PASS, 사이트/리소스/산출물 manifest 검증 PASS |
| OTW 로컬 doctor | 전체 검사 PASS. 원격/API 검사 비활성 |
| LuvDia 기본 로컬 doctor | schema/일반 데이터 진단 PASS지만0141 미적용으로 FAIL. 기존 로컬 DB는 변경하지 않음 |
| LuvDia 로컬 업그레이드 | SQLite backup으로 읽기 전용 snapshot을 만들고 task 소유 복제본에0141만 적용. 복제본 doctor 전체 PASS. 운영에는 적용하지 않음 |

전부 통과한 전체 검사를 다시 반복하지 않고, 실패·미실행·변경으로 무효화된 단계만 재실행했다. 테스트 제외나 보호 조건 완화는 없다. registration-channel의 fork 종료 timeout 경고는 별도 재검증에서도 남지만25사례와 프로세스 exit0이며 미처리 오류는 없다. 실제 테스트 실패와 구분해 기록한다.

pnpm은 원본 node_modules junction의 workspace 경로 차이로 자동 재설치를 요구했다. 재설치나 junction 제거 없이 해당 검사 프로세스에만 verify_deps_before_run=warn을 설정했다. lockfile·의존성·추적 설정은 변경하지 않았다. 양 build에는 기존 console chunk 약655kB 경고가 남는다. 이번 수정과 무관한 chunk 재편은 하지 않았다.

상세 로그는 릴리스 작업 트리의 `.tmp/d1-resume-20261017/`에 보존한다. `preflight-run2.log`의 최초 FAIL과 `youtube-fixture-green.log`, `profile-green.log`, `pool-recheck.log`, `doctor-*.log`, `build-*.log`를 함께 읽는다. 임시 경로가 없는 clone에서도 위 명령/검사 파일과 PR ledger로 범위를 확인할 수 있다.

## 운영 최소 관측

09:04 KST 기존 Cloudflare UTC 당일 집계는 읽기8행·쓰기0행이었다. 원격 확인 예산은 읽기2만행으로 정했고, 09:22 집계16,759행에서 추가 D1 사용 화면/API 조회를 중단했다. 09:31 **기존 집계만** 재조회한 계정 합산은 읽기20,969행/500만행(0.4194%), 쓰기821행이다. 운영 자연 실행과 실제 관리자 화면 비용을 포함하며 모두 이번 직접 SQL 비용이라고 해석하지 않는다. 직접 REST 최소 표본은 총532행·쓰기0행이었다.

양 DB는 적용 이력141개, 마지막0141, 미적용0, 필수120테이블 컬럼 누락0이다. 스키마 카탈로그·이력만 읽었고 원격 업무 테이블 전수 검사·재귀 음악 검사를 하지 않았다.

| 사이트 | 100% 운영 Worker 버전 | 확인 |
| --- | --- | --- |
| OTW | d76f0228-f235-4be2-ad33-a1f472d42f2b | 원본 배포/리소스/Cron/Queue 유지 |
| LuvDia | b935842a-b8f1-49cf-9011-a23d812bbb80 | 동일 항목 및 정상 Clerk 관리자 진입/미리보기 |

각 사이트 Queue6개는 paused=false/적체0이고 consumer/retry/retention 설정은 기존과 같다. Cron `3,13,23,33,53 * * * *`도 동일하다. 이를 업무 완료의 유일한 근거로 사용하지 않았다.

자연 X 최종 run/item은 다음과 같다. job_type+status 인덱스와 선택 run_id만 읽고 result_json 내부 결과·retry_pending을 확인했다.

| 사이트 | run / KST 수락 시각 | 실제 결과 |
| --- | --- | --- |
| OTW | c0668502-66ae-4411-8d1c-bc5d72b420eb / 10/17 07:53 | run succeeded, collect2개 succeeded/각1회, retry_pending0, 반환40·신규저장0, hydration 대기·실패0 |
| LuvDia | e45a7571-4aa5-4f13-b650-c235b716e77e / 10/17 08:23 | run succeeded, collect1개 succeeded/1회, retry_pending0, 반환15·신규저장0 |

정상 빈 수집의 최종 완료이며 신규 게시물 INSERT가 발생했다는 증거는 아니다. 강제 수집하지 않았다. 기존 automation-4는 이 관측 완료 후 PAUSED로 보존했다. 19일00:01의 otw-luvdia-19는 같은 시각·목적으로 ACTIVE를 유지하며 명시적 재개와 계정80% 중단 조건을 갱신했다. otw-9-d1은 PAUSED 그대로다.

LuvDia 실제 도메인에서 익명 카운트다운→정상 Clerk 관리자→운영 대시보드→사이트 미리보기→빙하유 프로필을 확인했다. 메뉴는 ‘멀티뷰’이며 프로필·사인 이미지가 표시됐다. 운영 화면의 X 신규저장 없음/일반 예약 정상 상태는 위 실제 run 결과와 일치했다. 공개 정각은 아직 미래이므로 완료라고 기록하지 않는다. 새 profile 코드가 운영에서 측정됐다고도 하지 않는다.

자원 화면의 D1 실제 사용량은 **Worker secret에 D1 토큰 미설정** 안내로 확인 불가였다. 별도 Cloudflare 집계로 확인했으며 자격증명을 Worker에 새로 복제하지 않았다. 원격 secret 설정은 후속 운영 작업이다.

R2는 [공식 storage 집계](https://developers.cloudflare.com/r2/platform/metrics-analytics/)에서 bucket별 최신24시간 표본만 읽었다. 10/17 08:50 KST 표본에서 OTW76객체·49,519,256bytes·미완료 multipart0, LuvDia0객체·0bytes·미완료 multipart0이다. 객체 목록 전체 순회·삭제·정리·업로드는 하지 않았다. 이 집계만으로 과거 업로드 사고나 원본 보존 전체가 해소됐다고 판단하지 않는다.

## 남은 운영 확인과 보존

- CHZZK 실제 adapter의 로컬 직접 polling은200/CLOSE/error없음이었지만 현재 공개 채널 추가 요청은 ECONNRESET이었다. 한국 로컬 응답은 Cloudflare 해외 edge9004의 재현/해결 증거가 아니다. PR162 병합·배포 후 대상 채널의 자연 수집과 최종 저장을 확인해야 한다. 과거16:03 partial을 수정하지 않았다.
- 10/11 수락된 OTW auto_update running 이력도 최소 표본에서 발견했다. 과거 잔여 상태로 분리하며 새 회귀·현재 성공으로 단정하거나 강제 완료/취소하지 않는다. 저비용 진단 후 복구 책임을 판단할 후속 항목이다.
- LuvDia 기본 로컬 DB는140으로 보존했다. 개발 재개 시 기존 데이터/트리거 책임을 확인한 뒤 로컬0141 적용이 필요하다. 복제본의 업그레이드·doctor 성공을 원본 적용 완료로 표현하지 않는다.
- 19일 실제 전환, 새 Worker의9004 수집 경로, 프로필 체감 로딩 시간은 미확인이다. 병합·배포 대기가 해제되기 전 운영 해결로 올리지 않는다.
- 원본409개 WIP·X 원본10개·기존 보고서3개·데이터/기존 마이그레이션 이력을 보존한다. 대량 이관·백필·장기 아키텍처·branch 삭제는 이번 완료 범위 밖이다.
