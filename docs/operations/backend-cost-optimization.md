# 백엔드 비용 운영 기준

기준: 2026-09-17. 7일 관측은 [2026-09-16 최종 보고서](backend-cost-observation-final-2026-09-16.md)로 종료되었다.
UTC 9/9~9/15의 168시간 자료에서 주요 claim 조회당 읽기 평균 감소가 관측되어 80% 목표를 충족했다.
이는 동일 workload의 인과적 절감률·전체 청구액·전 사용자 p95를 증명하지 않는다.
보고서의 Worker·flag·pause 값은 당시 snapshot이며 이 문서 정리에서 운영을 재조회하지 않았다.

## 현재 실행 경로

Cron의 읽기 전용 eligibility/budget 검사 → Workflow → D1 outbox → Queue → executor를 사용한다.
대상 없는 유지보수 작업을 만들지 않고 outbox 조회·복구는 해당 상태의 인덱스를 사용한다.
D1 write guard는 기존 usage ledger를 읽는다. guard 때문에 억제된 Workflow와 실행 후 skipped run을 구분한다.
관측을 위해 추가 usage 행을 쓰거나 수집을 강제하지 않는다.

일반 YouTube는 수요 기반 cache·동기 수동 갱신, 일반 예약 feed 수집을 구분한다.
제거한 warmup 예약을 되살리지 않는다. 예산은 `youtube_api_daily_quota_units`가 권위다.
Play 채널은 [uploads polling](channel-upload-polling.md), WebSub은 종료 상태다.
Play global pause는 관리자 채널 관리에서 처리하고 재개 시 최신 기준점을 확보한다.
구독 해제·Hub 응답을 현행 pause 완료 조건으로 사용하지 않는다.

## 운영 확인

- Cloudflare 일별 실측, Query Adaptive 집계, 내부 dispatch 추정 예산은 별도 지표로 비교한다.
- 최근 일반 수집·source 상태·nested attempted/succeeded/failed·retry를 확인한다.
  해결된 partial은 성공으로 정규화하되 실제 실패·재시도 대기는 보존한다.
- outbox·item·Queue backlog, lease·generation·DLQ와 기존 오류의 생성 시점을 구분한다.
- pause 중 Play 신규 업로드 canary를 정상 수집 증거로 계산하지 않는다.
- 수치 보고에는 UTC 구간·배포 identity·조회 범위·읽기/쓰기·누락 가능성을 함께 남긴다.

## 종료 및 잔여 항목

한시적 관측 예약 7의 삭제와 잔여 0건은 최종 보고서에 기록되어 있다.
같은 관측을 다시 예약하거나 삭제할 필요가 없으며 서비스 Cron은 계속 유지한다.
Play 신규 업로드 canary, X 30일 관측과 계정 이전은 이 7일 closeout에 포함되지 않는다.
[개발 상태](../development-status.md)에서 별도로 추적한다.
이전 구현·배포·측정 과정은 [정리 전 기록](../archive/backend-cost-optimization-before-2026-09-17.md)에 보존한다.
