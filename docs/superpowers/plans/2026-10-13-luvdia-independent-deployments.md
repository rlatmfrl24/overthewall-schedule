# SUL-36 Independent Site Deployments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 기능과 접근·저장 계약을 유지하며 OTW/LuvDia의 배포·데이터·회원·작업 처리를 독립적으로 운영한다.

**Architecture:** 하나의 공통 소스·스키마를 사이트별 공개 정의와 두 Wrangler config로 빌드한다. 각 Worker는 자기 D1/R2/Queue/Workflow와 별도 Clerk 앱을 사용한다. 요청 host로 테넌트를 선택하지 않는다.

**Tech Stack:** Node.js 24.20.0, pnpm 11.7.0, TypeScript 5.8, React/Vite, Cloudflare Worker/D1/R2/Queues/Workflows/Analytics Engine, Clerk, 기존 Drizzle/Vitest/tsx.

**Spec:** [상세 설계·추가 결정표](../specs/2026-10-13-luvdia-independent-deployments-design.md)

**실행 준비 점검:** [2026-10-14 전수 점검](../../reports/sul-36/pre-implementation-review.md). 정책은 확정됐지만 변경 포착·소유권 인계·관계/작성자 변환의 상세안과 실제 환경 입력은 미완료다. 아래는 보완된 작업 계획이며 즉시 실행 가능한 상태라는 판정이 아니다.

**상태:** 2026-10-14 사용자 지시에 따라 **코드 구현과 로컬 검증 진행 중**. 도메인은 사용자가 등록 후 제공한다. 도메인이 필요한 작업·운영 자원 준비·운영 데이터 이관·배포는 실행하지 않는다. 아래 checkbox는 실제 검증 증거가 있는 항목만 완료로 갱신하며, 로컬 구현의 통과를 운영 전환 완료로 처리하지 않는다.

## Global Constraints

- 확정 사항: 공통 코드, 두 사이트 지속 운영, 전체 기능 유지, 로그인·회원 분리. LuvDia 대상은 빙하유·유리리·양메이만이며 과거 일정·전체 콘텐츠도 이관하고 신규 자료는 LuvDia에서만 관리한다. OTW 원본은 관리자만 열람한다. 개인 playlist·일반 회원 계정 연결 데이터는 OTW에 유지한다.
- 사이트 ID는 `otw`와 `luvdia`. Node.js는 `>=24.20.0 <25`, pnpm은 `11.7.0`. 의존성 추가 없음.
- LuvDia 사이트 표시명은 `LuvDia Schedule`, 음악 기능 이름은 `LuvDia Play`. 사용자 화면·SEO·내보내기는 이 이름과 비공식 팬 운영 고지를 사용한다.
- Cloudflare 계정은 기존 OTW 계정을 공유하며 Worker/D1/R2/Queue/Workflow/dataset/rate-limit 자원은 전부 분리한다. 계정 ID가 같다는 이유로 격리 검사에서 실패시키거나 각 DB guard를 계정 합산 예산으로 간주하지 않는다.
- 운영자는 기존 OTW 운영진을 유지한다. 외부 API 프로젝트/계정은 공유하고 가능한 키는 사이트별 분리하며, 새 Clerk 사용자 ID에 관리자 권한을 개별 부여한다. provider 한도는 키 개수가 아니라 프로젝트/계정 합산으로 적용한다.
- 정상 운영은 검증된 `master` 병합 후 사이트별 독립 pipeline의 자동 배포다. 최초 이관/공개 전환과 데이터/schema 적용은 별도 검증·실행 지시가 필요하며 merge 성공만으로 완료 처리하지 않는다.
- 목표 공개 시각은 `2026-10-18 11:00 Asia/Seoul`이다. 도메인 미정·구현 진행 중 상태에서 달성을 보장하지 않으며, 필요 입력/실제 데이터 규모/검증을 확인해 일정 위험을 다시 평가한다. 마감 때문에 기능·권한·이관 검증을 생략하지 않는다.
- 세 사람의 수집·갱신도 중단 없는 전환이 필수다. final sync를 위한 수집/쓰기 일시 정지를 사용하지 않는다. 변경분 연속 동기화·지연 job/Queue·처리 소유권 인계를 먼저 설계·검증하고 전환 후 상시 cross-site DB 의존성을 남기지 않는다.
- UI·HTTP·application/domain·infrastructure의 기존 경계를 보존하며 공유 계약은 env·host·D1을 읽지 않는다.
- 기존 API 경로·핵심 payload·논리 binding, 회원 Play/admin clip 제한, 검수·명시적 게시·동시성·idempotency를 유지한다. 확정된 관리자 보관 상태는 schema/공유 DTO에 명시하고 소비자를 함께 갱신한다.
- OTW 과거 데이터는 보존한다. D07에 따라 전환 시 세 사람의 신규 수집·자동 갱신 주체를 LuvDia로 인계하며 다른 소스·설정은 유지한다. 과거 migration 수정·가공 applied 기록 금지.
- full 기능 유지가 모든 수집/공개 flag 자동 활성화를 뜻하지 않는다. 새 사이트의 수집·공개는 검증 후 승인 정책대로 활성화한다.
- 초기 자동 수집은 세 사람에 대한 기존 OTW 소스·주기를 승계하며 새 소스 추가·주기 확대는 추후 결정한다. 기존 게시·공개/회원/admin 접근 제한을 유지한다.
- 비용은 기존 계약·합산 한도를 우선 사용하며 추가 비용·요금제 변경은 실제 비용 확인 후 별도 결정한다. 별도 Clerk와 무중단 이관의 일시적 추가 사용량까지 확인하고 사이트별 예산을 배분한다.
- 목표 시각까지 전체 기능·이관·권한·무중단 전환 검증이 미완료면 LuvDia 공개를 연기하고 기존 OTW 수집·갱신을 계속 유지한다.
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

설계안 D01–D08의 운영 정책은 확정되었다. 남은 입력은 D02의 도메인, D03의 실제 자원 ID, D05의 새 관리자 ID/키·provider 한도, D07/D08의 기존 실제 수집 설정과 예산 배분이다. D06의 무중단 변경 포착·checkpoint·소유권 인계 방법은 구현 착수 전 영향 범위부터 검토하고 Task 4에서 실제 D1 흐름으로 검증한다. 임의 domain·fake resource ID·OTW fallback을 넣어 production 검사를 통과시키지 않는다. 준비되지 않은 LuvDia production build/deploy는 실패하는 것이 정상이다.

점검에서 기존 outbox/감사가 row 변경·삭제를 빠짐없이 담지 못함을 확인했다. 따라서 원본 저장과 같은 트랜잭션의 최소 전환 저널, 쓰기 소유권 검사, 초기 복사 기준점/적용 cursor, source별 checkpoint와 혼합 작업 인계 방식을 먼저 설계한다. 원본·목적지 D1·R2의 분산 원자성을 가정하지 않는다.

| 환경 검증 | 실제 입력 준비 순서 | 경계 |
| --- | --- | --- |
| Task 1/3 development 로그인·관리자 저장 | 해당 검증 전에 새 Clerk development와 site별 local env/origin 준비 | site별 port·process·D1/R2 사용. 운영 R2 remote binding 사용 금지 |
| Task 5 코드/guard 검증 | local 입력과 부정 조합 fixture로 검사 | production build/dry-run에 필요한 실제 값이 없으면 해당 검증을 Task 6으로 넘기고 미완료로 기록 |
| 실제 Cron/Queue·이관 rehearsal | 승인된 환경 준비 범위에서 별도 Worker/D1/R2/Queue/Workflow·검증 인증 준비 후 | 운영 작업/자료와 격리. Preview HTTP만으로 대체하지 않음 |
| Task 6 production build/doctor/dry-run·비공개 smoke | 실제 domain·Clerk production·resource ID·secrets 준비 후 | domain·workers.dev·preview alias·asset의 접근 통제와 실제 readback |

development/검증 자원 준비를 production provisioning 완료의 뒤로 미루지 않는다. 이 환경 작업도 구현/운영 지시 범위에서 수행하며 현재는 실행하지 않는다. 별도 검증 자원은 기존 계약·비용 정책에 포함하고 필요한 검증 뒤 정리 조건을 기록한다.

순서: **무중단 전환 영향·필수 입력 검토 → 1 대상·빌드 경계 → 2 UI/SEO → 3 runtime 격리 → 4 migration/이관 → 5 배포·검사 → 6 승인된 자원 설정 → 7 실제 검증·공개**. 공유 engine 변경은 양 사이트에 도달하도록 같은 branch에서 완성한다. 예상 일수·비용은 실제 데이터 규모·계정 정보·무중단 방식 검토 없이 추정하지 않는다.

## 파일 책임

아래 신규 경로는 구현 시 생성할 **제안**이며 현재 파일이 존재한다는 뜻이 아니다. 실제 신규 자원 ID·도메인·계정 값은 결정과 provisioning readback 후 넣는다.

| 책임 | 신규 파일 제안 | 변경할 기존 경계 |
| --- | --- | --- |
| 공개 정의·사이트 선택 | `contracts/site-definition.ts`, `src/shared/config/site.ts`, `scripts/site-target.mjs`, `scripts/site-target.d.mts`, `scripts/build-site.mjs` | `vite.config.ts`, `src/vite-env.d.ts`, `src/main.tsx`, `package.json`, `scripts/local-dev-config.mjs`, `scripts/dev-restart.mjs`, env 예제·선택 규칙 |
| 물리 자원·runtime 해석 | `wrangler.luvdia.jsonc`, `worker/platform/site.ts` | `wrangler.jsonc`, `worker/platform/types.ts`, `worker/index.ts`, `worker/app/*` composition, `cf-typegen`으로 생성하는 `worker-configuration.d.ts` |
| 공개 브랜드·SEO | 별도 페이지/컴포넌트 복사 없음 | `contracts/site-seo.ts`, `contracts/site-public-content.ts`, `src/app/layout/*`, `src/shared/seo/*`, `src/shared/lib/site-rights.ts`, `src/features/rights/ui/rights-page.tsx`, `src/features/schedule-board/ui/daily/snapshot/*`, `worker/features/seo/*`, `scripts/generate-seo-assets.ts`, `index.html`, `public/robots.txt` |
| 이관 | `scripts/prepare-luvdia-data.mjs`, `scripts/import-luvdia-data.mjs` | 기존 doctor/reset/seed/migration·파일 업로드 도구. 변경이 필요할 때만 새 migration 생성 |
| OTW 관리자 보관 경계 | 임의 공용 필터로 대체하지 않음 | `db/schema/index.ts`, `contracts/members.ts`, 해당 일정/멤버/공지/미디어/feed/Play reader·API·SEO·cache·관리자 조회와 새 Drizzle migration |
| 무중단 변경분 이관 | 기존 outbox/감사의 불완전성 확인. 원본 저장과 원자적인 최소 전환 저널을 설계 | 모든 대상의 관리자/collector/AI 검수/관계/삭제 mutation, 실제 쓰기 소유권 검사, 혼합/지연 Queue·checkpoint·이관 도구. 구체 schema/상태 전이는 구현 전 상세안에서 확정 |
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

**코드·로컬 검증 진행 기록:** 전체 이관 범위는 유지하며, ① schema·출처·원자적 변경 포착, ② 관리자 보관 접근 경계, ③ 보존·파일, ④ 저장·수집 소유권 인계, ⑤ 도구·통합 검증 순서로 구현하고 각각 리뷰한다. ①은 `944d9f73..1e886c86`, ②는 `e2a6b2f4..50ea41a9`, ③은 `e8ef5aaa..a1395bf6`의 코드·허용된 로컬 검증과 독립 리뷰를 완료했다. ③은 최초 중요4건과 수정 중 잔여·새 회귀를 실제 검증으로 해결했다. 최종 관련122건·양쪽117개 적용과 실제 OTW 화면·저장·파일 읽기를 확인했지만 전체 doctor exit1은 Task5의 열린 gate다. ④–⑤도 남아 있으므로 Task 4 전체 완료 상태가 아니다. 대상의 영속 접수 준비를 원본 쓰기 권한 전환보다 먼저 확인하고, 이전 접수 건의 최종 결과를 기다리는 동안에도 새 대상 작업을 접수·처리하는 계약을 확정했다. 현재 실제 증거와 실패·재검사는 [로컬 검증 기록](../../reports/sul-36/local-implementation-verification.md)에서 갱신한다. 도메인·실제 LuvDia 로그인과 운영 이관·배포는 별도로 보류한다.

**Files:** `scripts/d1-reset-local.mjs`, `d1-doctor.mjs`, `d1-seed-local.mjs`, `d1-local-options.mjs`, `upload-profile-backgrounds-to-r2.mjs`, `package.json`, `drizzle.config.ts`; 관리자 보관을 위한 canonical schema·DTO·해당 reader/API/정적 asset 경계·새 migration; 신규 prepare/import script와 migration tests, 기존 reset/seed guard·doctor tests. 무중단 변경 포착의 추가 경로는 쓰기 목록 조사 후 확정한다. 이관 manifest·검증 SQL은 구현 시 `docs/reports/sul-36/`에 보존한다.

**Interfaces:** prepare는 확정 D01/D04/D07에서 **읽기 기반 선택 데이터와 검토 가능한 manifest**를 만든다. 원본 쓰기를 차단하는 export를 사용하지 않으며 초기 복사와 변경분 재생의 일관성을 검증한다. import는 승인 manifest와 명시적 target을 받는다. 신규 DB bootstrap은 기존 phased chain을 재사용하고 local/remote target은 Task 1 helper와 같은 선택을 따른다. 관리자 보관·전환 저널·필요한 출처/권한 분리는 canonical schema 수정 → Drizzle generate로 새 migration을 생성한다. 기존 numbered migration을 수정하지 않는다.

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
- [ ] 원본 쓰기를 차단하는 full export 없이 승인 manifest의 초기 자료·연속 변경분·R2 파일을 이관한다. 최종 관계·건수·게시/접근 상태·checkpoint·파일 readback과 원본 운영 부하를 검증한다. 인계 전 목적지 이관 대상의 업무 쓰기를 열거나 같은 source를 이중 수집하지 않는다.
- [ ] 실제 LuvDia domain/Clerk의 정상 인증·관리자/회원 읽기·접근 권한을 확인한다. 정상 저장 흐름은 격리 rehearsal에서 검증하며 production 이관 대상 저장은 Task 7 인계 뒤 확인한다. 시험용 소유권 우회를 추가하지 않는다. 아직 일반 공개하지 않는다.

## Task 7: 양 사이트 실제 흐름 확인·공개·롤백

**실행 전 조건:** Task 6 대상 identity·data/auth readback·rehearsal, 운영 배포 전에 완료한 최종 preflight·독립 검토, D06 공개 시점·D08 자동 작업 범위. 아래 인계 전 검증과 인계 후 관측을 분리하며 후자의 성공을 미리 주장하지 않는다.

- [ ] 실제 domain에서 spec §6의 전체 기능·snapshot·metadata를 모바일/데스크톱 정상 진입으로 확인한다. 다른 사이트의 콘텐츠/링크 노출과 회원/admin 경계도 확인한다.
- [ ] 격리 rehearsal에서 OTW의 보관 활성화 후 익명/일반 회원은 대상 자료를 API/직접 URL/검색/cache/내 제안/playlist 썸네일에서도 읽지 못하고 관리자만 읽는지 확인한다. production에서는 인계 전 기존 OTW 공개를 유지하고, 인계 직후 같은 권한 검증을 수행한다. LuvDia의 이관 자료는 기존 게시·접근 정책과 실제 건수·관계를 맞춘다.
- [ ] 인계 전에는 격리 rehearsal에서 회원 playlist 저장·제안 → 관리자 검수·명시적 게시 → UI/D1 readback·catalog ID 재사용을 검증한다. production에서는 인계 후 같은 정상 흐름으로 대표 저장을 확인하며 상대 사이트가 바뀌지 않았는지 읽는다. 원본 소유 상태에서 목적지 쓰기를 수행하지 않는다.
- [ ] 격리 검증 환경에서 관리자 operation·예정 Cron → 실제 Workflow/Queue → Operations/readback, retry/DLQ를 확인한다. production의 trigger/domain은 사전 준비하되 인계 전 같은 source를 양쪽에서 수집하지 않도록 쓰기 소유권을 적용한다. 장애 검증은 격리 환경에서 수행한다.
- [ ] 실제 Cloudflare/API 한도와 사이트별·합산 사용량을 기존 ledger/대시보드 읽기로 확인한다. 수집 이중 실행·새 불필요한 관측 쓰기가 없는지 검증한다.
- [ ] site/commit/Worker version/DB/schema/Clerk identity와 각 PASS/FAIL 증거를 기록한다. 하나의 실패가 독립된 검증을 막지 않되 관련 안전·데이터 경계가 실패하면 그 작업은 중지한다.
- [ ] 공개 전 조건을 모두 충족하면 목표 시각에 검증된 소유권 세대·마지막 변경 번호/checkpoint로 LuvDia에 처리를 인계하고 OTW 관리자 보관·LuvDia 공개를 적용한다. 접수된 저장과 지연 작업을 보존하고 새 편집은 LuvDia 로그인으로 진행한다. 미완료면 공개를 연기하고 OTW 운영을 유지한다.
- [ ] 인계 후 실제 production 저장과 다음 수집·source sync·retention 주기까지 정상 처리/자료 보존·권한·합산 예산을 readback한다. 보호 저널/파일은 사전 정의한 복구 종료 조건 전 삭제하지 않는다. 복구는 마지막 정상 호환 LuvDia 버전을 우선하며 OTW 복귀는 목적지 신규 변경의 역이관 절차가 검증된 경우에만 허용한다.

## 계획 작성·실행 전 점검의 검증 기록

설계/계획의 계약·작업·검증 대응을 자체 검토했다. Node assert 문서 검사는 4개 문서의 로컬 링크 53개·고정 commit 코드 출처 21개·참조 정의·fence·후행 공백, 7개 Task와 8개 결정 항목, 구현 변경 부재를 확인해 통과했다. `git diff --check`와 `pnpm.cmd sync:agent-cursor:check`도 exit 0이며 관리 파일 27개와 참조가 유효했다.

2026-10-14 정책 인터뷰 후 4개 문서의 확정 기록과 후속 계획을 맞췄다. 문서 검사는 로컬 링크 53개·고정 코드 출처 21개·참조 사용 54개, 7개 Task·8개 결정 행·미실행 단계 46개를 확인했다. 대상 3명·무중단·공개 미완료 시 연기·비용 증가 별도 결정이 보고서/설계/계획 모두에 있으며 변경 범위는 이 4개 문서뿐이다. 무중단 기술 방식이나 목표일 공개 가능성은 이 검사로 검증되지 않았다.

2026-10-14 실행 전 점검과 Q01/Q02 확정 후에는 점검 보고서를 포함한 **5개 문서**를 검사했다. 로컬 링크 97개·고정 commit 코드 출처 21개·참조 사용 54개, 7개 Task·8개 결정 행·미실행 단계 55개가 유효하다. 변경 범위는 이 5개 문서이며 HEAD는 위 기준 commit 그대로이고 staged 변경은 없다. `git diff --check`와 `pnpm.cmd sync:agent-cursor:check`는 exit 0, 관리 파일 27개는 변경 없이 유효하다. 현재 Node 25에 대한 지원 범위 경고는 남아 있으므로 구현의 app/build 검증 전에 저장소가 요구하는 Node 24 환경을 준비한다.

위 문서 검사는 구현 지시 전의 기록이다. 당시 checkbox는 모두 미완료였으며 application tests, build, D1 replay, 외부 자원/데이터 변경, 수집, commit/push, 배포는 수행하지 않았다. 현재는 상단 실행 범위에 따라 코드·로컬 검증을 진행하며 각 단계의 실제 증거로 상태를 갱신한다. 운영 이관·배포의 완료나 실행 권한은 로컬 검증에서 추론하지 않는다.
