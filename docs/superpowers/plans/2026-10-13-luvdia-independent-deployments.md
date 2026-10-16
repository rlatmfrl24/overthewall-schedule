# SUL-36 Independent Site Deployments Implementation Plan

**2026-10-15 현행 우선 정책:** [실제 초기 서비스 개통 목표와 실행 기록](../../reports/sul-36/initial-service-launch.md)이 아래와 충돌하는 이전 조건을 대체한다. 10월 17일 KST 이내 개통을 우선하고 필수 원격 자원·초기 복사·Clerk/도메인·최초 수동 배포가 허용됐다. OTW 중단은 가능하며 Task 4.4 전체·실시간 인계·모든 자동화는 개통 선행 조건에서 제외한다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 기능과 접근·저장 계약을 유지하며 OTW/LuvDia의 배포·데이터·회원·작업 처리를 독립적으로 운영한다.

**Architecture:** 하나의 공통 소스·스키마를 사이트별 공개 정의와 두 Wrangler config로 빌드한다. 각 Worker는 자기 D1/R2/Queue/Workflow와 별도 Clerk 앱을 사용한다. 요청 host로 테넌트를 선택하지 않는다.

**Tech Stack:** Node.js 24.20.0, pnpm 11.7.0, TypeScript 5.8, React/Vite, Cloudflare Worker/D1/R2/Queues/Workflows/Analytics Engine, Clerk, 기존 Drizzle/Vitest/tsx.

**Spec:** [상세 설계·추가 결정표](../specs/2026-10-13-luvdia-independent-deployments-design.md)

**실행 준비 점검:** [2026-10-14 전수 점검](../../reports/sul-36/pre-implementation-review.md). 정책은 확정됐지만 변경 포착·소유권 인계·관계/작성자 변환의 상세안과 실제 환경 입력은 미완료다. 아래는 보완된 작업 계획이며 즉시 실행 가능한 상태라는 판정이 아니다.

**상태:** 2026-10-14 사용자 지시에 따라 **코드 구현과 로컬 검증 진행 중**. 도메인은 사용자가 등록 후 제공한다. 도메인이 필요한 작업·운영 자원 준비·운영 데이터 이관·배포는 실행하지 않는다. 아래 checkbox는 실제 검증 증거가 있는 항목만 완료로 갱신하며, 로컬 구현의 통과를 운영 전환 완료로 처리하지 않는다.

## 2026-10-15 정책 변경과 남은 작업

사용자가 **준비 완료까지 OTW 정상 운영 → 최종 쓰기·수집 점검 → 일관된 최종 복사·검증 → 독립 운영**으로 확정 변경했다. [현행 설계](../specs/2026-10-13-luvdia-independent-deployments-design.md#2026-10-15-확정-변경-점검-전환-정책)와 [결정96](../../reports/sul-36/implementation-rulings.md)이 아래의 이전 무중단 요구·검증 문구보다 우선한다. 현재 작업자와 WIP를 보존하고, 별도 승인 요청 없이 허용된 코드·로컬 검증을 계속한다.

- 재사용: 사이트별 자원·인증·배포 경계, 관리자 보관·출처·파일 보호, 원래 서비스/API/Queue/Workflow, source capture·원자 permit/fence, 저장 응답·미확인 증거와 기존 이관 도구.
- 생략: 최종 정지 중 신규 target 접수·양쪽 업무 병행, 실행 중 source 작업의 실시간 분배만을 위한 추가 continuation 및 동등 검증 행렬. 알려진 미발행 AI의 관리자 확인 재개 정책 자체는 생략하지 않는다.
- Task4.4 최소 수정: 기존 진입점과 실제 업무·파일 저장 경계의 점검 제어, 기존 실행의 안전한 정리/보류 및 늦은 쓰기 차단, truthful 점검 응답, 수집 cursor/due 보존, 확인된 source-current AI ACK 실패 등 실제 필수 결함.
- Task4.5: 정지 proof를 요구하는 최종 복사·검증 도구, source 보존·새 쓰기 전 안전 재개·새 쓰기 후 데이터 보존 복구 리허설. 이관 책임 정리와 임시 binding 제거 뒤 양쪽 독립 조회·저장·수집·재시도도 실제 격리 경로에서 검증한다.
- Task5: 최종 양 사이트 schema/doctor·설정·CI·배포 guard와 임시 binding 제거 산출물 검증. 실제 자원·도메인·로그인·provider·운영 증거의 미실행은 별도로 남긴다.

점검 시간은 실제 데이터 규모와 리허설로 복사·검증·복귀를 나누어 측정한다. 지금은 미측정이다. 운영 중단·원격 쓰기·운영 이관·배포·push/merge는 실행하지 않는다. 이전 PASS는 영향이 없으면 재사용하고 전체 검사/preflight는 매 단계 반복하지 않는다.

### 추가 완료 조건97의 통합

사용자가 지정한 정리 후보를 현재 작업에 통합한다.13:40 snapshot 보고서 `.tmp/sul36-downtime-prune-review/report.md`와 최신 코드를 재대조해 **14 writer의 신규 접수 전용 분기, 옛 테스트5개, 구형 이관 codec3개, 로컬 인계 뒤 불필요 peer/relay/ACK/전용 타입**의 삭제·교체·유지를 항목별로 기록한다. 정상 `/api/schedules/save`와 기존 receipt/재시도/권한/원자성/한 번 실행·미확인 증거는 유지한다.

Task4.4에서 해당 호출자·기능 연결과 필요한 정리를 통합하며4.5가 최종 복사/리허설과 정리된 코드의 실제 양쪽 독립 검증을 완성한다. Task5는 최종 config/CI/schema 산출물을 소비한다. Task4.4의 실제 기능·안전성 결함을 뒤 단계로 미루지 않는다. 테스트5개는 점검 거부/무접수/불변/owner 뒤 정상 저장으로 교체하고 무영향 권한·충돌·원자성 증거는 재사용한다. binding 제거·상대 Worker/DB 차단 뒤 **양쪽 조회·저장·수집·Queue·Workflow·재시도·관리자 복구**를 실제 경로/readback으로 확인하기 전 전체 완료하지 않는다.

후보 보고서의 예상61줄은 gross 후보값이며 실제 순감소량이나 완료율이 아니다. 보존 envelope·적용 migration 상태를 확인하지 않고 codec/이력을 삭제하지 않는다. 실제 로그인/provider/운영 미실행과 잔여 위험을 명시한다. 별도 후속 청소·작업 재시작·새 플랫폼·반복 전체 검사 없이 기존 작업자/WIP를 유지한다.

## Global Constraints

- 확정 사항: 공통 코드, 두 사이트 지속 운영, 전체 기능 유지, 로그인·회원 분리. LuvDia 대상은 빙하유·유리리·양메이만이며 과거 일정·전체 콘텐츠도 이관하고 신규 자료는 LuvDia에서만 관리한다. OTW 원본은 관리자만 열람한다. 개인 playlist·일반 회원 계정 연결 데이터는 OTW에 유지한다.
- 사이트 ID는 `otw`와 `luvdia`. Node.js는 `>=24.20.0 <25`, pnpm은 `11.7.0`. 의존성 추가 없음.
- LuvDia 사이트 표시명은 `LuvDia Schedule`, 음악 기능 이름은 `LuvDia Play`. 사용자 화면·SEO·내보내기는 이 이름과 비공식 팬 운영 고지를 사용한다.
- Cloudflare 계정은 기존 OTW 계정을 공유하며 Worker/D1/R2/Queue/Workflow/dataset/rate-limit 자원은 전부 분리한다. 계정 ID가 같다는 이유로 격리 검사에서 실패시키거나 각 DB guard를 계정 합산 예산으로 간주하지 않는다.
- 운영자는 기존 OTW 운영진을 유지한다. 외부 API 프로젝트/계정은 공유하고 가능한 키는 사이트별 분리하며, 새 Clerk 사용자 ID에 관리자 권한을 개별 부여한다. provider 한도는 키 개수가 아니라 프로젝트/계정 합산으로 적용한다.
- 정상 운영은 검증된 `master` 병합 후 사이트별 독립 pipeline의 자동 배포다. 최초 이관/공개 전환과 데이터/schema 적용은 별도 검증·실행 지시가 필요하며 merge 성공만으로 완료 처리하지 않는다.
- 목표 공개 시각은 `2026-10-18 11:00 Asia/Seoul`이다. 도메인 미정·구현 진행 중 상태에서 달성을 보장하지 않으며, 필요 입력/실제 데이터 규모/검증을 확인해 일정 위험을 다시 평가한다. 마감 때문에 기능·권한·이관 검증을 생략하지 않는다.
- 준비 동안 OTW를 정상 운영하고 최종 복사 때만 업무 쓰기·수집과 실제 비동기 변경 경로를 점검 제어한다. 일관된 정지 proof와 복사 readback 뒤 LuvDia 쓰기를 연다. 이전 실시간 인계 필수 조건은 해제하며 정상 운영에 상대 Worker/DB 호출·상시 동기화를 남기지 않는다.
- UI·HTTP·application/domain·infrastructure의 기존 경계를 보존하며 공유 계약은 env·host·D1을 읽지 않는다.
- 기존 API 경로·핵심 payload·논리 binding, 회원 Play/admin clip 제한, 검수·명시적 게시·동시성·idempotency를 유지한다. 확정된 관리자 보관 상태는 schema/공유 DTO에 명시하고 소비자를 함께 갱신한다.
- OTW 과거 데이터는 보존한다. D07에 따라 전환 시 세 사람의 신규 수집·자동 갱신 주체를 LuvDia로 인계하며 다른 소스·설정은 유지한다. 과거 migration 수정·가공 applied 기록 금지.
- full 기능 유지가 모든 수집/공개 flag 자동 활성화를 뜻하지 않는다. 새 사이트의 수집·공개는 검증 후 승인 정책대로 활성화한다.
- 초기 자동 수집은 세 사람에 대한 기존 OTW 소스·주기를 승계하며 새 소스 추가·주기 확대는 추후 결정한다. 기존 게시·공개/회원/admin 접근 제한을 유지한다.
- 비용은 기존 계약·합산 한도를 우선 사용하며 추가 비용·요금제 변경은 실제 비용 확인 후 별도 결정한다. 별도 Clerk와 이관 중 일시적 추가 사용량까지 확인하고 사이트별 예산을 배분한다.
- 목표 시각까지 전체 기능·이관·권한·점검 전환/복구 검증이 미완료면 LuvDia 공개를 연기한다. 최종 점검에 들어가기 전까지 OTW를 정상 운영한다.
- 최초 이관은 현재 보유한 대상 자료 전체다. 이미 없는 과거 자료 복구는 후속 결정이며 현존·cache·만료/삭제·범위 분류 대기 자료를 manifest에서 구분한다.
- 접수된 저장 요청은 완료/인계하여 누락시키지 않는다. 전환 후 새 일정·자료 편집은 LuvDia 로그인으로 진행하며 OTW 로그인·편집 세션을 자동 승계하지 않는다.
- 구현 작업은 배포 단위가 아니다. Task 1–5의 부분 적응 상태를 LuvDia 운영 완료로 발표·배포하지 않는다.
- production 자원/회원 데이터 변경은 명시적 실행 범위에 포함되어야 한다. 이번 문서는 그 실행 권한을 주지 않는다.

## Review Focus

1. OTW 산출물·Clerk key를 LuvDia 대상으로 배포하려는 경우 명령이 쓰기 전에 실패해야 함 — Task 1·5.
2. LuvDia 물리 Queue/DLQ 및 알 수 없는 Queue에서 message가 처리 없이 ACK되지 않아야 함 — Task 3.
3. 별도 Clerk 앱의 token·old user ID와 migration된 개인 데이터가 권한/소유권을 승계하지 않아야 함 — Task 3·4.
4. snapshot·JSON-LD·cache·Analytics 읽기에 OTW domain/dataset이 남거나 상대 사이트 데이터가 섞이지 않아야 함 — Task 2·3.
5. 빈 DB bootstrap·이관의 공동 참여/JSON 참조·중복 실행 상태·옛 Worker rollback이 데이터 무결성을 깨뜨리지 않아야 함 — Task 4·7.

## 준비와 작업 의존성

설계안 D01–D08와 최신 점검 전환 정책은 확정되었다. 남은 입력은 D02의 도메인, D03의 실제 자원 ID, D05의 새 관리자 ID/키·provider 한도, D07/D08의 기존 실제 수집 설정과 예산 배분이다. Task4는 실제 변경 경로의 정지·작업 보존·최종 복사·checkpoint/due와 복구를 검증한다. 임의 domain·fake resource ID·OTW fallback을 넣어 production 검사를 통과시키지 않는다. 준비되지 않은 LuvDia production build/deploy는 실패하는 것이 정상이다.

기존 outbox/감사의 불완전성을 보완한 전환 저널·소유권 검사·복사 cursor·source checkpoint는 재사용한다. 최종 복사는 실제 변경이 멈춘 일관된 상태를 요구하며, 원본·목적지 D1·R2의 분산 원자성을 가정하지 않는다. 미완료 책임의 보존과 재개는 실제 원래 흐름으로 증명하고 실시간 Worker 간 이전을 전제로 추가 확장하지 않는다.

| 환경 검증 | 실제 입력 준비 순서 | 경계 |
| --- | --- | --- |
| Task 1/3 development 로그인·관리자 저장 | 해당 검증 전에 새 Clerk development와 site별 local env/origin 준비 | site별 port·process·D1/R2 사용. 운영 R2 remote binding 사용 금지 |
| Task 5 코드/guard 검증 | local 입력과 부정 조합 fixture로 검사 | production build/dry-run에 필요한 실제 값이 없으면 해당 검증을 Task 6으로 넘기고 미완료로 기록 |
| 실제 Cron/Queue·이관 rehearsal | 승인된 환경 준비 범위에서 별도 Worker/D1/R2/Queue/Workflow·검증 인증 준비 후 | 운영 작업/자료와 격리. Preview HTTP만으로 대체하지 않음 |
| Task 6 production build/doctor/dry-run·비공개 smoke | 실제 domain·Clerk production·resource ID·secrets 준비 후 | domain·workers.dev·preview alias·asset의 접근 통제와 실제 readback |

development/검증 자원 준비를 production provisioning 완료의 뒤로 미루지 않는다. 이 환경 작업도 구현/운영 지시 범위에서 수행하며 현재는 실행하지 않는다. 별도 검증 자원은 기존 계약·비용 정책에 포함하고 필요한 검증 뒤 정리 조건을 기록한다.

순서: **점검 전환 영향·필수 입력 검토 → 1 대상·빌드 경계 → 2 UI/SEO → 3 runtime 격리 → 4 migration/이관 → 5 배포·검사 → 6 승인된 자원 설정 → 7 실제 검증·공개**. 공유 engine 변경은 양 사이트에 도달하도록 같은 branch에서 완성한다. 예상 일수·비용은 실제 데이터 규모·계정 정보·복사/검증/복귀 리허설 없이 추정하지 않는다.

## 파일 책임

아래 신규 경로는 구현 시 생성할 **제안**이며 현재 파일이 존재한다는 뜻이 아니다. 실제 신규 자원 ID·도메인·계정 값은 결정과 provisioning readback 후 넣는다.

| 책임 | 신규 파일 제안 | 변경할 기존 경계 |
| --- | --- | --- |
| 공개 정의·사이트 선택 | `contracts/site-definition.ts`, `src/shared/config/site.ts`, `scripts/site-target.mjs`, `scripts/site-target.d.mts`, `scripts/build-site.mjs` | `vite.config.ts`, `src/vite-env.d.ts`, `src/main.tsx`, `package.json`, `scripts/local-dev-config.mjs`, `scripts/dev-restart.mjs`, env 예제·선택 규칙 |
| 물리 자원·runtime 해석 | `wrangler.luvdia.jsonc`, `worker/platform/site.ts` | `wrangler.jsonc`, `worker/platform/types.ts`, `worker/index.ts`, `worker/app/*` composition, `cf-typegen`으로 생성하는 `worker-configuration.d.ts` |
| 공개 브랜드·SEO | 별도 페이지/컴포넌트 복사 없음 | `contracts/site-seo.ts`, `contracts/site-public-content.ts`, `src/app/layout/*`, `src/shared/seo/*`, `src/shared/lib/site-rights.ts`, `src/features/rights/ui/rights-page.tsx`, `src/features/schedule-board/ui/daily/snapshot/*`, `worker/features/seo/*`, `scripts/generate-seo-assets.ts`, `index.html`, `public/robots.txt` |
| 이관 | `scripts/prepare-luvdia-data.mjs`, `scripts/import-luvdia-data.mjs` | 기존 doctor/reset/seed/migration·파일 업로드 도구. 변경이 필요할 때만 새 migration 생성 |
| OTW 관리자 보관 경계 | 임의 공용 필터로 대체하지 않음 | `db/schema/index.ts`, `contracts/members.ts`, 해당 일정/멤버/공지/미디어/feed/Play reader·API·SEO·cache·관리자 조회와 새 Drizzle migration |
| 최종 점검·자료 이관 | 기존 capture/permit/fence/receipt 재사용. 실제 정지 뒤 최종 baseline·DB/파일 복사/readback | 관리자·회원/collector/Queue/Workflow/재시도/파일 변경 경로, 작업 보존·late-write 차단, checkpoint/due·안전 복귀·독립 운영 도구 |
| 배포·운영 검사 | `scripts/site-target.test.ts`, `worker/platform/site.test.ts`, `scripts/site-data-migration.test.ts` | 기존 deploy/provision/preflight/build guard와 영향을 받는 테스트 |

## Task 1: 사이트 정의와 선택·빌드 경계

**2026-10-14 진행:** 코드·허용된 로컬 범위는 `cfbd0a8d`와 경로 보호 수정 `f75dc5b6`에서 구현·검토했다. 신규 OTW 로컬 DB의 migration 101개와 정상 root/API, 포트 선택·중지 흐름을 확인했다. Windows alias·중첩/junction 경로 회귀 55개가 통과했고 기존 로컬 DB 파일 4개의 동일성을 확인했다. 별도 LuvDia development 앱이 없어 실제 LuvDia 로그인·양쪽 정상 동시 진입은 사용자 답변에 따라 설정 준비 후 검증한다. production origin/issuer·실제 산출물 검증과 후속 SEO/runtime 작업은 완료로 표시하지 않는다. 새 로컬 경로의 최소 reset/seed/doctor/migration 대상 연결은 이 단계로 앞당겼다.

**Files:** 신규 공개 정의/프런트 adapter/target/build script, `vite.config.ts`, `src/vite-env.d.ts`, `src/main.tsx`, `package.json`, `scripts/local-dev-config.mjs`, `scripts/dev-restart.mjs`, env 예제; 새 `contracts/site-definition.test.ts`, `scripts/site-target.test.ts`와 기존 Clerk/build/local-dev/restart tests.

**Interfaces:** `parseSiteId(value: string | undefined): SiteId`, `getSiteDefinition(siteId: SiteId): SiteDefinition`. `getSiteTarget(siteId: SiteId)`는 `{ siteId, configPath, outputRoot, localPersistTo }`를 반환한다. OTW config는 `wrangler.jsonc`, LuvDia는 `wrangler.luvdia.jsonc`; output은 `dist/<siteId>`, persist는 `.wrangler/state/<siteId>`. 프런트 `site` export는 `SiteDefinition`이다.

- [x] 선택 경계 실패 테스트를 먼저 작성한다. `parseSiteId(undefined)`/`parseSiteId('other')`는 throw, `getSiteTarget('luvdia').configPath`는 `wrangler.luvdia.jsonc`, 두 사이트 output/persist는 서로 다르게 assert한다.
- [x] `pnpm exec vitest run contracts/site-definition.test.ts scripts/site-target.test.ts`로 해당 실패를 확인한 뒤 순수 정의와 최소 helper를 구현한다. Node helper의 TS import는 상대 `.ts` 경로와 erasable syntax만 쓴다.
- [ ] build script에서 site 선택을 Vite config와 `VITE_SITE_ID`, SEO 생성에 전달한다. 기존 명령은 명시적 OTW alias로 유지하고 `dev:luvdia`, `build:luvdia`, `deploy:luvdia`를 같은 처리에 연결한다. 상위 env의 잘못된 site/key가 요청한 site를 덮어쓰지 못하게 한다.
- [ ] site별 local origin/port·env 파일 선택 우선순위·R2 대상을 정의한다. 로컬 D1과 운영 R2를 혼용하지 않고 restart/stop이 상대 site의 Vite를 종료하지 않는 실제 동시 개발 흐름을 확인한다.
- [ ] 산출물 manifest를 작성하고 Clerk key의 test/live 구분뿐 아니라 **해당 site의 issuer/app identity**를 검사한다. 비밀값을 출력하거나 client bundle에 넣지 않는다.
- [ ] 대상 tests·`pnpm typecheck:test`·`pnpm architecture:check`를 실행하고, 결정된 development key와 별도 로컬 상태로 기존 `pnpm dev`와 새 `pnpm dev:luvdia`의 정상 진입을 검증한다. 정책/자원이 미결이면 이 검증을 완료로 표시하지 않는다.
- [x] 이 작업과 소비자만 명시적으로 stage해 변경 목적·검증을 담은 commit을 만든다. 이후 작업도 같은 방식으로 범위를 지킨다.

## Task 2: 모든 UI·SEO·내보내기에 사이트 정의 전달

**코드·로컬 검증 진행 기록:** `2f2452c0`와 리뷰 수정 `65ee9ad8`로 명시적 site 입력을 UI·SEO·내보내기의 120개 조사된 caller에 연결했다. 독립 리뷰와 수정 재검토가 통과했다. OTW의 정상 home/weekly/rights 진입, Worker HTML·canonical·JSON-LD·sitemap 읽기, 메뉴를 통한 세 형식의 실제 PNG 저장을 확인했다. 누락 이미지로 저장이 실패하는 공통 문제를 수정했고 LuvDia 회원 안내에 남은 OTW 문구도 회귀 테스트와 함께 수정했다. 최초 affected unit 실행의 1건 timeout은 기록을 보존했으며 동일 파일은 기본 timeout으로 재실행 통과했다. Worker 38개·SEO 25개·수정 shell 20개 테스트와 타입·lint·architecture가 통과했다. LuvDia 새 Clerk 앱이 없어 해당 실제 앱/로그인/PNG 검증은 사용자의 결정에 따라 설정 준비 후 진행한다. 실제 production build는 OTW issuer 불일치와 LuvDia origin 부재로 실패하며 통과로 기록하지 않는다.

**Files:** 파일 책임 표의 공개 브랜드·SEO 경계, `worker/app/site-seo.ts`, Play/feed/member의 SEO builder caller 전체; 기존 `src/shared/seo/site-seo-contract.test.ts`, `site-seo-navigation.test.tsx`, `scripts/generate-seo-assets.test.ts`, `scripts/wrangler-seo-config.test.ts`, `worker/features/seo/application/site-seo-service.test.ts`, `site-content-service.test.ts`, `src/features/schedule-board/ui/daily/snapshot/snapshot-output.test.ts`.

**Interfaces:** 기존 SEO builder의 마지막 인자로 `site: SiteDefinition`을 필수 전달. `resolveSiteSeo(rawPath, site)`, `toSiteUrl(path, site)`, `buildStaticSitemapUrls(site)`. `SiteSeoService(reader, site)`, `SiteContentService(seoReader, reader, site, cache?)`. `safeSiteContentUrl(value, site)`도 같은 origin을 사용하며 현재 URL 안전 검증을 유지한다.

- [x] 같은 `/weekly` 입력에서 canonical origin·title이 각 site 정의와 일치하고, 회원 Play/비공개 feed가 sitemap·JSON-LD에 노출되지 않는 실패 테스트를 추가한다.
- [x] 모든 `SITE_ORIGIN`, `SITE_NAME`, `resolveSiteSeo`, `toSiteUrl` caller를 검색해 signature·fixtures·exports를 같이 바꾼다. Node·Worker·React가 동일한 정의를 받게 한다.
- [x] 로고·aria/alt·footer·권리 안내·Cafe 링크와 모든 snapshot의 domain 표시를 갱신한다. 내부 `otw` enum/table/binding 이름은 유지하며 notice API 계약을 재해석하지 않는다.
- [x] `public/robots.txt`와 생성 HTML/404도 해당 빌드에서 생성한다. 기존 OTW 정적 파일을 그대로 복사해 LuvDia origin 검사만 생략하는 경로를 만들지 않는다.
- [ ] 위 관련 tests를 실행하고 양쪽 정상 로컬 진입 → navigation → snapshot 실제 이미지 저장 → Worker HTML/canonical 조회를 확인한다. OTW의 문구·정책은 그대로인지 비교한다.

## Task 3: 인증·Queue/DLQ·캐시·통계 격리

**코드·로컬 검증 진행 기록:** `415eb400`과 리뷰 수정 `944d9f73`로 모든 HTTP/예약/Queue/Workflow 진입에 같은 site/resource 검사를 연결했다. 알 수 없는 Queue는 ACK하지 않고 재시도·오류를 남기며, 두 사이트의 캐시와 Analytics SQL 대상이 분리된다. 인증 runtime은 누락/빈 authorized parties를 거부한다. 독립 리뷰와 두 경계 수정의 재검토가 통과했고, 최초 138 unit·40 Worker/D1·33 maintenance 검사 및 수정 범위 138 unit/maintenance·10 Worker/D1 검사가 통과했다(일부 중복 포함). 실제 OTW 세션의 관리자/회원 화면과 로컬 Workflow 완료를 확인했다. Workflow는 기존 자동 수집 비활성 상태의 진입·durable step 증거이며 활성 수집/Cron/Queue 성공 증거가 아니다. cf-typegen은 실제 selected-local OTW config에서 기존 private field metadata와 새 vars를 함께 생성했다. 기본 canonical-only 명령의 재현성 문제는 Task 5에서 영속적인 개발 절차로 보완한다. 새 LuvDia 앱/로그인·live dataset/consumer·production 검증은 보류 상태다.

**Files:** `worker/platform/site.ts`, `worker/platform/types.ts`, `worker/index.ts`, `worker/platform/auth.ts`, `worker/app/worker-queue.ts`, `queue.ts`, `scheduled-queue.ts`, `ai-review.ts`, `routes.ts`, `site-seo.ts`, `worker/features/otw-play/infrastructure/cloudflare-public-catalog-cache.ts`, `cloudflare-play-observability-reader.ts`, `worker/features/seo/infrastructure/site-content-cache.ts`, `worker/features/naver-cafe/http/handler.ts`; 위 owner tests와 `worker/app/protected-routes.test.ts`.

**Interfaces:** `getWorkerSiteResources(env: Env): { site: SiteDefinition; queues: QueueNames; analyticsDataset: string }`. `QueueNames`는 spec의 6개 role을 key로 쓰는 map이다. 기존 cache/analytics adapter는 composition root가 site/dataset을 필수 생성자 인자로 주입한다. application/domain에서 env를 읽지 않는다.

- [x] 각각의 실제 Queue 이름으로 기존 정상 dispatch/retry/DLQ가 보존되는 테스트를 추가한다. 알 수 없는 Queue는 `ack`가 호출되지 않고 retry/오류가 관측됨을 assert한다. 네 곳의 고정 DLQ 판별도 함께 검증한다.
- [x] site/Queue vars/dataset을 검사하는 platform helper를 구현하고 `fetch`, `scheduled`, `queue`, Workflow composition의 대상 선택을 맞춘다. producer/consumer 이름과 runtime map의 불일치는 배포 검사에서 거부한다.
- [x] 별도 Clerk issuer와 authorized party 조합으로 상대 token·잘못된 admin ID를 거부하는 기존 auth tests를 확장한다. 권한 검증을 느슨하게 하거나 email로 계정을 승계하지 않는다.
- [x] production issuer/JWKS/publishable key 앱 identity와 정확한 authorized origins의 일치를 배포 전에 검사한다. site/Queue vars 변경에 맞춰 `cf-typegen`을 실행하고 생성 타입 소비자를 확인한다.
- [x] 동일 path/date/catalog revision을 입력해 양 site의 cache key가 다르고 Analytics SQL은 선택한 dataset만 조회하는 tests를 추가한다. dataset 이름은 SQL 식별자로 검증한다.
- [x] `pnpm exec vitest run worker/platform/auth.test.ts worker/platform/site.test.ts worker/app/worker-queue.test.ts worker/app/queue.test.ts worker/app/scheduled-queue.test.ts worker/app/protected-routes.test.ts` 및 영향받은 cache·analytics·AI tests를 실행한다.
- [ ] 실제 별도 development 로그인과 로컬 Worker/D1의 기존 관리자·회원 동선을 확인한다. Queue tests는 실제 production Cron/Queue 검증을 대체하지 않는다.

## Task 4: 안전한 DB 구축·선택 이관·도구 대상 일치

**코드·로컬 검증 진행 기록:** 전체 이관 범위는 유지하며, ① schema·출처·원자적 변경 포착, ② 관리자 보관 접근 경계, ③ 보존·파일, ④ 저장·수집 소유권 인계, ⑤ 도구·통합 검증 순서로 구현하고 각각 리뷰한다. ①은 `944d9f73..1e886c86`, ②는 `e2a6b2f4..50ea41a9`, ③은 `e8ef5aaa..a1395bf6`의 코드·허용된 로컬 검증과 독립 리뷰를 완료했다. ③은 최초 중요4건과 수정 중 잔여·새 회귀를 실제 검증으로 해결했다. 최종 관련122건·양쪽117개 적용과 실제 OTW 화면·저장·파일 읽기를 확인했지만 전체 doctor exit1은 Task5의 열린 gate다. ④–⑤도 남아 있으므로 Task 4 전체 완료 상태가 아니다. 이전 연속 접수 계약은 결정96으로 대체했다. 준비 중 정상 OTW를 유지하고 최종 점검에서 신규 변경을 통제한 뒤 기존 작업을 안전 정리/보존한다. 실제 정지·복사/readback 뒤 target 쓰기를 열며 안전 복귀와 binding 제거 후 독립 운영이 완료 기준이다. 현재 실제 증거와 실패·재검사는 [로컬 검증 기록](../../reports/sul-36/local-implementation-verification.md)에서 갱신한다. 도메인·실제 LuvDia 로그인과 운영 이관·배포는 별도로 보류한다.

**Files:** `scripts/d1-reset-local.mjs`, `d1-doctor.mjs`, `d1-seed-local.mjs`, `d1-local-options.mjs`, `upload-profile-backgrounds-to-r2.mjs`, `package.json`, `drizzle.config.ts`; 관리자 보관을 위한 canonical schema·DTO·해당 reader/API/정적 asset 경계·새 migration; 신규 prepare/import script와 migration tests, 기존 reset/seed guard·doctor tests. 기존 쓰기 목록에서 점검·최종 정지·자료/작업 보존에 실제 필요한 경로만 연결한다. 이관 manifest·검증 SQL은 구현 시 `docs/reports/sul-36/`에 보존한다.

**Interfaces:** prepare는 확정 D01/D04/D07의 읽기 기반 선택 데이터·검토 가능한 manifest를 만들며 준비 동안 OTW를 멈추지 않는다. 최종 export/copy는 실제 점검·정지 proof를 요구한다. import는 승인 manifest·정지 증거·명시적 target으로 최종 상태를 설치하고 readback 전 새 쓰기를 닫아둔다. 신규 DB bootstrap은 기존 phased chain, local/remote target은 Task1 helper를 재사용한다. 필요한 schema 변경은 canonical schema → Drizzle generate의 새 migration으로 만들고 기존 numbered migration을 수정하지 않는다.

**확정 범위:** 현재 보유한 세 사람의 모든 과거 일정·멤버 콘텐츠·검수 자료를 이관한다. 없는 과거 자료 복구는 후속 결정이다. 개인 playlist·일반 회원 계정 연결 데이터는 OTW에 유지한다. 게시/접근 상태는 보존하고 검수 내용 이관을 새 계정의 소유권 부여나 기존 Queue/lease의 재실행으로 해석하지 않는다.

**구현 기준 보완:** 세 사람의 코드를 유일한 원본 정수 UID로 해석하고 승인 manifest에 목적지 대응을 고정한다. 원본 관리자 보관 정책은 이관 업무 이미지에서 제외하며, 공유 곡·참여자의 관계 포착을 원본의 독점 소유권으로 해석하지 않는다. 기존 실행 FK를 복제할 수 없는 검수 자료는 계정 없는 비실행 역사 자료로 정상 관리자 조회에 연결한다. 초기 이관은 기준점·승인 digest·행 수/해시에 묶인 비활성 staging과 제한된 FK 순서 적용을 사용하고 실제 전체 조회 뒤 완료 증거를 남긴다. 각 일반 변경 커밋의 재생은 원자성을 유지한다. 이 계약의 구현·검증 완료를 의미하지 않는다.

- [ ] 확정된 D04 범위와 데이터군 처리 규칙에 대해 foreign/JSON 참조 누락, mixed credits, old actor ID, 활성 lease/outbox, 중복 재실행을 잡는 작은 migration regression을 작성한다.
- [ ] 확정된 세 사람의 과거 일정·전체 콘텐츠 이관과 OTW 관리자 보관을 구현한다. canonical schema에서 명시적 자료 접근/보관 상태를 정의하고 새 Drizzle migration을 생성한다. 일반·회원 API/검색/상세/SEO/cache에서는 모든 관련 자료를 제외하고 관리자 조회는 유지하는 실제 D1 권한 회귀를 추가한다. 공동 참여·JSON 참조까지 검증하며 이관을 이유로 미게시/회원/admin 자료를 공개로 승격하지 않는다.
- [ ] 대상의 모든 쓰기/삭제·공동 관계·관리자/collector/AI 갱신 경로를 목록화한다. 원본 변경과 같은 트랜잭션의 최소 저널, baseline 기준점/적용 cursor, 범위 진입·이탈, 재개/중복 제거를 구현한다. 초기 복사 도중·마지막 확인 이후·인계 도중의 변경을 실제 D1에서 재현해 최종 상태를 비교한다. 필요한 부하/추가 writes도 공유 예산에서 검증한다.
- [ ] source별 단일 쓰기 주체·소유권 세대와 실제 저장 조건 검사를 구현한다. 이미 대기 중인 X/CHZZK 혼합 shard·지연 Queue·미완료 관리자 저장은 다른 OTW 대상을 잃지 않고 완료/인계한다. 모니터 생성/재개로 watermark를 최신화하지 않고 확정 watermark·pagination·next due·candidate identity를 검증해 승계한다.
- [ ] 영구 자료/cache/확인된 만료·삭제/외부 조회 전용/관계 미지정 자료를 manifest로 구분한다. D-day·전역 공지 등 애매한 항목은 운영자 분류를 받는다. 공동 항목의 다른 참여자를 관리 roster에 추가하지 않고 역사적 credit를 보존하며, 공유 곡의 무관한 가창을 숨기지 않는다.
- [ ] inventory의 기준 시각/원본 변경 번호를 고정하기 전에 대상 자료·파일의 운영상 TTL/registry/cleanup 보호를 활성화하는 절차를 구현한다. 의도적 삭제·redaction과 운영상 만료를 구분하고 전자는 제거 의미를 보존한다. 복사 중 만료가 보유 자료를 유실시키지 않는 회귀를 검증한다.
- [ ] 회원 제안/검수 자료의 출처와 인증상 소유권을 분리한다. 원 user ID/email을 새 사용자/관리자에게 매핑하지 않고 과거 게시·검수 상태 제약을 보존한다. OTW 내 제안의 본인 조회/수정도 관리자 보관 경계를 적용한다.
- [ ] OTW 공개 asset·R2 직접 URL, sitemap/cache/read model, 개인 playlist 참조, retention/file cleanup도 관리자 보관 정책을 따른다. 개인 playlist를 삭제하거나 콘텐츠 metadata/재생 URL을 우회 노출하지 않는다. admin 화면의 실제 이미지/파일 열람은 정상 인증 흐름으로 가능해야 한다. 정책 적용 뒤 이를 무시하는 과거 Worker로 rollback하는 경로는 거부한다.
- [ ] D07에 맞춰 과거 기록 보존과 신규 대상 선택을 분리한다. 기존 `is_deprecated`만으로 전체 콘텐츠 접근을 제어하지 않는다. live 변경분 반영과 처리 주체 인계가 완료될 때 OTW의 세 사람 대상 신규 수집을 종료하며 LuvDia는 공백 없이 이어간다.
- [ ] YouTube source registry의 DELETE/cascade·enabled 재활성화, feed TTL·source-health·파일 cleanup을 보관/소유권 규칙에 맞춘다. R2 object key/version/hash와 저널을 복구 가능 기간 동안 보호하고, 실제 다음 registry/retention 실행 뒤에도 보관 자료가 유지되는지 확인한다.
- [ ] 현재 `0030`/`0032`의 bootstrap 전제와 임시 멤버 정리를 사이트 target과 결합한다. 원본 번호 migration과 실제 apply 이력을 유지하고 bootstrap을 제품 roster로 남기지 않는다.
- [ ] doctor/reset/seed/migration/R2 upload의 config·DB·persist/bucket 대상을 통일한다. 기존 `--force`·empty DB 보호·안전한 경로 검사를 보존한다. remote initial bootstrap은 **검증된 새 빈 DB만** 받으며 기존 OTW remote reset 경로를 만들지 않는다.
- [ ] 선택 이관은 ID·관계·게시 상태·파일 참조·read model을 확인하고 이미 일부 적용된 대상에서는 전체 작업을 재실행하지 않는다. 명시적 재개/repair 또는 중단을 사용한다. 외부 콘텐츠를 다운로드해 이관하는 기능은 추가하지 않는다.
- [ ] 관련 unit/integration tests와 두 사이트의 **실제 로컬 D1 전체 migration replay**를 실행한다. 향후 target을 받도록 갱신된 reset의 `--validate-only`로 기존 local D1을 보존하고 이관 데이터 readback을 비교한다.
- [ ] 원본 OTW DB·로컬 상태가 변경되지 않았다는 대상/건수 증거를 남긴다. remote export/import는 Task 6의 별도 승인된 실행 범위다.

## Task 5: 배포·CI·검사 절차를 사이트별로 연결

**Files:** `scripts/deploy-workers.mjs`, `client-build-deploy-guard.mjs`, `provision-ops-queues.mjs`, `preflight.mjs`, `generate-seo-assets.ts`, `package.json`, `vite.config.ts`, Wrangler configs; 기존 guard tests와 신규 target tests. 운영 절차는 검토/승인 뒤 관련 운영 문서에 반영한다.

**Interfaces:** deploy/doctor/migrations/provision/build가 Task 1의 동일 target을 사용한다. manifest의 `siteId/gitCommit/publicOrigin/workerName/configHash/clerkIssuer`와 실제 생성 config/산출물이 일치해야 한다. config의 D1 binding ID와 REST 관측 DB ID도 같아야 한다.

- [ ] 다른 site manifest·Clerk key, 오래된 build/config hash, 누락된 target, Queue 이름 충돌, 동일 rate-limit namespace 등 잘못된 조합은 외부 write/spawn 전에 실패하는 테스트를 작성한다.
- [ ] 새 config는 기존 모든 entry point·binding·Queue retry/concurrency·placement·routing 정책을 보존하되 물리 자원과 site vars를 분리한다. 미확정 production ID는 실제 provisioning readback으로 채우기 전 배포 가능 상태로 표시하지 않는다.
- [ ] deploy의 `--config`는 검증한 해당 산출물의 생성 Worker config를 가리키게 한다. 직전 빌드가 남긴 공용 `.wrangler/deploy/config.json` redirect에 의존해 상대 사이트 빌드를 배포하지 않는다. 양 사이트를 연속 빌드한 경우도 guard test에 포함한다.
- [ ] `preflight`는 공통 code/tests를 한 번 검사하고 양 사이트 build/doctor를 확인하도록 바꾼다. 무관한 반복 전체 tests·coverage를 넣지 않는다. 최종 PR merge 준비에서 한 번 실행한다.
- [ ] D06에 따라 같은 저장소·master를 각 Worker의 독립 build/deploy 명령에 연결할 구체 설정표를 만든다. 공통 source/lockfile/migration은 양쪽 watch 대상이다. 운영 release 절차가 DB별 호환 expand migration/readback을 선행하고 자동 deploy는 기존 pending guard를 통과한 Worker만 배포한다. 같은 site의 migration/deploy 직렬화, 오래된 commit 차단, 한쪽 실패 재개와 schema/Worker 호환표를 정의한다.
- [ ] build/guard tests를 실행한다. 양쪽 production build/`deploy:dry-run`은 실제 domain/Clerk/resource 값 준비 후 Task 6에서 완료한다. 실제 build output 경로와 manifest를 확인하고 OTW legacy alias도 확인한다. 미준비 검증을 passing으로 기록하지 않는다.

Workers Builds는 같은 저장소에 여러 Worker를 연결하고 각각의 명령·watch paths를 설정할 수 있다. 현재 dashboard 설정은 이번 계획에서 조회하지 않았으며 위 설정은 제안이다. [공식 문서](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/)

## Task 6: 환경 준비·rehearsal·비공개 production 이관

**실행 전 조건:** Task 1–5의 구현/가능한 로컬 검증·전환 상세안 검토, 실제 입력, 해당 환경/운영 자원과 데이터 변경에 대한 실행 지시. development/격리 검증 자원은 위 의존성 표에 따라 해당 검증 전에 준비하며 아직 없는 production 값의 검증을 이 단계의 선행 조건으로 요구하지 않는다. full preflight 성공만으로 운영 권한을 추론하지 않는다.

- [ ] D03 계정에서 승인된 검증/운영 자원을 각각 준비하고 실제 ID·Queue→consumer·bucket·dataset·Clerk identity를 기록한다. 사이트별 Queue는 DLQ 포함 6개다. 검증이 운영 자원에 쓰지 않도록 확인하며 추가 사용량도 비용 정책에 포함한다.
- [ ] 격리된 실제 Worker/D1/R2/Queue/Workflow에서 초기 복사와 동시 수정/삭제·지연/중복 작업·파일 교체·실패/재개·접근 차단을 rehearsal한다. 실제 예정된 Cron/consumer 흐름으로 확인하고 preview HTTP만으로 대체하지 않는다.
- [ ] 실제 domain·Clerk production·admin IDs·secrets·budget을 설정하고 Task 5의 양쪽 production build/dry-run·manifest를 검증한다. LuvDia domain/alias/asset는 외부 접근을 통제한다. 지원 Node runtime에서 최종 코드/local schema의 PR preflight와 독립 검토를 완료한다.
- [ ] 승인된 운영 실행 범위에서 schema 호환표에 따라 OTW expand migration과 새 빈 LuvDia D1 bootstrap/chain을 적용한다. 각 schema readback 이후 production doctor와 pending migration 검사를 수행한다. 빈 DB나 이전 schema에 새 doctor를 실행한 결과를 준비 완료로 기록하지 않는다.
- [ ] 위 검증 이후 master 병합의 사이트별 자동 배포로 원본 변경 포착·쓰기 소유권 경계와 비공개 LuvDia를 배포한다. OTW 수집/공개를 유지한 상태에서 실제 원본 갱신과 저널의 일치, 대상 자료/파일의 cleanup 보호를 확인한 뒤 inventory 기준점을 고정한다. 자동 배포에 별도 수동 배포를 중복 실행하지 않는다.
- [ ] 준비·사전 검증 완료와 별도 운영 지시 뒤 점검에 진입한다. 신규 업무/수집/예약/비동기 실행을 통제하고 기존 실행을 안전 정리/보존한 일관 정지 proof 뒤 최종 DB·R2를 복사한다. 관계·건수·게시/접근·파일 해시·checkpoint/페이지/next due를 readback하기 전 target 쓰기를 열거나 이중 수집하지 않는다. 복사·검증·복귀 시간을 구분해 측정한다.
- [ ] 실제 LuvDia domain/Clerk의 정상 인증·관리자/회원 읽기·접근 권한을 확인한다. 정상 저장 흐름은 격리 rehearsal에서 검증하며 production 이관 대상 저장은 Task 7 인계 뒤 확인한다. 시험용 소유권 우회를 추가하지 않는다. 아직 일반 공개하지 않는다.

## Task 7: 양 사이트 실제 흐름 확인·공개·롤백

**실행 전 조건:** Task 6 대상 identity·data/auth readback·rehearsal, 운영 배포 전에 완료한 최종 preflight·독립 검토, D06 공개 시점·D08 자동 작업 범위. 아래 인계 전 검증과 인계 후 관측을 분리하며 후자의 성공을 미리 주장하지 않는다.

- [ ] 실제 domain에서 spec §6의 전체 기능·snapshot·metadata를 모바일/데스크톱 정상 진입으로 확인한다. 다른 사이트의 콘텐츠/링크 노출과 회원/admin 경계도 확인한다.
- [ ] 격리 rehearsal에서 OTW의 보관 활성화 후 익명/일반 회원은 대상 자료를 API/직접 URL/검색/cache/내 제안/playlist 썸네일에서도 읽지 못하고 관리자만 읽는지 확인한다. production에서는 인계 전 기존 OTW 공개를 유지하고, 인계 직후 같은 권한 검증을 수행한다. LuvDia의 이관 자료는 기존 게시·접근 정책과 실제 건수·관계를 맞춘다.
- [ ] 인계 전에는 격리 rehearsal에서 회원 playlist 저장·제안 → 관리자 검수·명시적 게시 → UI/D1 readback·catalog ID 재사용을 검증한다. production에서는 인계 후 같은 정상 흐름으로 대표 저장을 확인하며 상대 사이트가 바뀌지 않았는지 읽는다. 원본 소유 상태에서 목적지 쓰기를 수행하지 않는다.
- [ ] 격리 검증 환경에서 관리자 operation·예정 Cron → 실제 Workflow/Queue → Operations/readback, retry/DLQ를 확인한다. production의 trigger/domain은 사전 준비하되 인계 전 같은 source를 양쪽에서 수집하지 않도록 쓰기 소유권을 적용한다. 장애 검증은 격리 환경에서 수행한다.
- [ ] 실제 Cloudflare/API 한도와 사이트별·합산 사용량을 기존 ledger/대시보드 읽기로 확인한다. 수집 이중 실행·새 불필요한 관측 쓰기가 없는지 검증한다.
- [ ] site/commit/Worker version/DB/schema/Clerk identity와 각 PASS/FAIL 증거를 기록한다. 하나의 실패가 독립된 검증을 막지 않되 관련 안전·데이터 경계가 실패하면 그 작업은 중지한다.
- [ ] 최종 복사 readback과 공개 전 조건을 충족한 뒤 검증된 소유권·보관 상태로 LuvDia 쓰기/공개를 연다. 접수 작업 증거를 보존하고 새 편집은 LuvDia 로그인으로 진행한다. 준비 미완료면 점검 진입/공개를 연기한다. 점검 중 target 새 쓰기 전 검증 실패는 원본 보존과 OTW 안전 재개로 복귀한다.
- [ ] 이전 이관 책임을 정리하고 임시 Service Binding을 제거한다. 상대 Worker/DB 접근 불가 격리 환경에서 양쪽 조회·저장·수집·재시도를 확인하며 정상 운영의 상대 호출/상시 콘텐츠 동기화를 남기지 않는다. 인계 후 실제 저장·다음 수집/retention·권한·합산 예산을 readback한다. 보호 기록/파일은 복구 종료 조건 전 삭제하지 않는다. 새 target 자료가 생긴 뒤에는 이전 OTW 상태로 단순 복귀하지 않고 새 데이터를 보존하는 검증된 복구를 적용한다.

## 계획 작성·실행 전 점검의 검증 기록

설계/계획의 계약·작업·검증 대응을 자체 검토했다. Node assert 문서 검사는 4개 문서의 로컬 링크 53개·고정 commit 코드 출처 21개·참조 정의·fence·후행 공백, 7개 Task와 8개 결정 항목, 구현 변경 부재를 확인해 통과했다. `git diff --check`와 `pnpm.cmd sync:agent-cursor:check`도 exit 0이며 관리 파일 27개와 참조가 유효했다.

2026-10-14 정책 인터뷰 후 4개 문서의 확정 기록과 후속 계획을 맞췄다. 문서 검사는 로컬 링크 53개·고정 코드 출처 21개·참조 사용 54개, 7개 Task·8개 결정 행·미실행 단계 46개를 확인했다. 대상 3명·무중단·공개 미완료 시 연기·비용 증가 별도 결정이 보고서/설계/계획 모두에 있으며 변경 범위는 이 4개 문서뿐이다. 무중단 기술 방식이나 목표일 공개 가능성은 이 검사로 검증되지 않았다.

2026-10-14 실행 전 점검과 Q01/Q02 확정 후에는 점검 보고서를 포함한 **5개 문서**를 검사했다. 로컬 링크 97개·고정 commit 코드 출처 21개·참조 사용 54개, 7개 Task·8개 결정 행·미실행 단계 55개가 유효하다. 변경 범위는 이 5개 문서이며 HEAD는 위 기준 commit 그대로이고 staged 변경은 없다. `git diff --check`와 `pnpm.cmd sync:agent-cursor:check`는 exit 0, 관리 파일 27개는 변경 없이 유효하다. 현재 Node 25에 대한 지원 범위 경고는 남아 있으므로 구현의 app/build 검증 전에 저장소가 요구하는 Node 24 환경을 준비한다.

위 문서 검사는 구현 지시 전의 기록이다. 당시 checkbox는 모두 미완료였으며 application tests, build, D1 replay, 외부 자원/데이터 변경, 수집, commit/push, 배포는 수행하지 않았다. 현재는 상단 실행 범위에 따라 코드·로컬 검증을 진행하며 각 단계의 실제 증거로 상태를 갱신한다. 운영 이관·배포의 완료나 실행 권한은 로컬 검증에서 추론하지 않는다.

**접수 준비 순서 보정의 이력, 결정61·96:** 빈 target를 실제 멤버·카탈로그 검증 없이 준비 완료로 알렸던 공백과 이를 막는 비공개 자료·readiness 검증은 유지한다. 내부 receiving·파일 seal·source ACK와 최종 업무 쓰기 권한도 구분한다. 결정61 당시의 최종 설치 중 신규 연속 접수 조건은 결정96으로 해제됐다. 현재는 준비 동안 OTW를 정상 운영하고, 최종 점검 중 새 업무 접수를 거부하며, 최종 정지·복사/readback과 소유권 확정 뒤 LuvDia의 새 쓰기를 연다. 빈 target 접수 성공은 완료 증거가 아니다.

**비공개 이관의 읽기 경계, 결정62:** 초기 자료의 normal 표기만으로 공개를 허용하지 않는다. 최종 target 소유권 전 비인증 공개·SEO·파일·내보내기·cache에서 staged 자료를 막고, 자기 사이트의 검증된 관리자 검토와 native 준비 뒤 기존 권한을 지킨 정상 로그인 편집 동선을 유지한다. 실제 로그인은 business 소유권·추가 비공개 권한을 대체하지 않는다. 최종 소유권 뒤 기존 공개·회원·관리자 제한을 적용한다.

**독립 배포와 임시 연결, 결정63:** 없는 상대 Worker를 기본 Service Binding으로 지정하면 최초 배포가 실패하므로 일반 설정은 독립 배포를 유지한다. 전환 연결은 양쪽 Worker·named entrypoint 준비 뒤 명시적으로 적용하고 이전 접수 건의 완료 증거까지 정상 배포에서도 유지한다. 실제 운영 생성·연결·제거·배포는 별도 실행 지시 이후이며 코드·로컬 설정 검증만 현재 범위다.

**수신 코드 호환성, 결정65:** 설치된 schema가 같아도 오래된 Worker의 준비 응답은 정상 참조·비공개 조회·실제 실행 계약을 증명하지 않는다. 실제 등록 receiver/executor와 compiled 계약을 peer·저장 readiness에 결합하고 source ACK·원자적 fence에서 검증한다. 누락·이전·불일치 형식은 거부하고 과거 seal·소유권을 변환하지 않는다. 같은 schema의 이전 응답을 사용한 결정적 검증과 실제 오래된 artifact 실행 검증은 구분한다.

**조회 응답 복구의 경계, 결정67–68:** 실제 CHZZK 읽기 응답을 저장하기 전에 실패한 경우 원래 접수·정확한 요청 아래 기존 상한·예산으로 제한 재조회한다. 응답·사용량은 달라질 수 있고 유실된 일시적 응답은 복원 보장하지 않는다. 처음 영속 확정한 페이지는 불변으로 재사용하며 완료 페이지·ACK 유실의 재조회나 불확실한 외부 변경의 반복을 허용하지 않는다. 이전 source 접수 조회의 결과 확정은 원래 source control의 단일 CAS에 두고 target 복구는 기존 private peer의 좁은 검증된 control과 승인 projection만 사용한다. native target 조회는 자기 journal을 사용한다. 업무 저장은 최종 소유자에서만 수행하고 이전 attempt·결과·ACK의 실제 유한 완료 뒤 임시 연결을 종료한다. 상세 판단·실패 비용·검증 경계는 구현 결정67–68을 따른다.

**수집의 후속 책임과 완료, 결정69–70:** 이전 수집의 단계 종료는 전체 접수 책임의 종료와 구분한다. 실제 최종 소유자의 원래 결과·범위에서 매칭을 도출하고 원래 source-local 실행 항목·집계·history/finalizer로 이어지며, 후속 결과의 정합과 최종 ACK 뒤에 이전 책임을 끝낸다. 원래 frozen parent를 유지하고 새 source 실행이나 나중 native backlog를 종료 조건에 넣지 않는다. 복구된 읽기의 원래 불확실한 시도는 증거와 대체 응답 참조를 보존하며 성공으로 바꾸지 않는다. 일반 Queue 전달 횟수만으로 접수 책임의 복구를 끝내지 않고 실제 영속 제어·기존 재시도 진입점과 연결한다. target 소유권과 새 저장은 이전 전체 작업 종료를 기다리지 않는다.

**AI 응답 유실의 관리자 종결, 결정89(사용자 확정):** 전환 접수 책임에 속한 Gemini POST가 발행됐지만 응답/결과가 영속 기록되지 않았고 같은 요청의 조회 증거도 없으면, 원래 미확인 증거를 보존하며 실제 해당 사이트 관리자의 명시 결정으로만 그 책임을 종결한다. 결정 전에는 미완료를 유지하고 자동 재POST·성공/확정 분석 실패 위장은 허용하지 않는다. 관리자는 원래 결과를 복구하지 못할 수 있음을 확인하고 필요하면 별도 정상 요청으로 새 분석을 실행한다. 중복 비용 가능성을 안내하며 종결 자체가 재분석을 시작하거나 한도를 늘리지 않는다. 실제 관리자 권한·원래 작업/attempt/hash·미확인 상태의 원자적 검사·불변 결정 receipt/readback와 개인정보 경계를 구현하고 검증한다. 검증된 결정은 이 예외의 복구 책임만 해소하며 unrelated 정상 AI·일반 retry·다른 provider·GET·R2·남은 미완료 작업에 확대하지 않는다. 자세한 계약은 [구현 결정89](../../reports/sul-36/implementation-rulings.md)를 따른다. 현재 정책 확정이며 구현·실제 provider 통과 증거는 아니다.


93. **보호 전 실행 중이던 AI의 발행 여부 미확인에도 같은 관리자 종결 정책을 적용한다.** 사용자가 2026-10-15 추가 질문에서 명시 선택했다. 실제 기존 music_ai_review_attempts는 claim의 token·started_at·running 상태를 기록하지만 POST 직전 marker가 없어, 보호 전 이미 실행 중이던 선택된 분석의 POST 발행/응답 영속 여부를 구분하지 못하는 경우가 있다. 이 정확한 legacy potentially-issued 시도는 "발행 여부 미확인"으로 보존하고 자동 재POST 없이 결정89의 정상 own-site 관리자·정확 operation/attempt/hash·현재 unresolved CAS·불변 결정 receipt/readback으로 종결할 수 있다. claim 시각을 발행 시각으로 조작하거나 실제 POST가 발행됐다고 확정하지 않는다. 원래 증거와 불확실성·별도 관리자 결정을 유지하고 분석 성공/실패로 위장하지 않는다. target 관리자 actor는 target private에만 남기며 source 계정/lease를 권한으로 복제하지 않는다. 이 결정은 해당 AI 예외의 원래 책임만 해소한다. 필요하면 별도 새 분석을 정상 입력·권한·예산 경로로 요청하고 원래 결과 복구 불보장·중복 비용 가능성을 안내한다. 알려진 미발행, 영속 결과, 확정 실패 및 unrelated 일반 재시도에 이 정책을 확대하지 않는다. 새 전환 접수에는 실제 POST 직전 영속 marker와 첫 결과를 연결하고, 역사 자료 복사만으로 기존 대기/실행 책임을 보존했다고 판단하지 않는다. 현재는 확정 정책이며 실제 구현/로그인/provider 검증의 PASS는 아니다.


94. **인계 뒤 미발행 AI를 이어서 실행할 때도 LuvDia 관리자의 명시 확인을 받는다.** 사용자가 2026-10-15 두 번째 추가 질문에서 선택한 정책이다. 인계/전환 보관 뒤 재개가 필요하고 다음 POST가 아직 발행되지 않았음이 확인된 원래 접수 분석은 LuvDia의 정상 현재 관리자가 확인한 뒤에만 이어서 실행한다. 보호 전 대기 건과 보호 후 영속 접수되어 남은 건 모두 같은 정책이다. 기존 architecture의 imported unfinished review는 관리자 결정 대상이라는 원칙을 유지하며, 역사 unfinished row나 source 계정/lease를 자동 dispatch 권한으로 만들지 않는다.

실제 원래 operation/attempt/input hash·승인된 선택 대상·현재 pending 상태/CAS·자기 사이트 관리자 권한·원래 입력과 기존 예산/재시도 한도를 확인하고 재시도 가능한 확인 receipt를 영속 기록·읽어 확인한다. target 관리자 actor는 target private에만 둔다. 확인 자체는 분석 완료나 원래 책임 ACK가 아니며 실제 결과와 필요한 후속 책임까지 조정해야 한다. 확인을 기다리는 상태는 분석 성공/실패와 구분해 원래 관리자 화면에서 도달 가능해야 한다. 발행 여부가 미확인인 시도는 결정89/93대로 자동 재POST 없이 관리자 종결을 적용하고, 미발행 재개 확인과 미확인 종결을 별도 동작으로 표시한다. 미확인 원래 결과를 복구하지 못할 수 있고 별도 새 분석에는 중복 비용이 가능하다는 안내는 유지한다.

fence 전의 정당한 source 정상 처리는 유지하고 인계 뒤 미발행 재개에 이 정책을 적용한다. 정상 소유권 아래 새 LuvDia AI 요청 및 그 정상 재시도에 불필요한 두 번째 확인을 확대하지 않는다. 관리자 확인 전에는 원래 미완료 책임을 보존하되 전체 분석 완료나 queue-empty를 소유권 전환 gate로 만들지 않고 독립 수집·저장·새 분석을 유지한다. 실제 pending adoption 구현이 기존에 없음을 확인했으므로 기존 app 조립/infra 주입 방식에 작은 owning adapter를 연결하고, 실제 승인된 source pending/시도/hash/plan/generation과 결합한 채택 및 같은 fence transaction의 미채택 pending 부재 검사로 경합을 막는다. 목록을 미리 읽은 것만으로 원자성을 주장하지 않는다. 현재는 확정 정책과 구현 경계이며 실제 UI/인증/provider 통과 증거가 아니다.

### 2026-10-15 추가 확정99: 공식 채널과 키리누키 수집 설정

공식 멤버 채널은 자동 수집 승인이다. 키리누키 자동 수집 소스·감시 설정·실행 approval은 이관하지 않고, LuvDia 관리자가 추후 별도 검토해 기존 경로로 추가한다. 이관 monitor 재승인 기능은 만들지 않는다. 기존 멤버 콘텐츠·검수 자료·필요한 출처 이력은 보존하며 상세 경계는 [결정99](../../reports/sul-36/implementation-rulings.md)를 따른다. 기존 작업자/WIP와 코드·로컬 한정 실행 범위는 유지한다.

### 2026-10-15 추가 확정98: 미정리 배치·수집의 전환 차단

아직 분석 입력이 없는 AI 배치 항목과 발행 여부를 확인할 수 없는 기존 수집 작업은 OTW에서 안전정리한 뒤 전환한다. 미확인 건이 남으면 최종 전환을 차단하고 공개를 연기한다. 이 두 범주의 target 재개 구조는 추가하지 않으며, 원래 데이터·부모 책임·페이지·due를 보존한다. 기존 단건 AI94/89/93과 정책96·추가97은 유지한다. 상세 계약과 검증 경계는 [구현 결정98](../../reports/sul-36/implementation-rulings.md)을 따른다. 실제 운영 실행 권한은 부여되지 않았다.
