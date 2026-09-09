# 관측 유효성 재점검

2026-09-09, 기준 코드 `a0ad138eff82d3f27588509bb427b6e5dbac9f1d` / 운영 Worker `516e101f-f57e-499a-bfd6-41a8cf22489c`.

## 판단

사용자의 관측 유효성 재판단 및 조기 완료 요청에 따라, WebSub 제거와 7일 비용 관측을 분리한다. 49시간은 Cloudflare의 의무 대기시간이 아니라 마지막 메시지가 남았을 경우의 보존기간 상한을 반영한 기존 계획이었다. 생산자 종료 직전 메시지가 존재했다는 가정은 실제 이력과 맞지 않는다. 마지막 메시지의 충분한 경과 시간, 종료된 생산 경로, 두 Queue의 현재 빈 상태를 함께 증명하면 생산자 제거일부터 다시 49시간을 기다릴 필요가 없다.

강제 purge, Queue 보존기간 단축, 과거 D1 이력 삭제는 사용하지 않는다. 조건이 충족된 뒤 consumer 구성 제거를 병합 배포하고 실제 detach를 확인한 다음 빈 WebSub Queue와 미사용 secret만 삭제한다. 공용 DLQ는 유지한다.

## 관측 근거

- 2026-09-09 01:10:29 UTC: WebSub, 공용 DLQ 및 나머지 Queue 4개 모두 realtime backlog count/bytes/oldest timestamp가 0. WebSub producer 0, consumer 1. 운영 버전은 위 PR #130 버전 100%.
- 2026-09-06 00:00 UTC부터 9/9 01:11 UTC까지 WebSub와 공용 DLQ의 GraphQL 메시지 작업 행이 없다. 별도 계정 전체 조회에서는 background와 critical의 실제 write/read/delete가 반환되어 조회 자체가 전체적으로 비어 있지는 않음을 확인했다. Adaptive 분석의 빈 결과 하나만으로 메시지 부재를 단정하지 않는다.
- D1의 `music_channel_websub_deliveries`는 `completed` 1건뿐이다. 마지막 enqueue는 2026-08-26 07:08:52.447 UTC (`1787728132447`)이며 원 Queue 24시간 + DLQ 24시간보다 훨씬 오래되었다. D1 조회는 1행 읽기, 0행 쓰기였다.
- 생산자 제거 이후 신규 `websub_maintenance` / `recent_reconcile` run 0, 현재 pending/dispatching/failed Outbox 0. D1 추정 dispatch guard는 140/40,000, reserved 0. 이는 Cloudflare 청구 사용량이 아니다.
- 15분 이상 간격의 두 번째 realtime 조회와 배포 직전 확인 결과, 실제 삭제 결과는 해당 PR 운영 증거 댓글에 기록한다. 이 문서의 첫 샘플만으로 제거 완료를 선언하지 않는다.

## 비용 관측의 보정

- 초기 보조 스크립트 `observe-day1.mjs`는 SELECT만 분류했다. 후속 `compare-outbox-day1.mjs`는 UPDATE claim/recovery를 포함하지만 새 `UPDATE scheduled_outbox INDEXED BY ...` 구문은 이전 정규식과 다르다. PR #128의 `outbox-organic-metrics.mjs`는 새 구문을 따로 확인했다. 앞으로 UPDATE/SELECT/CTE와 INDEXED BY 유무를 함께 분류하고 미분류 Outbox SQL도 별도로 표시해 오래된 스크립트만 재사용하는 오류를 막는다.
- DB Metrics와 쿼리 Adaptive 분석은 합산하지 않는다. 완료된 UTC 시간/일별 구간, 호출 수, 조회당 읽기를 함께 비교한다. 수동 검증 주석과 배포 전 doctor/이관 검사는 일반 트래픽과 구분한다. 9/9 00시의 doctor 등 감사 트래픽이 섞인 373,805행을 자연 사용량이나 Outbox 회귀로 해석하지 않는다.
- 9/9 00시 Outbox eligibility는 4회/28행, 전달 유실 eligibility는 4회/4행, Operations backlog는 1회/6행이다. 이 구간에 claim UPDATE 분석 행은 없으므로 0원 또는 claim 회귀검증 성공으로 바꾸어 표현하지 않는다.
- 마지막 Outbox 수정 배포는 9/8 22:27 UTC다. 기존 9/15 10:00 KST 종료는 7일을 채우지 못한다. 종료를 **9/16 10:00 KST**로 보정하여 7일 이후 평가한다. 80% 감소, 실제 비용 절감액, p95 개선은 현재의 짧은 표본만으로 확정하지 않는다.

## 일반 수집 검증

강제 수집이나 Play 재개 없이 다음 정규 실행을 관측한다. run의 succeeded 표시뿐 아니라 item의 실제 attempted/success/failed, retry 대기, source last_success/cursor와 저장 결과를 확인한다. 단기 관측에서 아직 실행되지 않은 소스는 다음 due 시간 이후로 한정해 확인하며 매분 전체 DB를 조회하지 않는다. 중지 중인 Play 신규 업로드 수집은 재개 전까지 미검증이다.

## 공식 참고

- [Queue realtime backlog](https://developers.cloudflare.com/queues/observability/metrics/): REST는 시점별 count/bytes/oldest를 제공하고 GraphQL은 집계 지표다.
- [Queue 재시도](https://developers.cloudflare.com/queues/configuration/batching-retries/): ack된 메시지는 재전달하지 않으며 빈 push Queue는 Worker를 호출하지 않는다.
- [DLQ](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/): 재시도 소진 메시지를 별도의 Queue로 넘긴다. 현재 실제 두 Queue의 보존 설정은 각각 86,400초다.

원시 자료는 격리 작업 폴더 `.tmp/retirement-*.json`, `.tmp/analytics-*.json`, `.tmp/queue-coverage.json`, `.tmp/natural-*.json`에 보존한다. 비밀 값은 기록하지 않는다.
