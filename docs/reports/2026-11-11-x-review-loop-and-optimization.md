# X 대조 반복 리뷰 수정과 비용 최적화

2026-11-11. 기준 HEAD는 `236fd3495c367364ef53959e3c576375c77d72e4`이며 변경은 미커밋 상태다. 사용자는 발견한 문제를 수정하고 Standards/Spec 리뷰를 반복한 뒤 과도한 중첩과 개발을 점검해 최적화하도록 승인했다. 운영 설정 변경·배포·원격 DB 변경·신규 유료 호출·Git 게시 보류는 유지했다.

**결론: 최초 3건과 추가 리뷰에서 재현한 성공 경로 경합·혼합 실패 큐·ACK 오류 비용 문제를 수정했다. 최종 Standards 위반 0건·수정할 smell 0건, Spec 지적 0건이다.** 운영 적용이 완료됐다는 의미는 아니다.

## 수정 내용

| 이전 동작 | 현재 동작 | 효과 |
| --- | --- | --- |
| 실행 중인 항목의 회차가 유지되면 이전 예산 거절이 새 실행도 제한 | outbox claim에서 실행 제어 회차를 함께 캡처하고 거절 SQL에서 임대·항목 회차·제어 회차를 검사 | 진행 중 작업은 유지하고 이전 거절의 새 회차 쓰기는 0건 |
| 이전 control의 조회 오류도 재시도 예산 3회를 사용 | 현재 queued 실행·회차일 때만 한 트랜잭션에서 예산 예약 | 이전 메시지 때문에 95% 경계에서 새 실행이 제한되는 문제 차단 |
| 성공한 이전 control/DLQ가 새 회차 outbox를 대신 전송 | `ScheduledDispatchFence`를 정상 계획과 완료 조정에서 원자적 outbox claim까지 전달 | 이전 회차가 새 실행의 admission을 우회하지 못함 |
| 이전 완료 snapshot으로 새 queued 실행을 running으로 갱신 | `refreshRun`·`refreshRuns`의 실제 UPDATE에도 snapshot 조건 적용 | 새 제어 메시지가 정상 계획을 계속 수행 |
| 회차 0의 RSS만 묶고, 공식 결과가 섞이면 모두 개별 처리 | 현재 회차의 X collect 결과를 RSS·공식 구분 없이 공통 조정 | 혼합 실패 큐의 반복 dispatch·완료 조회 제거 |
| 실행 10개의 완료 확인에서 계정 목록·기준 조회 반복 | 계정 목록만 해당 묶음에서 공유하고, 각 실행의 기준과 완료 상태는 같은 SELECT에서 재평가 | 완료 boolean을 재사용하지 않으면서 D1 호출 감소 |
| 마지막 내구성 ACK 오류에서 실행별 실패 기록 10회 | 기존 SQL과 실행별 snapshot 조건을 D1 batch 1회로 처리 | 오류 처리까지 포함해 D1 한도 보존, 중간 실패 시 전체 롤백 |

원인과 위치는 `worker/app/scheduled-queue.ts`, `worker/platform/scheduled-jobs/d1-scheduled-job-repository.ts`, `worker/features/scheduled-operations/infrastructure/{scheduled-job-coordinator,scheduled-job-executor}.ts`, `worker/features/x-posts/infrastructure/x-hybrid-policy.ts`에서 확인할 수 있다.

## 비용과 기능 검증

Node 24.20.0, 실제 로컬 D1과 정상 `handleWorkerQueue` 진입점을 사용했다. 전송 완료 기록과 실패한 D1 호출도 실행당 50회 계측에 포함한다. 외부 Queue와 공급자 응답은 제어했으며 실제 유료 호출은 수행하지 않았다.

| 사례 | 수정 전 재현 | 최종 결과 |
| --- | --- | --- |
| 현재 회차 RSS DLQ 10건·후속 전송 | D1 54회 필요, 50회 강제 시 ACK 9/10 | D1 **7회**, ACK 10/10 |
| RSS 9건 + 공식 1건, hybrid 결과·후속 전송 | D1 85회 필요, 50회 강제 시 ACK 5/10 | D1 **9회**, ACK 10/10 |
| 독립 공식 실행 10개, 완료 확인 전/후 | 50회 초과 재현 | D1 **45/46회**, ACK 10/10 |
| 위 10개 실행의 마지막 ACK 배치 실패 | 오류 기록을 개별 처리하면 50회 초과 | D1 **47회**, 한도 거절 0, ACK 10/10, 미정산 책임 보존 |
| ACK 커밋 후 응답 유실, 독립 추가 검증 | 개별 오류 기록으로 50회 초과 | D1 **46/47회**, 한도 거절 0, ACK 10/10, 실제 커밋된 정산 유지 |
| 인용 대기 20건·작성자 보강 | 기존 상한 유지 | Queue **33회**, 실행당 D1 최대 **46회** |
| 원문 캐시 만료 혼합 20건 | 기존 상한 유지 | Queue **16회**, D1 최대 **49회** |
| 위 혼합 20건의 첫/마지막 메시지 ACK 실패 | 기존 상한 유지 | Queue **16/17회**, D1 최대 **50/49회**, 한도 거절 0 |
| 기존 공식 보완 ID | 4건 모두 필요 | **4/4 저장·재조회 확인** |

50회는 기존 계측 계약인 D1 binding 호출 기준이다. batch 내부 SQL 수와는 구분한다. 오류 기록은 기존 실행별 SQL을 그대로 사용하므로 binding 감소만으로 쓰기 행이나 운영 청구액 감소를 단정하지 않는다.

저장 순번 경합, 요청 확정 CAS, 토큰 만료 후 재분할, 저장된 ID의 신규 공식 재조회 방지, 전체 구간 확인 후 checkpoint 전진, 정산된 인용·작성자 응답 재사용, RSS 404 1회 재시도와 지속 실패 보존을 영향 회귀로 재확인했다. 정상 진행은 기존 Queue에서 즉시 재개하며, 공식 완료 후 다음 자격은 12시간 뒤다.

## Standards

초기 예산 거절·이전 control 오류의 수정 후에도 성공 경로 경합 2건을 실제 D1으로 추가 재현했다. outbox claim과 run refresh까지 예상 회차·snapshot을 전달해 수정했다. 이전 성공 control이 새 회차를 전송하던 재현과 terminal 조회 직후 수동 재시도하는 재현이 모두 통과했다.

최종 독립 검토는 문서화된 규칙 위반 **0건**, 수정이 필요한 smell **0건**이다. scoped/global outbox claim의 중복 바인딩 분기를 통합했고 control catch 중첩을 줄였다. RSS 전용 분기의 공급자·mode 파싱을 제거했다. 실제 두 경계에서 사용하는 `ScheduledDispatchFence`와 묶음에서 계정 목록을 공유하는 인자는 필요하다. 별도 계층·전략 객체·새 의존성은 추가하지 않았다.

독립 프로브 6건은 이전 경합 2건, 누락·중복·혼합 회차, 메시지 ACK 실패와 재전달, 최종 조정 snapshot 직후 재시도·source pending을 확인했다. 모두 통과했으며 작업 폴더의 임시 프로브는 삭제했다.

## Spec

RSS·공식 혼합과 독립 실행 10개의 실패 경로를 추가 재현하면서 정상 경로만의 D1 검증을 보완했다. 완료 여부를 묶음 전체에 캐시하지 않고, 매 실행에서 현재 기준으로 판단하도록 유지했다. 마지막 실패 기록도 한 배치로 묶은 뒤 최종 Spec 지적은 **0건**이다.

독립 ACK 검증 4건은 완료 확인 전/후와 실제 SQLite ACK 배치 오류/커밋 후 응답 유실을 조합했다. D1은 46·47·46·47회, 한도 거절 0회, 메시지 ACK 10/10이었다. 권위 있는 재조회에서 미정산 outbox는 커밋 전 실패 10개, 커밋 후 응답 유실 0개였다. 실패를 정상 완료로 바꾸지 않는다.

## 실행 증거와 한계

- 영향 회귀: **47파일 936건 통과**. X 기능·scheduled operations·공유 저장소와 Queue·계약·관리자 모니터링 소비자를 포함한다. 실제 Worker의 Cron → native Workflow → Queue 흐름도 포함했다.
- 일괄 명령에는 정리 중인 임시 진단 파일이 잠시 포함되어, 해당 파일의 시작 오류 1건으로 명령 종료 코드는 1이었다. 영구 47파일의 assertion은 모두 통과했다. 같은 임시 파일을 보존본으로 복원해 해당 파일만 재실행하여 **4/4 통과**한 뒤 다시 제거했다. 전체 명령이 한 번에 성공했다고 보고하지 않는다.
- 새 회차 인자 전달에 맞춰 기존 호출부 테스트 4건을 확장했다. 이후 Queue·실제 제어 경합·X 통합 3파일 61건도 통과했다. 테스트 fixture의 타입 선언을 보완했고 최종 `typecheck:test`의 세 tsconfig, 변경 TypeScript 전체 lint, architecture 검사를 통과했다.
- 로그: `%TEMP%/otw-x-goal-verified.log`, `otw-x-goal-probe-rerun.log`, `otw-x-goal-green3.log`, `otw-run-fence-*.log`, `otw-dispatch-fence-*.log`, `otw-cohort-failure-*.log`. 실패 재현과 수정 후 결과를 구분해 보존했다.

이번 수정에서 스키마·마이그레이션·운영 설정은 변경하지 않았다. 기존 미커밋 기능·마이그레이션과 앱 DB를 보존했다. 공개 운영 효과·실제 청구액·원격 마이그레이션·배포·릴리스 preflight는 검증하지 않았다. 제품 변경은 로컬 상태이며 기존 운영 반영 보류를 유지한다.

최종 집계: **Standards 0건, Spec 0건.** 이는 위 기능·경합·비용 범위의 현재 검토 결과이며 모든 가능한 오류가 없다는 보장은 아니다.

## PR #220 게시 검증과 GitHub 리뷰 보완

후속 `pr-ready` 승인으로 [PR #220](https://github.com/rlatmfrl24/overthewall-schedule/pull/220)을 게시했다. `8e75ed9cad05f9bc16af6d897c0a97253b97eba6`에서 Node 24.20.0·pnpm 11.7.0으로 공식 `pnpm preflight`가 전체 통과했다. Vitest 414파일 3939건, agent 동기화 테스트10건, 전체 타입·lint·architecture, production build, 격리된 `.wrangler/x-review-20261111-final`의 로컬 D1 doctor, mirror 검사를 포함했다. 기존 앱 DB는 변경하지 않았다.

GitHub 자동 리뷰는 추가 P2 1건을 제시했다. 인용 원문/작성자 조회가 정산 전 중단되면 결과 없는 `running` 영수증을 계속 기다려 로컬 복구 기록의 30일 만료 전 재개하지 못했다. 실제 정산 UPDATE 오류로 두 요청 모두 재현했고, 10분 뒤 만료를 기대하는 assertion 2건이 수정 전 실패했다.

수정 커밋은 `17ffee03725760eaf79bc0e4e0d196c309ab2bd0`이다. 기존 영수증 SELECT에서 마지막 갱신 시각을 함께 읽는다. 요청이 10분 이상 미정산이면 현재 관계 임대와 요청 ID 검사를 거쳐 로컬 복구 표식만 해제한다. 최근 진행 중인 요청은 중복 호출하지 않으며, 완료 응답은 나이와 무관하게 재사용한다. 원래 요청과 미정산 예산 예약은 변경·환급하지 않는다. 후속 요청은 기존 예산 승인과 재시도 대기를 지키며 예산을 늘리지 않는다. 추가 D1 호출이나 새 스키마는 필요 없다.

수정 후 원문·작성자의 만료 경계/예산 보존과 병행 작성자 요청 3건이 통과했다. 정상 수동 재시도 → control Queue → background Queue에서도 작성자 보강·12시간 확인점·D1 50회 이내·저장 원문 신규 조회 없음이 통과했다. 로컬 표식 제거 시 원래 미정산 원장 행과 예산이 완전히 동일함을 재조회했다.

최종 검증은 합성이다. 영향 47파일 실행은 기존 redaction 표본의 ID를 새 회귀에서도 재사용해 fixture 1건이 실패했고 937건이 통과했다. 새 표본을 독립 ID로 수정한 뒤 해당 hydration·Queue 2파일을 99/99 재실행했다. 최종 영향 범위는 **47파일 939건 통과**다. 나머지 전체 테스트의 동일 입력 증거를 합치면 Vitest 3942건에 해당하지만 최종 전체 명령 재실행을 의미하지 않는다. 최종 타입·전체 lint·architecture·build도 통과했고 변경되지 않은 D1 doctor·mirror·agent 검사 증거를 재사용한다.

로그는 `%TEMP%/otw-x-pr-ready-preflight.log`, `otw-pr220-stale-quote-{red,green}.log`, `otw-pr220-author-control-recovery.log`, `otw-pr220-review-fixed-affected.log`, `otw-pr220-final-hydration-queue.log`, `otw-pr220-review-fixed-checks.log`, `otw-pr220-final-type-lint.log`에 보존했다. 새 코드에 대한 GitHub 리뷰 답변·해결과 최종 head 확인은 PR 원장에 기록한다. 원격 DB·운영 설정·병합·배포·신규 유료 호출 보류는 유지한다.

## Cloudflare 빌드 실패 재확인과 테스트 제한 시간 보완

`342dc5a31f8d81fee405f2817fd0cce4542c26bc`의 [Cloudflare 빌드](https://dash.cloudflare.com/46e1801b290196fbec7cfae87710ffcf/workers/services/view/overthewall-schedule/production/builds/95bc3c5e-bb7b-4248-b92e-978fa887ba22)는 완료·실패였다. `WORKERS_CI=1`의 기존 build 단계에 포함된 전체 테스트에서 412파일이 통과하고 2파일의 9건이 시간 초과했다. `x-hybrid.integration.test.ts`의 긴 Queue 시나리오 5건은 기본 5초, `x-scan-cost.integration.test.ts`의 완료 이력 시나리오 4건은 15초를 초과했다. 검증값 불일치나 업로드 단계의 실패는 아니며 `wrangler versions upload`는 실행되지 않았다.

동일한 두 파일은 변경 전 로컬에서 66/66 통과했다(21.93초). 긴 Queue 시나리오 네 선언에만 제한 시간 30초를 지정하고 이력 검사 suite를 60초로 조정했다. 실행 횟수·실제 D1·데이터 규모·모든 assertion을 유지하며 제품 코드·전역 테스트 설정·빌드 보호 검사는 변경하지 않았다. 변경 후 같은 66건이 23.96초에 통과했고 기존 공식 보완 4건도 별도 4/4 통과했다. 인용20건 Queue33/D1최대46, 만료 혼합20건 Queue16/D1최대49, 첫·마지막 ACK 실패 최대50/49를 확인했다. 타입 검사·변경 파일 lint·diff 검사도 통과했다.

로그는 `%TEMP%/otw-pr220-build-timeout-{baseline,fixed,supplemental,types,lint}.log`다. 나머지 preflight 구성 요소는 동일 입력의 앞선 통과 증거를 재사용하며 전체 명령 재통과로 보고하지 않는다. 기존 P2는 해결됐고 새 미해결 리뷰는 없었다. 자동 리뷰 요약은 이전 head에 대한 결과이므로 최신 코드의 PASS로 간주하지 않는다. 새 head의 Cloudflare 검사 결과는 PR 원장으로 확인하며 로컬 통과만으로 원격 성공을 단정하지 않는다. 재빌드 버튼·수동 배포·원격 마이그레이션·운영 설정 변경·신규 유료 호출은 수행하지 않았다.
