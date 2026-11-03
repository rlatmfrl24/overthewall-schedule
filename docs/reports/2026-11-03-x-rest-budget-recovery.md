# X REST 예약 경합·반복 이월 수정과 예산 검토

2026-11-03. 기준 `6897d7b9cc69f45cd009a8fc0c9b18b6f80edd4a`에서 `codex/x-rest-budget-recovery`로 분리한 수정이다. 사용자는 리뷰 결함·기준 사항 보완 후 `$pr-ready`의 커밋·푸시·PR 게시를 승인했다. 운영 배포·유료 X 조회·강제 수집·설정 변경은 수행하지 않았다. 이전 조사 원본은 로컬 `.tmp/2026-11-03-x-audit/`에 있다.

## 결과와 승인 범위

사용자가 요청한 공통 UTC 하루 $1 유지, OTW REST 선예약 경합·반복 이월 수정, 웹훅 보강 비용의 안전한 절감 가능성 및 예산 조정 필요성을 검토했다. 공통·사이트 예약 보호와 커서 확인, 사이트/멤버 허용 범위, D1·Queue 보호, 기존 자동화 중지는 유지한다. DB schema·migration·API DTO 모양은 변경하지 않았다.

로컬 코드와 관련 검증은 완료했다. 운영의 실제 수집 복구·비용 절감은 배포 전이므로 확인하지 않았다.

## 수정한 정상 경로

1. 기존 정기 coordinator가 예정된 작업을 계획하고 outbox와 Queue로 보낸다.
2. 같은 shard의 계정별 timeline 요청을 순차 처리한다. 앞 계정이 정산하기 전에 다음 계정이 큰 금액을 예약해 차단되는 경합을 줄인다. 사이트 간 동시 요청은 기존 공통 DB 원자적 게이트가 통제한다.
3. 새 페이지와 이월 페이지는 요청 직전의 공통·사이트 잔여액을 모두 반영해 5–25개 범위로 크기를 정한다. 공유 예약의 게시물당 25,000 micros 및 사이트 조회 보호의 게시물당 10,000 micros 산식은 유지한다. 예를 들어 공통 잔여 $0.150이면 기존 이월 요청을 25개/$0.625에서 6개/$0.150으로 축소한다.
4. 저장 성공 후 기존 `since_id`, pagination token, base/newest ID 확인 경로로 진행 상태를 기록한다. 저장 실패·원문 접근 제한 시 커서를 성공 처리하지 않는다.
5. 이월 커서 또는 `budget_exceeded`가 남은 계정은 15분 재시도 자격 이후 다음 기존 정기 점검에서 이어 처리한다. 현재 X 정기 점검은 매시 23·53분이다. 최소 페이지의 공통·사이트 예약을 감당할 예산이 없으면 새로운 복구 작업을 만들지 않는다.
6. 미완료 전용 작업은 기존 `xCollectionScope=pending` 표시를 보존해 최종화한다. planner가 작업 저장과 이 표시를 함께 처리해 두 진입점의 중복 판정을 제거했다. 원래 전체 점검의 기준 시각을 `recoveryAnchorAt`으로 계획에 저장하고 source의 다음 점검 시각에도 적용한다. 전체 수집의 24시간 cadence는 이 작업 때문에 앞당기거나 연기하지 않으며, 실제 조회·성공 시각은 그대로 기록한다.
7. 임시 REST 예약으로 웹훅이 예산 중지된 경우, 예약이 풀려 처리 가능한 예산이 돌아오면 다음 조정 시 재개한다. `budget` 중지만 해제하고 사용자·사이트 중지는 유지한다. 실제 예산 소진 상태는 중지를 계속 유지한다.

관리자 예약액 표시는 실행과 같은 페이지 크기 계산을 재사용한다. 기존 응답 필드 구조를 유지하며, ‘다음 전체 점검 가능’과 별도 미완료 복구 설명으로 새 동작을 구분했다.

이번 요청은 이전의 ‘미완료도 다음 전체 24시간 실행까지 대기’ 동작을 수정한다. 전체 주기 자체와 수동 이월 전용 실행의 범위는 유지한다. 과거 아카이브한 X 구간 재검사 방식은 도입하지 않았다.

## 웹훅 보강 비용

보강 시도 키는 **이벤트 ID + UTC일**을 유지한다. 별도 이벤트에는 공통 게이트웨이에서 같은 UTC일·정확히 같은 조회 경로·operation의 **완료된 성공 응답만** 재사용한다. 단일 게시물·현재 수신 이벤트의 게시물/작성자 일치·응답 오류 없음·실제 미디어 준비까지 확인한다. 차단·공급자 실패·HTTP200 부분 응답을 다른 이벤트에 공유하던 리뷰 결함을 수정했다. 같은 이벤트의 진행 중 claim과 불확실한 요청은 기존 idempotency를 유지한다. 사이트별 허용 범위·삭제/redaction·UTC 경계와 이미 전달된 웹훅 이벤트 비용도 유지한다.

서로 다른 이벤트 두 건의 동일 Post 보강이 기존 코드에서 외부 조회 2회로 실패하는 회귀를 확인했다. 수정 후 조회 1회, inbox 두 건 complete, 저장된 미디어 유지로 통과했다. 기존 양 사이트 동시 처리와 삭제 경합 검증도 통과했다.

별도 이벤트가 동시에 들어와 첫 응답이 아직 완료되지 않은 경우에는 서로 독립된 시도다. 이 변경은 확정 응답의 재사용만 보장하며, 서로 다른 이벤트의 모든 동시 조회를 하나로 합친다고 주장하지 않는다. 캐시 조회 범위는 해당 UTC일의 완료 행이며 새로운 DB 쓰기를 추가하지 않는다.

다만 11월 2일 UTC 운영 장부의 완료 보강 62회는 **서로 다른 Post 62개**였다. 그날 $0.310에 대한 이 수정의 관측 가능한 절감 대상은 0건이다. 중복 전달이 발생할 때의 추가 조회를 막는 개선이며, $0.310 전부가 없어지는 변경이 아니다.

`attachments`가 생략된 글을 미디어 없는 텍스트라고 간주해 조회를 생략하지 않는다. X 공식 문서는 전달 시점에 따라 필드 가용성이 달라질 수 있다고 설명한다. 명시적인 빈 첨부 목록 또는 완전한 사진·영상 원본은 기존 경로대로 추가 조회 없이 처리한다. 불완전 원본의 일괄 생략은 미디어 누락을 일으킬 수 있어 채택하지 않았다. [X 이벤트 원본 계약](https://docs.x.com/x-api/activity/event-payloads)

## 하루 예산 조정 판단

**예약 경합을 해결하기 위한 증액은 필요하지 않다. 현재 $1을 유지하고 수정 배포 후 실제 미완료·중지 시간과 X 청구액을 대조하는 것이 우선이다.** 예약액 축소와 재시도 개선은 실제 자원 사용료의 인하와 다르다. 이전에 밀리던 작업이 처리되면서 실제 사용액이 늘어날 수도 있다.

최근 운영 장부의 UTC 7일은 다음과 같다. 모두 내부 추정값이며 개별 최종 청구액이 아니다.

| UTC 일자 | 공통 사용 |
| --- | ---: |
| 10/27 | $0.730 |
| 10/28 | $0.920 |
| 10/29 | $0.605 |
| 10/30 | $0.950 |
| 10/31 | $0.700 |
| 11/01 | $0.975 |
| 11/02 | $0.975 |

합계 $5.855, 일평균 $0.8364, 30일 단순 환산 $25.09다. 뒤의 두 날은 한도 근처에서 수신을 중단한 값이므로 필요한 수요를 모두 처리한 평균이 아니다. 이 값만으로 $1이 종일 수신에 충분하다고 판단하거나 정확한 증액 필요액을 정할 수 없다.

11/02 장부 $0.975는 이벤트 $0.370 + 웹훅 보강 $0.310 + timeline $0.255 + 별도 게시물 조회 $0.030 + 계정 조회 $0.010이다. 중복 보강 개선만으로 일반 글의 보강 비용을 제거하지 못하므로, **종일 무중단 웹훅 수신이 필수라면 실제 예산 부족이 계속되는지 관측해야 한다.** 복구 경합이 해소된 뒤에도 실제 소진으로 중지·적체가 반복되면 일 예산 증액을 검토할 근거가 된다. 현재 관측은 중단으로 잘렸으므로 임의로 $1.25나 $1.50을 적정값으로 제안하지 않는다.

X는 같은 UTC일의 자원 중복 과금 제거를 설명하지만 이를 soft guarantee로 명시한다. 따라서 같은 글이라는 이유만으로 비용을 0으로 예약하거나 공통 보호를 낮추지 않았다. 실제 요금·주기 지출 제한·자동충전 설정을 함께 대조한 뒤 예산 변경을 결정해야 한다. 이번에는 변경하지 않았다. [X 요금·중복 과금 및 지출 제한](https://docs.x.com/x-api/getting-started/pricing)

## 검증

Node 24 실행 파일 `.tmp/node24.exe`를 사용했다. 통과한 기존 증거는 입력이 같은 범위에서 유지했고 후속 변경이 영향을 준 파일만 재검증했다.

- 관련 26파일 418건 PASS 후 동일 Post 중복 이벤트 회귀 1건을 추가했다. 마지막 제품 변경 후 XAA/domain/app 3파일 37건, 강화된 cadence 32건, 관리자 UI 10건을 재검증했다. 관련 고유 **419건**의 합성 검증 증거를 구성했다.
- 경합, 낮은 공통 잔액, 낮은 사이트 보호 한도, 비최적화 재개, 임시 예약 후 웹훅 재개, 다른 이벤트의 동일 Post 중복 조회를 실패 회귀로 먼저 확인했다.
- 정기 재개 검증은 실제 Worker/D1의 `ScheduledJobCoordinator.runScheduled` → outbox/dispatch → Queue handler → executor → finalizer로 수행했다. optimizer on/off 각각에 대해 실제 사용 예산의 UTC rollover와 임시 예약 해제 후 같은 날 재개를 확인했다. 최종 D1의 게시물 2건, 실패 코드 해제, 예약 0, succeeded, `xCollectionScope=pending`, 전체 cadence 불변을 확인했다.
- 외부 X·Cloudflare Analytics 응답과 Queue 전송은 테스트 어댑터다. 새 운영 UI에서 유료 수집이 성공한 증거로 대체하지 않는다.
- Worker/test 타입, 변경 코드 ESLint, architecture check PASS. 최종 OTW production build와 artifact manifest 확인 PASS. 기존 크기 큰 client chunk 경고는 남아 있으며 이번 변경과 별개다.
- 별도 검토자가 초기 비최적화 cooldown과 사이트 잔액 누락을 지적했고 수정·회귀 후 재검토에서 추가 지적이 없었다. 마지막 게시물/UTC일 공통 키도 재검토했다.

대표 명령:

```powershell
& '.tmp/node24.exe' node_modules/vitest/vitest.mjs run --config vitest.all.config.ts worker/features/x-posts worker/features/scheduled-operations/infrastructure/scheduled-job-planner.test.ts worker/features/scheduled-operations/infrastructure/scheduled-job-executor.test.ts worker/features/scheduled-operations/infrastructure/scheduled-job-coordinator.test.ts worker/features/scheduled-operations/infrastructure/collector-sql-cadence.integration.test.ts worker/app/x-activity.integration.test.ts worker/app/x-gateway.test.ts src/features/member-posts/ui/admin/x-collection-monitoring.test.tsx src/features/member-posts/ui/admin/x-activity-manager.test.tsx src/features/member-posts/ui/admin/x-reference-health.test.tsx worker/app/archive-access.integration.test.ts
& '.tmp/node24.exe' node_modules/typescript/bin/tsc -p tsconfig.worker.json --noEmit
& '.tmp/node24.exe' node_modules/typescript/bin/tsc -p tsconfig.test.json --noEmit
& '.tmp/node24.exe' scripts/architecture-check.mjs
& '.tmp/node24.exe' scripts/build-site.mjs --site=otw
```

## PR 최종 검증 — 2026-11-03

Node **24.20.0**, pnpm **11.7.0**에서 최종 제품/테스트14파일을 고정했다. 이 제품 diff의 Git blob ID는 `50ca0f71bea0e65ba21d64770031c45491867eac`이며, package/lockfile·Vitest·ESLint·세 test/worker/node tsconfig·preflight 구성 해시 집합의 SHA256은 `62567b0a7db040ac57feab5d8bcdb127d92efa46a071388ac0965ba1b82a78aa`다. 게시 직전까지 원본 blob 일치를 확인했다.

**모든 preflight 구성요소 PASS의 합성 검증이다. 원래 `pnpm preflight` 전체 명령이 성공했다고 보고하지 않는다.** 최초 명령은 구조 검사 PASS 후 새 helper의 타입 호환 오류에서 fail-fast됐다. 런타임을 바꾸지 않고 `post` 입력을 `Record<string, unknown>`으로 바로잡은 뒤 타입 검사와 미도달 단계를 순서대로 실행했다.

- 구조 검사 PASS 재사용. 전체 test/worker/node 타입·전체 ESLint PASS.
- 전체 Vitest **401파일3,400건 PASS**, agent sync 보조 테스트 **10건 PASS**. 실패·삭제·권한·원자적 예약과 정상 Queue/D1 복구 회귀를 포함한다.
- OTW build PASS, 공통 웹훅 소비자인 LuvDia build도 추가 PASS. 양 사이트 artifact manifest 확인 PASS. 기존500kB 초과 client chunk 경고는 남는다.
- 로컬 D1 doctor는 처음에 기존0157·0158 인덱스 미적용으로 FAIL했다. 전체158건을 별도 임시 DB에 실제 적용·검증한 뒤, 기존 DB의 온라인 백업/quick_check를 확인하고 두 migration만 로컬 적용했다.133개 나머지 테이블의 행 수는 모두 동일하고 migration 원장만2건 증가, 기대 인덱스3개 존재를 확인했다. 최종 기본 `pnpm d1:doctor` PASS다. 기존 데이터 reset/seed와 원격 migration은 하지 않았다.
- 미도달 mirror check도 PASS:27개 관리 파일 일치, 참조 유효. canonical/generated 지침 변경은 없다.
- 최종 독립 Standards는 hard 위반0·의미 있는 냄새0, Spec은 세 P2 해소·미해결0/PASS다. 이후 타입만 보정했으며 동작은 동일하다.

원본 로그는 로컬 `.tmp/2026-11-03-x-review/`의 `preflight.log`, `composed-preflight.log`, `doctor-final.log`, `migration-chain.log`, `local-indexes-apply.log`, `luvdia-build.log`, `mirror.log`다. `final-source-identity.json`에14개 원본 blob과 구성별 해시를 기록했다. DB 백업과 전후 readback도 같은 폴더에 보존한다. 기존 Haiku 문서4개는 해시 불변이며 current-work에서도 X 절만 스테이징했다.

## 남은 운영 검증

새 코드는 미배포다. 양 사이트 실제 관리자 화면의 새 문구·예상 예약액, 자연 정기 실행에서 기존 운영 커서의 재개·완료, 실제 절감액과 전체 누락량은 아직 확인하지 않았다. 배포 후에도 실제 잔여 예산이 부족하면 정당한 이월은 발생할 수 있다. 공통 $1은 기존대로 전달 중 이벤트 등에 의해 초과 가능한 운영 목표이며 강제 청구 상한으로 바꾸지 않았다.

운영 DB·웹훅/수집 제어·자동충전·Play/AI 자동화는 변경하지 않았다. 기존 Haiku 미커밋 문서는 보존하며 이번 PR에서 제외한다. 승인된 게시 범위는 이 X 수정의 커밋·푸시·PR까지이며, 병합·배포는 포함하지 않는다.
