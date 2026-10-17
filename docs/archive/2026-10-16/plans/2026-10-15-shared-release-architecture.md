> 2026-10-16 아카이브: 당시 계획·검증 기록입니다. 미완료 표기를 현재 실행 지시로 사용하지 않습니다. 남은 작업과 중단 조건은 [현재 작업](../../../current-work.md)을 따릅니다.

# OTW·LuvDia 동일 소스 배포·구조 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 두 사이트가 검증된 동일 소스 release를 사용함을 증명하고 정상 기능과 임시 이관 책임을 명확히 분리한다.

**Architecture:** 하나의 저장소·계약·schema/migration chain과 두 독립 사이트 설정을 유지한다. artifact 내용/사이트 자원/schema 요구를 배포 시 검증하고, 기능별 domain/application/ports/infrastructure와 app composition 구조는 유지한다. 범용 tenant 플랫폼이나 장기 사이트별 소스 분기는 만들지 않는다.

**Tech Stack:** TypeScript, Vite, existing site build/deploy scripts, Wrangler, Drizzle/D1, architecture checker.

**Spec:** [점검 결과와 요구](../reports/sul-36/2026-10-15-operations-audit-and-priorities.md)

## Global Constraints

- 현재 334개 WIP 경로를 보존한다. stage/commit에는 검토한 경로만 포함한다.
- Worker version ID는 사이트별로 달라도 된다. 동일 source revision/tree와 대상별 산출물·설정·schema 호환성을 증명해야 한다.
- 계정 예산이 높은 동안 원격 migration·전체 재이관·대량 orphan 정리를 하지 않는다.
- 미완료 AI/Queue/파일 증거와 권한/원자성/idempotency를 삭제하지 않는다.
- 19일 공개 작업을 막는 필수 호환성 확인과 장기 구조 정리를 구분한다.
- 실행 환경은 `node >=24.20.0 <25`, `pnpm 11.7.0`; 현재 Node25를 release 검증 환경으로 사용하지 않는다.

## Review Focus

- 같은 HEAD의 서로 다른 WIP → release source identity 불일치 검출(Task 1).
- 다른 site artifact/Clerk/resource 혼합 → deploy 전 거부(Task 1).
- 한쪽 배포 실패·서로 다른 schema → 성공을 개별 기록하고 안전한 rollback 범위 명시(Task 1).
- 죽은 것처럼 보이는 retry/unknown/보관 경로 → caller와 실제 보존 책임 확인 후 정리(Task 2).
- 구조 검사 PASS지만 domain이 I/O 의미를 알고 있음 → 실제 의존성과 변경 책임을 문서/검사에 반영(Task 2).

## Task 1: release identity와 두 사이트 배포 호환성

**Files:** Modify `scripts/site-build-manifest.mjs`, `scripts/site-build-manifest.test.ts`, `scripts/build-site.mjs`, `scripts/deploy-workers.mjs`; inspect `scripts/site-resources.mjs`, `scripts/site-target.mjs`, `config/sites/*`, both Wrangler configs. Update `docs/reports/sul-36/initial-service-launch.md` with a new dated release record only after deployment.

**Interfaces:** existing `writeSiteBuildManifest(siteId, environment)` / `verifySiteBuildManifest(siteId, manifest?, root?)`. Add `sourceTreeHash: string`, `artifactHashes: Record<string,string>`, `migrationHead: string` to their manifest output. Hash project build inputs and generated deploy inputs deterministically, excluding secrets and transient directories. Keep existing site/config/issuer checks. Production release uses a reviewed clean source checkout; local preview of WIP remains possible but is not release evidence.

- [ ] **Step 1:** inventory tracked/staged/untracked input, each deployed Worker artifact/config and recorded schema. Resolve the canonical source release before build. Confirm Worker Builds dashboard/Git connection and build/deploy commands; absence of `.github/workflows` is not proof of no auto deploy. Record how a master merge reaches each Worker and how a one-sided failure is surfaced.
- [ ] **Step 2:** add manifest regressions: same HEAD + modified source produces a different tree hash; changed generated Worker/client input fails verify; changed schema head fails compatibility; OTW artifact cannot target LuvDia; secret contents never appear in manifest/log. A changed secret/config value must still invalidate the relevant verified build without disclosing it.
- [ ] **Step 3:** `pnpm exec vitest run scripts/site-build-manifest.test.ts scripts/site-target.test.ts scripts/site-resources.test.ts` must fail for the new identity cases before implementation. Extend existing helpers rather than adding a release service.
- [ ] **Step 4:** implement deterministic source/artifact hashes and require the reviewed source revision at deployment. Verify same source hash and migration head for the paired release, while keeping distinct site artifacts/config hashes/issuer/resources. Do not require equal compiled JS bytes because branding/build-time config differs. Worker version annotations or the release record must map remote version to the exact manifest.
- [ ] **Step 5:** align schema safely. Use db-migration workflow after budget recovery; rehearse OTW0101→required head against a protected local copy, measure scans/writes/backup/recovery and preserve LuvDia0136 data. Never mark compatibility from migration filename alone. If unrelated WIP migrations dominate risk, separate a reviewed compatible release instead of deploying all WIP; both sites must still receive the same selected release before parity is claimed.
- [ ] **Step 6:** fix actual existing automatic pipeline if necessary. Reuse Cloudflare Worker Builds when configured, with explicit `--site=otw`/`--site=luvdia`, own secrets/output roots and target validation. Add a new GitHub workflow only if the existing deployment owner is confirmed absent and that choice is accepted; do not create competing deployment triggers.
- [ ] **Step 7:** scoped tests, both site builds, release-ops/preflight at final merge preparation. Deploy through the authorized path; read back source/manifest/schema mapping and own Worker/D1/R2/Queue/Workflow/Clerk. Confirm each normal homepage/login/admin flow; partial rollout stays partial. Rollback uses a schema-compatible Worker and never overwrites new data.
- [ ] **Step 8:** scoped commit and release record. Result is same source revision with independent data and configuration, not a permanently synchronized database or shared authentication.

## Task 2: responsibility map and targeted modularization

**Files:** Modify `docs/architecture.md`, `docs/development-status.md`; inspect `worker/features/content-transition/infrastructure/d1-transition-repository.ts`, `worker/features/content-transition/index.ts`, `worker/app/content-transition*.ts`, `worker/app/routes.ts`, `src/features/members/ui/member-profile-page.tsx`, and existing extracted mutation/AI/file modules. Change `.agent/rules/architecture.md`/`scripts/architecture-check.mjs` only when the approved boundary needs enforcement; regenerate mirrors.

**Interfaces:** existing public capability `index.ts` and declared `commands.ts`, current application ports. Infrastructure methods moved between existing files keep signatures, transaction boundaries and error behavior. No new generic service, event bus or repository abstraction is a prerequisite.

- [ ] **Step 1:** map five real flows with code paths: normal public read; authenticated save/readback; Cron→Workflow→Outbox→Queue→result; protected file read/write; AI request/attempt/response/review. Show per-site resources and shared external quotas. Record which calls still touch content-transition during ordinary operations. Distinguish current production from uncommitted implementation.
- [ ] **Step 2:** reconcile old tasks against latest decisions. Create a keep/replace/remove ledger in the architecture doc for the 14 old writer branches, 5 old tests, 3 codec candidates and peer relay/ACK families from the existing prune report. Re-search each current caller and retained envelope before deciding; old candidate counts are not current deletion counts. Do not restore Task4.4 real-time handoff or AI replay as launch requirements.
- [ ] **Step 3:** select only a cohesive responsibility with verified unnecessary coupling. First reuse existing extracted files under `content-transition/infrastructure`; remove unreachable pre-owner acceptance/dispatch branches only when receipt retry paths do not need them. Keep pure domain parsing, atomic commit guards, native retry and access/asset authority intact. Split the 3,196-line repository by existing operation family only where callers change together; a line-count target is not a reason to move code.
- [ ] **Step 4:** before edits run the existing owning safety tests and add one regression only if the changed boundary lacks evidence. Replace old continuous-admission success assertions with current maintenance rejection and unchanged data; keep rollback, concurrency, authorization and unknown-effect assertions. Search removed exports/constructors/codecs again after edits.
- [ ] **Step 5:** run `pnpm architecture:check`, changed lint, affected unit/Workerd tests. For changed agent infrastructure also run `node --test scripts/sync-agent-to-cursor.test.mjs`, `pnpm sync:agent-cursor`, `pnpm sync:agent-cursor:check`. Test own-site operation with peer binding absent using normal app composition, then after release observe normal operator flow/readback; a mock-only PASS does not prove runtime isolation.
- [ ] **Step 6:** update diagrams, exact entry points, ownership, reasons for remaining transition code and current rollout state. Record removed/kept items and remaining proof gaps. Keep preexisting history in dated reports; replace stale current-status summaries rather than appending contradictory claims.
- [ ] **Step 7:** commit the cohesive change plus its consumers/tests. Repeat for another responsibility only if required by observed risk; defer unrelated UI rewrite, dependency replacement, route framework migration and broad formatting.

## Self-review

Version equality, independent resources, optimization/cleanup, architecture direction and previous-work reconciliation are covered. Task1 compatibility is a prerequisite to current-code rollout; Task2 broad cleanup is not a prerequisite to the countdown UI. Identity verification does not stand in for real login/save/scheduled flows.
