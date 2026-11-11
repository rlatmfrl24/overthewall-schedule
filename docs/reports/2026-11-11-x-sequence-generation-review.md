# 저장 순번·이전 회차 차단 추가 코드 리뷰

후속 상태: 이 문서의 3건은 [요청 확정·회차 차단 수정](2026-11-11-x-request-fencing-and-rss404-fixes.md)에서 수정·검증했다. 아래 내용은 수정 전 재현 기록이다.

2026-11-11 재검토. 기준 HEAD는 `236fd3495c367364ef53959e3c576375c77d72e4`이며 저장 순번·회차 차단 관련 미커밋 구현과 소비자를 검토했다. 이전 보고서의 추가 지적 0건은 당시 검토 결과이며 이번 재검토를 대신하지 않는다.

**현재 결론: P2 3건을 로컬에서 재현했다. 제품 코드는 수정하지 않았다.** 12시간 주기·즉시 재개·D1 50회 한도는 변경하지 않았으며 운영 설정·원격 DB·배포·신규 유료 호출·Git 게시 작업도 수행하지 않았다.

## Standards

실행 회차를 실제 쓰기까지 보호해야 하는 계약에 적용 누락 2건이 있다. 두 실행 경로 자체는 기존 코드이며, 이번에 추가한 회차 방어가 이 경로까지 덮지 못한다. 이번 변경이 새로 만든 버그라고 분류하지 않는다.

### P2 — 오래된 제어 메시지의 DLQ가 새 재시도를 실패 처리

위치: `worker/app/scheduled-queue.ts:122–126`.

실제 로컬 D1 재현 순서:

1. 기존 X 실행을 실패시킨 뒤 정상 `retryRun`으로 회차 1의 새 `queued` 항목을 만든다.
2. 원래 실행 준비에 사용한 `scheduled_job_control` 메시지가 늦게 DLQ로 도착한다.
3. 이 분기는 `runId`만으로 `markRunFailed`를 호출한다. 회차나 현재 계획 여부를 확인하지 않는다.

관측 결과는 새 항목 `failed/run_failed`, 실행 `failed/control_queue_retries_exhausted`, execute outbox `dispatched`다. 메시지는 ACK되어 새 재시도 실행이 사라진다. 외부 호출 0회, D1 binding 1회였다.

발생 가능성은 낮다. 이미 계획된 제어 메시지의 지연 DLQ가 수동 재시도와 겹쳐야 한다. 발생하면 수집 재개를 중단시키므로 현재 계획 또는 실행 회차를 실패 기록 SQL에서 함께 확인해야 한다. 작업 메시지의 회차 검사만으로 해결되지 않는다.

### P2 — 이전 outbox 전송의 예산 거절이 새 회차를 제한 상태로 변경

위치: `worker/features/scheduled-operations/infrastructure/scheduled-job-coordinator.ts:166–179`, `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts:677–680`, `:1094–1111`.

실제 로컬 D1 재현 순서:

1. 이전 회차의 reconcile outbox를 dispatcher가 claim한다.
2. 전송 예산을 확인하기 직전에 수동 재시도가 회차 1의 `queued` 항목을 만든다.
3. 이전 전송의 예산이 거절되면 `markOutboxResults([], throttledRun)`이 현재 실행 전체를 변경한다.

관측 결과는 새 항목 `throttled/admission_throttled`, 실행 `throttled/daily_background_budget_exhausted`다. send 0회, dispatcher D1 binding 3회였다. 경합을 재현하기 위해 끼워 넣은 별도 수동 재시도 작업의 호출은 이 계측에 포함하지 않았다.

성공·실패 전송 기록에는 outbox lease 검사가 있지만 전체 실행 제한 처리에는 없다. 예산이 계속 부족하다면 새 실행도 이후 거절될 수 있으나, 이전 claim의 결과로 새 실행을 변경해도 된다는 의미는 아니다. admission 실패 쓰기도 해당 outbox의 lease·회차에 묶어야 한다.

추가 계층이나 포괄적인 리팩터링이 필요한 근거는 찾지 못했다. 위 쓰기 경계의 조건 보완이 우선이다.

## Spec

### P2 — 요청 확정 전에 저장된 Fx 글을 새 공식 요청이 다시 읽음

요구사항은 저장 글 재조회 방지와 동시 저장·재개에서의 중복 방지다.

위치: `worker/features/x-posts/infrastructure/x-timeline-gaps.ts:91–94`, `x-api.ts:2237–2241`, `:2301–2303`.

실제 로컬 D1과 공통 원문 writer로 다음 순서를 재현했다.

1. 공식 수집이 `100–120` 구간과 저장 순번을 읽는다.
2. 새 요청의 checkpoint UPDATE 실행 직전에 Fx 원문 `110`의 저장을 완전히 커밋한다.
3. checkpoint UPDATE에는 예상 `insert_revision` 일치 조건이 없어 이전 `100–120` 구간이 그대로 확정된다.
4. 이후 새 공식 요청이 이미 저장된 `110`을 반환한다.

관측값은 `duplicatePaidIds=["110"]`, `pendingSources=0`이다. 중복 방지 assertion이 실패했다. 모의 공급자 호출 범위는 `100–120`, `120–head`였다. 공식 API 응답을 기다리는 도중 저장된 상황이 아니라 **새 요청의 내구성 있는 기록을 확정하기 전에 저장된 상황**이다.

첫 fresh 구간은 경계 재검사를 건너뛰며, 다른 구간도 경계 SELECT와 요청 checkpoint UPDATE 사이에 같은 경합 창이 있다. 첫 SELECT를 한 번 더 넣는 것만으로는 이 틈을 닫지 못한다. 요청 checkpoint를 예상 저장 순번과 같은 UPDATE에서 비교해 확정하고, 순번이 달라졌으면 유료 요청 전에 즉시 재분할해야 한다.

## 이번 검증에서 정상인 경로

Node 24.20.0, `vitest.all.config.ts`, 실제 로컬 D1과 Queue handler를 사용했다. X 응답은 모의 응답이다.

- 기존 집중 회귀: 4파일 136건 통과. 기존 보완 ID 4/4, 12시간 주기, 즉시 Queue 재개, 저장 충돌 재개, 인용 20건과 원문 캐시 만료 혼합 20건을 포함한다.
- 토큰 4페이지와 마지막 구간: 자신의 이전 페이지 저장을 외부 변경으로 오인하지 않았다.
- 서로 다른 글의 동시 저장: 고유한 저장 순번 1·2·3을 확인했다. 같은 글의 동시 저장에서는 카운터가 한 번만 증가했다.
- 원문 저장 후 ACK 실패와 Fx 동시 저장: 저장 ID 재조회 없이 누락 105·115를 복구하고 확인 지점을 완료했다. 정산 응답이 남은 경우와 3일 뒤 정리된 경우를 각각 확인했다.
- 임대 복구 후 이전 lease의 완료·재시도 해제: 모두 거절되고 새 실행 행을 보존했다.
- 원문 캐시 만료 혼합 20건에서 첫 continuation ACK 실패 1회: 재개 완료까지 D1 최대 50회, 한도 거절 0회.
- 같은 혼합 20건에서 마지막 완료 ACK 실패 1회: 재전달 후 후속 조정까지 완료했다. 이 표본 전체의 D1 최대 49회, 한도 거절 0회였다.

정상 표본은 인용 20건 Queue 33회/D1 최대 46회, 캐시 만료 혼합 20건 Queue 16회/D1 최대 49회였다. 위 정상 검증은 확정된 3건의 경합을 해소했다는 증거가 아니다.

호출 계측은 SQL 문장 수와 구분한 D1 binding 호출 수다. `batch()` 1회를 호출 한도 1건으로 세는 방식은 [Cloudflare D1의 공식 batch 한도 설명](https://developers.cloudflare.com/d1/platform/limits/#batch-limits)과 일치한다. 배치는 읽거나 쓰는 행 수까지 줄이는 것은 아니다.

## 범위와 한계

이번 작업은 리뷰이며 제품 코드와 기존 회귀 테스트를 변경하지 않았다. 검증용 임시 테스트는 삭제했다. 전체 931건 suite·릴리스 preflight·마이그레이션 적용을 다시 실행하지 않았고, 운영 성능·실제 청구액은 측정하지 않았다. 수정안은 아직 반영하지 않았으므로 위 3건은 열린 문제다.

최종 집계: Standards P2 2건, Spec P2 1건. 두 축 모두 최악 심각도는 P2다.
