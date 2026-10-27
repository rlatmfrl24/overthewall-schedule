# 양 사이트 XAA 운영 전환 Implementation Plan

**Goal:** 승인된 전체 멤버 웹훅 전환을 합산 UTC $1 목표·24시간 REST 복구와 함께 운영에 반영한다.

**Spec:** [직접 확인한 사용자 승인 원문](../specs/2026-10-26-x-activity-rollout.md).

**Architecture:** OTW D1/Worker가 구독·공통 예산·유료 X 게이트웨이의 권위다. 고정 named Service Binding RPC로 LuvDia 대상·전달·유료 요청을 연결한다. 각 사이트의 정책, inbox/Queue, 기존 저장·완료 커서는 유지한다. 기존 1명 구현은 보존하고 추가 migration으로 이전한다.

**Execution:** 현재 채팅에서 순차 구현한다. 기존 빌드/자동 CI에 회귀를 포함하며 별도 독립 검증 런·추가 canary·미디어 관측 대기를 만들지 않는다. 이전 1명 구현의 검증 결과는 해당 이전 코드 범위의 증거다.

## Constraints

- 전체 허용 활성 멤버. 비공개·제외·사이트 운영 중지·사용자 직접 중지를 보존한다.
- 양 사이트 합산 UTC 하루 1,000,000 micros 목표. 자동충전5→10달러와 공급자 주기30달러 한도는 유지한다.
- 전달 비용은 이미 발생한 비용이다. 예약으로 강제 상한을 보장한다고 하지 않는다.
- 당일 양 사이트 지출/예약과 기존 외부 canary 비용을 보존한다. 공통 장부 장애 시 모든 유료 호출은 fail closed다.
- 외부 콜백은 OTW만 사용한다. 사이트 간 전달/제어는 공개 HTTP 경로를 만들지 않는다.
- REST 완료 커서·전체 복구 완료시각은 durable REST 완료에서만 전진한다.
- 다른 북마크·수집 작업은 포함하지 않는다.

## 1. Shared paid gateway and ledger

**Files:** `contracts/x-activity.ts`, `db/schema/index.ts`, generated migrations, `worker/features/x-posts/infrastructure/x-shared-budget.ts`, `worker/app/x-gateway.ts`, `x-api.ts`, collection/reference adapters and runtime entry points.

- [x] Add UTC shared budget, idempotent request results, per-site controls/targets and owned subscriptions/dispatch inbox schema. Keep legacy singleton table; import its state in an additional generated data migration.
- [x] Add typed serializable request/result ports. Route all production user/timeline/post/reference reads through the OTW gateway. Supply the port explicitly from runtime composition, including Queue/manual paths; missing RPC/ledger must not use direct X.
- [x] Atomically reserve before provider dispatch; account uncertain dispatched requests conservatively. Reuse existing cost estimation and local observational ledgers. Persist request identity/result to prevent replayed event hydration from invoking the provider twice.
- [x] Seed the first day from both sites' used/reserved amounts and the documented external canary cost. Roll over new UTC days without resetting the old day.
- [x] Include concurrency, retry/uncertain response, unavailable ledger and cross-site accounting regressions in the existing CI suite.

## 2. Multi-member coordinator and private RPC

**Files:** x-activity service/domain/HTTP/infrastructure, new named Worker entrypoints, `worker/index.ts`, queue/cron composition, site configs and local test bindings.

- [x] Site RPC calculates active allowed targets and rechecks policy before local receipt/storage. Caller/site roles are fixed by separate binding methods; no client-selected site, account or callback.
- [x] Resolve missing user IDs through the shared paid gateway, then update account identity without marking REST ranges complete. Sync targets individually; keep unrelated registrations running after an individual failure.
- [x] Deduplicate subscriptions by X user_id, retain owned ID/tag/webhook/event/filter evidence, refresh expiry through POST, and reconcile source removal plus uncertain registration/deletion.
- [x] Authenticate callback, record cost once and durably dispatch to each allowed site. Retry partial fanout through the existing typed background Queue; retain per-site processing and tombstones.
- [x] Stop owned subscriptions near the budget target. Budget stops alone resume at the next UTC day; user/site stops remain. Expose connection protocol/readiness explicitly.
- [x] Include duplicate delivery, source isolation, midnight resume, direct-stop preservation and partial registration regressions in existing CI.

## 3. Administrator flow and 24-hour recovery

**Files:** activity DTO/API/UI, collection scheduler/health readers, current-work/runbook.

- [x] Replace arbitrary single handle input with whole allowed-site apply/stop/resume controls and multi-member rows. Show site counts, failures, global budget, stop reason/resume time, recent deliveries and REST recovery state.
- [x] Set 24-hour recovery only as part of prepared activation. Retain existing cursors/continuations and preserve incomplete/error semantics. Do not restore high-frequency collection during rollback/retry.
- [x] Include the interrupted-cursor and actual reachable admin flow regressions in existing CI.

## 4. Compatible release and mandatory readback

- [x] Read current account D1 analytics before remote D1 access; retain account 5M/background4M protection and other held automation.
- [x] Commit the integrated X scope, open/attach its PR and use the existing automatic build/CI route. No new paid or independent validation runs.
- [x] Apply additive migrations compatible with old Workers. Prepare named receiver exports in LuvDia without unready mutual bindings, then use OTW's normal merge-triggered build for the coordinator and LuvDia binding, then deploy LuvDia's final coordinator binding. Keep new paid activity off until both sides and the shared budget are ready.
- [x] Seed existing-day usage/holds, activate allowed targets, change recovery cadence to24h, and read back actual artifact identity, migrations, target/subscription counts, cadence, shared budget and failure scope.
- [x] Report actual partial failures without losing data/cursors or raising budgets. Natural media quality and long-running observation belong to the user after release.

운영 반영 완료(2026-10-26 14:26 KST): [PR194 실제 관리자·공급자/DB readback](https://github.com/rlatmfrl24/overthewall-schedule/pull/194#issuecomment-6408933733). 자연 미디어·장기 복구/갱신 관측은 승인대로 이후 확인한다.
