# 백엔드 비용 최적화 7일 최종 관측 보고서

작성: 2026-09-16. 최종 운영 확인: 2026-09-16T02:51:44.037Z (11:51 KST). 비용 자료 회수: 2026-09-16T01:03:11.983Z.

## 최종 판단

Outbox 읽기 감소와 일반 수집 유지가 관측되었다. 종료된 WebSub 작업의 재생성이나 현재 Queue 적체는 발견되지 않았다. 한시적 7일 관측을 종료하며, 매일 반복하는 Codex 예약 작업 7은 이 보고 후 삭제한다. 서비스 자체 Cron, Workflow, Queue, 보존기간 정리는 계속 유지한다.

- 마지막 Outbox 수정 배포: 2026-09-08 22:27:24 UTC. 완료된 비용 비교 구간: 9/9~9/15 UTC, 168시간.
- 기준일 claim: 448회 / 1,609,881행 / 조회당 3593.48행.
- 이후 7일 claim: 630회 / 10,121행 / 가중 평균 조회당 16.07행. 관측 평균 감소율 99.55%.
- 따라서 주요 claim 조회 비용의 80% 감소 목표는 관측값 기준으로 충족했다. 호출량·처리량·배포·수동 사용 차이가 있으므로 동일 workload의 인과적 절감률이나 전체 청구액 절감률로 해석하지 않는다.

## 비용 자료

| 완료 UTC 날짜 | 전체 D1 읽기 | 전체 D1 쓰기 | 반환된 Outbox 관련 SQL 읽기 | claim 호출 | claim 읽기/회 |
|---|---:|---:|---:|---:|---:|
| 2026-09-09 | 1,481,697 | 18,255 | 7,106 | 165 | 22.79 |
| 2026-09-10 | 866,819 | 6,065 | 3,267 | 116 | 11.71 |
| 2026-09-11 | 324,787 | 6,351 | 3,296 | 110 | 14.35 |
| 2026-09-12 | 132,199 | 5,474 | 1,550 | 50 | 13.64 |
| 2026-09-13 | 313,882 | 7,961 | 3,154 | 55 | 16.76 |
| 2026-09-14 | 1,218,515 | 16,477 | 5,899 | 69 | 10.87 |
| 2026-09-15 | 848,057 | 17,618 | 2,337 | 65 | 16.46 |

- 전체 DB Metrics 합계: 읽기 5,185,956행, 쓰기 78,201행. 날짜마다 24시간 자료가 존재한다.
- 별도 Query Adaptive 집계의 Outbox 관련 읽기 합계: 26,609행. 하루 평균 3801.29행. DB Metrics와 합산하지 않는다.
- 기존 주요 3 UPDATE의 기준일 읽기 1,863,889행과 비교해 큰 감소가 지속되지만, 위 전체 Outbox SQL 합계와는 분류 범위가 달라 동일 범위의 정확한 감소율로 사용하지 않는다.
- dispatch eligibility는 관측된 호출당 7행, delivery recovery eligibility는 1행, Operations backlog는 6행이었다. 각 날짜에 분석 행이 없는 SQL은 0비용 또는 실행 성공으로 간주하지 않는다.
- INDEXED BY를 포함한 UPDATE/SELECT를 원시 SQL에서 다시 분류했다. 날짜별 반환 그룹은 121~289개로 요청 한도 1,000개에는 도달하지 않았으나 Adaptive 집계의 완전성을 보장하지 않는다.
- 기타 Outbox SQL도 포함했다: run/item 조회·retry 판정, INSERT, dispatched UPDATE, retention EXISTS, orphan eligibility. 알려진 수동 감사 SELECT는 전달 상태 조회 13회/70행, 상태 집계 4회/12행으로 기타 합계에 남겼다. 주석으로 식별되는 outbox-pk-verification은 이 구간 반환 자료에 없다. 나머지 모든 조회가 자연 트래픽이라고 단정하지 않는다.
- 9/9 초기 이관·doctor 트래픽, 이후 기능 배포와 관리자 활동이 전체 DB 사용량에 혼합되어 있다. 월 절감액·응답시간 개선율은 계산하지 않았다.

## 수집 및 저장 검증

운영 이력 조회 범위는 9/9 00:00 UTC부터 최종 조회 시점까지이며 비용의 완료 7일 구간보다 약 3시간 길다.

- 정규 Naver 92회, X 68회, YouTube 56회가 모두 succeeded였다. 정규 retention 7회, schedule_auto_update 7회도 succeeded였다.
- 최근 수집 30회에 속한 item 50개에서 실패·오류와 중첩 수집 결과 실패가 없었다. 전체 7일의 모든 item을 정밀 재검사한 것은 아니다.
- 최신 YouTube 정규 실행 bf099840-afe3-4074-bb32-4e442b9910fd: 9/16 00:23:30 UTC, attempted 6 / succeeded 6 / failed 0, 신규 Shorts 0, quotaBlocked false. 최신 Worker 배포 이후 실행으로 남아 있던 정규 수집 확인을 완료했다. 새 영상 없음과 실패를 구분한다.
- 최신 X 실행 88fcf525-24f2-44be-87b6-5f637e7ecf26: 8계정 갱신, 신규 게시물 2개. 실제 저장 ID 2099990936076128650, 2099998612730376352를 D1에서 재조회했다. quote 보강 complete, retryAt null.
- 최신 Naver 실행 aa55ba8e-9f84-438d-8d56-7e1a16f55b0d: 6소스 모두 ok, 신규 0. source1 cursor 53154의 저장 행 31352147:9:53154가 존재한다.
- 일반 YouTube Y3I-3jB6sZo와 Shorts _JNFUxHqWyg의 저장 행 및 available=1을 확인했다. source 성공 시각·cursor는 원시 증거에 보존했다. 활성 소스의 consecutive_failures와 last_error_code는 모두 오류 없음이었다.

## 작업 생성·전달·종료 리소스

- 현재 pending/dispatching/failed Outbox 0, queued/running item 0.
- 7회 retention의 item 38개가 모두 succeeded이며 deletedRows가 양수였다. 조회 구간에서 대상 없는 retention item 0.
- 9/9 이후 WebSub 유지보수, recent_reconcile, 고정 ingestion_recovery run은 생성되지 않았다. 공용 복구 경로가 제거되었다는 뜻은 아니며 실행 대상이 없을 때 생성하지 않는 현재 계약과 구분한다.
- 기존 failed 23개, partial 1개, throttled 6개는 보존되어 있다. 생성·최종 갱신은 모두 관측 시작 이전이며, WebSub 실패와 과거 복구/YouTube 이력이다. 이를 현재 진행 중 장애 또는 신규 회귀로 집계하지 않았다.
- 실제 Queue 6개 모두 realtime backlog count/bytes 0이며 공용 DLQ도 0이다. 추가된 otw-play-ai-review는 현재 기능 리소스로, 종료 WebSub의 재생성이 아니다.
- otw-websub Queue, WebSub secret 및 현재 버전의 WebSub binding이 없다. 기존 제거 완료 상태를 재확인했다.

## 현재 버전·설정과 관측 한계

- 최종 Worker: 7ae5a2ce-0d30-47fa-9d2f-871085efd901, 100%, 9/16 00:00:16 UTC 배포. 원시 deployment 목록에 관측 중 여러 배포가 남아 있어 단일 버전 실험으로 표현하지 않는다.
- Play 자동화 중지 true, canonical YouTube quota 1,000. 공개·내비게이션은 현재 1/1이다. 과거 예약 지시의 0/0으로 되돌리지 않았다.
- 중지 중인 Play 신규 업로드 수집은 재개 전까지 미검증이다. 공개 재생·화면 p95, Clerk 비용, Cloudflare/X 공급자 청구서는 이번 관측 범위 밖이다.
- 내부 D1 dispatch guard: 9/15 used 12,050 / 40,000, 9/16 조회 시 2,640 / 40,000, reserved 0. Cloudflare 실측 쓰기 및 청구액과 별도 지표다.
- 최종 추가 D1 조회는 읽기 9,032행, 쓰기 0, 모든 changed_db=false. 강제 수집·설정 변경·테스트·배포는 하지 않았다.
- 예전 임시 작업 트리가 삭제되어 오늘 Cloudflare에서 완료 구간 비용 자료를 재회수했다. 과거 각 시점의 Queue 상태는 오늘의 빈 backlog로 소급 증명하지 않는다.
- 중복 전달·lease 만료·retry의 모든 가능한 상황을 자연 관측만으로 증명할 수 없다. 기존 회귀 테스트 결과를 이번에 재실행했다고 표현하지 않는다.

## 증거 및 종료

원시 자료: 저장소 .tmp/outbox-final-20260916/ 아래 metrics.json, queries-2026-09-*.json, reclassified.json, final-state.json, final-readback.json, historical-errors.json. 비밀 값은 저장하지 않았다. 이 보고서는 지속 보존용이며 원시 자료는 임시 경로이므로 별도 정리 시 함께 보존해야 한다.

새로운 매일 관측을 추가할 근거는 발견되지 않았다. 최종 보고 후 이 스레드의 ‘백엔드 비용 최적화 7일 검증’ 예약(id 7)만 삭제한다. 삭제 확인은 아래에 기록한다.

예약 종료 확인: 2026-09-16, 앱 응답 deleteStatus=deleted. automation 7 설정 파일 부재 및 동일 스레드 대상 예약 잔여 0건 확인. 다른 예약 작업은 변경하지 않았다.
