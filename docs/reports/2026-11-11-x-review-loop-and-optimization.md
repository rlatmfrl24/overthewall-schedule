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

## Cloudflare 전용 모듈 오류 원격 진단

`294ca6ca`의 빌드 `206453cd-e0d2-4eee-9751-d6690e1c5e19`는 전체414파일3939건·플랫폼 조건3건 생략과 agent10건이 통과한 뒤 client bundle의 `@tanstack/store` 해석에서 실패했다. Worker bundle은 통과했고 업로드는 시작되지 않았다. 동일 소스의 새 Windows·Linux 설치 빌드와 Linux의 `CI=1 WORKERS_CI=1 pnpm run build`는 모두 통과했다. 로컬 통과만으로 원격 오류가 해결됐다고 보고하지 않았다.

추가 원격 진단에서 확인한 내용은 다음과 같다.

- dashboard의 빌드 캐시는 비활성이었고 실패 실행과 후속 실행 모두 `reused 0 / downloaded 608 / added 609`의 새 설치였다. 캐시 복원 문제로 단정할 근거가 없다.
- 잠금 파일에 `react-store 0.9.3 → store 0.9.3` 의존성이 이미 존재한다. 두 등록본의 무결성과 ESM entry를 확인했다.
- 임시 `33097a97`의 빌드 `a3451826-ee19-4ec0-9ff0-fb0ef61103d8`에서 실제 설치 직후 세 패키지의 심볼릭 링크·물리 경로·CJS/ESM entry와 ESM import를 확인했다. 모두 정상이었고 진단 종료의 강제 exit1로 업로드를 차단했다.
- 임시 `7d3c150e`의 [빌드 `bafb0783`](https://dash.cloudflare.com/46e1801b290196fbec7cfae87710ffcf/workers/services/view/overthewall-schedule/production/builds/bafb0783-14be-4f00-82a5-833b6ac920d4)는 설치·각 검사·전체 테스트·TypeScript·Vite·SEO 단계 뒤마다 별도 Node 프로세스로 같은 연결을 확인했다. 연결과 로딩은 계속 정상이었으며 전체414파일3939건·플랫폼 조건3건 생략, agent10건, mirror, Worker/client build, SEO와 artifact manifest까지 완료했다. 전체 테스트는519.14초, Worker/client bundle은4.52/15.95초였다.
- 마지막 `[build] Verified artifact manifest for otw.` 뒤 `PR220_DIAGNOSTIC_HOLD`로 exit1을 반환해 버전 업로드와 배포는 실행하지 않았다. 따라서 외부 check의 FAIL은 의도된 중단이며 전체 build 명령 exit0 또는 외부 CI PASS로 보고하지 않는다. 이 명령에는 D1 doctor가 포함되지 않는다.

진단의 선행 로딩 영향을 배제하기 위해 `a5e334b8`의 [빌드 `2a3a7eb9`](https://dash.cloudflare.com/46e1801b290196fbec7cfae87710ffcf/workers/services/view/overthewall-schedule/production/builds/2a3a7eb9-261d-4445-8677-3b4db004b7e8)도 실행했다. 진단 파일과 모든 probe 호출을 제거하고 `294ca6ca`의 원래 build 본문과 마지막 업로드 차단만 사용했다. 이 정상 경로에서도414파일3939건·플랫폼 조건3건 생략과 agent10건이 통과했고 전체 테스트348.94초, Worker/client build2.52/8.74초와 SEO·manifest까지 완료됐다. 이후 `PR220_DIAGNOSTIC_HOLD: uninstrumented build complete`로 업로드 전에 중단했다. 정상 원격 빌드가 모듈 선행 로딩에 의존하지 않음을 확인했다.

이번 새 설치의 Cloudflare에서는 원래 오류가 재현되지 않았다. 당시 실행의 파일시스템이 보존되지 않아 정확한 원인은 미확정이다. 지속적인 선언 누락·캐시 복원·테스트 후 링크 손상을 확인하지 못했으므로 버전 교체·직접 의존성 추가·Vite 별칭·설치 재시도 우회는 추가하지 않는다. 이번 정상 실행을 영구적인 재발 방지 증거로 일반화하지 않는다.

확인된 보완점은 실패한 컨테이너의 실제 연결 상태를 나중에 확인할 수 없다는 점이다. 최종 코드는 **Vite 실패 뒤에만** 별도 Node 프로세스로 세 패키지의 링크·물리 경로·파일 존재 여부와 CJS/ESM 결과를 기록한다. 정상 빌드에서는 모듈을 선행 로딩하지 않으며, 진단은5초 제한이고 원래 실패 종료 코드를 그대로 유지한다. 환경 변수 전체나 비밀값은 출력하지 않는다. 임시 선행 진단과 강제 실패 분기는 모두 제거했다.

새 회귀2건은 실제 패키지 파일과 끊어진 링크에서 상태 기록·비밀값 비노출·입력 파일 보존을 확인했다. 누락된 기능에서2건 실패 후 구현·검증을 통과했다. CJS는 환경의 `NODE_PATH`로 다른 설치를 찾을 수 있어 ESM의 `ERR_MODULE_NOT_FOUND`도 함께 기록해야 함을 확인했다. 실제 격리 Linux 빌드 진입점에 Vite 실패42를 주입해 진단 이후에도42를 반환하고 후속 단계가 실행되지 않음을 확인했다. 영향4파일17건·타입·변경 lint·architecture를 통과했다. 마지막 코드의 정상 로컬 build에서도 진단 출력·선행 로딩·강제 중단 없이 artifact 완료와 exit0을 확인했다. 이전 원격 전체 gate와 합성한 검증이며 마지막 전체 preflight 재실행은 아니다.

마지막 정리·증거 게시에는 Cloudflare가 지원하는 `[skip ci]`를 사용해 업로드로 이어지는 새 자동 빌드를 막는다. [Cloudflare의 skip 지원 확인](https://github.com/cloudflare/workers-sdk/discussions/13216) 저장소의 squash 기본 메시지는 `COMMIT_MESSAGES`이므로 향후 승인된 병합의 메시지에는 이 생략 표식을 포함하지 않아야 한다. 운영/빌드 설정·캐시 삭제·인증 권한·원격 마이그레이션·병합·배포·신규 유료 호출은 변경하지 않았다. 정상 X 동작·12시간 주기·즉시 재개·저장 글 재조회 방지·D1 50회 정책도 변경하지 않았다.

## Cloudflare 모듈 연결의 자동 복구 보완

이 절은 `5d20a1f7` 당시 구현과 원격 증거다. 자동 복구 명령은 다음 절의 engineStrict 보존 수정으로 대체했다.

사용자의 후속 재발 방지 요청으로 앞 절의 진단 전용 코드를 보완했다. `1d34ac06`의 Cloudflare `4818f0ab`는 dashboard에서 건너뛰기로 재확인했다. 과거 `294ca6ca` 컨테이너의 정확한 손상 원인은 여전히 미확정이다.

격리 Linux의 실제 pnpm 설치에서 `react-store → store` 링크를 제거했다. 일반 `install --frozen-lockfile --offline`, 여기에 `--force`만 추가한 경우, `optimisticRepeatInstall=false`만 추가한 경우 모두 exit0이지만 링크를 복구하지 못했다. 설치된 pnpm11.7.0의 `installDeps`는 `optimisticRepeatInstall`이 활성화된 경우 설치 상태 판단으로 조기 반환한다. 두 옵션을 **함께** 적용하면 다시 연결하고 다운로드0·잠금 파일 동일 상태를 유지했다. 이는 자동 복구 명령의 검증 결과이며 과거 Cloudflare 오류 원인의 확정은 아니다.

실제 `pnpm run build`는 Vite 직전에 별도 Node 프로세스로 router/store의 ESM 연결을 검사한다. 정상이면 재설치하지 않는다. 검사 실패에만 `pnpm install --frozen-lockfile --offline --force --config.optimistic-repeat-install=false`를1회 실행하고 새 프로세스로 재확인한다. 실패한 ESM import의 프로세스 캐시를 재사용하지 않는다. 검사 각5초·복구120초 제한이며 복구 실패/재검사 실패 시 빌드와 후속 업로드를 중단한다. Vite의 일반 소스 오류에는 재설치나 빌드 재시도를 하지 않으며 원래 실패 코드를 유지한다. 버전·잠금 파일·허용된 설치 스크립트 정책은 바꾸지 않는다. [pnpm의 frozen/offline 설치 계약](https://pnpm.io/cli/install)

회귀는 기존 진단 테스트에 검사·정상 무설치·복구 성공·설치 실패37·복구 무효의 종료/횟수를 추가했다. 누락된 동작에서4건 실패를 확인한 뒤 영향4파일22건과 타입·변경 lint·architecture가 통과했다. 정상 Windows의 `pnpm run build`는 재설치 없이 exit0·manifest 완료였다. 격리 Linux의 실제 링크와 ESM entry를 함께 제거한 `pnpm run build`도 복구1회·다운로드0·잠금 파일 동일·복구된 entry 바이트 동일·최종 manifest 완료와 exit0을 확인했다(50.28초). 첫 검증 도구는 재설치 대상 내부에 보관한 백업이 사라져 검증 후 정리에 실패했으며 백업을 외부로 옮긴 뒤 같은 실제 흐름을 다시 통과했다. 제품 코드 실패와 구분한다.

정상 LuvDia의 `pnpm run build:luvdia`도 재설치 없이 exit0·manifest 완료였다. 정상 연결 검사만의 로컬 측정은350ms이며 상한이나 성능 보장값은 아니다. 실제 Linux 빌드의 Vite에 exit42를 주입한 경우 복구를 시도하지 않고 실패 후 진단을 기록한 뒤42를 유지하며 SEO/manifest에 도달하지 않았다. 제품·잠금 파일·X 수집 코드와 검증 한도는 동일하다.

Cloudflare 재검증용 임시 게시 `5c03dd42`의 [빌드 `06f65faf`](https://dash.cloudflare.com/46e1801b290196fbec7cfae87710ffcf/workers/services/view/overthewall-schedule/production/builds/06f65faf-901d-40e0-a5dd-9a50488847e7)에서 **415파일3946건 통과·플랫폼 조건3건 생략**, agent10건·mirror·연결 검사·Worker/client bundle·SEO·manifest까지 완료했다. 전체 테스트329.99초, client bundle7.87초였다. `[build] Verified artifact manifest for otw.` 뒤 임시 `PR220_PREVENTION_HOLD`/exit1로 후속 버전 업로드를 차단했다. 외부 check FAIL은 이 의도된 중단 결과이며 전체 명령 exit0이나 외부 CI PASS로 보고하지 않는다.

최종 소스에서는 임시 중단을 제거하고 자동 실행 생략으로 게시한다. 원격 검증과의 실행 코드 차이는 이 마지막 차단 분기 제거뿐이다. 잠금 파일·설치 버전·빌드/운영 설정·캐시·원격 DB는 바꾸지 않았다. 실제 연결 손상에 대한 자동 복구는 로컬 Linux의 정상 빌드 진입점에서 검증했고, Cloudflare에서는 손상을 강제로 만들지 않았다. 과거 오류의 정확한 원인이나 모든 모듈 오류의 영구 방지를 보장하지 않는다. 전체 preflight 재실행이 아닌 이번 원격 gate와 기존 변경 없는 로컬 D1 doctor 증거의 합성 검증이다. 배포·설정 변경·캐시 삭제·원격 마이그레이션·유료 호출 보류를 유지한다.

## 자동 복구의 engineStrict 보존

이 절은 `cc753e0a`의 구현/검증이다. 중단·실패 후 재실행의 미완료 설치 우회는 다음 절에서 추가 수정했다.

[후속 리뷰 P3](https://github.com/rlatmfrl24/overthewall-schedule/pull/220#issuecomment-6790875604)를 수정했다. `--force`가 엄격한 Node 호환성 검사까지 생략하므로 복구 명령에서 제거했다. 실제 pnpm11.7.0 검증 결과, 생성된 설치 상태 파일 `node_modules/.pnpm/lock.yaml`만 재생성하면 force 없이도 누락된 링크와 ESM entry를 복구할 수 있었다. 기준 파일 `pnpm-lock.yaml`과 선언된 버전/정책은 수정하지 않는다. 정상 분기는 이 설치 상태 파일에도 손대지 않는다.

실패 시에만 생성된 설치 상태를 비우고 `pnpm install --frozen-lockfile --offline --config.optimistic-repeat-install=false`를1회 실행한다. 기존 engineStrict 설정을 그대로 적용해 비호환 의존성을 거절하며, false 설정과 호환 의존성의 정상 복구도 유지한다. 복구 실패·재검사 실패·시간 초과는 후속 빌드를 중단한다. 검사5초·복구120초·신규 Node 프로세스 재검사는 동일하다. 실패한 설치가 불완전한 생성 상태를 남기면 다음 정상 pnpm 진입의 설치 검증 대상이 되며, 이를 유효한 상태로 되돌리지 않는다.

실제 pnpm 회귀3건을 추가해 strict true/비호환은 exit1과 `ERR_PNPM_UNSUPPORTED_ENGINE`, strict false/비호환과 strict true/호환은 복구1회와 exit0을 확인했다. 각 경우 package/workspace/기준 lock 파일과 설치 버전이 유지됐다. 정상 분기의 무설치도 확인했다. 기존 코드에서4건 실패를 확인한 뒤 최종 **Windows 영향5파일25건 PASS**, **Linux 정책/진단2파일10건 PASS**다. 실제 pnpm 경로를 상속하기 위해 `pnpm run test:unit <파일>` 또는 `pnpm test`로 실행한다. Windows의 대소문자가 다른 npm_execpath 중복 키 때문에 모의 설치기가 실제 설치기로 바뀌는 fixture 오류도 정리했다. 타입·변경 lint·architecture 검사는 통과했다.

Windows의 정상 `pnpm run build`와 `pnpm run build:luvdia` 모두 exit0·manifest 완료이며 복구 메시지0회다. 기준 lock뿐 아니라 생성된 설치 상태 파일도 전후 SHA256이 동일했다. Linux 실제 설치에서 링크와 ESM entry를 함께 제거한 `pnpm run build`는 force 없이 복구1회·다운로드0·기준 lock/복구 entry 바이트 동일·manifest 완료와 exit0을 확인했다(52.3초). 정상화한 fixture에서 허용 설치 스크립트는 유지되고 차단 스크립트는 미실행, 미승인 스크립트는 `ERR_PNPM_IGNORED_BUILDS`/exit1이었다. 기준 lock 불일치도 다시 쓰지 않고 거절했다.

격리 Linux의 실제 `pnpm run deploy` → build-site/diagnostics 흐름에서 설치 실패37·재검사 실패1·초기 검사5초 시간 초과1을 주입했다. 기능의 복구 횟수는1/1/0, Vite/SEO/manifest 미도달·업로드 도달 표식0·기준 lock SHA256 동일이었다. 외부 업로드 부분만 안전한 도달 표식으로 대체하고 finally에서 복원했다. 원격 업로드나 배포를 수행한 검증은 아니다.

로그는 `%TEMP%/otw-pr220-engine-policy-{red,green}.log`, `otw-pr220-engine-safe-{probe,policies,real-build,gate,normal-otw,normal-luvdia,types}.log`다. 새 전체 preflight·원격 실제 빌드는 실행하지 않았다. 정상 X 동작·12시간 주기·즉시 재개·저장 글 재조회 방지·D1 한도는 수정하지 않았으며 기존 동일 입력 증거를 재사용한다. 최종 게시는 자동 빌드 생략으로 업로드 보류를 유지하고, 향후 승인된 squash 메시지에는 생략 표식을 제외해야 한다. 병합·배포·운영 설정·원격 마이그레이션·신규 유료 호출 보류를 유지한다.

## 미완료 설치의 진행 상태 보존과 재개

[`cc753e0a` 재리뷰 P2](https://github.com/rlatmfrl24/overthewall-schedule/pull/220#issuecomment-6791680275)를 수정했다. 모듈 파일이 복원된 뒤 설치 후 처리가 중단되면 다음 ESM 검사만으로 설치 성공을 판단하던 문제다. 이제 생성된 설치 상태를 삭제하기 전에 `.tmp/build-dependency-repair.pending`를 동기 기록하고 flush한다. 이 표식은 pnpm이 관리하는 node_modules 밖에 있어 재설치 중에도 유지되며 Git에는 포함하지 않는다.

정상 빠른 경로는 ESM 정상·진행 표식 없음·생성 설치 상태 존재를 모두 확인한다. 표식이 있거나 생성 상태가 없으면 모듈이 정상이어도 frozen/offline 설치를1회 수행한다. 따라서 이전 버전이 표식 없이 남긴 생성 상태 부재도 재검증한다. 설치0·새 프로세스 재검사0·생성 설치 상태 존재까지 확인한 뒤에만 표식을 해제한다. 설치 실패·재검사 실패·시간 초과·중단 시에는 표식을 유지하고 빌드를 중단한다. engineStrict와 기존 설치 스크립트 정책은 그대로 적용하며 force를 재도입하지 않았다.

추가 회귀는 미완료 표식+정상 모듈의 재설치, 생성 상태 부재, 설치 실패/재검사 실패의 표식 유지, 생성 상태를 만들지 않은 가짜 설치 성공의 거절을 확인한다. 실제 pnpm 회귀에서는 설치 후 처리41 실패 뒤 모듈이 정상이어도 다시 후처리를 실행해41로 거절하고, 정상화하면 복구1회·표식 해제·다음 정상 실행의 재설치0회를 확인했다. 기존 코드에서8건 실패 후 최종 **Windows 영향5파일30건**, **Linux 정책/진단2파일15건**이 통과했다. 타입·변경 lint·architecture도 통과했다.

격리 Linux의 실제 `pnpm run deploy` → `pnpm run build` → build-site/diagnostics 흐름에서 다음을 확인했다. 외부 업로드 명령만 안전한 표식+exit99로 대체하고 finally에서 원본을 복원했다. 아래99는 의도적인 외부 차단이며 실제 업로드나 명령 전체 성공을 뜻하지 않는다.

| 상황 | 결과 |
| --- | --- |
| 생성 설치 상태 삭제 직후 강제 중단 | 삭제 전 진행 표식 존재, 산출물/업로드 미도달 |
| 위 상태에서 재실행 | 복구1회·설치/재검사/manifest 완료·진행 표식 해제·외부 차단99 |
| 모듈 복원 후 실제 Clerk 설치 후 처리 도중 SIGKILL | 진행 표식 유지·산출물/업로드 미도달 |
| 위 상태에서 후처리가41로 실패하도록 재실행 | 후처리 재실행·복구1회·진행 표식 유지·manifest/업로드 미도달 |
| 정상화 후 재실행 | 복구1회·설치/재검사/manifest 완료·표식 해제·외부 차단99 |
| 완료된 상태에서 다시 정상 실행 | 복구0회·후처리 추가 실행0·manifest 완료·외부 차단99 |

Windows의 OTW/LuvDia 실제 정상 build도 모두 exit0·manifest 완료·복구 메시지0·진행 표식 없음이며 기준 lock과 생성 설치 상태 SHA256이 동일했다. 실제 정책 fixture에서 strict 비호환 거절, 허용/차단 스크립트 유지, 미승인 스크립트 거절, frozen lock 불일치 거절과 기준 파일/버전 보존도 다시 통과했다. 별도 설치 실패37·재검사 실패1·초기 검사5초 시간 초과1의 실제 명령 흐름은 복구1/1/0회·표식 유지·업로드 미도달을 확인했다.

로그는 `%TEMP%/otw-pr220-pending-repair-{red,green,real,policies,gate,normal-otw,normal-luvdia,types}.log`다. 새로운 전체 preflight·실제 원격 빌드는 실행하지 않았다. X 수집 코드·스키마·잠금 파일·버전·운영 설정은 동일하며, 해당 변경 없는 검증은 앞선 증거를 재사용한다. 최종 게시의 자동 빌드는 생략한다. 향후 승인된 squash 메시지에서는 생략 표식을 제외해야 하며 병합·배포·원격 마이그레이션·운영 설정·신규 유료 호출 보류를 유지한다.
