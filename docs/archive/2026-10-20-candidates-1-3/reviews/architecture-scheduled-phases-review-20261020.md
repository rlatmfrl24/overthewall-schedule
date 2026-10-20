# 아키텍처 후보03 — 일정 자동 갱신 단계 점검

**결론: 수정할 기능 문제5건을 확인했다. 제품 코드는 수정하지 않았다.** 기존 단위 테스트96개가 통과했지만, 아래 다섯 경계의 안전성을 보장하지는 못했다.

## What this change does:

후보03은 일정 자동 갱신의 `scan → match → finalize` 규칙을 planner·coordinator·executor·Queue가 나눠 소유하는 구조를 점검한다. 이번 작업은 그 기존 구조의 실행 검토이며 리팩터링 구현이 아니다. scan은 CHZZK 관측을 저장하고, match는 관리자 승인 후보를 만들며, finalize는 실행 집계·이력을 남긴다. 공개 일정에 직접 게시하는 동작으로 해석하지 않았다.

- 기준: `codex/play-catalog-retry`, HEAD `b2be7c7e1f976a8702eb9fa386186ada0f28ed82` + 기존 후보01·02 미커밋. 이번 예약/일정 검토 대상 소스는 HEAD와 차이가 없다. 배포된 운영 artifact와 동일하다는 주장은 아니다.
- 부하 가정: 소수 관리자와 현재 양 사이트 멤버, 시간별 자동 갱신, 최대2채널/scan·3페이지/채널·8개 dispatch, 물리 background Queue의 batch1·concurrency1. 다수 동시 HTTP 사용자나 가상의 두 번째 DB를 가정하지 않았다. 5분 lease 만료와 재전달은 현재 내구 실행 계약의 예외 흐름으로 점검했다.
- 승인 범위: 로컬 읽기·기존 테스트·격리 D1 진단·보고서. 운영 API/SQL·중지 해제·유료 AI·PR·배포는 수행하지 않았다.

## Must fix

### 1. [P2] 자동 갱신을 꺼도 이미 전달된 예약 작업은 실행한다

위치: ScheduledJobExecutor (당시 로컬 위치: `worker/features/scheduled-operations/infrastructure/scheduled-job-executor.ts:349`), planner의 최초 설정 검사는 `scheduled-job-planner.ts:115–119`.

- **역할:** planner가 설정을 보고 작업을 만들고, Queue의 executor가 실제 공급자 조회·D1 저장을 수행한다.
- **문제:** `schedule_auto_update` 실행 분기에 `auto_update_enabled` 재검사가 없다. 정상 설정에서 scan을 dispatch한 뒤 `auto_update_enabled`와 rollout flag를 false로 바꾸고 실제 Queue handler에 전달하면 공급자 GET2회·관측 저장1건·scan `succeeded`를 관측했다. 최초 계획 검사만으로는 전달 대기 중의 중지를 적용하지 못한다.
- **최소 수정:** 예약 scan/match의 외부 작업 직전에 현재 자동 갱신 설정을 확인하고, 업무 쓰기의 같은 D1 batch에도 중지 조건을 반영한다. 수동 실행 계약과 종료·감사 정리는 구분하고, 중지를 데이터 없음이나 일반 성공으로 숨기지 않는다.
- **미수정 영향:** 사용자가 비활성화한 뒤에도 관측·후보 처리와 D1 비용이 발생할 수 있다. 대기 중인 작업이 있는 시점에 끄면 재현되는 조건부 문제이며 운영 발생 빈도는 측정하지 않았다. 유료 AI 호출을 관측한 문제는 아니다.

### 2. [P2] lease를 잃은 scan도 최신 관측을 덮는다

위치: D1ChzzkScanWriter.run (당시 로컬 위치: `worker/features/schedules/infrastructure/publication-writers.ts:39`), `scheduled-job-executor.ts:356–363`, `auto-update.ts:304–315`.

- **역할:** lease token은 현재 실행 소유자를 식별한다. Queue 완료 시 CAS는 이 token이 일치하는 작업만 상태를 변경하게 한다.
- **문제:** token 검사는 완료 상태에만 적용되고 scan의 업무 저장에는 전달되지 않는다. 공급자 응답을 기다리는 동안 검증 시계를5분+1ms 진행시키고 실제 `claimItem`으로 새 소유자가 재선점하도록 했다. 새 소유자의 제목·`last_seen_at=1792490700001`을 저장한 뒤 옛 응답을 반환하자, 제목이 과거 응답으로 바뀌고 `last_seen_at=1792490400000`으로 후퇴했다. item은 새 lease의 `running`·`result_json=NULL`이라 옛 완료 CAS 자체는 정상 차단됐다.
- **최소 수정:** 현재 `runId/itemId/leaseToken`을 업무 writer에 전달하고 관측·후보 변경과 같은 batch에서 소유권을 검사한다. finalizer에 이미 있는 원자 guard 방식을 재사용할 수 있다. 함수 입구의 조회만 추가하면 공급자 대기 중 소유권 변경을 막지 못한다.
- **미수정 영향:** 소유권을 잃은 작업이 다른 실행의 최신 정보를 되돌릴 수 있다. 5분 만료 후 재선점이 필요하므로 일반 짧은 scan에서의 가능성은 낮다. 관측 데이터의 실제 후퇴를 재현했으며 운영 데이터 손상 발생 여부는 확인하지 않았다. match writer도 동일 문맥 전달이 필요한 연결 경로다.

### 3. [P2] 완료된 scan 재전달이 새 날짜의 작업을 만들고 실행을 다시 연다

위치: ScheduledJobCoordinator.advanceRun (당시 로컬 위치: `worker/features/scheduled-operations/infrastructure/scheduled-job-coordinator.ts:197`), Queue terminal 조정 (당시 로컬 위치: `worker/app/scheduled-queue.ts:64`), `auto-update.ts:605–615`.

- **역할:** terminal scan이 모두 끝나면 match 대상을 만들고, 재전달에서는 미완료 후속 조정을 복구한다.
- **문제:** 이미 후속 조정까지 끝났는지 확인하지 않고 현재 날짜로 대상을 다시 읽는다. 정상 Queue `scan→match→finalize`를 끝내3개 item·`succeeded`를 확인한 뒤,14시간 후 같은 scan을 재전달했다. 새 `member:990001:date:2026-10-20` match1개가 queued로 추가되고 run이 `running`으로 바뀌었다. 공급자 추가 호출은0이었다. 동일 target key의 unique 제약만으로는 날짜가 바뀐 새 target을 막지 못한다.
- **최소 수정:** 이미 다음 단계가 생성·조정된 scan은 기존 항목만 복구·dispatch하도록 단계 진행을 원자적으로 판정한다. 조정 완료된 메시지가 현재 시각으로 새 업무 대상을 만들지 않게 한다. 미완료 reconciliation의 재전달 복구는 보존해야 하며 단순히 모든 terminal 메시지를 버리면 안 된다.
- **미수정 영향:** 끝난 실행에 승인하지 않은 추가 작업·D1 비용이 붙고 기존 finalizer 집계와 어긋날 수 있다. 날짜/휴방 판정 경계를 지난 늦은 재전달이 필요하므로 발생 조건은 제한적이다. 운영 재전달 빈도는 측정하지 않았다.

### 4. [P2] 예약 실행 재시도가 새 실행 주기 검사에 막혀 대기 작업을 남긴다

위치: planManualRun (당시 로컬 위치: `worker/features/scheduled-operations/infrastructure/scheduled-job-coordinator.ts:122`), `scheduled-job-planner.ts:120–139,278–286`, ScheduledRunClient.retryRun (당시 로컬 위치: `worker/platform/scheduled-jobs/scheduled-run-client.ts:119`).

- **역할:** 관리자 retry는 기존 run/item을 재시도 상태로 바꾸고 control Queue를 거쳐 원래 업무를 복구한다.
- **문제:** control Queue가 기존 재시도도 최초 계획과 같은 planner에 넣는다. 실패 후 finalizer가 기록한 `auto_update_last_run`과 원래 `scheduled_for`를 비교해 이미 보유한 대상을 제외한다.1시간 주기 설정에서2시간 뒤 실제 `ScheduledRunClient.retryRun → handleScheduledControlQueue`를 실행해도 run이 `skipped`, scan/finalize2개가 `queued`, execute outbox2개가 `pending`, dispatch0으로 남았다. 현재 시각이 아닌 원래 실행 시각을 비교하므로 시간이 지났다는 사실도 해결하지 못한다.
- **최소 수정:** 기존 item/outbox의 복구와 새 실행의 eligibility를 분리한다. 이미 보유한 실행을 retry할 때는 현재 중지·예산·권한 조건을 지키면서 기존 대상을 dispatch하고, 최초 계획이 정말 필요한 run만 cadence/빈 대상 판정으로 보낸다.
- **미수정 영향:** 관리자에게 재시도가 접수됐다고 응답한 뒤 실제 복구가 진행되지 않는다. `skipped` run은 일반 dispatch/추가 retry 대상에서도 빠질 수 있다. 종료 이력이 있는 예약 실행을 재시도할 때 재현했으며 운영 빈도는 미확인이다.

### 5. [P2] 수동 실행 재시도 성공 후에도 완료 영수증·이력이 과거 실패로 남는다

위치: finalizer 영수증 재사용 (당시 로컬 위치: `worker/features/schedules/infrastructure/auto-update-runs.ts:57`), retryRun 상태 초기화 (당시 로컬 위치: `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts:1265`).

- **역할:** finalizer의 `result_json`은 같은 완료 작업이 중복 전달돼도 이력을 한 번만 남기기 위한 결과 영수증이다.
- **문제:** 실제 업무를 재실행하는 retry도 이 영수증을 유지하고, finalizer는 내용이 있으면 새 집계 전에 반환한다. 예약 실행은4번에서 먼저 막히므로 최종 검증은 수동 source에서 서비스 접수·control Queue·scan·match·finalize를 통과시켰다. 실제 후보1건·match `updated=1`·run `succeeded`인데 finalizer는 `updated=0`, `auto_update_runs`는 과거 `failed/0건` 한 행만 남았다. Operations는 이 테이블을 `autoUpdate.recentRuns`로 반환하고 관리자 실행 기록은 그대로 실패 배지를 표시한다.
- **최소 수정:** 실제 `execute` 재시도와 기존 결과의 `reconcile` 재전달을 구분한다. 실제 업무 재시도 때만 같은 원자 retry 변경에서 finalizer 영수증을 무효화해 새 결과·이력을 기록하고, 단순 재전달의 영수증 재사용은 유지한다.
- **미수정 영향:** 저장 결과와 관리자 실행 이력이 서로 달라 추가 재시도나 수작업 확인을 유발한다. 수동 실행이 실패 완료된 후 재시도하는 조건에서 재현됐다. 이 문제에서 후보가 삭제되거나 중복 게시되는 현상은 관측하지 않았다.

## 검증 결과와 실제 범위

기존 단위 테스트 **96개 PASS**,8개 파일이다.

| 검사 | 사례 수 |
| --- | ---: |
| planner / coordinator / executor | 10 / 14 / 22 |
| scheduled Queue / Cron | 9 / 13 |
| auto-update-runs | 2 |
| ScheduledRunClient / Operations HTTP | 5 / 21 |

별도 네이티브 D1 진단은 위 **5개 결함을 관측**했다. 진단의 PASS는 잘못된 동작을 재현했다는 뜻이며 수정 완료나 운영 정상 판정이 아니다. 전체148 migration이 적용된 작업 전용 DB를 별도 `.tmp/review3/d1-native`로 SQLite backup 복제했고, `d1_migrations`에서148개를 확인했다. 설치된 Wrangler의 Miniflare/workerd가 실제 D1 SQL·batch·CAS·결과 읽기를 수행했다.

Queue handler·coordinator·executor·writer·DTO 조회 코드는 그대로 실행했다. Queue 전송 adapter는 메모리에서 메시지를 수집하고, 공급자 GET은 승인된 형태의 가짜 응답만 반환했다. 기타 외부 요청은 차단했다. 직접 DB 변경은 최초 실패 상태 및 새 소유자의 관측 같은 fixture 준비에만 사용했다. lease 재선점은 실제 repository `claimItem`의 만료 조건을 통과시켰다. retry의 최종 두 사례는 실제 ScheduledRunClient와 control Queue handler를 포함한다. HTTP 관리자 인증 경계는 정적 추적·기존 HTTP 단위 검사로 확인했으며, 실제 브라우저 로그인/HTTP 인증 통합을 이번 D1 진단에 포함하지 않았다.

초기 repository 직호출 진단의 예약 source 결과는 control Queue를 통과한 증거로 사용하지 않았다. 실제 진입점을 확장한 뒤 예약 retry 중단(4)과 수동 retry 집계 불일치(5)로 분리해 재확인했다. 일반 Queue 정상3단계 완료도3번 진단의 준비 과정에서 실제 D1로 확인했다.

초기 진단 묶음의 복수 단계 사례2개는5초 test timeout으로, control Queue 확대 뒤 수동 사례 준비는10초 hook timeout으로 종료된 기록이 있다. 이 실행들을 PASS로 계산하지 않았다. 원래 제한 시간을 유지하고 정상 선행 실행·명시적 재시도·검증 대상 동작을 준비 hook과 사례에 구분해 실행했다. 최종 관측 근거는 `.tmp/review3/native-pause-final.log`, `native-followup.log`의 lease/재전달, `native-control-retry.log`의 예약 retry, `native-manual-retry-final.log`의 수동 retry다. `existing-tests.log`와 `retry-entry-tests.log`는 기존96개 검사의 근거다. 일부 HTTP 모의 DB 검사에서 status-unavailable 로그가 출력됐으므로 이를 전체 Operations 집계의 실제 D1 검증으로 확대하지 않았다.

제품·정식 테스트·배포 설정의 기존 변경 파일 해시와 Git 변경 목록을 검토 전후 비교했다. 검토 작업 트리에서 이번 검토로 바뀐 기존 파일과 새 non-ignored 파일은0개다. 진단 코드·설정·로그는 ignored `.tmp/review3`에만 있다. 보고서는 OS temp에 있고 기존 구조 검토 HTML의 후보03 부분만 갱신했다.

## Graphify와 구조 판단

- 기존 graph는9,352 nodes·34,020 edges, `built_at_commit=d27f26a4628dff34b9eb06628b957b26c3b3aa11`이다. 현재 검토 HEAD보다 오래된 자료다.
- 실제 vocab의 `[schedule, scheduled, planner, coordinator, executor, scan, match, finalize, lease, outbox, pause, retry]`로 query했다. budget1,400 tokens에서957개 중36개 node만 표시돼, `ScheduledJobCoordinator` explain과 현재 소스로 보완했다. graph의 source location은 planner L246·coordinator L45·executor L283 등 탐색 위치로만 사용했다.
- 오래된 `content-transition-recovery` 연결은 현행 경로로 사용하지 않았다. 새 그래프 추출·외부 LLM 호출은0회다. query 출력 예산만1,400 tokens이며 실제 모델 토큰 비용은 따로 계측하지 않았다.
- 단계 규칙의 소유권을 모을 근거는 파일 크기보다 **중지/소유권/이미 진행한 단계/명시적 retry의 의미가 서로 다른 경계에서 달라지는 위 실행 결과**다. 기존 schedules와 scheduled-operations 사이에서 이 상태 계약을 함께 정의하는 것이 우선이다. 구조 이동만 먼저 하면 문제를 옮길 뿐이다.
- D1 repository의 원자 item/outbox·예산 예약·lease CAS·미완료 reconciliation은 유지한다. Queue adapter는 전달·ACK·재시도를 맡고, 이미 완료한 단계와 새 업무 재시도의 판단은 같은 업무 경계에서 관리하도록 보강할 수 있다. 가상의 플러그인·두 번째 저장소·새 범용 실행 프레임워크는 필요하지 않다.
- executor의 app factory 역참조와 concrete 생성은 최초 구조 제안의 마찰로 남는다. 이번에는 그것만으로 별도 기능 결함이나 줄 수 절감 수치를 만들지 않았다.

**Verdict: fix 1–5 first.** 운영 자동화를 재개하기 전에 중지·소유권 guard와 두 종류의 재시도/완료 규칙을 먼저 수정하고 동일한 Queue→D1 사례를 영구 회귀 테스트로 옮겨야 한다.

**Not checked:** 운영 사용량·운영 브라우저·실제 Cloudflare Workflow/Queue 전달·동시 관리자 실부하·전체 preflight는 미검증이다. 이번에는 제품 코드 수정·새 migration·빌드·배포를 수행하지 않았고, 중지된 운영 자동화와 유료 AI는 재개하지 않았다. 개인 메모리 폴더는 수정하지 않았다.
