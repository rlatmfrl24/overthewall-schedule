# 전체 테스트 정리·안정화 — 2026-11-18

## 결과와 검증 범위

배포 전 전체 필수 검증과 실제 권한·저장·경합·비용 경계는 유지한다. 임의의 테스트 개수·커버리지 비율 목표, 일괄 timeout 확대, 자동 재시도, skip/제외는 추가하지 않았다.

- 기준: a9ed7abd78f4f1a10285cb4fe54717ace700d043, Node 24.20.0, pnpm 11.7.0, Vitest 4.1.11, maxWorkers=2. 기존 다른 작업의 문서 변경은 보존한다.
- 기준 목록: 418파일(단위347, Worker feature55·schema13·Workflow1, Node2). 현재 목록: 430파일.
- 기준 공식 실행: Vitest 416파일·3,962건 PASS, 534.66초. 뒤이어 agent Node10건 PASS. 공식 명령에서 빠진 점검용 Worker2건도 별도 PASS.
- 전수 범위: 현재 파일의 AST 선언·import·검증/대기 패턴·실행 배치를 조사하고 모든 파일을 아래 목적/경계에 대응시켰다. 변경 후보와 긴 사례는 본문·소비자·기존 보호 경계를 대조했다. 아래 목적은 대표 사례군이며 모든 assertion의 명세 복사본이나 모든 제품 요구사항에 대한 독립 인증은 아니다.
- 같은 이름·본문 길이만으로 삭제하지 않았다. 기존 파일 사이의 완전히 같은 테스트 본문은 발견되지 않았고, 공통 API 파일과 소유 기능 테스트 사이의 동일 요청 검사를 중복으로 판정했다.

## 정리 판단과 남는 검증

| 대상 | 판단과 보존한 검증 |
| --- | --- |
| 공통 feature-contracts | 파일 제거. 회원·D-Day·공지·일정·일정표·통합 글·YouTube·설정·감사·CHZZK·pending 요청을 소유 API 옆으로 이동. 각 CRUD/복합 요청은 독립 사례로 확인한다. |
| 데이터 보존·수동 일정/X 실행 중복 | 기존 operations/api/operations.test.ts의 데이터 보존 dry-run/실행 구분 및 수동 실행 endpoint 검사가 남는다. 단순 중복 요청과 그 mock 응답만 제거했다. |
| pending 단건/일괄 승인·거절 | pending-schedules.test.ts에서 각 옵션·검색·일괄 결과·단건 내부 실패 전파를 독립 검사한다. |
| 관리자 카탈로그 UI | 67개 선언과 parameterized 사례의 조작·assertion을 카탈로그·등록·검수·운영으로 나눴다. mock 등록은 component import보다 앞서며, 각 사례의 DTO·응답·QueryClient·전역/DOM 상태를 초기화/복원한다. 큰 소스 상태 fixture는 운영 사례에만 준비한다. |
| 카탈로그/수집 입력·서비스 | preflight, 등록, conversion, ignore, retry, 명령별 감사 mirror 및 승인 거절 조건을 분리했다. 성공 승인 후 동일 결과 재사용은 하나의 실제 순서 계약으로 유지한다. |
| D1 카탈로그 실패 | event 삽입 실패·projection 실패·stale revision을 독립 사례로 분리했다. 실제 D1의 revision·가창·source readback, trigger 정리, 원자성은 유지한다. |
| 카탈로그 비용 | 기존 meterD1으로 실제 rows_read/rows_written을 측정한다. 50/500/5,000건, 500개 대표 처리량과 성장 대비 비용 assertion은 유지한다. assertion 없이 EXPLAIN만 전부 실행하던 Map/루프와 약1.8MB PLAY_READ_PLANS 출력은 제거했다. |
| 시간/동시성 | 공개 시각은 제품의 1초 interval만 제어하며 Testing Library의 polling interval을 가로채지 않는다. 이미지 실패는 직접 응답을 완료하고, 동시성은 해제 가능한 Promise로 확인한다. 자동 재시도 부재·완료 후 단일 갱신은 fake timer로 검사한다. |
| 장식/로그 | app-shell footer의 h-14 클래스 assertion만 제거했다. 계정 메뉴·접근성·실제 조작은 유지한다. 예상 오류는 해당 사례의 정확한 로그를 검사하며 전역 로그 필터는 두지 않는다. |
| 타입 검사 | 런타임 globals=false와 일치하도록 tsconfig.test.json에서 vitest/globals를 제거했다. 명시적 vi import 누락이 TS2304로 실패함을 확인하고 import를 보완했다. |
| Node 진입점 | test:node는 agent와 점검용 Worker 두 파일을 실행한다. test는 기존 네 Vitest 프로젝트 성공 뒤 test:node를 한 번 실행하고 실패 코드를 보존한다. |

## 긴 테스트의 판단

줄 수는 후보 선별에만 썼다. fixture와 단일 호출/결과 검증이 긴 경우, 대규모 비용 비교, 승인→게시→권한 철회, Ready 저장→다음 행 ID 재사용, 재전달/ACK/DLQ·과금 책임, migration 데이터 보존은 연결 자체를 보호하므로 실제 D1/Worker 흐름으로 유지한다. 이를 mock 단위 검증으로 옮기거나 데이터 규모·D1 50회 상한·assertion을 줄이지 않았다. 독립 API/파서/서비스 조건과 D1 실패 원인은 위와 같이 분리했다.

기준 AST에서 101줄 이상 본문은 43개다(초기 선별의 42개는 줄 끝 포함 방식 차이로 101줄 사례1개를 제외한 수치).

| 기존 파일 | 긴 사례 | 판단 |
| --- | --- | --- |
| worker/platform/scheduled-jobs/d1-scheduled-job-repository.integration.test.ts | keeps idle atomic outbox updates bounded after retained history outgrows planner statistics (102줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/app/work-queue-flow.integration.test.ts | reviews a full playlist through the authenticated workflow and writes catalog data only at final confirmation (229줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| src/shared/api/feature-contracts.test.ts | kirinuki/settings API는 쿼리와 endpoint를 조합한다 (260줄) | 중복 제거·소유 기능으로 이동 |
| worker/features/x-posts/infrastructure/x-reference-hydration.integration.test.ts | removes hydrated reply/quote/link copies and stale feed caches when an original is redacted (122줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/x-posts/infrastructure/x-rss-official-hydration.integration.test.ts | profiles a whole mixed Queue with five free and the maximum admissible official batch: %s (117줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/schedules/infrastructure/d1-pending-schedule-repository.integration.test.ts | 혼합 승인 결과는 입력 순서를 유지하고 성공 항목만 독립 commit한다 (101줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/schedules/domain/auto-update-matcher.test.ts | 로컬 18개 VOD 회귀 형태를 16개 세션·15개 기존 일정·단기 억제 1건으로 분류한다 (113줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-public-catalog-reader.integration.test.ts | applies the additive read-model tables, indexes, foreign keys, and fail-closed checks (108줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-public-catalog-reader.integration.test.ts | stays within the bounded query, bind, rows-read, and compressed response budgets (171줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-proposal-search-schema.integration.test.ts | enforces proposal lock pairs, review outcomes, status values, and integer fields (131줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-member-submission-repository.integration.test.ts | updates only an owned pending proposal with CAS and audits field names (108줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-ingestion-repository.integration.test.ts | preserves standalone song and identity materialization for reuse by the next row (162줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-ingestion-repository.integration.test.ts | defers unknown channels, then preserves positions, classifies metadata, and completes once under duplicate delivery (121줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-ingestion-repository.integration.test.ts | saves a stale row when only background metadata changed its version (149줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-ingestion-repository.integration.test.ts | saves candidate review with CAS and preserves ignored decisions for 180 days (168줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-external-identity-consolidation.integration.test.ts | moves every live reference to the canonical identity before enforcing uniqueness (160줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-channel-monitor-repository.integration.test.ts | keeps target generations isolated and preserves monitor audit history on deletion (133줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-authority-retention-migration.integration.test.ts | repairs false-active subscriptions and preserves valid authority (119줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | creates a draft and marks its ingestion candidate converted in one catalog batch (163줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | completes an existing broadcast draft and preserves policy through publish, alternate sources and revocation (255줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | creates a member, external identity, channel, song, performance, event, and projection in one catalog batch (143줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | creates a cover from separate original title and artist input (171줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | reuses one media source for independent medley cover segments (177줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | writes a draft atomically and publishes only after official channel approval (271줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | deletes draft and withdrawn test data while keeping events, projections, and revisions atomic (231줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | deletes only unreferenced external identities and preserves protected identities (178줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | rolls back the integrated entry when its event fails and rejects a stale preflight revision (161줄) | 실패 원인별 D1 사례 분리 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | allows an unknown channel to save only a draft and blocks it after revocation (103줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | approves a %s proposal atomically with catalog and projection (reuse artist: %s) (240줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts | corrects a performance atomically and creates or reuses a participant: %s (236줄) | 연결된 저장·공개·원자성 계약과 fixture 유지 |
| worker/features/otw-play/http/ingestion-input.test.ts | strictly validates candidate review, conversion, and retry commands (147줄) | 독립 입력 사례 분리 |
| worker/features/otw-play/http/admin-catalog-input.test.ts | parses the workflow-first preflight and integrated catalog command (195줄) | 독립 입력 사례 분리 |
| src/features/otw-play/ui/admin/catalog-manager.test.ts | edits the linked song, participants, classifications, source, and notes in one performance form (208줄) | 책임별 파일로 이동; 연결된 폼 조작·저장 검증 유지 |
| src/features/otw-play/ui/admin/catalog-manager.test.ts | deletes draft and withdrawn test data while protecting currently published catalog (152줄) | 책임별 파일로 이동; 연결된 폼 조작·저장 검증 유지 |
| src/features/otw-play/ui/admin/catalog-manager.test.ts | publishes every visible draft from one catalog action and preserves failed or accepted drafts (accepted=%s) (125줄) | 책임별 파일로 이동; 연결된 폼 조작·저장 검증 유지 |
| src/features/otw-play/ui/admin/catalog-manager.test.ts | registers a medley track as a draft cover and prepares the next segment (104줄) | 책임별 파일로 이동; 연결된 폼 조작·저장 검증 유지 |
| worker/features/otw-play/application/ingestion-service.test.ts | approves an official channel in the candidate flow and refreshes its authority state (142줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/application/ingestion-service.test.ts | converts ready rows independently as drafts and records only failed rows for retry (105줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/otw-play/application/admin-catalog-service.test.ts | coordinates successful admin lifecycle commands and audit mirrors (145줄) | 명령·승인 조건 분리 |
| worker/features/otw-play/application/admin-catalog-service.test.ts | coordinates a full performance correction and allocates inline participant identities (105줄) | 단일 가창 수정·inline ID 배정 계약 유지 |
| worker/features/otw-play/application/admin-catalog-service.test.ts | validates every proposal approval boundary before the atomic repository command (139줄) | 명령·승인 조건 분리 |
| worker/features/operations/http/handler.test.ts | pending은 과거 처리 로그 추정 없이 실제 행을 경고 대상으로 집계한다 (134줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |
| worker/features/operations/http/handler.test.ts | 네이버 표시가 꺼져도 소스별 오류와 stale 상태를 반환한다 (144줄) | 연결된 계약/fixture를 유지; 단위 대체 없음 |

## 실행 증거와 한계

- 독립 정적 검토에서 Clerk 복원 누락과 롤백 사례 가독성을 지적받아 보완했다. 환경에 미리 제공된 Clerk 값을 설치하는 별도 임시 setup 검증은 수정 전2스위트 FAIL→수정 후2스위트·27사례 PASS였다.
- 이후 자체 실행에서 확인한 vi import 누락은 런타임 실패와 전역 타입 환경의 불일치였다. 전역 타입 없이 검사하면 TS2304로 거절되는 RED를 확인하고, 실행과 같은 타입 설정·명시적 import로 보완했다.

### 최종 확인

| 검사 | 결과 |
| --- | --- |
| 공식 pnpm test | 네 Vitest 프로젝트 428파일·4,048건 PASS, Node 두 파일12건 PASS, 실패/skip0 |
| 순서 변경 | seed 20261118~20261122, 매회10파일·172건 PASS(총860사례 실행) |
| pnpm typecheck:test | 프런트 테스트·Worker·Node 설정 PASS; 실제 런타임과 같은 명시적 import 조건 |
| 변경 코드 ESLint·architecture:check·git diff --check | PASS |
| pnpm build / pnpm build:luvdia | 두 명령 exit0, 각 사이트 artifact manifest 생성·검증 완료 |

| 비교 | 정리 전 | 정리 후 |
| --- | ---: | ---: |
| Vitest 사례 | 3,962 | 4,048 |
| 필수 Node 사례 | 10 | 12 |
| Vitest 전체 실행 시간 | 534.66초 | 429.45초 |
| 공식 명령 출력 | 2,127,864 bytes | 328,764 bytes |
| D1 카탈로그 비용 파일 | 43.910초 | 36.326초 |
| 관리자 카탈로그 사례 전체 | 단일 파일23.449초 | 네 파일 합계22.380초(최대8.626초) |

독립 사례를 나누고 빠진 Node 검증을 포함해 원시 사례 수는 늘었다. 중복 요청·검증 없는 진단만 제거했으며 권한·원자성·경합·비용·실제 흐름 검증은 유지한다. 위 시간은 같은 호스트·Node/pnpm/Vitest·worker2개 조건에서 각각1회 측정한 결과다. 캐시·시스템 부하 영향을 분리한 벤치마크나 원격 CI에서 같은 폭의 단축을 보장하는 값은 아니다.

실행 로그는 %TEMP%/otw-test-audit-{baseline,final,units,d1,types,shuffle-20261118~20261122,clerk-red,clerk-green,explicit-imports-red,build,build-luvdia}-20261118.log 계열과 .tmp/test-audit/에 남겼다. shuffle 로그의 실제 이름은 otw-test-audit-shuffle-<seed>.log다. baseline은 초기 코드, final은 정리 후 코드이며 실패 재현과 통과 결과를 혼동하지 않는다.

전체 preflight·coverage·실제 브라우저 재검증은 실행하지 않았다. 이 작업은 테스트/타입 설정과 fixture 정리이며 제품 코드·공개 API·스키마는 바꾸지 않았다. 로컬 CLI·실제 workerd/D1/Queue/Workflow의 합성 검증은 원격 CI 재발 방지나 운영 배포 완료의 증거가 아니다. 운영 DB/설정·유료 공급자 호출·Git 게시·배포는 수행하지 않았다.

## 기존 418파일별 판단

### contracts/multiview.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [contracts/multiview.test.ts](../../contracts/multiview.test.ts) | Node/Vitest | 유지 | normalizes a supported channel: %s; rejects unsafe or unsupported input: %s |

### contracts/site-definition.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [contracts/site-definition.test.ts](../../contracts/site-definition.test.ts) | Node/Vitest | 유지 | rejects missing or unknown selection %s; keeps LuvDia's production origin unresolved and its own branding |

### contracts/site-publication.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [contracts/site-publication.test.ts](../../contracts/site-publication.test.ts) | Node/Vitest | 유지 | opens LuvDia exactly at midnight Korea time and leaves OTW open; hides only transferred OTW members at the same boundary |

### scripts/architecture-check.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/architecture-check.test.ts](../../scripts/architecture-check.test.ts) | Node/Vitest | 유지 | allows only the declared %s pure command entry; rejects undeclared entry %s |

### scripts/build-dependency-diagnostics.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/build-dependency-diagnostics.test.ts](../../scripts/build-dependency-diagnostics.test.ts) | Node/Vitest | 유지 | checks and repairs dependency links: $broken $mode $repair pending=$pending |

### scripts/build-dependency-policy.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/build-dependency-policy.test.ts](../../scripts/build-dependency-policy.test.ts) | Node/Vitest | 유지 | preserves actual pnpm policy and unfinished repair: $strict $engine hook=$hook |

### scripts/clerk-environment.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/clerk-environment.test.ts](../../scripts/clerk-environment.test.ts) | Node/Vitest | 유지 | checks app identity as well as key kind without exposing a key; classifies development and production publishable keys |

### scripts/client-build-deploy-guard.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/client-build-deploy-guard.test.ts](../../scripts/client-build-deploy-guard.test.ts) | Node/Vitest | 유지 | rejects an entry outside the build root: %s; accepts a versioned entry for the selected production app |

### scripts/d1-doctor-core.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/d1-doctor-core.test.ts](../../scripts/d1-doctor-core.test.ts) | Node/Vitest | 유지 | requires migrated D-Day and pending VOD columns; rejects missing or invalid canonical quota: $rows |

### scripts/d1-doctor-mode.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/d1-doctor-mode.test.ts](../../scripts/d1-doctor-mode.test.ts) | Node/Vitest | 유지 | checks the runtime publication, maintenance and X repair prerequisites; retains migration and required-column checks without scanning business data |

### scripts/d1-local-options.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/d1-local-options.test.ts](../../scripts/d1-local-options.test.ts) | Node/Vitest | 유지 | shares dev persistence and canonical config for both sites; rejects a case-alias CLI override before D1/reset |

### scripts/d1-local-transport.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/d1-local-transport.test.ts](../../scripts/d1-local-transport.test.ts) | Node/Vitest | 유지 | native local D1 avoids Fetch-blocked ports and preserves migration failure semantics |

### scripts/d1-metrics-deploy-guard.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/d1-metrics-deploy-guard.test.ts](../../scripts/d1-metrics-deploy-guard.test.ts) | Node/Vitest | 유지 | accepts %s's existing plaintext or encrypted IDs without reading secrets; blocks a missing %s in the active or inherited version |

### scripts/d1-migration-reader.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/d1-migration-reader.test.ts](../../scripts/d1-migration-reader.test.ts) | Node/Vitest | 유지 | reads every canonical migration within the existing test time budget; preserves compound SQL, quoted markers and following statements (%s / %s / %s / %j) |

### scripts/d1-reset-guard.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/d1-reset-guard.test.ts](../../scripts/d1-reset-guard.test.ts) | Node/Vitest | 유지 | 기존 로컬 D1을 비강제 reset으로 교체하지 않는다; 명시적 force 또는 신규 로컬 환경에서는 reset을 허용한다 |

### scripts/d1-seed-guard.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/d1-seed-guard.test.ts](../../scripts/d1-seed-guard.test.ts) | Node/Vitest | 유지 | includes personal multiview data in the empty-database guard; 완전히 빈 DB에서만 비강제 seed를 허용한다 |

### scripts/dev-restart.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/dev-restart.test.ts](../../scripts/dev-restart.test.ts) | Node/Vitest | 유지 | requires the repository Vite executable and exact selected port; rejects overlapping state at %s before process or database mutations |

### scripts/generate-seo-assets.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/generate-seo-assets.test.ts](../../scripts/generate-seo-assets.test.ts) | Node/Vitest | 유지 | renders site metadata before Vite processes HTML asset URLs; authors %s static HTML, robots and 404 from the same definition |

### scripts/local-dev-config.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/local-dev-config.test.ts](../../scripts/local-dev-config.test.ts) | Node/Vitest | 유지 | uses one stable default for Vite and local API checks; applies OTW_DEV_PORT consistently |

### scripts/local-site-config.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/local-site-config.test.ts](../../scripts/local-site-config.test.ts) | Node/Vitest | 유지 | keeps all resource bindings local and resolves paths from the canonical config; keeps selected server inputs out of the generated config and browser inputs out of dev vars |

### scripts/maintenance

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/maintenance/worker.test.mjs](../../scripts/maintenance/worker.test.mjs) | Node | 필수 Node 실행에 편입 | all OTW pages use the maintenance response without any origin or database access; API writes fail explicitly, HEAD is empty, and another site is never intercepted |

### scripts/site-build-manifest.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/site-build-manifest.test.ts](../../scripts/site-build-manifest.test.ts) | Node/Vitest | 유지 | rejects an OTW artifact requested for LuvDia before reading bundles; verifies generated identity/assets and rejects canonical drift or cross-site assets |

### scripts/site-release-identity.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/site-release-identity.test.ts](../../scripts/site-release-identity.test.ts) | Node/Vitest | 유지 | rejects changed source or built assets even with the same commit label; rejects a cross-site database UUID even when names and freshly computed hashes match |

### scripts/site-resources.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/site-resources.test.ts](../../scripts/site-resources.test.ts) | Node/Vitest | 유지 | keeps the final %s X RPC binding present; pins activity RPC to the peer site's named entrypoint and permits receiver-only preparation |

### scripts/site-target.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/site-target.test.ts](../../scripts/site-target.test.ts) | Node/Vitest | 유지 | accepts disjoint normal site roots without creating state; rejects configured nested persistence roots %s and %s |

### scripts/sync-agent-to-cursor.test.mjs

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/sync-agent-to-cursor.test.mjs](../../scripts/sync-agent-to-cursor.test.mjs) | Node | 유지 | generates portable entries and an idempotent mirror; accepts ${name} checkouts without rewriting generated files |

### scripts/wrangler-seo-config.test.ts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [scripts/wrangler-seo-config.test.ts](../../scripts/wrangler-seo-config.test.ts) | Node/Vitest | 유지 | invokes the Worker before serving encoded protected assets: %s; generates a direct HTML entry for every registered static admin route |

### src/app

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/app/admin/admin-gate.test.tsx](../../src/app/admin/admin-gate.test.tsx) | jsdom | 유지 | renders admin content from the server-authoritative decision; does not trust the signed-in client identity when the server denies admin |
| [src/app/admin/operations-home.test.tsx](../../src/app/admin/operations-home.test.tsx) | jsdom | 유지 | refreshes pending REST cursors and does not use stale data after a lookup failure |
| [src/app/errors/root-not-found.test.tsx](../../src/app/errors/root-not-found.test.tsx) | jsdom | 유지 | 중첩 경로의 404에서도 공통 안내와 홈 복귀를 제공한다 |
| [src/app/errors/root-route-error.test.ts](../../src/app/errors/root-route-error.test.ts) | jsdom | 유지 | hides exception details from the nosnippet UI and retries |
| [src/app/layout/app-navigation.test.ts](../../src/app/layout/app-navigation.test.ts) | Node/Vitest | 유지 | resolves app chrome modes by route family; keeps the multiview sidebar compact across desktop widths |
| [src/app/layout/app-shell.test.ts](../../src/app/layout/app-shell.test.ts) | jsdom | 경계 유지·격리/대기 보완 | lets guests hide and restore the related schedule link and remembers it across visits; keeps the link switch usable when browser storage is blocked |
| [src/app/layout/footer.test.tsx](../../src/app/layout/footer.test.tsx) | jsdom | 유지 | keeps the rights notice reachable from the public footer |
| [src/app/layout/public-navigation-loading.test.tsx](../../src/app/layout/public-navigation-loading.test.tsx) | jsdom | 유지 | keeps the public Play entry stable while auth loads and changes without a catalog request |
| [src/app/layout/site-branding.test.tsx](../../src/app/layout/site-branding.test.tsx) | jsdom | 유지 | keeps public Play navigation and points the community link to LuvDia's official cafe; shows site ownership, nonofficial notice and configured rights contact |
| [src/app/layout/site-countdown.test.tsx](../../src/app/layout/site-countdown.test.tsx) | jsdom | 유지 | shows the confirmed launch time and remaining time without an announcement every second; shows a preparation message when an operational hold overrides midnight |
| [src/app/providers/app-startup.test.ts](../../src/app/providers/app-startup.test.ts) | jsdom | 유지 | honors theme %s before app startup (system dark=%s); leaves the server body readable and the loader absent without JavaScript |
| [src/app/providers/interaction-provider.test.tsx](../../src/app/providers/interaction-provider.test.tsx) | jsdom | 유지 | 실제 라우터에서 미저장 이동을 취소하면 입력을 보존하고 확인 후에만 이동한다; 중복 확인 요청은 한 번만 실행하며 Escape 취소는 작업을 실행하지 않는다 |
| [src/app/providers/session-query-boundary.test.tsx](../../src/app/providers/session-query-boundary.test.tsx) | jsdom | 유지 | retries native workspace reads after sign-in and removes cached preparation data on sign-out |
| [src/app/providers/site-publication-boundary.test.tsx](../../src/app/providers/site-publication-boundary.test.tsx) | jsdom | 경계 유지·격리/대기 보완 | hides an open tab at midnight, clears fresh content, then mounts observers that fetch the new policy |

### src/features/audit

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/audit/model/audit-result.test.ts](../../src/features/audit/model/audit-result.test.ts) | Node/Vitest | 유지 | does not report unchanged live schedules as unsuccessful targets; preserves missing counters instead of converting them to zero |
| [src/features/audit/model/recorded-changes.test.ts](../../src/features/audit/model/recorded-changes.test.ts) | Node/Vitest | 유지 | preserves zero, false and explicit empty values separately from missing history; does not invent changes from old or malformed logs |
| [src/features/audit/ui/admin/auto-update-logs.test.ts](../../src/features/audit/ui/admin/auto-update-logs.test.ts) | jsdom | 유지 | shows schedule filters and ordering without reading admin audit records; opens inline change details and re-queries the server when search changes |

### src/features/auth

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/auth/api/auth.test.ts](../../src/features/auth/api/auth.test.ts) | Node/Vitest | 유지 | reads the authoritative admin status with required auth and no cache |

### src/features/chzzk

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/chzzk/api/clips.test.ts](../../src/features/chzzk/api/clips.test.ts) | Node/Vitest | 유지 | 멤버 클립을 createdDate 기준으로 합치고 memberUid를 매핑한다; API adapter는 별도 캐시 없이 호출마다 Worker에 위임한다 |
| [src/features/chzzk/api/live-status.test.ts](../../src/features/chzzk/api/live-status.test.ts) | Node/Vitest | 경계 유지·격리/대기 보완 | 공개 조회는 이전 브라우저 캐시와 분리된 버전 URL을 사용한다; 관리자 자동 입력 command에 정규화된 채널 목록을 전달한다 |
| [src/features/chzzk/api/vods.test.ts](../../src/features/chzzk/api/vods.test.ts) | Node/Vitest | 유지 | 채널별 최신 vod를 멤버 uid로 매핑한다; 채널별 여러 vod를 멤버 uid가 포함된 최신순 배열로 반환한다 |
| [src/features/chzzk/model/clip-date-groups.test.ts](../../src/features/chzzk/model/clip-date-groups.test.ts) | Node/Vitest | 유지 | 일자별로 묶고 날짜 안에서는 조회수순으로 정렬한다; 멤버별 보기에서도 날짜 우선, 같은 날짜는 조회수 우선으로 정렬한다 |
| [src/features/chzzk/model/vod-date-groups.test.ts](../../src/features/chzzk/model/vod-date-groups.test.ts) | Node/Vitest | 유지 | 다시보기를 일자별로 묶고 날짜 안에서는 최신순으로 정렬한다 |
| [src/features/chzzk/queries/use-chzzk-media.test.ts](../../src/features/chzzk/queries/use-chzzk-media.test.ts) | jsdom | 유지 | 클립 초기 조회와 reload를 수행한다; 멤버당 VOD 조회 개수를 API에 전달한다 |
| [src/features/chzzk/ui/chzzk-clips-playlist.test.ts](../../src/features/chzzk/ui/chzzk-clips-playlist.test.ts) | jsdom | 유지 | 상위 탭 제목과 날짜/멤버 전환 버튼 없이 날짜별 클립 피드를 렌더링한다; 멤버 필터는 단일 선택으로 동작한다 |
| [src/features/chzzk/ui/chzzk-history.test.tsx](../../src/features/chzzk/ui/chzzk-history.test.tsx) | jsdom | 유지 | selects an archived channel and inspects expired held snapshot metadata |

### src/features/configuration

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/configuration/model/settings-config.test.ts](../../src/features/configuration/model/settings-config.test.ts) | Node/Vitest | 유지 | 허용된 자동 수집 주기만 유효하게 본다; 기존에 저장된 삭제된 주기나 누락값은 기본값으로 정규화한다 |
| [src/features/configuration/ui/admin/auto-update-settings.test.ts](../../src/features/configuration/ui/admin/auto-update-settings.test.ts) | jsdom | 경계 유지·격리/대기 보완 | 개별 승인 중 거부 제외로 이동하면 숨긴 후보는 읽지 않고 복귀 시 한 번 갱신한다; 전체 승인 확인의 신규·수정 건수는 실제 선택한 반영 방식을 따른다 |
| [src/features/configuration/ui/admin/schedule-rejections-panel.test.ts](../../src/features/configuration/ui/admin/schedule-rejections-panel.test.ts) | jsdom | 유지 | 검색 조건으로 목록을 다시 조회하고 후보 스냅샷을 표시한다; 재검토 허용 영향 확인 후 제외 해제 API를 호출한다 |

### src/features/ddays

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/ddays/model/admin-dday.test.ts](../../src/features/ddays/model/admin-dday.test.ts) | Node/Vitest | 유지 | 생일 저장 연도를 숨기고 다음 연도 도래일을 표시한다; 윤일은 기존 달력 정책대로 평년 3월 1일로 계산한다 |
| [src/features/ddays/model/dday.test.ts](../../src/features/ddays/model/dday.test.ts) | Node/Vitest | 유지 | 색상 문자열/배열을 normalize 한다; 선택 날짜와 일치하는 디데이만 반환한다 |
| [src/features/ddays/queries/invalidate-dday-consumers.test.ts](../../src/features/ddays/queries/invalidate-dday-consumers.test.ts) | Node/Vitest | 유지 | D-Day와 schedule-board aggregate query를 함께 무효화한다; 공개 목록과 관리자 목록 캐시를 모두 stale 상태로 만든다 |
| [src/features/ddays/ui/admin/dday-manager.test.ts](../../src/features/ddays/ui/admin/dday-manager.test.ts) | jsdom | 유지 | 공개 D-Day 캐시가 fresh여도 관리자 no-cache 조회를 수행한다; 기존 설명을 비우면 null로 저장하고 목록을 다시 조회한다 |

### src/features/media-library

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/media-library/ui/vods-overview.test.ts](../../src/features/media-library/ui/vods-overview.test.ts) | jsdom | 유지 | opens the dedicated VOD tab without mounting other YouTube sections; 4개 상위 탭을 표시하고 공식 유튜브를 기본 탭으로 렌더링한다 |

### src/features/member-posts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/member-posts/model/feed-filters.test.ts](../../src/features/member-posts/model/feed-filters.test.ts) | Node/Vitest | 유지 | 답글과 인용을 모두 유지하며 멤버·출처만 필터링한다; 오늘과 요일을 간결하게 표시하고 이전 연도만 연도를 포함한다 |
| [src/features/member-posts/queries/use-member-posts.test.ts](../../src/features/member-posts/queries/use-member-posts.test.ts) | jsdom | 유지 | 기존 aggregate 데이터가 있는 reload 실패는 두 source를 stale로 표시한다; retains loaded posts after failure and retries the same cursor without duplicates |
| [src/features/member-posts/ui/admin/member-post-settings.test.ts](../../src/features/member-posts/ui/admin/member-post-settings.test.ts) | jsdom | 유지 | refreshes current webhook state from the top refresh without opening settings; places the X budget and member chart first, groups visible settings, and puts history last |
| [src/features/member-posts/ui/admin/x-activity-manager.test.tsx](../../src/features/member-posts/ui/admin/x-activity-manager.test.tsx) | jsdom | 유지 | shows progress in the card and reveals management after activation is confirmed; allows a failed remote stop to be retried while local delivery is already disabled |
| [src/features/member-posts/ui/admin/x-collection-budget.test.tsx](../../src/features/member-posts/ui/admin/x-collection-budget.test.tsx) | jsdom | 유지 | shows nested limits and uses the smaller available balance including reservations; identifies the last known budget after a refresh fails |
| [src/features/member-posts/ui/admin/x-collection-manager.test.tsx](../../src/features/member-posts/ui/admin/x-collection-manager.test.tsx) | jsdom | 유지 | refreshes collection data after webhook %s; keeps official failure and incomplete work visible when Fx is healthy and webhook is Disabled |
| [src/features/member-posts/ui/admin/x-collection-monitoring.test.tsx](../../src/features/member-posts/ui/admin/x-collection-monitoring.test.tsx) | jsdom | 유지 | shows a completed recent check with its discovery limit; identifies Fx work and keeps a successful unfinished traversal pending |
| [src/features/member-posts/ui/member-posts-overview.test.ts](../../src/features/member-posts/ui/member-posts-overview.test.ts) | jsdom | 유지 | loads once at the scroll boundary and stops automatic retries after failure; 답글 전환과 이전 저장값을 사용하지 않고 답글을 표시한다 |
| [src/features/member-posts/ui/member-posts-page.test.tsx](../../src/features/member-posts/ui/member-posts-page.test.tsx) | jsdom | 유지 | %s 화면에서 푸터를 한 번 유지한다; 공개 설정 조회 실패를 로그인 요구로 오인하지 않고 다시 조회한다 |

### src/features/members

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/members/model/current-member-affiliation.test.ts](../../src/features/members/model/current-member-affiliation.test.ts) | Node/Vitest | 유지 | labels current LuvDia members without changing the source or OTW history; uses the current LuvDia label without rewriting a stored historical affiliation |
| [src/features/members/model/profile-background-images.test.ts](../../src/features/members/model/profile-background-images.test.ts) | Node/Vitest | 유지 | builds local responsive profile background variants; supports a Cloudflare asset base URL for R2-backed variants |
| [src/features/members/ui/member-filter.test.ts](../../src/features/members/ui/member-filter.test.ts) | jsdom | 유지 | 멤버 필터를 단일 선택으로 전환하고 같은 멤버 재클릭 시 전체로 돌아간다; 게시글 필터는 재선택을 유지하고 선택 상태를 보조기기에 전달한다 |
| [src/features/members/ui/member-profile-page.test.tsx](../../src/features/members/ui/member-profile-page.test.tsx) | jsdom | 유지 | reserves the mobile portrait while protected bytes load and avoids hidden desktop background requests; loads optimized backgrounds first and requests their originals only after an authenticated failure |

### src/features/multiview

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/multiview/api/personal-channels.test.ts](../../src/features/multiview/api/personal-channels.test.ts) | Node/Vitest | 유지 | uses authenticated private routes and forwards cancellation without accepting a client owner; does not send personal requests without a session token |
| [src/features/multiview/model/multiview-utils.test.ts](../../src/features/multiview/model/multiview-utils.test.ts) | Node/Vitest | 유지 | accepts raw 32-hex IDs and supported CHZZK URL forms; rejects non-CHZZK, malformed, and non-32-hex input |
| [src/features/multiview/queries/use-multiview-sources.test.tsx](../../src/features/multiview/queries/use-multiview-sources.test.tsx) | jsdom | 유지 | keeps a verified personal live status when the same default channel's public query fails; merges personal channels by channel id without inventing members and keeps public LIVE during a private failure |
| [src/features/multiview/queries/use-personal-multiview.test.tsx](../../src/features/multiview/queries/use-personal-multiview.test.tsx) | jsdom | 유지 | does not fetch a private list while auth is %s; reads the persisted list after adding and removing instead of just appending a local row |
| [src/features/multiview/ui/multiview-page.test.ts](../../src/features/multiview/ui/multiview-page.test.ts) | jsdom | 유지 | announces the required extension and keeps embedded viewing disabled after selection; starts with unique live/offline choices and no iframe or enabled watch actions |
| [src/features/multiview/ui/personal-channel-manager.test.tsx](../../src/features/multiview/ui/personal-channel-manager.test.tsx) | jsdom | 유지 | offers a quiet entry point and opens the save form only on request; invites anonymous visitors to log in from the requested popup without an add form |
| [src/features/multiview/ui/personal-multiview-flow.test.tsx](../../src/features/multiview/ui/personal-multiview-flow.test.tsx) | jsdom | 유지 | adds through the form, reads back, selects beside a default member and deletes without changing the shared URL; protects site members even when their channel also appears in the personal saved list |

### src/features/naver-cafe

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/naver-cafe/api/naver-cafe-api.test.ts](../../src/features/naver-cafe/api/naver-cafe-api.test.ts) | Node/Vitest | 유지 | 게시판 URL에서 cafeId와 menuId를 추출한다; config, sources, posts endpoint를 호출한다 |
| [src/features/naver-cafe/model/filter-naver-cafe-posts.test.ts](../../src/features/naver-cafe/model/filter-naver-cafe-posts.test.ts) | Node/Vitest | 유지 | 선택된 멤버가 없으면 원본 배열을 반환한다; memberUid가 일치하는 게시글만 남긴다 |
| [src/features/naver-cafe/queries/use-naver-cafe-posts.test.ts](../../src/features/naver-cafe/queries/use-naver-cafe-posts.test.ts) | jsdom | 유지 | enabled=false면 요청하지 않는다; 조회 결과와 stale 상태를 반영하고 reload를 수행한다 |
| [src/features/naver-cafe/ui/admin/naver-cafe-source-manager.test.tsx](../../src/features/naver-cafe/ui/admin/naver-cafe-source-manager.test.tsx) | jsdom | 유지 | joins checks by board ID in the editable table without a search; keeps stale and failed checks visible and missing checks unknown |
| [src/features/naver-cafe/ui/naver-cafe-post-card.test.ts](../../src/features/naver-cafe/ui/naver-cafe-post-card.test.ts) | jsdom | 유지 | 제목, 요약, no-referrer 썸네일과 원문 링크를 표시한다; 카드·본문은 이동하지 않고 썸네일은 내부 이미지 뷰어를 연다 |

### src/features/notices

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/notices/model/notice-thumbnails.test.ts](../../src/features/notices/model/notice-thumbnails.test.ts) | Node/Vitest | 유지 | 허용 MIME type과 업로드 제한을 일관되게 노출한다; MIME type을 canonical 확장자로 변환한다 |
| [src/features/notices/model/notice-visibility.test.ts](../../src/features/notices/model/notice-visibility.test.ts) | Node/Vitest | 유지 | 활성 상태와 게시 기간을 함께 확인한다; 관리자 화면용 게시 상태를 KST 기준 기간까지 반영한다 |
| [src/features/notices/queries/invalidate-notice-consumers.test.ts](../../src/features/notices/queries/invalidate-notice-consumers.test.ts) | Node/Vitest | 유지 | 공지와 schedule-board aggregate query를 함께 무효화한다 |
| [src/features/notices/ui/admin/notice-form-dialog.test.ts](../../src/features/notices/ui/admin/notice-form-dialog.test.ts) | jsdom | 경계 유지·격리/대기 보완 | keeps the notice draft and displays %s; shows multi-link, multi-image, and related-member controls |
| [src/features/notices/ui/admin/notice-manager.test.ts](../../src/features/notices/ui/admin/notice-manager.test.ts) | jsdom | 유지 | shows the actual %s response without featured success; 미사용 R2 썸네일 정리는 확인 전까지 삭제 API를 호출하지 않는다 |
| [src/features/notices/ui/notice-banner.test.ts](../../src/features/notices/ui/notice-banner.test.ts) | jsdom | 유지 | rotates visible notices every five seconds and keeps full long titles; opens the URL directly only when exactly one link exists |
| [src/features/notices/ui/notice-page.test.ts](../../src/features/notices/ui/notice-page.test.ts) | jsdom | 유지 | shows every named link and related member, and advances the manual carousel; clamps the carousel when the same notice is refreshed with fewer images |

### src/features/operations

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/operations/api/operations.test.ts](../../src/features/operations/api/operations.test.ts) | Node/Vitest | 유지 | 일정 검수는 전체 운영 이력 대신 일정 범위를 no-store로 요청한다; 운영 상태 조회의 기본·지정 window를 query에 반영한다 |
| [src/features/operations/ui/admin/operations-dashboard.test.tsx](../../src/features/operations/ui/admin/operations-dashboard.test.tsx) | jsdom | 유지 | filters the full history on the server and refreshes only the active view; keeps resource-only usage, guard and retention with one header and refresh |

### src/features/otw-play

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/otw-play/api/admin.test.ts](../../src/features/otw-play/api/admin.test.ts) | Node/Vitest | 유지 | loads review filters through the authenticated shared route; deletes import history through the authenticated job endpoint |
| [src/features/otw-play/api/playlists.test.ts](../../src/features/otw-play/api/playlists.test.ts) | Node/Vitest | 유지 | uses the %s audience for default playlists and queue resolution; authenticates administrator preview and personal playlist reads/writes |
| [src/features/otw-play/api/public.test.ts](../../src/features/otw-play/api/public.test.ts) | Node/Vitest | 유지 | uses the member path and only songbook query fields in public and preview requests; member 반복값과 parameter를 결정적으로 canonicalize한다 |
| [src/features/otw-play/api/submissions.test.ts](../../src/features/otw-play/api/submissions.test.ts) | Node/Vitest | 유지 | uses required authentication and preserves submission payloads; encodes member-owned pagination and detail routes |
| [src/features/otw-play/model/catalog-route-search.test.ts](../../src/features/otw-play/model/catalog-route-search.test.ts) | Node/Vitest | 유지 | maps URL state to the public query without interpreting opaque group keys; serializes selected member IDs deterministically for browser history |
| [src/features/otw-play/model/play-queue.test.ts](../../src/features/otw-play/model/play-queue.test.ts) | Node/Vitest | 유지 | reorders by identity while preserving the playing source, mode and saved order; appends a batch without starting playback or changing existing queue state |
| [src/features/otw-play/player/play-player-context.test.tsx](../../src/features/otw-play/player/play-player-context.test.tsx) | jsdom | 유지 | remembers volume %s across visits and applies it to playback; uses the default volume for invalid stored data %j |
| [src/features/otw-play/player/youtube-iframe-api.test.ts](../../src/features/otw-play/player/youtube-iframe-api.test.ts) | jsdom | 유지 | loads one script and constructs one policy-compliant player; does not load video until the caller issues a user-intent load |
| [src/features/otw-play/queries/review-catalog-changes.test.ts](../../src/features/otw-play/queries/review-catalog-changes.test.ts) | Node/Vitest | 유지 | makes returned IDs reusable immediately without reloading the catalog; does not certify missing concurrent revisions or overwrite a newer snapshot |
| [src/features/otw-play/queries/use-playlists.test.tsx](../../src/features/otw-play/queries/use-playlists.test.tsx) | jsdom | 유지 | passes the explicit playback request only after the whole playlist resolves; clears pending state and prevents appending after cancellation |
| [src/features/otw-play/queries/use-public-catalog.test.ts](../../src/features/otw-play/queries/use-public-catalog.test.ts) | jsdom | 유지 | revalidates on the next screen entry without displaying a pre-archive catalog snapshot; catalog cursor를 infinite query page parameter로만 전달한다 |
| [src/features/otw-play/ui/admin/ai-review-flow.test.tsx](../../src/features/otw-play/ui/admin/ai-review-flow.test.tsx) | jsdom | 유지 | does not automatically replace %s review state with a batch draft; reopens a persisted batch draft, fills the form, and saves through human review before moving next |
| [src/features/otw-play/ui/admin/ai-review-form.test.tsx](../../src/features/otw-play/ui/admin/ai-review-form.test.tsx) | jsdom | 유지 | protects explicit clearing, saved values and edits made while analysis runs; fills defaults, undoes only fields not subsequently edited and resets on target change |
| [src/features/otw-play/ui/admin/catalog-manager.test.ts](../../src/features/otw-play/ui/admin/catalog-manager.test.ts) | jsdom | 등록·검수·운영·카탈로그로 분리 | protects actual proposal edits and clears protection when values are restored; registers a clip directly without enabling collection and preserves unknown broadcast metadata |
| [src/features/otw-play/ui/admin/catalog-pickers.test.tsx](../../src/features/otw-play/ui/admin/catalog-pickers.test.tsx) | jsdom | 유지 | refreshes off-page song results through catalog invalidation; refreshes off-page identities through catalog invalidation |
| [src/features/otw-play/ui/admin/catalog-search-input.test.tsx](../../src/features/otw-play/ui/admin/catalog-search-input.test.tsx) | jsdom | 유지 | keeps Korean composition local until the syllable is committed; applies ordinary input and clearing and restores URL changes |
| [src/features/otw-play/ui/admin/channel-monitor-section.test.tsx](../../src/features/otw-play/ui/admin/channel-monitor-section.test.tsx) | jsdom | 유지 | shows new uploads with a manual draft registration path; keeps monitor operations available while the catalog is unavailable |
| [src/features/otw-play/ui/admin/historical-materials.test.tsx](../../src/features/otw-play/ui/admin/historical-materials.test.tsx) | jsdom | 유지 | shows original source, outcome, time and nested credits without providing execution controls |
| [src/features/otw-play/ui/admin/ingestion-section.test.tsx](../../src/features/otw-play/ui/admin/ingestion-section.test.tsx) | jsdom | 유지 | checks the full playlist before creating one job and does not start AI automatically; blocks a playlist beyond the collection cap before submission |
| [src/features/otw-play/ui/admin/registration-channel.test.ts](../../src/features/otw-play/ui/admin/registration-channel.test.ts) | Node/Vitest | 유지 | preserves both history directions only for the target channel and original search |
| [src/features/otw-play/ui/admin/review-inbox.test.tsx](../../src/features/otw-play/ui/admin/review-inbox.test.tsx) | jsdom | 유지 | requires final confirmation and only converts selected videos in the open playlist; does not allow a reused ready candidate to be registered during collection |
| [src/features/otw-play/ui/admin/review-navigation.test.ts](../../src/features/otw-play/ui/admin/review-navigation.test.ts) | Node/Vitest | 유지 | preserves review drafts while the catalog manager stays mounted; retains channel and return context in validated admin URLs |
| [src/features/otw-play/ui/admin/review-segment-player.test.tsx](../../src/features/otw-play/ui/admin/review-segment-player.test.tsx) | jsdom | 유지 | loads the requested interval, checks its ending and destroys playback on close; does not load a player for an invalid interval |
| [src/features/otw-play/ui/admin/singing-clip-review-dialog.test.tsx](../../src/features/otw-play/ui/admin/singing-clip-review-dialog.test.tsx) | jsdom | 유지 | refreshes expired video metadata without discarding a saved draft or an in-progress edit; renders only the active fast review while retaining unsaved input on return |
| [src/features/otw-play/ui/admin/source-health-section.test.tsx](../../src/features/otw-play/ui/admin/source-health-section.test.tsx) | jsdom | 유지 | groups summary, status lists, and actions into one dense panel; confirms the batch, waits for its result, and refreshes source health on completion |
| [src/features/otw-play/ui/admin/use-ai-review-sound.test.ts](../../src/features/otw-play/ui/admin/use-ai-review-sound.test.ts) | jsdom | 유지 | unlocks on request, waits for audio readiness and releases a short beep; does not interrupt notifications when audio is unsupported or denied |
| [src/features/otw-play/ui/member/member-shell.test.tsx](../../src/features/otw-play/ui/member/member-shell.test.tsx) | jsdom | 유지 | does not mount proposal UI on mobile, including direct member routes; shows a login call to action without mounting member requests |
| [src/features/otw-play/ui/member/submission-page.test.tsx](../../src/features/otw-play/ui/member/submission-page.test.tsx) | jsdom | 유지 | selects namesakes independently, blocks the same ID, and removes only the chosen identity; shows artist names without internal IDs or kinds and does not choose ambiguous matches on Enter |
| [src/features/otw-play/ui/member/submissions-page.test.tsx](../../src/features/otw-play/ui/member/submissions-page.test.tsx) | jsdom | 유지 | keeps accepted withdrawal visible in the original confirmation and reuses its key; shows a focused first-proposal action without an empty detail panel |
| [src/features/otw-play/ui/otw-play-thumbnail.test.tsx](../../src/features/otw-play/ui/otw-play-thumbnail.test.tsx) | jsdom | 유지 | prefers the 16:9 max-resolution YouTube image; falls back to the catalog thumbnail when max resolution is unavailable |
| [src/features/otw-play/ui/player/now-playing-panel.test.tsx](../../src/features/otw-play/ui/player/now-playing-panel.test.tsx) | jsdom | 유지 | keeps the host mounted and the closing player inert until the exit completes; ignores a stale exit completion after reopening and settles at the desktop breakpoint |
| [src/features/otw-play/ui/playlists/default-playlist-manager.test.tsx](../../src/features/otw-play/ui/playlists/default-playlist-manager.test.tsx) | jsdom | 유지 | uses the shared select and preserves the current editor when discarding is cancelled; selects a representative after page 60, saves metadata, and shows authoritative readback |
| [src/features/otw-play/ui/playlists/playlist-editor-page.test.tsx](../../src/features/otw-play/ui/playlists/playlist-editor-page.test.tsx) | jsdom | 유지 | keeps oversized saved lists intact and permits saving after enough items are removed; recovers %s with the original payload before saving edited input |
| [src/features/otw-play/ui/playlists/playlist-hero-transition.test.ts](../../src/features/otw-play/ui/playlists/playlist-hero-transition.test.ts) | jsdom | 유지 | reveals the destination without flying or duplicating artwork and titles, and restores both scroll axes; keeps navigation, focus and scroll restoration with %s motion |
| [src/features/otw-play/ui/playlists/playlists-page.test.tsx](../../src/features/otw-play/ui/playlists/playlists-page.test.tsx) | jsdom | 유지 | shows personal-list loading until authentication is known, then invites anonymous users; waits for a signed-in user's list before showing the saved-list empty state |
| [src/features/otw-play/ui/public/catalog-components.test.tsx](../../src/features/otw-play/ui/public/catalog-components.test.tsx) | jsdom | 유지 | preserves playback commands and disabled states in %s; uses the server-provided exact filter for %o |
| [src/features/otw-play/ui/public/catalog-page.test.tsx](../../src/features/otw-play/ui/public/catalog-page.test.tsx) | jsdom | 유지 | searches during Hangul composition without replacing the composing input; loads near the list end once, waits for fetching, and stops at the final page |
| [src/features/otw-play/ui/public/clips-page.test.tsx](../../src/features/otw-play/ui/public/clips-page.test.tsx) | jsdom | 유지 | keeps separate performances of the same song reachable and playable in every view; shows unknown broadcast information and sends the actual segment to the shared queue |
| [src/features/otw-play/ui/public/member-profile-link.test.tsx](../../src/features/otw-play/ui/public/member-profile-link.test.tsx) | jsdom | 유지 | uses the supplied profile UID without requesting a songbook or song counts; keeps the link hidden when public navigation is unavailable |
| [src/features/otw-play/ui/public/music-layout.test.tsx](../../src/features/otw-play/ui/public/music-layout.test.tsx) | jsdom | 유지 | always searches by member with visibility=$enabled and songs=$songCount; uses discovery as a compact featured entry point |
| [src/features/otw-play/ui/public/participant-presentation.test.ts](../../src/features/otw-play/ui/public/participant-presentation.test.ts) | Node/Vitest | 유지 | promotes only main vocalists in compact presentation; keeps one deterministic visible participant when legacy data has no main vocal |
| [src/features/otw-play/ui/public/play-shell.test.tsx](../../src/features/otw-play/ui/public/play-shell.test.tsx) | jsdom | 유지 | hides mobile proposal entry points for admin=%s; shows OTW unavailability before waiting for Clerk |
| [src/features/otw-play/ui/public/song-detail-page.test.tsx](../../src/features/otw-play/ui/public/song-detail-page.test.tsx) | jsdom | 유지 | highlights the performance selected by the direct-link query |
| [src/features/otw-play/ui/use-button-feedback.test.tsx](../../src/features/otw-play/ui/use-button-feedback.test.tsx) | jsdom | 유지 | animates the SVG without consuming the button action and cancels on unmount; animates keyboard activation and ignores held-key repeat |
| [src/features/otw-play/ui/use-play-tab-indicator.test.tsx](../../src/features/otw-play/ui/use-play-tab-indicator.test.tsx) | jsdom | 유지 | starts at the current link and interrupts navigation motion when selection changes again; snaps to responsive geometry without another navigation animation |
| [src/features/otw-play/use-cases/resolve-playlist.test.ts](../../src/features/otw-play/use-cases/resolve-playlist.test.ts) | Node/Vitest | 유지 | collects all pages and includes different performances of the same song; fails atomically on a changed revision or failed later page |

### src/features/rights

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/rights/ui/rights-page.test.tsx](../../src/features/rights/ui/rights-page.test.tsx) | jsdom | 유지 | shows the current web rights notice without the removed extension policy; provides direct rights contact paths |

### src/features/schedule-board

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/schedule-board/model/recovery-pet.test.ts](../../src/features/schedule-board/model/recovery-pet.test.ts) | Node/Vitest | 유지 | counts elapsed Korean calendar days at %s as %s; keeps the pet exclusive to LuvDia after the cutoff |
| [src/features/schedule-board/queries/use-schedule-data.test.ts](../../src/features/schedule-board/queries/use-schedule-data.test.ts) | jsdom | 유지 | loads members without fetching or waiting for unused D-days; reloads members under the current access policy |
| [src/features/schedule-board/queries/use-schedule-save-feedback.test.tsx](../../src/features/schedule-board/queries/use-schedule-save-feedback.test.tsx) | jsdom | 유지 | 서버 저장 결과와 입력 날짜를 성공 안내에 보존한다; 저장 실패를 입력 폼에 전달하며 성공 안내를 만들지 않는다 |
| [src/features/schedule-board/queries/use-weekly-schedule.test.ts](../../src/features/schedule-board/queries/use-weekly-schedule.test.ts) | jsdom | 유지 | 주간 보드 aggregate 조회 결과와 다이얼로그 동작을 처리한다; 삭제 실패 시 alert 상태를 노출한다 |
| [src/features/schedule-board/ui/admin/snapshot-preview-manager.test.tsx](../../src/features/schedule-board/ui/admin/snapshot-preview-manager.test.tsx) | jsdom | 유지 | preserves design in the preview and new-tab URL while grid ignores it; shrinks the iframe to the new snapshot when switching from poster to legacy |
| [src/features/schedule-board/ui/components/schedule-updated-at.test.ts](../../src/features/schedule-board/ui/components/schedule-updated-at.test.ts) | jsdom | 유지 | 업데이트 시각을 한국 표준시로 명확하게 표시한다; 유효하지 않은 시각은 표시하지 않는다 |
| [src/features/schedule-board/ui/daily/chronological-schedule-list.test.ts](../../src/features/schedule-board/ui/daily/chronological-schedule-list.test.ts) | jsdom | 유지 | 필터 없이 편성표와 보조 레일을 함께 표시한다; 일정 없는 라이브 멤버는 미등록 경고 대신 방송 중으로 표시한다 |
| [src/features/schedule-board/ui/daily/chronological-schedule-utils.test.ts](../../src/features/schedule-board/ui/daily/chronological-schedule-utils.test.ts) | Node/Vitest | 유지 | 방송/게릴라/미정/휴방을 분류하고 시간순으로 정렬한다; 필터별로 메인 보드와 보조 레일을 함께 좁힌다 |
| [src/features/schedule-board/ui/daily/daily-schedule.test.ts](../../src/features/schedule-board/ui/daily/daily-schedule.test.ts) | jsdom | 유지 | renders %i D-days and %i notices without losing long titles or leaving empty slots; offers legacy exports only in the timeline menu without replacing the default actions |
| [src/features/schedule-board/ui/daily/recovery-pet.test.tsx](../../src/features/schedule-board/ui/daily/recovery-pet.test.tsx) | jsdom | 유지 | appears at Korean midnight in an already-open daily view and advances the counter on focus; does not render or schedule work on OTW even with admin=%s |
| [src/features/schedule-board/ui/daily/snapshot/snapshot-fonts.test.ts](../../src/features/schedule-board/ui/daily/snapshot/snapshot-fonts.test.ts) | jsdom | 유지 | embeds every Poppins weight and Pretendard using the exact fetched bytes; uses system fonts on HTTP failure |
| [src/features/schedule-board/ui/daily/snapshot/snapshot-legacy.test.tsx](../../src/features/schedule-board/ui/daily/snapshot/snapshot-legacy.test.tsx) | jsdom | 유지 | sorts times and retains full notes, secondary times and all status groups; preserves both simultaneous broadcasts and lists all members on empty days |
| [src/features/schedule-board/ui/daily/snapshot/snapshot-options.test.ts](../../src/features/schedule-board/ui/daily/snapshot/snapshot-options.test.ts) | Node/Vitest | 유지 | defaults old and invalid URLs to the poster; keeps legacy width separate while ignoring design for grids |
| [src/features/schedule-board/ui/daily/snapshot/snapshot-output.test.ts](../../src/features/schedule-board/ui/daily/snapshot/snapshot-output.test.ts) | jsdom | 유지 | 보조 그룹은 실제 제목을 보존하고 상태와 중복 문구만 생략한다; 그리드 카드에서 실제 스케쥴 카드와 동일한 휴방 상태를 표시한다 |
| [src/features/schedule-board/ui/daily/snapshot/snapshot-portrait.test.tsx](../../src/features/schedule-board/ui/daily/snapshot/snapshot-portrait.test.tsx) | jsdom | 유지 | replaces a missing portrait without leaving a broken img that prevents PNG capture |
| [src/features/schedule-board/ui/daily/snapshot/snapshot-site.test.tsx](../../src/features/schedule-board/ui/daily/snapshot/snapshot-site.test.tsx) | jsdom | 유지 | brands the %s/%s export from its selected site |
| [src/features/schedule-board/ui/daily/snapshot/use-auto-fit-text.dom.test.tsx](../../src/features/schedule-board/ui/daily/snapshot/use-auto-fit-text.dom.test.tsx) | jsdom | 유지 | remeasures an unchanged title after fonts settle and after system fallback |
| [src/features/schedule-board/ui/daily/snapshot/use-auto-fit-text.test.ts](../../src/features/schedule-board/ui/daily/snapshot/use-auto-fit-text.test.ts) | Node/Vitest | 유지 | 기본 크기에서 이미 맞으면 폰트를 유지한다; 넘치는 경우 맞을 때까지 폰트를 줄인다 |
| [src/features/schedule-board/ui/daily/snapshot/use-snapshot-fonts.test.tsx](../../src/features/schedule-board/ui/daily/snapshot/use-snapshot-fonts.test.tsx) | jsdom | 유지 | publishes the font CSS only after preparation and removes faces on unmount; does not install fonts after unmount |
| [src/features/schedule-board/ui/weekly/components/weekly-grid-day-cell.test.tsx](../../src/features/schedule-board/ui/weekly/components/weekly-grid-day-cell.test.tsx) | jsdom | 경계 유지·격리/대기 보완 | 종료 이후 빈 칸에서 일정 추가를 제공하지 않는다 |
| [src/features/schedule-board/ui/weekly/components/weekly-grid.test.tsx](../../src/features/schedule-board/ui/weekly/components/weekly-grid.test.tsx) | jsdom | 유지 | 기존 주간표에서 멤버별 일정 추가와 편집 흐름을 유지한다 |
| [src/features/schedule-board/ui/weekly/components/weekly-schedule-item.test.ts](../../src/features/schedule-board/ui/weekly/components/weekly-schedule-item.test.ts) | jsdom | 유지 | 방송 카드는 축약 ON 대신 상태명과 시간을 읽기 좋게 표시한다; 시간 없는 게릴라 방송은 미정 시간칩과 fallback 제목을 표시한다 |
| [src/features/schedule-board/use-cases/use-admin-live-schedule-auto-fill.test.ts](../../src/features/schedule-board/use-cases/use-admin-live-schedule-auto-fill.test.ts) | jsdom | 유지 | 관리자에게 새 live-status 결과가 도착할 때 한 번만 POST를 실행한다; 일정이 갱신된 경우 schedule query를 무효화한다 |

### src/features/schedules

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/schedules/api/pending-schedules.test.ts](../../src/features/schedules/api/pending-schedules.test.ts) | Node/Vitest | 경계 유지·격리/대기 보완 | sends per-candidate edits in one existing approval request |
| [src/features/schedules/model/pending-time.test.ts](../../src/features/schedules/model/pending-time.test.ts) | Node/Vitest | 유지 | 분 단위 수집 시간을 가장 가까운 30분 단위로 반올림한다; 30분 반올림이 자정을 넘으면 같은 날짜의 마지막 구간으로 제한한다 |
| [src/features/schedules/ui/schedule-dialog.test.ts](../../src/features/schedules/ui/schedule-dialog.test.ts) | jsdom | 유지 | 종료 이후 일반 입력을 막고 관리자에게 공개 예외 안내를 제공한다; 신규 스케쥴은 시간 미정으로 시작하고 시간 없이 저장한다 |
| [src/features/schedules/use-cases/save-schedule.test.ts](../../src/features/schedules/use-cases/save-schedule.test.ts) | Node/Vitest | 유지 | 스케줄 저장은 서버 command API에 정규화된 날짜로 위임한다; 수정 저장도 기존 id와 요청 멱등성 키를 유지한 command payload로 전달한다 |

### src/features/site-content

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/site-content/model/site-content-metadata.test.tsx](../../src/features/site-content/model/site-content-metadata.test.tsx) | jsdom | 유지 | uses the delivered data and replaces JSON-LD without adding app UI; follows the selected week and clears stale JSON-LD without replacing the UI on failure |
| [src/features/site-content/model/site-content-recovery.test.tsx](../../src/features/site-content/model/site-content-recovery.test.tsx) | jsdom | 유지 | refetches an aged server response on focus after its absolute expiration; waits a minute after expired content fails, then resumes fresh polling after recovery |

### src/features/x-posts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/x-posts/api/x-posts-api.test.ts](../../src/features/x-posts/api/x-posts-api.test.ts) | Node/Vitest | 유지 | extracts X handles without treating reserved paths as accounts; fetches current visibility and bypasses the HTTP cache on retry |
| [src/features/x-posts/ui/x-post-card.test.ts](../../src/features/x-posts/ui/x-post-card.test.ts) | jsdom | 유지 | 프리뷰 가능한 링크는 본문 링크와 별도의 카드로 한 번만 표시한다; 연결된 X 게시글 작성자와 본문, 미디어를 렌더링한다 |

### src/features/youtube

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/features/youtube/api/youtube.test.ts](../../src/features/youtube/api/youtube.test.ts) | Node/Vitest | 유지 | 채널이 없으면 null을 반환한다; 채널 ID를 정렬해 조회하고 동영상에 memberUid를 매핑한다 |
| [src/features/youtube/queries/use-youtube-media.test.ts](../../src/features/youtube/queries/use-youtube-media.test.ts) | jsdom | 유지 | 키리누키 접근 재확인이 실패하면 기존 콘텐츠를 숨긴다; YouTube 채널이 없으면 요청 없이 로드 완료 처리한다 |
| [src/features/youtube/queries/use-youtube-shorts.test.ts](../../src/features/youtube/queries/use-youtube-shorts.test.ts) | jsdom | 유지 | 명시적 더 보기 요청으로 확정된 다음 페이지를 이어 붙인다; 미완료 페이지는 기존 카드를 유지하고 15초 뒤 한 번만 재조회한다 |
| [src/features/youtube/queries/use-youtube-videos.test.ts](../../src/features/youtube/queries/use-youtube-videos.test.ts) | Node/Vitest | 유지 | 선택된 멤버가 없으면 원본 배열을 반환한다; 선택된 멤버 uid 기준으로 필터링한다 |
| [src/features/youtube/ui/admin/kirinuki-channel-manager.test.tsx](../../src/features/youtube/ui/admin/kirinuki-channel-manager.test.tsx) | jsdom | 유지 | searches by channel ID and cancels a named deletion without mutating |
| [src/features/youtube/ui/admin/youtube-feed-manager.test.tsx](../../src/features/youtube/ui/admin/youtube-feed-manager.test.tsx) | jsdom | 유지 | keeps a static table, cancels without collecting, and distinguishes acceptance from completion; retains the last snapshot on refresh failure and never substitutes a normal zero |
| [src/features/youtube/ui/admin/youtube-history.test.tsx](../../src/features/youtube/ui/admin/youtube-history.test.tsx) | jsdom | 유지 | inspects retained metadata as read-only and drops the previous page on a denied next-page read |
| [src/features/youtube/ui/youtube-playlist.test.ts](../../src/features/youtube/ui/youtube-playlist.test.ts) | jsdom | 유지 | 키리누키 안내에 현재 참여한 채널 리스트를 표시한다 |
| [src/features/youtube/ui/youtube-section.test.ts](../../src/features/youtube/ui/youtube-section.test.ts) | jsdom | 유지 | Shorts 실패를 빈 결과로 표시하지 않고 현재 목록을 유지하며 재시도한다; Shorts 로딩이 끝나지 않아도 조회된 일반 동영상을 보여준다 |
| [src/features/youtube/ui/youtube-video-card.test.ts](../../src/features/youtube/ui/youtube-video-card.test.ts) | jsdom | 유지 | 키리누키 카드는 좌측 상단 칩에 채널명을 표시하고 채널 아바타는 숨긴다 |

### src/routes

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/routes/-multiview.test.ts](../../src/routes/-multiview.test.ts) | jsdom | 유지 | mounts the multiview page without an auth gate |
| [src/routes/-root-navigation.test.tsx](../../src/routes/-root-navigation.test.tsx) | jsdom | 유지 | preserves the common layout and iframe across Play tabs while updating route metadata; never requests %s -> %s with the previous schedule date |
| [src/routes/-schedule-review.test.ts](../../src/routes/-schedule-review.test.ts) | jsdom | 유지 | moves %s to unified review while preserving filters and anchors; keeps ordinary collection and legacy run history links at their own destinations |

### src/shared

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [src/shared/api/client.test.ts](../../src/shared/api/client.test.ts) | Node/Vitest | 유지 | fetches protected image bytes with the actual session bearer and preserves binary data; keeps the JSON content type for json payloads |
| `src/shared/api/feature-contracts.test.ts` (제거) | Node/Vitest | 중복 제거·소유 기능으로 이동 | 활성 멤버만 필터링한다; 멤버 프로필 상세 API는 code를 인코딩해 요청한다 |
| [src/shared/lib/audit-filters.test.ts](../../src/shared/lib/audit-filters.test.ts) | Node/Vitest | 유지 | keeps optional filters literal, with inclusive calendar boundaries; rejects invalid filter %s |
| [src/shared/lib/site-rights.test.ts](../../src/shared/lib/site-rights.test.ts) | Node/Vitest | 유지 | uses the first publication year when it is still current; uses a year range after the first publication year |
| [src/shared/query/query-keys.test.ts](../../src/shared/query/query-keys.test.ts) | Node/Vitest | 유지 | isolates OTW Play member submissions by signed-in user |
| [src/shared/seo/member-redirect.test.ts](../../src/shared/seo/member-redirect.test.ts) | jsdom | 유지 | replaces the old URL and applies a string member filter without old search values; shows not-found for unknown or inactive members |
| [src/shared/seo/site-seo-contract.test.ts](../../src/shared/seo/site-seo-contract.test.ts) | Node/Vitest | 유지 | uses the explicit site for the same route and rejects an unresolved origin; resolves content links against its site while retaining URL safety |
| [src/shared/seo/site-seo-dom.test.ts](../../src/shared/seo/site-seo-dom.test.ts) | jsdom | 유지 | updates navigation metadata without creating new duplicates |
| [src/shared/seo/site-seo-navigation.test.tsx](../../src/shared/seo/site-seo-navigation.test.tsx) | jsdom | 유지 | replaces profile and search metadata on client navigation and clears old images |
| [src/shared/ui/animation-provider.test.tsx](../../src/shared/ui/animation-provider.test.tsx) | jsdom | 유지 | combines site=%s and OS reduce=%s into effective=%s; reacts to OS changes without overwriting the saved site switch |
| [src/shared/ui/authenticated-image.test.tsx](../../src/shared/ui/authenticated-image.test.tsx) | jsdom | 경계 유지·격리/대기 보완 | uses the own login for normal workspace images without requesting admin archive access; rechecks the same external URL when its owning notice context changes and never falls back after rejection |
| [src/shared/ui/confirm-action-dialog.test.tsx](../../src/shared/ui/confirm-action-dialog.test.tsx) | jsdom | 유지 | returns focus to a standalone confirmation's invoking button after Escape |
| [src/shared/ui/content-page-shell.test.tsx](../../src/shared/ui/content-page-shell.test.tsx) | jsdom | 유지 | 기본 공지·VOD 헤더는 스크롤 바깥에 유지한다; 선택적 스크롤 헤더·고정 필터·푸터는 순서대로 한 번씩 표시한다 |
| [src/shared/ui/loading-image.test.tsx](../../src/shared/ui/loading-image.test.tsx) | jsdom | 유지 | reserves a skeleton until the current image loads and clears it after failure; reveals an already available image without waiting for another load event |
| [src/shared/ui/post-content.test.tsx](../../src/shared/ui/post-content.test.tsx) | jsdom | 유지 | 4개 타일에서 모든 사진을 탐색하고 방향키·Escape·포커스 복원을 지원한다; 사진 실패 시 안내와 원문 링크를 유지하며 단일 사진 이동은 비활성화한다 |
| [src/shared/ui/stepper/stepper.test.tsx](../../src/shared/ui/stepper/stepper.test.tsx) | jsdom | 유지 | plays the original slide when explicitly enabled despite the OS preference, including external backward navigation; supports the requested initialStep=3 configuration and completes an uncontrolled wizard |
| [src/shared/ui/tabs-list.test.tsx](../../src/shared/ui/tabs-list.test.tsx) | jsdom | 유지 | 키보드 이동에서 비활성 항목을 건너뛰고 선택과 포커스를 함께 이동한다 |

### worker/app

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/app/admin-catalog-replay.integration.test.ts](../../worker/app/admin-catalog-replay.integration.test.ts) | Workerd | 유지 | returns the original successful HTTP result after response loss and concurrent retries; binds completed keys to the actor, site, method and input before any mutation |
| [worker/app/ai-review.test.ts](../../worker/app/ai-review.test.ts) | Node/Vitest | 유지 | keeps %s AI review and batch DLQ semantics; requires a non-negative safe integer retry generation for batch messages |
| [worker/app/archive-access.integration.test.ts](../../worker/app/archive-access.integration.test.ts) | Workerd | 유지 | saves a notice image edit through the admin route and serves it publicly; applies the timed OTW cutoff through normal member, schedule, notice and asset routes without changing rows |
| [worker/app/fetch.test.ts](../../worker/app/fetch.test.ts) | Node/Vitest | 유지 | rejects invalid runtime resources before HTTP consumers: %j |
| [worker/app/media-route-cache.test.ts](../../worker/app/media-route-cache.test.ts) | Node/Vitest | 유지 | prevents stale public caching for chzzk vods and clips; prevents stale public caching for youtube and kirinuki videos |
| [worker/app/multiview.integration.test.ts](../../worker/app/multiview.integration.test.ts) | Workerd | 유지 | persists through authenticated Worker entry, restores and deletes without crossing owner/site boundaries; rejects a foreign issuer and unsaved target/query injection |
| [worker/app/profile-background-upload.test.ts](../../worker/app/profile-background-upload.test.ts) | Node/Vitest | 유지 | imports without spawning and exposes an explicit runner; rejects invalid selected target before runner spawn |
| [worker/app/protected-routes.test.ts](../../worker/app/protected-routes.test.ts) | Node/Vitest | 유지 | requires authentication through the real route dispatcher: %s %s (%s); /api/settings rejects unauthenticated requests |
| [worker/app/publication-schema-upgrade.integration.test.ts](../../worker/app/publication-schema-upgrade.integration.test.ts) | Workerd | 유지 | upgrades the actual %s migration order without losing legacy writes, proposal children or X repair state |
| [worker/app/queue.test.ts](../../worker/app/queue.test.ts) | Node/Vitest | 유지 | routes work preparation and DLQ failure through the same ingestion binding; acks successful and malformed main-queue deliveries |
| [worker/app/route-registry.test.ts](../../worker/app/route-registry.test.ts) | Node/Vitest | 유지 | dispatches only exact path patterns; returns null outside the Worker API surface |
| [worker/app/routes.test.ts](../../worker/app/routes.test.ts) | Node/Vitest | 유지 | keeps unsupported methods on private multiview routes uncacheable; keeps every endpoint's method, authorization, cache and response policy |
| [worker/app/schedule-member-policy.integration.test.ts](../../worker/app/schedule-member-policy.integration.test.ts) | Workerd | 유지 | 실제 관리자 승인 경로는 선택한 편집값을 D1에 저장하고 비관리자·원본·이력을 보호한다; 실제 승인 경로는 %s 후보의 편집을 저장하지 않는다 |
| [worker/app/scheduled-queue.test.ts](../../worker/app/scheduled-queue.test.ts) | Node/Vitest | 유지 | rearms a priority-deferred delivery before acknowledging and redispatches the run; preserves control planning failure admission: %s |
| [worker/app/scheduled-workflow-cron.integration.test.ts](../../worker/app/scheduled-workflow-cron.integration.test.ts) | Workerd | 유지 | checks the execution UTC day for delayed Cron, current day blocked: %s; defers initialization during %s (poll due: %s) without writes or Workflow creation |
| [worker/app/scheduled-workflow-cron.test.ts](../../worker/app/scheduled-workflow-cron.test.ts) | Node/Vitest | 유지 | hourly lanes remain staggered across one Free-plan cron expression; starts X collection at 23 and 53 minutes every hour |
| [worker/app/site-auth.integration.test.ts](../../worker/app/site-auth.integration.test.ts) | Workerd | 유지 | enforces %s app/origin/admin identity through Worker fetch before D1 mutation; rejects invalid site/resources in the real Worker entry before D1, auth or assets |
| [worker/app/site-countdown.test.ts](../../worker/app/site-countdown.test.ts) | Node/Vitest | 유지 | includes readable remaining time before JavaScript or animation assets load; hides the timer at an operational hold, including before JavaScript |
| [worker/app/site-publication.test.ts](../../worker/app/site-publication.test.ts) | Node/Vitest | 유지 | returns public clock metadata without D1 or authentication; renders the public countdown without waiting for Clerk, app assets or D1 |
| [worker/app/work-queue-flow.integration.test.ts](../../worker/app/work-queue-flow.integration.test.ts) | Workerd | 유지 | prepares a persisted review through authenticated HTTP, real queue consumers and final HTTP readback without duplicate provider work; reviews a full playlist through the authenticated workflow and writes catalog data only at final confirmation |
| [worker/app/worker-queue.test.ts](../../worker/app/worker-queue.test.ts) | Node/Vitest | 유지 | routes manual control without waiting behind background work; routes %s through the scheduled executor |
| [worker/app/x-activity.integration.test.ts](../../worker/app/x-activity.integration.test.ts) | Workerd | 유지 | controls hybrid collection through authenticated site routes and reports official failures with zero observation writes; reports partial policy deployment as503 and does not write a successful audit |
| [worker/app/x-gateway.test.ts](../../worker/app/x-gateway.test.ts) | Node/Vitest | 유지 | fails closed even with a local bearer when the coordinator is absent; uses only the fixed peer RPC and fails closed on transport failure |

### worker/features/assets

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/assets/domain/file-reference.test.ts](../../worker/features/assets/domain/file-reference.test.ts) | Node/Vitest | 유지 | projects approved owning URLs into canonical relative paths without changing external-only media; rejects missing origin classification and conflicting resource mappings |
| [worker/features/assets/http/handler.test.ts](../../worker/features/assets/http/handler.test.ts) | Node/Vitest | 유지 | scopes static ETag to site and current policy revision; serves public profile background assets after current policy without retaining stale public bytes |
| [worker/features/assets/infrastructure/file-projection.integration.test.ts](../../worker/features/assets/infrastructure/file-projection.integration.test.ts) | Workerd | 유지 | retires only transfer triggers after installing the nine owning file projection triggers; preserves %s projection, old-file retention and atomic rollback |
| [worker/features/assets/infrastructure/file-recovery.integration.test.ts](../../worker/features/assets/infrastructure/file-recovery.integration.test.ts) | Workerd | 유지 | preserves populated raw references during incremental migration and rolls back index/release changes with a failed owning batch; keeps SQL URL identity equal to the owning parser for encoded path delimiters |
| [worker/features/assets/infrastructure/file-write-compat.integration.test.ts](../../worker/features/assets/infrastructure/file-write-compat.integration.test.ts) | Workerd | 유지 | edits and removes a notice with images through the owning gateway; updates a member image, projects the replacement, and reads it on the profile |

### worker/features/audit

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/audit/http/admin-audit-handler.test.ts](../../worker/features/audit/http/admin-audit-handler.test.ts) | Node/Vitest | 유지 | page 경계를 정규화하고 no-store 페이지 응답을 반환한다; 관리자 인증 실패 응답을 그대로 반환한다 |
| [worker/features/audit/infrastructure/log-filter.integration.test.ts](../../worker/features/audit/infrastructure/log-filter.integration.test.ts) | Workerd | 유지 | uses identical filters for schedule rows and total, including the entire UTC end day; keeps audit totals and records aligned for status, target, action and literal search |

### worker/features/auth

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/auth/http/handler.test.ts](../../worker/features/auth/http/handler.test.ts) | Node/Vitest | 유지 | returns the Worker-authoritative admin decision without exposing a user id; returns a neutral signed-out decision |

### worker/features/chzzk

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/chzzk/domain/channel-targets.test.ts](../../worker/features/chzzk/domain/channel-targets.test.ts) | Node/Vitest | 유지 | normalizes case and removes duplicates while preserving order; rejects invalid and oversized target lists |
| [worker/features/chzzk/http/live-status.test.ts](../../worker/features/chzzk/http/live-status.test.ts) | Node/Vitest | 유지 | GET은 승인된 채널의 상태만 조회하고 스케줄을 수정하지 않는다; 조건부 재검증 요청에도 캐시된 JSON 본문을 200으로 반환한다 |
| [worker/features/chzzk/http/media.test.ts](../../worker/features/chzzk/http/media.test.ts) | Node/Vitest | 유지 | 활성 멤버 채널을 정규화·중복 제거하고 승인된 캐시 대상으로 표시한다; 승인되지 않은 VOD 프로필은 등록 채널이어도 D1에 저장하지 않는다 |
| [worker/features/chzzk/infrastructure/chzzk-api.test.ts](../../worker/features/chzzk/infrastructure/chzzk-api.test.ts) | Node/Vitest | 유지 | D1 fresh hit에서는 origin을 호출하지 않는다; L1 fresh hit에서는 origin을 다시 호출하지 않는다 |
| [worker/features/chzzk/infrastructure/chzzk-live-status.test.ts](../../worker/features/chzzk/infrastructure/chzzk-live-status.test.ts) | Node/Vitest | 유지 | uses confirmed public channel status after the recorded 500/9004 response; handles a 9004 envelope without an HTTP error and never invents an opening time |
| [worker/features/chzzk/infrastructure/chzzk-multiview-reader.test.ts](../../worker/features/chzzk/infrastructure/chzzk-multiview-reader.test.ts) | Node/Vitest | 경계 유지·격리/대기 보완 | omits an invalid optional name while keeping healthy status and the saved-name fallback; drops malformed optional image and date fields at the provider boundary |

### worker/features/configuration

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/configuration/http/settings-handler.integration.test.ts](../../worker/features/configuration/http/settings-handler.integration.test.ts) | Workerd | 유지 | rejects %s alone and in a mixed update without any persisted change; saves the canonical budget and returns the authoritative value with one audit |
| [worker/features/configuration/http/settings-handler.test.ts](../../worker/features/configuration/http/settings-handler.test.ts) | Node/Vitest | 유지 | 백그라운드 수집/예열 설정 기본값과 읽기 전용 last_run을 쓰기 없이 반환한다; 허용된 X 수집 주기를 저장한다 |

### worker/features/content-access

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/content-access/infrastructure/publication-access.test.ts](../../worker/features/content-access/infrastructure/publication-access.test.ts) | Node/Vitest | 유지 | keeps ownerless public rows visible while hiding selected member relations at the cutoff; applies the operator-confirmed D-day cutoff without an active transfer workspace |

### worker/features/ddays

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/ddays/http/handler.test.ts](../../worker/features/ddays/http/handler.test.ts) | Node/Vitest | 유지 | returns 400 for malformed JSON instead of throwing to the index; 조회 결과와 noCache 계약을 application port에서 그대로 반환한다 |
| [worker/features/ddays/infrastructure/d1-dday-repository.test.ts](../../worker/features/ddays/infrastructure/d1-dday-repository.test.ts) | Node/Vitest | 유지 | 조회와 생성·수정·삭제를 persistence adapter에서 수행한다 |
| [worker/features/ddays/infrastructure/d1-dday-schema.integration.test.ts](../../worker/features/ddays/infrastructure/d1-dday-schema.integration.test.ts) | Workerd | 유지 | migration 적용 후 전체 입력을 일반 조회로 저장·수정·삭제한다; 이전 migration의 type 누락 시 데이터 생략 저장을 하지 않는다 |

### worker/features/member-posts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/member-posts/http/handler.test.ts](../../worker/features/member-posts/http/handler.test.ts) | Node/Vitest | 유지 | rejects invalid pagination cursors: %s; keeps member authorization on older-page requests |
| [worker/features/member-posts/infrastructure/member-posts-pagination.integration.test.ts](../../worker/features/member-posts/infrastructure/member-posts-pagination.integration.test.ts) | Workerd | 유지 | pages through equal-time mixed sources without duplicates, hidden posts, external calls or writes; filters each page by member and excludes inaccessible sources |

### worker/features/members

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/members/http/handler.test.ts](../../worker/features/members/http/handler.test.ts) | Node/Vitest | 유지 | 활성 멤버 목록과 public cache 계약을 반환한다; 멤버 상세는 이미지와 링크를 정렬된 프로필 계약으로 반환한다 |

### worker/features/multiview

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/multiview/application/multiview-service.test.ts](../../worker/features/multiview/application/multiview-service.test.ts) | Node/Vitest | 유지 | returns a duplicate admitted concurrently between the initial lookup and a full-list read; replays a saved channel without relying on another upstream request |
| [worker/features/multiview/http/channel-handler.test.ts](../../worker/features/multiview/http/channel-handler.test.ts) | Node/Vitest | 유지 | requires authentication and prevents caching even on failure; rejects invalid POST data without saving |
| [worker/features/multiview/infrastructure/d1-channel-repository.integration.test.ts](../../worker/features/multiview/infrastructure/d1-channel-repository.integration.test.ts) | Workerd | 유지 | reopens persisted channels without exposing another owner or site's data; admits only one of two additions racing for the thirtieth slot |

### worker/features/naver-cafe

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/naver-cafe/domain/board-urls.test.ts](../../worker/features/naver-cafe/domain/board-urls.test.ts) | Node/Vitest | 유지 | 숫자 ID의 공백과 1~20자리 경계를 검증한다; 현재 f-e 게시판 URL에서 cafeId와 menuId를 추출한다 |
| [worker/features/naver-cafe/http/handler-auth.test.ts](../../worker/features/naver-cafe/http/handler-auth.test.ts) | Node/Vitest | 유지 | Clerk 토큰이 없으면 회원 전용 카페 게시글 API 호출을 막는다; 클라이언트 사용자 헤더만으로는 회원 전용 카페 게시글 API를 허용하지 않는다 |
| [worker/features/naver-cafe/http/handler-cache.test.ts](../../worker/features/naver-cafe/http/handler-cache.test.ts) | Node/Vitest | 유지 | does not reuse OTW cached posts when the request host and sources match LuvDia; fresh response cache가 있으면 저장 조회 서비스를 다시 호출하지 않는다 |
| [worker/features/naver-cafe/infrastructure/naver-cafe-collector.test.ts](../../worker/features/naver-cafe/infrastructure/naver-cafe-collector.test.ts) | Node/Vitest | 유지 | 게시판 목록 응답을 피드 카드 데이터로 정규화한다; 소스별 최신글을 호출하고 최신순으로 합친다 |
| [worker/features/naver-cafe/infrastructure/site-sources.integration.test.ts](../../worker/features/naver-cafe/infrastructure/site-sources.integration.test.ts) | Workerd | 유지 | keeps only %s member boards in admin, collection and status without deleting history; rejects a stale out-of-scope %s source before any provider request |

### worker/features/notices

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/notices/http/handler.test.ts](../../worker/features/notices/http/handler.test.ts) | Node/Vitest | 유지 | uploads notice thumbnails into the configured R2 asset bucket; returns no-store headers for public notice reads |

### worker/features/operations

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/operations/http/handler.test.ts](../../worker/features/operations/http/handler.test.ts) | Node/Vitest | 유지 | forwards INSERT evidence only through authorized admin run readback (%s); /api/operations/status는 관리자 인증을 요구한다 |
| [worker/features/operations/infrastructure/cloudflare-d1-observability-reader.test.ts](../../worker/features/operations/infrastructure/cloudflare-d1-observability-reader.test.ts) | Node/Vitest | 유지 | returns an unconfigured read without making an external request; reads UTC daily metrics and returns categorized workloads without raw SQL |
| [worker/features/operations/infrastructure/data-retention.test.ts](../../worker/features/operations/infrastructure/data-retention.test.ts) | Node/Vitest | 유지 | selects only due policies in one read-only batch and preserves the cutoff boundary; YouTube feed metadata retention is based on fetched_at |
| [worker/features/operations/infrastructure/operations-application.test.ts](../../worker/features/operations/infrastructure/operations-application.test.ts) | Node/Vitest | 유지 | keeps a recent normal skip healthy even when the previous success is old; marks the latest check stale even when that check was a normal skip |
| [worker/features/operations/infrastructure/read-efficiency.integration.test.ts](../../worker/features/operations/infrastructure/read-efficiency.integration.test.ts) | Workerd | 유지 | reads schedule review status without unrelated D1 scans or writes; uses indexed log bounds without changing mixed timestamp or UID filter semantics |
| [worker/features/operations/infrastructure/retained-content.integration.test.ts](../../worker/features/operations/infrastructure/retained-content.integration.test.ts) | Workerd | 유지 | does not reschedule retained moved-source work through stale metadata or enabled flags; uses the same hold predicate for eligibility, count, actual prune and readback |
| [worker/features/operations/infrastructure/scheduled-queue-state-sql.integration.test.ts](../../worker/features/operations/infrastructure/scheduled-queue-state-sql.integration.test.ts) | Workerd | 유지 | skips retained pending reconciliation for completed runs while preserving global stale leases; does not scan all completed items in a large active mostly-dispatched run |

### worker/features/otw-play

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/otw-play/application/admin-catalog-service.test.ts](../../worker/features/otw-play/application/admin-catalog-service.test.ts) | Node/Vitest | 명령·승인 조건 분리 | approves clips only with an approved clip channel, known extent and verified bounds; materializes an omitted clip end from verified duration for registration and correction |
| [worker/features/otw-play/application/channel-monitor-service.test.ts](../../worker/features/otw-play/application/channel-monitor-service.test.ts) | Node/Vitest | 유지 | blocks new monitoring and reactivation while preserving pause and candidate readback; returns an opaque cursor and restores it for the next candidate page |
| [worker/features/otw-play/application/ingestion-service.test.ts](../../worker/features/otw-play/application/ingestion-service.test.ts) | Node/Vitest | 유지 | stops automatic recovery before the next queue send when automation pauses; reports queue recovery failures and leaves remaining messages pending |
| [worker/features/otw-play/application/member-submission-service.test.ts](../../worker/features/otw-play/application/member-submission-service.test.ts) | Node/Vitest | 유지 | canonicalizes YouTube and verifies metadata once while song search skips the provider; uses KST calendar-day bounds |
| [worker/features/otw-play/application/playlist-artwork.test.ts](../../worker/features/otw-play/application/playlist-artwork.test.ts) | Node/Vitest | 유지 | uses the artwork projection instead of hydrating catalog content for personal list images; uses the selected playable source and excludes item arrays from summaries |
| [worker/features/otw-play/application/playlist-service.test.ts](../../worker/features/otw-play/application/playlist-service.test.ts) | Node/Vitest | 유지 | rejects oversized writes before any database work: %j; roundtrips a page boundary with rich performance metadata without embedding it in the cursor |
| [worker/features/otw-play/application/public-catalog-service.test.ts](../../worker/features/otw-play/application/public-catalog-service.test.ts) | Node/Vitest | 유지 | reads authoritative meta before a config cache hit and keeps config readable while disabled; uses a 30 minute config TTL and treats cache failures as misses |
| [worker/features/otw-play/application/source-health-service.test.ts](../../worker/features/otw-play/application/source-health-service.test.ts) | Node/Vitest | 유지 | uses the same observation path for manual checks and validates stored identity; returns HTTP-safe retry data while preserving the target status and last check |
| [worker/features/otw-play/domain/ai-review-result.test.ts](../../worker/features/otw-play/domain/ai-review-result.test.ts) | Node/Vitest | 유지 | prefers the complete title and resolves bilingual artist %s amid duplicate catalog entries; does not resolve an ambiguous bilingual artist or merge distinct people |
| [worker/features/otw-play/domain/broadcast-metadata.test.ts](../../worker/features/otw-play/domain/broadcast-metadata.test.ts) | Node/Vitest | 유지 | keeps unknown dates and originals, including partial singing; rejects invalid dates, missing fields and unsafe original links |
| [worker/features/otw-play/domain/channel-poll-schedule.test.ts](../../worker/features/otw-play/domain/channel-poll-schedule.test.ts) | Node/Vitest | 유지 | does not miss the next cron slot when completion follows dispatch; schedules a manual poll for the next slot across midnight |
| [worker/features/otw-play/domain/duplicate-policy.test.ts](../../worker/features/otw-play/domain/duplicate-policy.test.ts) | Node/Vitest | 유지 | creates deterministic song key material without hashing; keeps video-backed songs distinct without auto-linking equal titles |
| [worker/features/otw-play/domain/ingestion-cursor.test.ts](../../worker/features/otw-play/domain/ingestion-cursor.test.ts) | Node/Vitest | 유지 | round-trips the keyset and filter identity; rejects legacy and malformed cursor payloads |
| [worker/features/otw-play/domain/member-songbook-query.test.ts](../../worker/features/otw-play/domain/member-songbook-query.test.ts) | Node/Vitest | 유지 | rejects %s; defaults to vocal and featured, and binds collaboration into cursor identity |
| [worker/features/otw-play/domain/member-submission-cursor.test.ts](../../worker/features/otw-play/domain/member-submission-cursor.test.ts) | Node/Vitest | 유지 | round-trips a Unicode-safe keyset tuple; rejects malformed and non-canonical payloads |
| [worker/features/otw-play/domain/playlist-query.test.ts](../../worker/features/otw-play/domain/playlist-query.test.ts) | Node/Vitest | 유지 | keeps performance identity and nullable date and binds the cursor to its filter/revision; rejects %s |
| [worker/features/otw-play/domain/public-catalog-cursor.test.ts](../../worker/features/otw-play/domain/public-catalog-cursor.test.ts) | Node/Vitest | 유지 | round-trips a Unicode-safe $sort key; requires a coherent search phase and rank exactly when q is present |
| [worker/features/otw-play/domain/public-catalog-query.test.ts](../../worker/features/otw-play/domain/public-catalog-query.test.ts) | Node/Vitest | 유지 | normalizes search and canonicalizes equivalent member sets; decodes and re-canonicalizes the opaque group selector |
| [worker/features/otw-play/domain/public-group-key.test.ts](../../worker/features/otw-play/domain/public-group-key.test.ts) | Node/Vitest | 유지 | round-trips a Unicode unit selector; supports either selector authority |
| [worker/features/otw-play/domain/public-source-selection.test.ts](../../worker/features/otw-play/domain/public-source-selection.test.ts) | Node/Vitest | 유지 | uses the stored playable primary without recomputing channel-role rank; reports an explicit fallback when the primary is unavailable |
| [worker/features/otw-play/domain/search-normalization.test.ts](../../worker/features/otw-play/domain/search-normalization.test.ts) | Node/Vitest | 유지 | normalizes multilingual and compatibility text: %s; produces the same key when only whitespace and punctuation differ |
| [worker/features/otw-play/domain/source-health-policy.test.ts](../../worker/features/otw-play/domain/source-health-policy.test.ts) | Node/Vitest | 유지 | schedules %s after %s hours; clamps provider Retry-After and applies fixed retry policies |
| [worker/features/otw-play/domain/work-queue-policy.test.ts](../../worker/features/otw-play/domain/work-queue-policy.test.ts) | Node/Vitest | 유지 | requires human review or an explicit disposition before advancing |
| [worker/features/otw-play/domain/youtube-playlist-id.test.ts](../../worker/features/otw-play/domain/youtube-playlist-id.test.ts) | Node/Vitest | 유지 | normalizes %s; rejects non-authoritative input %s |
| [worker/features/otw-play/domain/youtube-video-id.test.ts](../../worker/features/otw-play/domain/youtube-video-id.test.ts) | Node/Vitest | 유지 | extracts an ID from an allowed URL: %s; rejects arbitrary, lookalike, or credentialed hosts: %s |
| [worker/features/otw-play/http/admin-catalog-handler.test.ts](../../worker/features/otw-play/http/admin-catalog-handler.test.ts) | Node/Vitest | 유지 | authenticates before reading the catalog and returns no-store; passes bounded catalog filters only after authentication |
| [worker/features/otw-play/http/admin-catalog-input.test.ts](../../worker/features/otw-play/http/admin-catalog-input.test.ts) | Node/Vitest | 독립 입력 사례 분리 | parses the workflow-first preflight and integrated catalog command; accepts a complete MVP song and rejects missing original artists |
| [worker/features/otw-play/http/ai-batch-handler.test.ts](../../worker/features/otw-play/http/ai-batch-handler.test.ts) | Node/Vitest | 유지 | requires administrator authorization for every batch and draft route; normalizes duplicate candidates and rejects scope expansion or conflicting versions |
| [worker/features/otw-play/http/ai-review-handler.test.ts](../../worker/features/otw-play/http/ai-review-handler.test.ts) | Node/Vitest | 유지 | requires admin authentication before resolving dependencies: %s %s; rejects conflicting targets, arbitrary fields and invalid ranges |
| [worker/features/otw-play/http/channel-monitor-handler.test.ts](../../worker/features/otw-play/http/channel-monitor-handler.test.ts) | Node/Vitest | 유지 | creates an explicit monitor by YouTube channel ID and reconciles it; updates and deletes a collection target with its expected version |
| [worker/features/otw-play/http/ingestion-handler.test.ts](../../worker/features/otw-play/http/ingestion-handler.test.ts) | Node/Vitest | 유지 | protects budget and resume, exposes no-store and a reset time on admission refusal; authenticates before resolving the ingestion service |
| [worker/features/otw-play/http/ingestion-input.test.ts](../../worker/features/otw-play/http/ingestion-input.test.ts) | Node/Vitest | 독립 입력 사례 분리 | accepts explicit singing imports and rejects invalid kinds and unversioned corrections; accepts bounded recent imports and normalizes surrounding whitespace |
| [worker/features/otw-play/http/member-submission-handler.test.ts](../../worker/features/otw-play/http/member-submission-handler.test.ts) | Node/Vitest | 유지 | returns the standard auth error without resolving a service; fails closed when the edge limiter is missing |
| [worker/features/otw-play/http/member-submission-input.test.ts](../../worker/features/otw-play/http/member-submission-input.test.ts) | Node/Vitest | 유지 | preserves selected artist IDs for create and edit and rejects malformed IDs; accepts only the member submission snapshot contract |
| [worker/features/otw-play/http/play-telemetry-handler.test.ts](../../worker/features/otw-play/http/play-telemetry-handler.test.ts) | Node/Vitest | 유지 | records a new proposal exactly once without logging the request body; counts an idempotent replay as a request without duplicating the proposal event |
| [worker/features/otw-play/http/playlist-handler.test.ts](../../worker/features/otw-play/http/playlist-handler.test.ts) | Node/Vitest | 유지 | keeps unknown-site playlist reads closed: %s; allows anonymous %s default lists and official queue resolution while keeping personal lists authenticated |
| [worker/features/otw-play/http/public-catalog-handler.test.ts](../../worker/features/otw-play/http/public-catalog-handler.test.ts) | Node/Vitest | 유지 | allows anonymous %s catalog reads without enabling administrator preview; authenticates before data and conditional cache reads: %s |
| [worker/features/otw-play/http/websub-handler.test.ts](../../worker/features/otw-play/http/websub-handler.test.ts) | Node/Vitest | 유지 | returns 410 to %s callbacks without DB or queue work; authenticates the retired %s admin command |
| [worker/features/otw-play/http/work-queue-handler.test.ts](../../worker/features/otw-play/http/work-queue-handler.test.ts) | Node/Vitest | 유지 | requires admin authorization before resolving every work queue surface; reads progress without mutations and validates command scope and explicit dispositions |
| [worker/features/otw-play/infrastructure/admin-review-summary.test.ts](../../worker/features/otw-play/infrastructure/admin-review-summary.test.ts) | Node/Vitest | 유지 | reads stored counts without writes or provider calls, retaining unavailable counts |
| [worker/features/otw-play/infrastructure/ai-review-broadcast-reader.test.ts](../../worker/features/otw-play/infrastructure/ai-review-broadcast-reader.test.ts) | Node/Vitest | 유지 | rejects arbitrary hosts without fetching and verifies CHZZK replay identity; does not mistake a public original MV for a broadcast |
| [worker/features/otw-play/infrastructure/catalog-batch-error.test.ts](../../worker/features/otw-play/infrastructure/catalog-batch-error.test.ts) | Node/Vitest | 유지 | keeps a real identity constraint as definitive validation failure |
| [worker/features/otw-play/infrastructure/cloudflare-ingestion-read-budget.test.ts](../../worker/features/otw-play/infrastructure/cloudflare-ingestion-read-budget.test.ts) | Node/Vitest | 유지 | calls the Workers fetch function with its global receiver; uses the UTC account total at %i rows |
| [worker/features/otw-play/infrastructure/cloudflare-play-telemetry.test.ts](../../worker/features/otw-play/infrastructure/cloudflare-play-telemetry.test.ts) | Node/Vitest | 유지 | maps only fixed safe slots and preserves unknown D1 metadata as -1; deterministically samples only successful catalog custom logs |
| [worker/features/otw-play/infrastructure/cloudflare-public-catalog-cache.test.ts](../../worker/features/otw-play/infrastructure/cloudflare-public-catalog-cache.test.ts) | Node/Vitest | 유지 | uses the fixed internal host and preserves JSON cache headers; keeps config state in its deterministic cache URL identity |
| [worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts) | Workerd | 실패 원인별 D1 사례 분리 | blocks cross-kind artist duplicates by normalized name and alias without side effects; blocks duplicate artist renames while allowing the same artist to update itself |
| [worker/features/otw-play/infrastructure/d1-ai-batch-repository.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-ai-batch-repository.integration.test.ts) | Workerd | 유지 | snapshots all pages, deduplicates concurrent submissions and never appends later candidates on replay; excludes completed reviews, stale versions, unavailable videos and pending proposals |
| [worker/features/otw-play/infrastructure/d1-ai-review-repository.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-ai-review-repository.integration.test.ts) | Workerd | 유지 | reuses completed analysis across presentation changes but rechecks privacy and evidence; persists the catalog check after analysis and refreshes matches without another model call |
| [worker/features/otw-play/infrastructure/d1-architecture-hardening-schema.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-architecture-hardening-schema.integration.test.ts) | Workerd | 유지 | uses SET NULL for proposal member snapshots and preserves the names; rejects invalid JSON, conversion, boolean, range, and generation inserts |
| [worker/features/otw-play/infrastructure/d1-authority-retention-migration.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-authority-retention-migration.integration.test.ts) | Workerd | 유지 | repairs false-active subscriptions and preserves valid authority |
| [worker/features/otw-play/infrastructure/d1-catalog-schema.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-catalog-schema.integration.test.ts) | Workerd | 유지 | applies the migration with complete tables and valid foreign keys; round-trips a normalized catalog graph through every foundation table |
| [worker/features/otw-play/infrastructure/d1-channel-monitor-repository.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-channel-monitor-repository.integration.test.ts) | Workerd | 유지 | counts only newly inserted origins without counting accumulated history; keeps VOD registration, deletion and Play collection independent for the same YouTube channel |
| [worker/features/otw-play/infrastructure/d1-clip-relation-migration.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-clip-relation-migration.integration.test.ts) | Workerd | 유지 | normalizes legacy broadcast relations without losing dependent reviews or credits |
| [worker/features/otw-play/infrastructure/d1-external-identity-consolidation.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-external-identity-consolidation.integration.test.ts) | Workerd | 유지 | moves every live reference to the canonical identity before enforcing uniqueness |
| [worker/features/otw-play/infrastructure/d1-ingestion-repository.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-ingestion-repository.integration.test.ts) | Workerd | 유지 | preserves standalone alias resolution and catalog fences: %s; keeps channel approval bound to its requested candidate version during %s |
| [worker/features/otw-play/infrastructure/d1-member-entity-backfill.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-member-entity-backfill.integration.test.ts) | Workerd | 유지 | adds every active member missing from the ownership entity authority |
| [worker/features/otw-play/infrastructure/d1-member-submission-repository.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-member-submission-repository.integration.test.ts) | Workerd | 유지 | returns one row per entity across aliases and retains namesake IDs through create, replay and edit; searches existing artists and preserves selected IDs through submission, replay and edit |
| [worker/features/otw-play/infrastructure/d1-playlist-repository.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-playlist-repository.integration.test.ts) | Workerd | 유지 | persists more than one page, reopens ordered references and does not need surviving catalog rows; replays create and rejects reuse for another payload |
| [worker/features/otw-play/infrastructure/d1-proposal-deletion-migration.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-proposal-deletion-migration.integration.test.ts) | Workerd | 유지 | preserves approved proposals and their credits when adding deletion snapshots |
| [worker/features/otw-play/infrastructure/d1-proposal-search-schema.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-proposal-search-schema.integration.test.ts) | Workerd | 유지 | applies the migration with complete tables and valid foreign keys; stores proposal snapshots without creating canonical catalog rows |
| [worker/features/otw-play/infrastructure/d1-public-catalog-reader.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-public-catalog-reader.integration.test.ts) | Workerd | 유지 | serves the anonymous %s official catalog and playlists through Worker fetch with D1 readback; lists every playlist performance across pages and keeps vocal roles scoped to the same performance |
| [worker/features/otw-play/infrastructure/d1-read-cost.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-read-cost.integration.test.ts) | Workerd | 검증 없는 진단 제거·계측 재사용 | measures import and Ready/draft/publish reads at 50, 500 and 5000 rows |
| [worker/features/otw-play/infrastructure/d1-ready-search-backfill.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-ready-search-backfill.integration.test.ts) | Workerd | 유지 | repairs Ready-only songs from canonical metadata and diagnoses missing terms independently of grams |
| [worker/features/otw-play/infrastructure/d1-source-health-repository.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-source-health-repository.integration.test.ts) | Workerd | 유지 | allows a manual batch to claim due sources without resuming automation; blocks automatic claims and late observations or retries after pause while retaining manual review |
| [worker/features/otw-play/infrastructure/d1-work-queue-repository.integration.test.ts](../../worker/features/otw-play/infrastructure/d1-work-queue-repository.integration.test.ts) | Workerd | 유지 | persists private catalog conversion, retains partial successes and never converts them twice; bulk registration stores information only and readonly progress never starts work |
| [worker/features/otw-play/infrastructure/gemini-review-analyzer.test.ts](../../worker/features/otw-play/infrastructure/gemini-review-analyzer.test.ts) | Node/Vitest | 유지 | preserves grounded genre suggestions $tags through the provider response; does not retry depleted prepaid credits or echo the provider message |
| [worker/features/otw-play/infrastructure/youtube-metadata-reader.test.ts](../../worker/features/otw-play/infrastructure/youtube-metadata-reader.test.ts) | Node/Vitest | 유지 | retains identifiable private entries and flags malformed playlist memberships; calls fetch without rebinding the Cloudflare-compatible receiver |

### worker/features/schedule-board

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/schedule-board/http/handler.test.ts](../../worker/features/schedule-board/http/handler.test.ts) | Node/Vitest | 유지 | 날짜 범위를 검증한다; 유효한 범위는 repository aggregate 결과를 반환한다 |
| [worker/features/schedule-board/infrastructure/d1-schedule-board.test.ts](../../worker/features/schedule-board/infrastructure/d1-schedule-board.test.ts) | Node/Vitest | 유지 | 조회 시각이 아니라 실제 최신 변경 시각을 ISO 문자열로 반환한다; 변경 로그가 없는 기존 일정은 가장 최근 생성 시각을 사용한다 |

### worker/features/scheduled-operations

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/scheduled-operations/infrastructure/collector-sql-cadence.integration.test.ts](../../worker/features/scheduled-operations/infrastructure/collector-sql-cadence.integration.test.ts) | Workerd | 유지 | recovers only a pending X cursor within the shared budget without moving the site cadence; recovers X ranges blocked by $blocker budget without moving full cadence (optimizer=$optimized) |
| [worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts](../../worker/features/scheduled-operations/infrastructure/native-workflow.integration.test.ts) | Workerd | 유지 | persists %s cadence through ordinary Cron, native Workflow and Queue; recovers a pending X page through the native Workflow before full cadence is due |
| [worker/features/scheduled-operations/infrastructure/scheduled-auto-update.integration.test.ts](../../worker/features/scheduled-operations/infrastructure/scheduled-auto-update.integration.test.ts) | Workerd | 유지 | skips a dispatched scheduled scan after automation is disabled; preserves newer observations when an in-flight scan loses its lease |
| [worker/features/scheduled-operations/infrastructure/scheduled-job-coordinator.test.ts](../../worker/features/scheduled-operations/infrastructure/scheduled-job-coordinator.test.ts) | Node/Vitest | 유지 | maps %s to the serialized background queue; maps %s to the serialized critical queue |
| [worker/features/scheduled-operations/infrastructure/scheduled-job-dispatch.integration.test.ts](../../worker/features/scheduled-operations/infrastructure/scheduled-job-dispatch.integration.test.ts) | Workerd | 유지 | does not dispatch a new retry with an older successful control admission |
| [worker/features/scheduled-operations/infrastructure/scheduled-job-executor.test.ts](../../worker/features/scheduled-operations/infrastructure/scheduled-job-executor.test.ts) | Node/Vitest | 유지 | dispatches rss_candidates through its composition and preserves partial state; records real timeline paid calls for %s without counting free JSON calls |
| [worker/features/scheduled-operations/infrastructure/scheduled-job-planner.test.ts](../../worker/features/scheduled-operations/infrastructure/scheduled-job-planner.test.ts) | Node/Vitest | 유지 | plans RSS pending snapshots beside JSON with distinct mode target keys; plans no empty recovery, WebSub, YouTube, or retention work |
| [worker/features/scheduled-operations/infrastructure/x-hybrid.integration.test.ts](../../worker/features/scheduled-operations/infrastructure/x-hybrid.integration.test.ts) | Workerd | 유지 | schedules, resumes and completes a bounded official gap sweep; continues a regular timeline and 20 waiting quotes under the D1 cap (%s, %s cached bodies) |

### worker/features/schedules

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/schedules/application/authorize-schedule-write.test.ts](../../worker/features/schedules/application/authorize-schedule-write.test.ts) | Node/Vitest | 유지 | application 경계가 policy 판단을 그대로 적용한다 |
| [worker/features/schedules/application/pending-schedule-service.test.ts](../../worker/features/schedules/application/pending-schedule-service.test.ts) | Node/Vitest | 유지 | isolates repository exceptions while preserving order and concurrency; keeps single-item exceptions observable to the route boundary |
| [worker/features/schedules/domain/auto-update-matcher.test.ts](../../worker/features/schedules/domain/auto-update-matcher.test.ts) | Node/Vitest | 유지 | 기존 일정에서 %s의 새 방송은 240분 경계로 판정한다; 여러 일정 중 가장 가까운 일정과 시간 미정을 고려하고 다른 멤버와 날짜는 제외한다 |
| [worker/features/schedules/domain/pending-schedule.test.ts](../../worker/features/schedules/domain/pending-schedule.test.ts) | Node/Vitest | 유지 | manual fields override only explicitly selected values and retain the half-hour policy; 지원하는 적용 모드를 허용한다: %s |
| [worker/features/schedules/domain/schedule.test.ts](../../worker/features/schedules/domain/schedule.test.ts) | Node/Vitest | 유지 | 상호 배타적인 일정 상태를 식별한다: %s; 일반 일정 상태는 상호 배타적이지 않다: %s |
| [worker/features/schedules/http/manual-auto-update-handler.test.ts](../../worker/features/schedules/http/manual-auto-update-handler.test.ts) | Node/Vitest | 유지 | 수동 실행을 비동기 operation으로 접수한다; 대기열 접수 실패 시 503을 반환한다 |
| [worker/features/schedules/http/pending-command-handler.test.ts](../../worker/features/schedules/http/pending-command-handler.test.ts) | Node/Vitest | 유지 | returns 405 and Allow for non-POST direct calls; returns 400 for malformed JSON before repository work |
| [worker/features/schedules/http/pending-query-handler.test.ts](../../worker/features/schedules/http/pending-query-handler.test.ts) | Node/Vitest | 유지 | 기존 pending 목록 응답과 no-store 계약을 유지한다; 거부 제외 검색·사유·날짜·페이지네이션을 전달한다 |
| [worker/features/schedules/http/schedule-handler.test.ts](../../worker/features/schedules/http/schedule-handler.test.ts) | Node/Vitest | 유지 | 잘못된 상태값은 repository 호출 전에 거부한다; strict ID와 date/time을 검증한다 |
| [worker/features/schedules/http/update-log-handler.test.ts](../../worker/features/schedules/http/update-log-handler.test.ts) | Node/Vitest | 유지 | legacy limit 조회 계약과 no-store 응답을 보존한다; paged 조회 범위와 sort를 정규화한다 |
| [worker/features/schedules/infrastructure/auto-update-rejection.integration.test.ts](../../worker/features/schedules/infrastructure/auto-update-rejection.integration.test.ts) | Workerd | 유지 | keeps rejection fragments global and avoids reading simple unrelated history; targeted holiday reconciliation leaves other targets for the run finalizer |
| [worker/features/schedules/infrastructure/auto-update-runs.test.ts](../../worker/features/schedules/infrastructure/auto-update-runs.test.ts) | Node/Vitest | 유지 | %s 실행은 동일한 D1 cacheDb를 수집 서비스에 전달한다 |
| [worker/features/schedules/infrastructure/auto-update.test.ts](../../worker/features/schedules/infrastructure/auto-update.test.ts) | Node/Vitest | 유지 | 후속 페이지 예외를 실패로 보존하고 이미 완료한 다른 채널과 구분한다; 채널을 페이지 wave로 조회하고 모든 수집 호출에서 fresh cache를 우회한다 |
| [worker/features/schedules/infrastructure/d1-pending-schedule-repository.integration.test.ts](../../worker/features/schedules/infrastructure/d1-pending-schedule-repository.integration.test.ts) | Workerd | 유지 | manual title edit replaces a populated V2 value while preserving time/status and auditing the source; manual time-only update rounds the edited input and preserves title/status |
| [worker/features/schedules/infrastructure/holiday-suggestions.test.ts](../../worker/features/schedules/infrastructure/holiday-suggestions.test.ts) | Node/Vitest | 유지 | preserves %s through the normal catalog and assessment entry |
| [worker/features/schedules/infrastructure/live-schedule.integration.test.ts](../../worker/features/schedules/infrastructure/live-schedule.integration.test.ts) | Workerd | 유지 | concurrent empty-day collection creates only one schedule and links its log; fills an empty title, preserving time under concurrent requests |
| [worker/features/schedules/infrastructure/live-schedule.test.ts](../../worker/features/schedules/infrastructure/live-schedule.test.ts) | Node/Vitest | 유지 | 시간 미정 방송 스케쥴에 라이브 제목과 시작 시간을 채운다; 기존 미정 상태 스케쥴도 방송 스케쥴로 보정할 대상으로 잡는다 |
| [worker/features/schedules/infrastructure/public-schedule-write-policy.test.ts](../../worker/features/schedules/infrastructure/public-schedule-write-policy.test.ts) | Node/Vitest | 유지 | 종료 이후 일정과 이동 전 원본의 일반 회원 변경을 거부한다; 현재 제품 정책에 따라 익명 일정 쓰기를 명시적으로 허용한다 |
| [worker/features/schedules/infrastructure/schedule-policy.test.ts](../../worker/features/schedules/infrastructure/schedule-policy.test.ts) | Node/Vitest | 유지 | 11월 15일까지 표시하고 이후 빈 일정에서는 제외한다; 종료 이후에도 저장된 일정은 멤버와 함께 공개한다 |

### worker/features/seo

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/seo/application/site-content-service.test.ts](../../worker/features/seo/application/site-content-service.test.ts) | Node/Vitest | 유지 | serves static rights without reading historical access revisions; 종료 이후 예외 일정이 있는 날짜만 주간 공개 콘텐츠에 포함한다 |
| [worker/features/seo/application/site-seo-service.test.ts](../../worker/features/seo/application/site-seo-service.test.ts) | Node/Vitest | 유지 | keeps member-only catalog data out of anonymous SEO even with navigation enabled; includes only public feed and active profiles in a deduplicated sitemap |
| [worker/features/seo/http/handler.integration.test.ts](../../worker/features/seo/http/handler.integration.test.ts) | Workerd | 유지 | serves %s as a noindex application route; rewrites feed metadata from public settings |
| [worker/features/seo/http/site-content-handler.integration.test.ts](../../worker/features/seo/http/site-content-handler.integration.test.ts) | Workerd | 유지 | sends readable body and safely serialized data without relying on JavaScript; rejects invalid query %s |
| [worker/features/seo/infrastructure/site-content-cache.test.ts](../../worker/features/seo/infrastructure/site-content-cache.test.ts) | Node/Vitest | 유지 | isolates identical path/date summaries in the shared Cache API |
| [worker/features/seo/infrastructure/site-content-storage.integration.test.ts](../../worker/features/seo/infrastructure/site-content-storage.integration.test.ts) | Workerd | 유지 | returns 503/no-store for total video failure and 200 for empty or partial sources; injects the configured LuvDia identity through the real Worker composition rather than the request host |

### worker/features/x-posts

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/x-posts/application/fx-rss-collection.test.ts](../../worker/features/x-posts/application/fx-rss-collection.test.ts) | Node/Vitest | 유지 | does_not_rescan_pending_feed and resumes the sixth candidate at the next nominal tick; checkpoints_before_first_lookup and excludes before-start, foreign, duplicate and stored IDs |
| [worker/features/x-posts/domain/handle-targets.test.ts](../../worker/features/x-posts/domain/handle-targets.test.ts) | Node/Vitest | 유지 | deduplicates handles case-insensitively; enforces handle count, format, and maxResults bounds |
| [worker/features/x-posts/domain/merge-x-post.test.ts](../../worker/features/x-posts/domain/merge-x-post.test.ts) | Node/Vitest | 유지 | retains canonical null relations when inserting a new Fx post; preserves a known %s independently when a complete Fx replay omits it |
| [worker/features/x-posts/domain/x-activity.test.ts](../../worker/features/x-posts/domain/x-activity.test.ts) | Node/Vitest | 유지 | verifies exact bytes and rejects altered bodies, signatures and CRC signing-oracle input; requires matching author/filter and a valid post identity/date |
| [worker/features/x-posts/domain/x-collection-policy.test.ts](../../worker/features/x-posts/domain/x-collection-policy.test.ts) | Node/Vitest | 유지 | does_not_gate_healthy_accounts_on_failed_peer; classifies exact age %s |
| [worker/features/x-posts/http/manual-collection-handler.test.ts](../../worker/features/x-posts/http/manual-collection-handler.test.ts) | Node/Vitest | 유지 | 수동 수집을 비동기 operation으로 접수한다; 미완료 페이지 전용 요청을 명시적으로 전달하고 잘못된 범위는 거절한다 |
| [worker/features/x-posts/http/x-activity.test.ts](../../worker/features/x-posts/http/x-activity.test.ts) | Node/Vitest | 유지 | requires admin for controls before reading input or calling the provider; rejects arbitrary handles and missing risk acknowledgement |
| [worker/features/x-posts/http/x-collection.test.ts](../../worker/features/x-posts/http/x-collection.test.ts) | Node/Vitest | 유지 | requires administrator and rejects the other site's denied identity before any status reads; returns policy failure 503 without success audit for an older peer |
| [worker/features/x-posts/http/x-history-route.test.ts](../../worker/features/x-posts/http/x-history-route.test.ts) | Node/Vitest | 유지 | requires administrator authentication; passes stable cursor and filters and disables caching |
| [worker/features/x-posts/http/x-posts-route.test.ts](../../worker/features/x-posts/http/x-posts-route.test.ts) | Node/Vitest | 유지 | case-insensitive duplicates are authorized once without refresh; rejects unapproved and oversized handle targets |
| [worker/features/x-posts/infrastructure/fx-api.test.ts](../../worker/features/x-posts/infrastructure/fx-api.test.ts) | Node/Vitest | 유지 | reads the trusted numeric account without depending on provider handle resolution; validates the trusted numeric ID before sending a provider request |
| [worker/features/x-posts/infrastructure/fx-collection-queue.integration.test.ts](../../worker/features/x-posts/infrastructure/fx-collection-queue.integration.test.ts) | Workerd | 유지 | completes a multi-account Fx run within Free D1 limits and fills reply previews on replay |
| [worker/features/x-posts/infrastructure/fx-collection.integration.test.ts](../../worker/features/x-posts/infrastructure/fx-collection.integration.test.ts) | Workerd | 경계 유지·격리/대기 보완 | recovers an interrupted handle lookup through the pinned ID and durable cursor; retains the acknowledged head and pending cursor when the pinned provider still returns 404 |
| [worker/features/x-posts/infrastructure/fx-rss-api.integration.test.ts](../../worker/features/x-posts/infrastructure/fx-rss-api.integration.test.ts) | Workerd | 유지 | imports the actual XML parser in Workerd and reads CDATA, namespaces and escaped URLs; rejects valid DTD declarations and external/custom entities in Workerd |
| [worker/features/x-posts/infrastructure/fx-rss-api.test.ts](../../worker/features/x-posts/infrastructure/fx-rss-api.test.ts) | Node/Vitest | 유지 | filters_context_and_deduplicates_guid; preserves raw counts when a valid 200 feed shrinks from 100 to 35 |
| [worker/features/x-posts/infrastructure/fx-rss-collection.integration.test.ts](../../worker/features/x-posts/infrastructure/fx-rss-collection.integration.test.ts) | Workerd | 경계 유지·격리/대기 보완 | stores RSS after normal Fx-only bootstrap without initializing official identity or cursor; rss_success_does_not_repair_json_or_official_clock and resumes a terminal partial without scanning |
| [worker/features/x-posts/infrastructure/link-preview.test.ts](../../worker/features/x-posts/infrastructure/link-preview.test.ts) | Node/Vitest | 유지 | X URL entity 메타데이터가 있으면 외부 fetch 없이 프리뷰를 만든다; HTML 메타 태그에서 제목, 설명, 사이트명, 상대 이미지 URL을 파싱한다 |
| [worker/features/x-posts/infrastructure/rss-d1-budget.test.ts](../../worker/features/x-posts/infrastructure/rss-d1-budget.test.ts) | Node/Vitest | 유지 | only limits observed RSS conflicts and counts failed, batch, session and exec execution |
| [worker/features/x-posts/infrastructure/x-activity.integration.test.ts](../../worker/features/x-posts/infrastructure/x-activity.integration.test.ts) | Workerd | 경계 유지·격리/대기 보완 | keeps quote replies through their recovery lifetime without scanning retained history; returns a quote receipt body only to its owning site and suppresses it after redaction |
| [worker/features/x-posts/infrastructure/x-api-cost.test.ts](../../worker/features/x-posts/infrastructure/x-api-cost.test.ts) | Node/Vitest | 유지 | normalizes the shared daily-budget setting %s; charges batched Post lookups for Post resources only |
| [worker/features/x-posts/infrastructure/x-collection-status.integration.test.ts](../../worker/features/x-posts/infrastructure/x-collection-status.integration.test.ts) | Workerd | 유지 | fails the status request once when D1 fails after a successful webhook status read; counts unique first saves in the rolling day for active members, independently of the archive index |
| [worker/features/x-posts/infrastructure/x-collection.test.ts](../../worker/features/x-posts/infrastructure/x-collection.test.ts) | Node/Vitest | 유지 | does not use a cadence state whose actual completion is still in the future; uses the scheduled anchor at the %sh boundary while retaining actual completion |
| [worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts](../../worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts) | Workerd | 유지 | compares the stored revision atomically when confirming a new request (token=%s); uses newly stored Fx posts as boundaries when opening the next queued ranges |
| [worker/features/x-posts/infrastructure/x-post-merge.integration.test.ts](../../worker/features/x-posts/infrastructure/x-post-merge.integration.test.ts) | Workerd | 유지 | treats raw protected Fx replays as one-call no-ops but commits authority upgrades and NULL hash repairs; does not reinterpret an explicit protected Fx relation change as omission preserving the old public target |
| [worker/features/x-posts/infrastructure/x-redaction.test.ts](../../worker/features/x-posts/infrastructure/x-redaction.test.ts) | Node/Vitest | 유지 | heals the facts tombstone on an idempotent retry; does not create a facts tombstone for an unknown post |
| [worker/features/x-posts/infrastructure/x-reference-health-read-model.integration.test.ts](../../worker/features/x-posts/infrastructure/x-reference-health-read-model.integration.test.ts) | Workerd | 유지 | keeps exact accumulated totals while avoiding repeated reference/post reads; does not join settled quote history when it contributes no health stage |
| [worker/features/x-posts/infrastructure/x-reference-hydration.integration.test.ts](../../worker/features/x-posts/infrastructure/x-reference-hydration.integration.test.ts) | Workerd | 유지 | ignores reply-only post and author backlog without reserving budget or retrying; advances the official cursor and uses free reply originals without purchasing posts or authors |
| [worker/features/x-posts/infrastructure/x-rss-official-hydration.integration.test.ts](../../worker/features/x-posts/infrastructure/x-rss-official-hydration.integration.test.ts) | Workerd | 유지 | keeps RSS 404 retry bounded through the complete Queue entry (persistent=%s); known_lookup_is_not_timeline_completion |
| [worker/features/x-posts/infrastructure/x-scan-cost.integration.test.ts](../../worker/features/x-posts/infrastructure/x-scan-cost.integration.test.ts) | Workerd | 유지 | seeds only incomplete repairs when upgrading populated history; does not rescan completed history when repairs and hydration have no work |
| [worker/features/x-posts/infrastructure/x-stored-feed.integration.test.ts](../../worker/features/x-posts/infrastructure/x-stored-feed.integration.test.ts) | Workerd | 유지 | RSS HTTP success cannot refresh the public feed or repair the official error; uses Fx success only for public freshness while retaining the official cursor and errors |
| [worker/features/x-posts/x-posts.test.ts](../../worker/features/x-posts/x-posts.test.ts) | Node/Vitest | 유지 | timeline 응답을 게시글 카드 데이터로 정규화한다; 사용자 조회 후 handle별 최신 게시글을 가져온다 |

### worker/features/youtube

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/features/youtube/domain/channel-targets.test.ts](../../worker/features/youtube/domain/channel-targets.test.ts) | Node/Vitest | 유지 | accepts valid channel ids and removes exact duplicates; enforces target count, format, and maxResults bounds |
| [worker/features/youtube/domain/short-classification.test.ts](../../worker/features/youtube/domain/short-classification.test.ts) | Node/Vitest | 유지 | duration=%s title=%s => %s; does not classify extended videos published before the product cutoff |
| [worker/features/youtube/domain/shorts-cursor.test.ts](../../worker/features/youtube/domain/shorts-cursor.test.ts) | Node/Vitest | 유지 | round-trips with order-independent channel fingerprints; rejects malformed and cross-channel cursors |
| [worker/features/youtube/http/kirinuki.test.ts](../../worker/features/youtube/http/kirinuki.test.ts) | Node/Vitest | 유지 | retains names and public caching, without an external API key; rejects oversized requests before reading channels or storage |
| [worker/features/youtube/http/youtube.test.ts](../../worker/features/youtube/http/youtube.test.ts) | Node/Vitest | 유지 | serves stored videos without an API key, and marks old retained metadata stale; empty storage is a known empty response, never a legacy fallback |
| [worker/features/youtube/infrastructure/d1-youtube-feed-status.test.ts](../../worker/features/youtube/infrastructure/d1-youtube-feed-status.test.ts) | Node/Vitest | 유지 | keeps failure, initialization, pause, due, 2h delay and unknown distinct |
| [worker/features/youtube/infrastructure/public-read-cost.integration.test.ts](../../worker/features/youtube/infrastructure/public-read-cost.integration.test.ts) | Workerd | 유지 | keeps API and summary reads bounded by the public page, including an empty Shorts kind; seeks mixed-case X handles without reading the old timeline |
| [worker/features/youtube/infrastructure/youtube-feed.integration.test.ts](../../worker/features/youtube/infrastructure/youtube-feed.integration.test.ts) | Workerd | 유지 | does not rewind an old YouTube slot after latest %s progress; keeps actual source timestamps and anchors only %s feed cadence |
| [worker/features/youtube/infrastructure/youtube-feed.test.ts](../../worker/features/youtube/infrastructure/youtube-feed.test.ts) | Node/Vitest | 유지 | keeps a global page refreshing while any source frontier can contain a newer item; finalizes a full page after every active frontier passes its boundary |
| [worker/features/youtube/infrastructure/youtube-quota.integration.test.ts](../../worker/features/youtube/infrastructure/youtube-quota.integration.test.ts) | Workerd | 유지 | low 70%, core 85%, critical 100% 우선순위 경계를 한 원장에 적용한다; canonical quota 설정만 사용한다 |
| [worker/features/youtube/infrastructure/youtube-quota.test.ts](../../worker/features/youtube/infrastructure/youtube-quota.test.ts) | Node/Vitest | 유지 | PDT 자정에서 새 일일 quota window를 시작한다; PST 기간에는 UTC-8 자정을 사용한다 |

### worker/platform

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/platform/auth.test.ts](../../worker/platform/auth.test.ts) | Node/Vitest | 유지 | fails closed when configured JWKS or publishable app disagrees with the issuer; accepts only the selected app issuer, authorized origin and explicit administrator ID |
| [worker/platform/http-helpers.test.ts](../../worker/platform/http-helpers.test.ts) | Node/Vitest | 유지 | ignores client-supplied actor headers; uses a verified authenticated user for audit identity |
| [worker/platform/http/json.test.ts](../../worker/platform/http/json.test.ts) | Node/Vitest | 유지 | returns a 400 response for malformed JSON; returns a typed value for valid JSON |
| [worker/platform/scheduled-jobs/d1-scheduled-job-repository.integration.test.ts](../../worker/platform/scheduled-jobs/d1-scheduled-job-repository.integration.test.ts) | Workerd | 유지 | batches ten reconciliation failures with snapshot fencing and atomic rollback=%s; does not refresh a retried %s run from an older completion |
| [worker/platform/scheduled-jobs/job-policy.test.ts](../../worker/platform/scheduled-jobs/job-policy.test.ts) | Node/Vitest | 유지 | 70/85/95 percent 단계에 맞춰 낮은 우선순위부터 중단한다; 모든 job item에 양수 D1 read/write 예약량을 둔다 |
| [worker/platform/scheduled-jobs/scheduled-run-client.test.ts](../../worker/platform/scheduled-jobs/scheduled-run-client.test.ts) | Node/Vitest | 유지 | control Queue 전송 실패를 실패한 run으로 영속화한다; 동일 idempotency key의 %s run은 retry 전이 후 다시 enqueue한다 |
| [worker/platform/scheduled-jobs/x-collection-run-read-model.test.ts](../../worker/platform/scheduled-jobs/x-collection-run-read-model.test.ts) | Node/Vitest | 유지 | preserves the bounded check scope and limit in run history; preserves actual RSS partial evidence and paid lookups |
| [worker/platform/site.test.ts](../../worker/platform/site.test.ts) | Node/Vitest | 유지 | requires explicit selection and a resolved LuvDia origin; rejects absent, cross-site, ambiguous queue names and unsafe Analytics identifiers |

### worker/test-support

| 파일 | 실행 경계 | 판단 | 대표 보호 동작 |
| --- | --- | --- | --- |
| [worker/test-support/d1-meter.test.ts](../../worker/test-support/d1-meter.test.ts) | Node/Vitest | 유지 | counts one D1 binding call for a transactional batch while retaining every statement's rows; counts failed batches and session/exec methods, and refuses before executing beyond its cap |

## 새 테스트 파일의 소유 위치

| 파일 | 대표 보호 동작 |
| --- | --- |
| [src/features/audit/api/audit.test.ts](../../src/features/audit/api/audit.test.ts) | reads the first audit-log page without caching |
| [src/features/configuration/api/settings.test.ts](../../src/features/configuration/api/settings.test.ts) | reads settings without caching |
| [src/features/ddays/api/ddays.test.ts](../../src/features/ddays/api/ddays.test.ts) | reads uncached D-Days |
| [src/features/member-posts/api/member-posts-api.test.ts](../../src/features/member-posts/api/member-posts-api.test.ts) | member-post aggregate API는 요청 소스와 페이지 크기를 조합한다 |
| [src/features/members/api/members.test.ts](../../src/features/members/api/members.test.ts) | 활성 멤버만 필터링한다 |
| [src/features/notices/api/notices.test.ts](../../src/features/notices/api/notices.test.ts) | reads active notices |
| [src/features/otw-play/ui/admin/catalog-manager-operations.test.ts](../../src/features/otw-play/ui/admin/catalog-manager-operations.test.ts) | loads source health only after section entry and distinguishes retryable outages |
| [src/features/otw-play/ui/admin/catalog-manager-registration.test.ts](../../src/features/otw-play/ui/admin/catalog-manager-registration.test.ts) | registers a clip directly without enabling collection and preserves unknown broadcast metadata |
| [src/features/otw-play/ui/admin/catalog-manager-review.test.ts](../../src/features/otw-play/ui/admin/catalog-manager-review.test.ts) | protects actual proposal edits and clears protection when values are restored |
| [src/features/schedule-board/api/schedule-board.test.ts](../../src/features/schedule-board/api/schedule-board.test.ts) | requests the board date range without caching |
| [src/features/schedules/api/schedules.test.ts](../../src/features/schedules/api/schedules.test.ts) | reads schedules by date |
| [src/features/youtube/api/kirinuki.test.ts](../../src/features/youtube/api/kirinuki.test.ts) | requests kirinuki videos with the result limit |
| [src/features/youtube/api/youtube-feed.test.ts](../../src/features/youtube/api/youtube-feed.test.ts) | YouTube feed status is a no-store admin snapshot |
