# X Recent Free Check Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this cohesive repair, then a fresh whole-branch reviewer. Track each action below.

**Goal:** 최근48시간 대상 최대4페이지 무료 확인을 유한하게 완료하고 실제 실패의 재개·공식12시간 보완·기존 상태를 보존한다.

**Architecture:** 기존 Worker→Workflow→Queue→D1 저장을 유지한다. 정상 첫 페이지 ACK에서 기존 장기 탐색을 보존하고 고정 범위 확인으로 이관한다. 완료·상한·미완료를 동일한 상태 계약으로 collector/planner/admin API/UI에 전달한다.

**Tech Stack:** Node24.20.0/pnpm11.7.0, TypeScript, Workers/Workflows/Queues/D1/Drizzle/React. 새 의존성 없음.

**Spec:** [승인 설계](../specs/2026-11-04-x-recent-free-check-design.md).

## Global Constraints

- 무료30분·최근48시간·타임라인 최대4페이지, RSS6시간·공식12시간 및 기존 fallback 유지.
- 공통 UTC 하루$1 목표·사이트/자동충전·D1/Queue guard·웹훅 Disabled·Play/AI 중지 유지. 강제 유료·새 자동화 없음.
- 원본·공식cursor/clock·권위/CAS·숨김/삭제/허용 목록을 보존한다. 완료를 전량 보장으로 표시하지 않는다.
- 기존8개 cursor는 migration/배포로 변경하지 않고 정상 첫 저장 ACK에서 은퇴 정보로 보존한다.

## Review Focus

1. 같은 head·오래된 글 뒤의 정상 다음 페이지가 이번 확인에서 제외되지 않는가.
2. 페이지4 상한 완료와 실제 저장 실패/미완료를 DTO/UI가 다르게 표시하는가.
3. 재개 시 기존 고정 범위와 최신 head 확인이 서로의 cursor/페이지 수를 덮지 않는가.
4. 은퇴 정보·공식clock·숨김·예산·RSS50회 한도가 보존되는가.
5. 배포/migration만으로 운영 설정·기존 cursor가 바뀌지 않는가.

## Task1 — bounded collector와 모든 소비자

Files: db/schema/index.ts, 생성 Drizzle SQL/meta, vitest.worker.config.ts, scripts/d1-doctor-core.mjs(+테스트 필요 범위), contracts/x-collection.ts, worker/features/x-posts/infrastructure/{fx-collection.ts,fx-collection.integration.test.ts,x-collection-status.ts,관련status회귀}, worker/features/scheduled-operations/infrastructure/{scheduled-job-planner.ts,관련planner/native회귀}, src/features/member-posts/ui/admin/{x-collection-manager.tsx,x-collection-manager.test.tsx}.

- [ ] RED: 기존 장기 cursor가 새 head.page2를 버리는 사례와4페이지 뒤 영구partial을 실제 D1 회귀로 재현한다.
- [ ] Additive schema: window_until_at, pages_completed, last_window_until_at, last_window_limited, retired_progress. Drizzle 생성만 사용한다. retired_progress에는 원래 cursor/완료 시각/전환 시각/사유를 보존한다.
- [ ] Collector: 성공한 첫 페이지의 수신 시각으로 범위를 고정한다. 48시간/활성화 경계로 저장한다. 페이지 수·cursor·범위·은퇴 정보·완료는 lease/공개 fence ACK로 함께 저장한다. 실패 후 첫 미저장 페이지를 재개하며 최신 head 확인을 포함해4페이지를 지킨다. cursor없음/4페이지 저장으로 확인을 끝내고 상한을 별도 기록한다.
- [ ] Planner/API: cursorNULL인 첫 페이지 실패도 실제 window pending으로 판정한다. 공식 cursor/12시간 자격에는 사용하지 않는다. 기존 provider/mode 계약과 공개 DTO를 보존한다.
- [ ] Admin API/UI: 48시간/최대4페이지/확인 완료 범위/상한 도달/보존된 이전 탐색/실제 재시도를 표시한다. 오래된 서버 DTO는 기존 의미로 읽는 additive 필드로 유지한다. 공식 실패/예산·Disabled 표시는 별도 유지한다.
- [ ] GREEN: Fx D1·status·planner/native·관리 UI 회귀, 타입·구조·변경lint. 새 migration 전체chain validate-only/로컬incremental/doctor로 기존 app데이터 보존 확인.
- [ ] 명시적 파일만 stage/commit: feat(x): bound free collection to recent checks.

## Task2 — 검증·릴리스·실제 두 확인

- [ ] 마지막 전체 소스를 fresh scoped 리뷰하고 유효 지적을 RED→GREEN으로 해결한다.
- [ ] 최종 preflight 또는 유효한 기존 근거+실패/변경/미도달 단계의 composed 검증을 완료한다. 양 사이트 build/manifest, local migration chain/doctor, RSS전체Queue50 회귀를 포함한다.
- [ ] 로컬 정상 관리자 무료 실행에서 실제 Fx→D1→공개 피드·정상 완료를 두 번 확인한다. 데이터/공식/예산/Disabled 기준을 먼저 읽고 비교한다.
- [ ] 정상 push/PR과 실제head/check/review 확인 후 기존 승인 범위로 merge한다. OTW 자동 배포 중 수동 중복 배포하지 않는다.
- [ ] additive migration을 정상 릴리스 경로로 OTW→LuvDia 적용/readback하고 같은 소스를 배포한다. 최초 정상 무료 확인 이전에는 기존 cursor/설정이 그대로임을 확인한다.
- [ ] OTW→LuvDia 정상 관리자 무료 실행과 이어지는 두 번째 확인으로 active pending이 정상 소진되고 은퇴 정보8개·공식상태·예산·Disabled·기존 글·공개 피드를 검증한다. 강제 공식실행은 하지 않는다.
- [ ] 실제 PASS/FAIL·artifact/runID·한계를 소유 PR과 결과 기록에 남긴다. 작업 외 worktree/데이터는 보존한다.

## Rulings

- 최근48시간 확인은4페이지로 제한한 스냅샷 작업이다. 완료는 전량 발견 증명이 아니며 상한/공식대조 상태를 함께 표시한다 — 사용자 명시적 승인.
- 검색 endpoint 실제404로 기존 고정 ID profile JSON만 사용한다 — 확인된 정상 경로 유지.
