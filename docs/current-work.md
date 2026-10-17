# 현재 작업과 2026-10-17 검증

갱신: 2026-10-17 KST. 현재 작업의 단일 진입점이다. 날짜가 있는 보고서는 당시 증거이며 새 실행 지시가 아니다.

## 현재 승인과 제한

2026-10-17 추가 사용자 결정: OTW Play의 공식 곡 탐색·상세·재생과 기본 플레이리스트를 비회원에게 공개한다.
노래 클립의 관리자 전용 정책, 개인 목록·곡 제안의 회원 인증, LuvDia의 기존 접근 정책은 유지한다.
이 승인은 Play 자동 수집·AI 재개나 운영 데이터 재이관을 포함하지 않는다. 실제 반영 여부는 해당 공개 변경 PR의 배포 증거로 확인한다.

사용자가 **“할당량이 초기화되었습니다. 남은 테스트와 남은 작업을 모든 진행하세요”**라고 명시해 D1 중단을 해제했다. 09:04 KST Cloudflare 기존 UTC 당일 집계에서 읽기8행·쓰기0행으로 초기화를 확인한 뒤 로컬 D1 회귀와 최소 운영 읽기를 재개했다. 앞선 08:12 집계5,042,361행은 전날 UTC 창이며 [당시 관측 보류 기록](reports/sul-36/2026-10-17-natural-x-observation.md)에 보존한다.

**최신 사용자 지시: PR162 병합과 프로젝트 전체 branch/worktree 최신화·정리를 승인했다. 기존 병합 대기는 해제됐다.** 정확한 PR HEAD·검사·원격 schema를 확인하고 OTW 기존 자동 배포, 동일 병합 소스의 LuvDia 배포를 진행한다. 새 마이그레이션은 없다. 원본409개 미커밋·별도 X 작업 트리·기존 운영 보고서3개를 보존하며 병합/유휴 상태가 증명된 ref만 정리한다.

병합 OID·최신 Worker 버전·실제 배포 결과·정리 결과는 [PR162 운영 ledger](https://github.com/rlatmfrl24/overthewall-schedule/pull/162)의 최신 댓글을 따른다. 아래 이전 버전 표와 10/17 재개 보고서는 당시 증거이며 이후 배포 완료 여부를 대신하지 않는다.

원격 확인은 읽기2만 행을 상한으로 계획했다. 09:22 KST 계정 합산 읽기16,759행·쓰기7행에서 이번 확인 예산에 가까워 추가 D1 사용 화면/API 조회를 멈췄다. 09:31 기존 집계만 재조회한 결과는 읽기20,969행(0.4194%)·쓰기821행이며 운영 자연 실행도 포함한다. 직접 REST 표본은532행·쓰기0행이며 화면 비용과 구분한다. 고비용 검증은 격리 로컬 D1에 한정한다. 계정80% 근접 시 D1 작업을 다시 중단한다.

## 이번 재개 결과와 남은 순서

자세한 명령·결과·실제 운영 버전·제한은 [10/17 재개 검증 보고서](reports/sul-36/2026-10-17-d1-resume-validation.md)를 따른다. 최초 FAIL도 삭제하지 않는다.

| 우선순위 / ID | 확인 결과와 다음 행동 | 완료 기준 |
| --- | --- | --- |
| P1 / PR162-VERIFY | 실제 D1 공개·공유 채널 회귀81개, outbox29개 PASS. 표현식 깊이 오류와 무효 fixture·시간 기대값을 수정. 전체 실패 수정·조합 검증 완료 | 실패 제외 없이 최종 타입·린트·전체 테스트·양 사이트 build·로컬 doctor 조합 검증, 독립 리뷰 완료. 이번 병합 승인에 따라 정확한 HEAD/CI·배포·운영 readback 수행. 결과는 PR162 ledger |
| P1 / SCHEDULE-9004 | PR162 수집용 공개 채널 상태 확인 구현·88개 단위 회귀 유지. 실제 adapter 직접 polling은200/CLOSE였으나 추가 채널 메타데이터 요청은 ECONNRESET | Cloudflare 자연 수집에서9004 발생 시 새 경로와 최종 저장을 확인해야 운영 해결. 배포 결과와 대상 채널 자연 실행을 PR162 ledger에서 별도 확인 |
| P1 / X-NATURAL | 07:53 OTW·08:23 LuvDia 자연 X run/item 성공·retry_pending0. 각각40·15개 반환, 신규 저장0개 | 업무 결과·빈 수집과 신규 INSERT를 구분. 정상 빈 수집 관측 후 automation-4 PAUSED. X 비용11/7행 PASS 유지 |
| P0 / PUBLICATION-OBSERVE | 10/19 00:00 KST 서버 정책 유지. 00:01 기존 otw-luvdia-19 관측 예약 유지 | LuvDia 공개·OTW 세 멤버와 D-day4/9/10/11 차단·비대상/관리자/보관 정상. 실제 정각은 아직 미래 |
| P2 / PROFILE | 실제 관리자 프로필에서 같은 이미지의 별도 Blob 요청 중복을 확인. 같은 세션·권한 안에서 mounted consumer끼리 공유하도록 수정, 회귀10개 PASS | 로컬 요청2→1·마지막 consumer 폐기·세션/권한 분리. 운영 요청 공유와 표시를 배포 후 확인하고 실제 시간 측정과 구분 |
| P2 / RESOURCE-SCHEDULED | 양 DB schema141/필수120테이블 컬럼 정상. Cron·Queue 각6개·리소스 연결 기존과 동일, 적체0. LuvDia 정상 Clerk 운영 화면 확인 | 기존 집계와 자연 실행만 사용. 관리자 D1 실계측은 Worker secret 미설정 안내라 현재 UI에서 확인 불가; 원격 secret 설정은 이번 범위 밖 |
| P2 / CODEBASE | 원본 WIP와 X 원본 트리를 보존. 현행 문서→담당 운영 지침→과거 기록의 구조 유지 | 관계없는 미완료·대량 이관·전면 아키텍처 개편·무증거 branch 삭제를 이번 PR에 섞지 않음 |

19일 관측은 실제 공개를 실행하는 예약이 아니다. 10/17 재개 검증 당시 운영 소스는 PR161의462779cf였다. 이번 승인에 따라 정확한 PR HEAD와 검사 결과를 확인하고 기존 OTW 자동 배포 및 동일 병합 소스 LuvDia 배포 절차를 따른다. 이후 실제 소스·버전·검증 결과는 위 PR162 ledger로 확인한다. 구형 정책으로 rollback하거나 자동/수동 배포를 중복 실행하지 않는다.

## 테리 눈나 채널 오류: 확정된 진단

- 멤버: uid 2, terri_nunna, 채널 0a2020b09b8cc7f2285b7ae5de2ce4d3.
- 실패 실행: f1195a83-a4ab-4efd-8590-23f771a72d9c, 10월 16일 16:03~16:08 KST. scan item은 c38ceec2-768a-4331-b13f-73d62059aa44, 3회 시도 후 실제 partial이다. 성공으로 수정하지 않았다.
- Cloudflare의 당시 Queue 로그 6개에서 **라이브 polling 응답 HTTP 500 / code 9004 / 해외 시청 불가능한 콘텐츠**를 확인했다. 원본 Worker 버전은 0e140a70-3574-4af4-8b4f-261477ed766a다. 현재 코드의 일반 500 재시도와 겹친다.
- 첫 VOD 페이지는 정상 200이었다. 후속 페이지 실패라는 초기 가설은 확정 원인이 아니다. 로컬 직접 fetch의 ECONNRESET도 위 운영 실패 원인으로 판정하지 않는다.
- 과거 진단에는 공개 채널 메타데이터 openLive=false 확인이 기록돼 있다. 이번 PR162는 응답 code·채널 일치·boolean 상태를 엄격히 확인하는 수집용 경로를 추가했으며 추가 채널 메타데이터의 이번 직접 요청은 ECONNRESET이었다. 실제 adapter polling은200/CLOSE였지만 Cloudflare edge9004의 해소 근거는 아니다. 인증/지역 제한 우회, 재생 URL 획득, 방송 시작 시각 추정, 미확인 값을 휴방으로 바꾸는 처리는 금지한다.
- 담당 경로: [CHZZK adapter](../worker/features/chzzk/infrastructure/chzzk-api.ts), [관측 수집](../worker/features/schedules/infrastructure/auto-update.ts), [휴방 근거](../worker/features/schedules/infrastructure/holiday-suggestions.ts), [예약 실행](../worker/features/scheduled-operations/infrastructure/scheduled-job-executor.ts).
- 검증 범위: 9004와 일반 500/네트워크 오류의 구분, 잘못된/불충분한 메타데이터, OPEN 시 시작 시각 미확인, stale 캐시, 다른 채널, 정상 재시도, 정각 최종 저장 차단. 보호 조건을 완화하거나 과거 partial을 succeeded로 덮어써서는 안 된다.

저장된 로컬 증거는 릴리스 작업 트리의 .tmp/schedule-channel-repair-20261016/에 있다. failed-run.json, cache-probe.json, vod-evidence.json, vod-http.json, log-probe.json을 재사용하며 같은 운영 요청을 반복하지 않는다. 로그 검색 통계의 rows_read는 Observability 저장소 값이며 D1 사용량에 합산하지 않는다. 진단 중 직접 D1 조회는 읽기 29행·쓰기 0행이었다. 정상 공개 VOD 조회의 캐시 동작과 직접 SQL 비용을 혼동하지 않는다.

## 재개 검증 당시 운영 기준 — 이후 배포는 PR162 ledger 확인

10월 16일 검증 당시 [PR160](https://github.com/rlatmfrl24/overthewall-schedule/pull/160) 공개 구현과 [PR161](https://github.com/rlatmfrl24/overthewall-schedule/pull/161) 이관 실행부 정리가 운영 반영됐다. 기준 소스는 462779cf1db6b7e06fadc46d0dc3f878762e241b, 양 DB schema141이다. OTW는 자동 배포, LuvDia는 동일 병합 소스 산출물을 사용했다.

| 사이트 | 마지막 확인된 Worker 버전 | 확인 범위 |
| --- | --- | --- |
| OTW | d76f0228-f235-4be2-ad33-a1f472d42f2b | 메인/API·관리자·리소스·Cron·Queue readback |
| LuvDia | b935842a-b8f1-49cf-9011-a23d812bbb80 | 익명 카운트다운/API·파일 차단, 정상 Clerk 관리자 미리보기 |

이관 테이블·데이터·0102~0140 이력은 보존했다. 0141은 이관 트리거 492개만 제거하고 일반 파일 규칙 9개와 기존 보호 20개를 남겼다. 로컬 X 빈 작업 11행/미래 재시도 7행, 유효 2,832개 테스트의 조합 증거는 [반영 기록](reports/sul-36/2026-10-16-content-transition-retirement.md)에 있다. 단일 preflight 명령 전체 성공, 새 Worker의 자연 수집 완료, 실제 19일 전환 완료를 뜻하지 않는다.

## 계속 보류할 범위

LuvDia 재이관·재복사·대량 백필, 원격 전수 doctor·재귀 음악 정합성·전체 스캔은 실행하지 않는다. 기존 이관 완료를 미완료 작업으로 되살리지 않는다. 데이터 공백이 필요하면 필요성·차이·비용을 먼저 확인한 선택 복구로 한정한다.

의도적으로 중지된 양 사이트 Play 자동화와 LuvDia AI=false를 유지한다. 유료 AI 품질 검증, 대량 업로드 감시 재개, 계정 이전, 전면 아키텍처 개편은 현재 작업에 포함하지 않는다. 기존 R2 업로드 사고의 영향/이전 상태가 모두 해소됐다고 판정하지 않으며 [사고 기록](reports/sul-36/operational-upload-incident.md)은 보존한다.

대표곡 pin, 참여 정보 정정·가창 병합, 라이브러리·방송 setlist, 전용 멀티뷰 확장, AI 메타데이터 초안과 전체 품질 검증은 요구사항만 보존한 후순위다. 기존 개인 playlist와 역할·보관 정책을 변경하지 않는다. player 원곡 가수 확장·제작 참여 확장·공유 배너·VOD AI 별도 프로젝트와 종료된 X 비용 추적 의무는 복원하지 않는다.

## 안전한 재개 위치

새 clone이나 다른 작업 트리에서도 이 저장소의 README → docs/current-work.md를 진입점으로 사용한다. 특정 개인 디렉터리가 있어야 작업을 시작할 수 있는 구조가 아니다. PR의 문서를 읽을 때는 해당 PR HEAD와 실제 운영 기준 HEAD를 구분한다.

C:/Develop/overthewall-schedule의 기존 409개 미커밋 파일과 별도 X 작업 트리는 수정하지 않는다. 릴리스 작업 트리의 기존 미커밋 보고서 3개도 바이트 그대로 보존한다. 해당 보고서의 과거 현재/미완료 표기보다 이 문서의 최신 중단·작업 상태가 우선한다. 다음 코드 작업은 최신 검토 소스에서 범위를 분리하고, 이미 섞여 있는 변경을 초기화하지 않는다.

로컬 보존 위치는 당시 작업 증거다. 원본 WIP는 C:/Develop/overthewall-schedule, 리뷰·문서 작업은 별도 otw-publication-release 작업 트리, X 원본은 otw-x-scan-recovery 작업 트리에 남아 있다. 원본 프로젝트의 새 인계 포인터는 저장소 웹 문서로 연결하고, 이 로컬 경로에 접근할 수 없는 독자는 PR의 인계 본문을 그대로 사용한다. 원본409개 변경의 포함 여부와 폐기된 이관 코드의 보존 여부는 리뷰 기록에서 대조한다.

필요한 기능의 계약만 [참조 문서](reference.md)에서 선택한다. 과거 실행·실패·계획은 [아카이브](archive/README.md)에서 증거가 필요할 때만 읽는다.
