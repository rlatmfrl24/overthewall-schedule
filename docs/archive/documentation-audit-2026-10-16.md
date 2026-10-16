# 2026-10-16 문서 전체 점검·처분 기록

이 문서는 직전 문서 정리 작업의 기록이다. 이후 미커밋 코드 리뷰·PR 준비와 사용자의 병합 대기 결정은 [후속 리뷰](../reports/sul-36/2026-10-16-uncommitted-review.md)를 따른다. 아래의 당시 미커밋·문서 전용 검증 범위를 후속 PR 전체의 상태로 해석하지 않는다.

최종 로컬 검증(2026-10-16 KST): 문서 보존/참조 검사 PASS, 현행 로컬 참조 누락0, git diff --check PASS, Agent sync --check는0written/27unchanged/27managed 및 references valid였다. 이 검사에 D1·서비스 API·애플리케이션 테스트·build·배포는 포함하지 않았다.

기준 소스: 462779cf1db6b7e06fadc46d0dc3f878762e241b. 현재 실행/중단 조건은 [현재 작업](../current-work.md)만 소유한다.

## 범위와 실제 처리

릴리스 작업 트리144개, 원본 작업 트리141개, X 작업 트리119개 문서/정책/배포 텍스트의 목록·제목·본문 표기·로컬 참조를 대조했다. 같은 문서의 작업 트리별 사본을 별도 요구사항으로 세지 않았다. 코드·DB·서비스 운영을 재검증한 점검은 아니다.

- 과거 실행 계획·기술 검토·날짜가 있는 QA/운영 기록25개 이동, 이전 색인/상태표2개 snapshot 보존.
- 기존 미커밋 문서의 링크 및 실행 기록을 위한 이동 안내10개 유지. 고유 기록은 영구 삭제하지 않았다.
- 남은 요구·중단 조건·9004 진단·검증 한계를 현재 작업 한 곳으로 통합. 계약은 필요할 때 참조하고 과거 계획은 새 지시로 사용하지 않음.
- .agent 원본·생성 mirror, 제품/인증/보존 계약, 법적 라이선스와 배포 자산은 유지.
- 기존 미커밋 보고서3개, 원본409개 WIP 파일, 원본/X 작업 트리의 문서 전체 해시와 HEAD 보존 검사.
- D1 SQL/마이그레이션/DB 테스트/doctor/수집/사이트 조회/배포를 실행하지 않음. 자동화는 기존 두 설정에 명시적 D1 중단 조건만 추가.

## 기존144개 문서별 판단

| 기존 위치 | 판단 | 원문/현재 위치 |
| --- | --- | --- |
| .agent/rules/antigravity.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/rules/antigravity.md) |
| .agent/rules/architecture.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/rules/architecture.md) |
| .agent/rules/drizzle-workflow.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/rules/drizzle-workflow.md) |
| .agent/rules/project-context.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/rules/project-context.md) |
| .agent/rules/project-standards.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/rules/project-standards.md) |
| .agent/skills/branch-maintenance/SKILL.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/skills/branch-maintenance/SKILL.md) |
| .agent/skills/branch-maintenance/references/procedure.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/skills/branch-maintenance/references/procedure.md) |
| .agent/skills/code-review/SKILL.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/skills/code-review/SKILL.md) |
| .agent/skills/db-migration/SKILL.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/skills/db-migration/SKILL.md) |
| .agent/skills/db-migration/references/checklist.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/skills/db-migration/references/checklist.md) |
| .agent/skills/release-ops/SKILL.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/skills/release-ops/SKILL.md) |
| .agent/skills/release-ops/references/preflight-checklist.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/skills/release-ops/references/preflight-checklist.md) |
| .agent/skills/worker-api-change/SKILL.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/skills/worker-api-change/SKILL.md) |
| .agent/skills/worker-api-change/references/touchpoints.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/skills/worker-api-change/references/touchpoints.md) |
| .agent/workflows/branch-maintenance.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/workflows/branch-maintenance.md) |
| .agent/workflows/db-migration.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/workflows/db-migration.md) |
| .agent/workflows/local-dev-setup.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/workflows/local-dev-setup.md) |
| .agent/workflows/worker-deploy.md | 현행 계약·선택 참조 유지 | [문서](../../.agent/workflows/worker-deploy.md) |
| .agents/skills/branch-maintenance/SKILL.md | 생성 mirror 유지 | [문서](../../.agents/skills/branch-maintenance/SKILL.md) |
| .agents/skills/code-review-otw/SKILL.md | 생성 mirror 유지 | [문서](../../.agents/skills/code-review-otw/SKILL.md) |
| .agents/skills/db-migration/SKILL.md | 생성 mirror 유지 | [문서](../../.agents/skills/db-migration/SKILL.md) |
| .agents/skills/release-ops/SKILL.md | 생성 mirror 유지 | [문서](../../.agents/skills/release-ops/SKILL.md) |
| .agents/skills/worker-api-change/SKILL.md | 생성 mirror 유지 | [문서](../../.agents/skills/worker-api-change/SKILL.md) |
| .cursor/rules/architecture.mdc | 생성 mirror 유지 | [문서](../../.cursor/rules/architecture.mdc) |
| .cursor/rules/drizzle-workflow.mdc | 생성 mirror 유지 | [문서](../../.cursor/rules/drizzle-workflow.mdc) |
| .cursor/rules/project-standards.mdc | 생성 mirror 유지 | [문서](../../.cursor/rules/project-standards.mdc) |
| .cursor/skills/branch-maintenance/SKILL.md | 생성 mirror 유지 | [문서](../../.cursor/skills/branch-maintenance/SKILL.md) |
| .cursor/skills/branch-maintenance/references/procedure.md | 생성 mirror 유지 | [문서](../../.cursor/skills/branch-maintenance/references/procedure.md) |
| .cursor/skills/code-review-otw/SKILL.md | 생성 mirror 유지 | [문서](../../.cursor/skills/code-review-otw/SKILL.md) |
| .cursor/skills/db-migration/SKILL.md | 생성 mirror 유지 | [문서](../../.cursor/skills/db-migration/SKILL.md) |
| .cursor/skills/db-migration/references/checklist.md | 생성 mirror 유지 | [문서](../../.cursor/skills/db-migration/references/checklist.md) |
| .cursor/skills/release-ops/SKILL.md | 생성 mirror 유지 | [문서](../../.cursor/skills/release-ops/SKILL.md) |
| .cursor/skills/release-ops/references/preflight-checklist.md | 생성 mirror 유지 | [문서](../../.cursor/skills/release-ops/references/preflight-checklist.md) |
| .cursor/skills/worker-api-change/SKILL.md | 생성 mirror 유지 | [문서](../../.cursor/skills/worker-api-change/SKILL.md) |
| .cursor/skills/worker-api-change/references/touchpoints.md | 생성 mirror 유지 | [문서](../../.cursor/skills/worker-api-change/references/touchpoints.md) |
| .superpowers/sdd/2026-10-13-luvdia-independent-deployments/task-4-3-incident.md | 실행 증거 원위치 보존 | [문서](../../.superpowers/sdd/2026-10-13-luvdia-independent-deployments/task-4-3-incident.md) |
| .superpowers/sdd/2026-10-13-luvdia-independent-deployments/task-4-3-report.md | 실행 증거 원위치 보존 | [문서](../../.superpowers/sdd/2026-10-13-luvdia-independent-deployments/task-4-3-report.md) |
| AGENTS.md | 현행 계약·선택 참조 유지 | [문서](../../AGENTS.md) |
| Design.md | 현행 계약·선택 참조 유지 | [문서](../../Design.md) |
| PRODUCT.md | 현행 계약·선택 참조 유지 | [문서](../../PRODUCT.md) |
| README.md | 현행 계약·선택 참조 유지 | [문서](../../README.md) |
| design-qa.md | 아카이브 이동 | [문서](2026-10-16/design-qa.md) |
| docs/README.md | 현행 계약·선택 참조 유지 | [문서](../README.md) |
| docs/aeo.md | 현행 계약·선택 참조 유지 | [문서](../aeo.md) |
| docs/architecture.md | 현행 계약·선택 참조 유지 | [문서](../architecture.md) |
| docs/archive/README.md | 기존 과거 기록 유지 | [문서](README.md) |
| docs/archive/ai-review-optimization-2026-09-22.md | 기존 과거 기록 유지 | [문서](ai-review-optimization-2026-09-22.md) |
| docs/archive/architecture-refactoring-plan.md | 기존 과거 기록 유지 | [문서](architecture-refactoring-plan.md) |
| docs/archive/architecture-refactoring-verification.md | 기존 과거 기록 유지 | [문서](architecture-refactoring-verification.md) |
| docs/archive/auto-update-heuristic-v2-review.md | 기존 과거 기록 유지 | [문서](auto-update-heuristic-v2-review.md) |
| docs/archive/backend-cost-optimization-before-2026-09-17.md | 기존 과거 기록 유지 | [문서](backend-cost-optimization-before-2026-09-17.md) |
| docs/archive/branch-consolidation-2026-09-22.md | 기존 과거 기록 유지 | [문서](branch-consolidation-2026-09-22.md) |
| docs/archive/documentation-closeout-2026-09-17.md | 기존 과거 기록 유지 | [문서](documentation-closeout-2026-09-17.md) |
| docs/archive/external-share-banner-review.md | 기존 과거 기록 유지 | [문서](external-share-banner-review.md) |
| docs/archive/graphify-2026-09-17/APIFETCH_TRACE.md | 기존 과거 기록 유지 | [문서](graphify-2026-09-17/APIFETCH_TRACE.md) |
| docs/archive/graphify-2026-09-17/GRAPH_REPORT.md | 기존 과거 기록 유지 | [문서](graphify-2026-09-17/GRAPH_REPORT.md) |
| docs/archive/graphify-2026-09-17/LESSONS.md | 기존 과거 기록 유지 | [문서](graphify-2026-09-17/LESSONS.md) |
| docs/archive/graphify-2026-09-17/QUERY_TRACE.md | 기존 과거 기록 유지 | [문서](graphify-2026-09-17/QUERY_TRACE.md) |
| docs/archive/graphify-2026-09-17/README.md | 기존 과거 기록 유지 | [문서](graphify-2026-09-17/README.md) |
| docs/archive/music-player-member-mvp-review.md | 기존 과거 기록 유지 | [문서](music-player-member-mvp-review.md) |
| docs/archive/observation-validity-2026-09-09.md | 기존 과거 기록 유지 | [문서](observation-validity-2026-09-09.md) |
| docs/archive/otw-play-catalog-bulk-ingestion-and-proposal-lifecycle-research.md | 기존 과거 기록 유지 | [문서](otw-play-catalog-bulk-ingestion-and-proposal-lifecycle-research.md) |
| docs/archive/otw-play-channel-subscription-automation-research.md | 기존 과거 기록 유지 | [문서](otw-play-channel-subscription-automation-research.md) |
| docs/archive/otw-play-detailed-credits-and-member-songbook-research.md | 기존 과거 기록 유지 | [문서](otw-play-detailed-credits-and-member-songbook-research.md) |
| docs/archive/otw-play-implementation-guide-before-2026-09-17.md | 기존 과거 기록 유지 | [문서](otw-play-implementation-guide-before-2026-09-17.md) |
| docs/archive/otw-play-logo-2026-09-09/README.md | 기존 과거 기록 유지 | [문서](otw-play-logo-2026-09-09/README.md) |
| docs/archive/otw-play-product-requirements-before-2026-09-17.md | 기존 과거 기록 유지 | [문서](otw-play-product-requirements-before-2026-09-17.md) |
| docs/archive/otw-play-release-review.md | 기존 과거 기록 유지 | [문서](otw-play-release-review.md) |
| docs/archive/otw-play-system-design-before-2026-09-17.md | 기존 과거 기록 유지 | [문서](otw-play-system-design-before-2026-09-17.md) |
| docs/archive/otw-play-three-screen-design.md | 기존 과거 기록 유지 | [문서](otw-play-three-screen-design.md) |
| docs/archive/otw-play-ui-ux-design-before-2026-09-17.md | 기존 과거 기록 유지 | [문서](otw-play-ui-ux-design-before-2026-09-17.md) |
| docs/archive/remaining-work-priority-report-2026-09-17.md | 기존 과거 기록 유지 | [문서](remaining-work-priority-report-2026-09-17.md) |
| docs/archive/retired-implementation-cleanup-before-2026-09-17.md | 기존 과거 기록 유지 | [문서](retired-implementation-cleanup-before-2026-09-17.md) |
| docs/archive/session-consolidation-review-2026-09-14.md | 기존 과거 기록 유지 | [문서](session-consolidation-review-2026-09-14.md) |
| docs/archive/snapshot-poster-design-qa-2026-09.md | 기존 과거 기록 유지 | [문서](snapshot-poster-design-qa-2026-09.md) |
| docs/archive/sul-10-snapshot-design-qa.md | 기존 과거 기록 유지 | [문서](sul-10-snapshot-design-qa.md) |
| docs/archive/sul-27-validation-closeout.md | 기존 과거 기록 유지 | [문서](sul-27-validation-closeout.md) |
| docs/archive/testing-audit.md | 기존 과거 기록 유지 | [문서](testing-audit.md) |
| docs/archive/ui-component-inventory.md | 기존 과거 기록 유지 | [문서](ui-component-inventory.md) |
| docs/archive/ui-system-audit.md | 기존 과거 기록 유지 | [문서](ui-system-audit.md) |
| docs/archive/unused-implementation-audit-2026-09-09.md | 기존 과거 기록 유지 | [문서](unused-implementation-audit-2026-09-09.md) |
| docs/archive/vod-ai-summary-highlight-technical-review.md | 기존 과거 기록 유지 | [문서](vod-ai-summary-highlight-technical-review.md) |
| docs/archive/websub-hub-diagnosis-2026-09-09.md | 기존 과거 기록 유지 | [문서](websub-hub-diagnosis-2026-09-09.md) |
| docs/archive/x-provider-upload-404-incident-closeout.md | 기존 과거 기록 유지 | [문서](x-provider-upload-404-incident-closeout.md) |
| docs/archive/youtube-cadence-adjustment-2026-08-31.md | 기존 과거 기록 유지 | [문서](youtube-cadence-adjustment-2026-08-31.md) |
| docs/assets/otw-play-three-screen/prompts.md | 현행 계약·선택 참조 유지 | [문서](../assets/otw-play-three-screen/prompts.md) |
| docs/auto-update.md | 현행 계약·선택 참조 유지 | [문서](../auto-update.md) |
| docs/cache-policy.md | 현행 계약·선택 참조 유지 | [문서](../cache-policy.md) |
| docs/cloudflare-production-account-migration.md | 현행 계약·선택 참조 유지 | [문서](../cloudflare-production-account-migration.md) |
| docs/development-status.md | 진입점 갱신·이전 원문 보존 | [문서](2026-10-16/development-status-before-closeout.md) |
| docs/drizzle-workflow.md | 현행 계약·선택 참조 유지 | [문서](../drizzle-workflow.md) |
| docs/font-consistency-review.md | 아카이브 이동 | [문서](2026-10-16/font-consistency-review.md) |
| docs/operations/admin-collection-audit-2026-10-01.md | 아카이브 이동 | [문서](2026-10-16/operations/admin-collection-audit-2026-10-01.md) |
| docs/operations/aeo-seo-final-evaluation-2026-10-13.md | 아카이브 이동 | [문서](2026-10-16/operations/aeo-seo-final-evaluation-2026-10-13.md) |
| docs/operations/backend-cost-observation-final-2026-09-16.md | 아카이브 이동 | [문서](2026-10-16/operations/backend-cost-observation-final-2026-09-16.md) |
| docs/operations/backend-cost-optimization.md | 현행 계약·선택 참조 유지 | [문서](../operations/backend-cost-optimization.md) |
| docs/operations/channel-upload-polling.md | 현행 계약·선택 참조 유지 | [문서](../operations/channel-upload-polling.md) |
| docs/operations/member-post-storage-policy.md | 현행 계약·선택 참조 유지 | [문서](../operations/member-post-storage-policy.md) |
| docs/operations/retired-implementation-cleanup.md | 현행 계약·선택 참조 유지 | [문서](../operations/retired-implementation-cleanup.md) |
| docs/operations/scheduled-jobs-v2.md | 현행 계약·선택 참조 유지 | [문서](../operations/scheduled-jobs-v2.md) |
| docs/operations/search-console-indexing-2026-10-12.md | 아카이브 이동 | [문서](2026-10-16/operations/search-console-indexing-2026-10-12.md) |
| docs/operations/x-api-cost-minimization-design.md | 현행 계약·선택 참조 유지 | [문서](../operations/x-api-cost-minimization-design.md) |
| docs/operations/x-member-history-and-archive-design.md | 현행 계약·선택 참조 유지 | [문서](../operations/x-member-history-and-archive-design.md) |
| docs/operations/youtube-feed-retirement.md | 현행 계약·선택 참조 유지 | [문서](../operations/youtube-feed-retirement.md) |
| docs/otw-play-admin-workflow-integration.md | 현행 계약·선택 참조 유지 | [문서](../otw-play-admin-workflow-integration.md) |
| docs/otw-play-ai-review.md | 현행 계약·선택 참조 유지 | [문서](../otw-play-ai-review.md) |
| docs/otw-play-implementation-guide.md | 현행 계약·선택 참조 유지 | [문서](../otw-play-implementation-guide.md) |
| docs/otw-play-import-review-redesign.md | 현행 계약·선택 참조 유지 | [문서](../otw-play-import-review-redesign.md) |
| docs/otw-play-playlist-work-queue.md | 현행 계약·선택 참조 유지 | [문서](../otw-play-playlist-work-queue.md) |
| docs/otw-play-product-requirements.md | 현행 계약·선택 참조 유지 | [문서](../otw-play-product-requirements.md) |
| docs/otw-play-redesign-review.md | 아카이브 이동 | [문서](2026-10-16/otw-play-redesign-review.md) |
| docs/otw-play-singing-clips-requirements-and-plan.md | 현행 계약·선택 참조 유지 | [문서](../otw-play-singing-clips-requirements-and-plan.md) |
| docs/otw-play-system-design.md | 현행 계약·선택 참조 유지 | [문서](../otw-play-system-design.md) |
| docs/otw-play-ui-ux-design.md | 현행 계약·선택 참조 유지 | [문서](../otw-play-ui-ux-design.md) |
| docs/reports/sul-31/README.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-31/README.md) |
| docs/reports/sul-31/admin-ui.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-31/admin-ui.md) |
| docs/reports/sul-36/2026-10-15-operations-audit-and-priorities.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-36/2026-10-15-operations-audit-and-priorities.md) |
| docs/reports/sul-36/2026-10-15-publication-cutover-execution.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-36/2026-10-15-publication-cutover-execution.md) |
| docs/reports/sul-36/2026-10-16-content-transition-retirement.md | 기존 미커밋 원문 보호 | [문서](../reports/sul-36/2026-10-16-content-transition-retirement.md) |
| docs/reports/sul-36/2026-10-16-otw-d1-incident.md | 현행 계약·선택 참조 유지 | [문서](../reports/sul-36/2026-10-16-otw-d1-incident.md) |
| docs/reports/sul-36/2026-10-16-otw-temporary-maintenance.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-36/2026-10-16-otw-temporary-maintenance.md) |
| docs/reports/sul-36/2026-10-16-publication-production-release.md | 기존 미커밋 원문 보호 | [문서](../reports/sul-36/2026-10-16-publication-production-release.md) |
| docs/reports/sul-36/2026-10-16-work-register.md | 기존 미커밋 원문 보호 | [문서](../reports/sul-36/2026-10-16-work-register.md) |
| docs/reports/sul-36/README.md | 진입점 갱신·이전 원문 보존 | [문서](2026-10-16/reports/sul-36/technical-review-before-closeout.md) |
| docs/reports/sul-36/implementation-rulings.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-36/implementation-rulings.md) |
| docs/reports/sul-36/initial-service-launch.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-36/initial-service-launch.md) |
| docs/reports/sul-36/local-implementation-verification.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-36/local-implementation-verification.md) |
| docs/reports/sul-36/operational-upload-incident.md | 현행 계약·선택 참조 유지 | [문서](../reports/sul-36/operational-upload-incident.md) |
| docs/reports/sul-36/otw-resume-and-luvdia-collection.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-36/otw-resume-and-luvdia-collection.md) |
| docs/reports/sul-36/pre-implementation-review.md | 아카이브 이동 | [문서](2026-10-16/reports/sul-36/pre-implementation-review.md) |
| docs/superpowers/plans/2026-10-13-luvdia-independent-deployments.md | 아카이브 이동 | [문서](2026-10-16/plans/2026-10-13-luvdia-independent-deployments.md) |
| docs/superpowers/plans/2026-10-14-otw-play-metadata-first-ai-draft.md | 현행 계약·선택 참조 유지 | [문서](../superpowers/plans/2026-10-14-otw-play-metadata-first-ai-draft.md) |
| docs/superpowers/plans/2026-10-15-shared-release-architecture.md | 아카이브 이동 | [문서](2026-10-16/plans/2026-10-15-shared-release-architecture.md) |
| docs/superpowers/plans/2026-10-15-site-performance-operations.md | 아카이브 이동 | [문서](2026-10-16/plans/2026-10-15-site-performance-operations.md) |
| docs/superpowers/plans/2026-10-15-site-publication-cutover.md | 아카이브 이동 | [문서](2026-10-16/plans/2026-10-15-site-publication-cutover.md) |
| docs/superpowers/plans/2026-10-16-content-transition-retirement.md | 아카이브 이동 | [문서](2026-10-16/plans/2026-10-16-content-transition-retirement.md) |
| docs/superpowers/plans/2026-10-16-publication-production-release.md | 아카이브 이동 | [문서](2026-10-16/plans/2026-10-16-publication-production-release.md) |
| docs/superpowers/plans/2026-10-16-release-readiness-and-backlog.md | 아카이브 이동 | [문서](2026-10-16/plans/2026-10-16-release-readiness-and-backlog.md) |
| docs/superpowers/specs/2026-10-13-luvdia-independent-deployments-design.md | 아카이브 이동 | [문서](2026-10-16/specs/2026-10-13-luvdia-independent-deployments-design.md) |
| docs/testing.md | 현행 계약·선택 참조 유지 | [문서](../testing.md) |
| docs/youtube-optimization.md | 현행 계약·선택 참조 유지 | [문서](../youtube-optimization.md) |
| public/fonts/README.md | 배포 자산·라이선스 유지 | [문서](../../public/fonts/README.md) |
| public/fonts/inter-4.1/LICENSE.txt | 배포 자산·라이선스 유지 | [문서](../../public/fonts/inter-4.1/LICENSE.txt) |
| public/robots.txt | 배포 자산·라이선스 유지 | [문서](../../public/robots.txt) |

## 원본 미커밋 문서 — 읽기 전용 보존

아래 원본 작업 트리의 문서 수정도 이동·병합·덮어쓰지 않았다. 릴리스 사본의 문서 정리와 구분한다.

- .agent/rules/architecture.md
- .cursor/rules/architecture.mdc
- docs/development-status.md
- docs/otw-play-ai-review.md
- docs/reports/sul-36/2026-10-15-operations-audit-and-priorities.md
- docs/reports/sul-36/2026-10-15-publication-cutover-execution.md
- docs/reports/sul-36/2026-10-16-otw-d1-incident.md
- docs/reports/sul-36/2026-10-16-otw-temporary-maintenance.md
- docs/reports/sul-36/2026-10-16-work-register.md
- docs/reports/sul-36/README.md
- docs/reports/sul-36/implementation-rulings.md
- docs/reports/sul-36/initial-service-launch.md
- docs/reports/sul-36/local-implementation-verification.md
- docs/reports/sul-36/otw-resume-and-luvdia-collection.md
- docs/reports/sul-36/pre-implementation-review.md
- docs/superpowers/plans/2026-10-13-luvdia-independent-deployments.md
- docs/superpowers/plans/2026-10-14-otw-play-metadata-first-ai-draft.md
- docs/superpowers/plans/2026-10-15-shared-release-architecture.md
- docs/superpowers/plans/2026-10-15-site-performance-operations.md
- docs/superpowers/plans/2026-10-15-site-publication-cutover.md
- docs/superpowers/plans/2026-10-16-release-readiness-and-backlog.md
- docs/superpowers/specs/2026-10-13-luvdia-independent-deployments-design.md
- scripts/maintenance/README.md

## 원래 프로젝트의 진입점 연결

원래 프로젝트 README.md·AGENTS.md의 기존 미커밋이 없는 두 문서에 시작 안내만 추가했고, docs/current-work.md는 릴리스 작업 트리의 실제 인계로 연결하는 짧은 포인터다. 원본409개 WIP 파일과 미커밋 문서23개는 수정하지 않았다. X 작업 트리도 수정하지 않았다. 원래 프로젝트에 전체 릴리스 변경을 섞어 넣지 않았다.

## 검증 결과와 한계

모든 이동/색인 snapshot은 기존 Git 원문과 본문을 대조했으며 바뀐 것은 아카이브 안내와 이동한 링크뿐이다. 보호한 미커밋 원문은 바이트 해시를 대조했다. 변경 범위는 문서뿐이며 stage/commit/push/배포는 하지 않았다. 로컬 Markdown 참조 1744개를 검사했다.

미해결 로컬 target 238개 중 현행 문서 0개, 과거 기록 238개다. 과거 임시 검증 산출물이나 당시 코드 경로는 현재 존재를 보장하지 않는다. 원문 삭제·성공으로의 상태 변경으로 숨기지 않는다.

다른 작업 트리의 기존 참조도 읽기 전용으로 대조했다. 원본/X의 미완료 코드·문서 참조는 이번 문서 작업에 흡수해 고치지 않았다.

{"primary":{"documents":142,"linksChecked":1484,"existingMissingReferences":236},"x":{"documents":119,"linksChecked":1325,"existingMissingReferences":236}}

| 문서 | 로컬 참조 | 구분 |
| --- | --- | --- |
| .superpowers/sdd/2026-10-13-luvdia-independent-deployments/task-4-3-report.md | ../../../.tmp/sul36-4-3-fix2-ui116.jpg | 과거 증거 |
| .superpowers/sdd/2026-10-13-luvdia-independent-deployments/task-4-3-report.md | ../../../.tmp/sul36-4-3-fix2-ui117.jpg | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/app/admin/resource-budgets.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/app/admin/resource-budgets.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/app/admin/resource-budgets.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-component-inventory.md | ../../src/features/youtube/ui/admin/youtube-cache-manager.tsx | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/daily-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/daily-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/daily-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/daily-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/daily-timeline-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/daily-timeline-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/daily-timeline-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/daily-timeline-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/weekly-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/weekly-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/weekly-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/weekly-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/notices-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/notices-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/notices-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/notices-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vods-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vods-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vods-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vods-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/kirinuki-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/kirinuki-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/kirinuki-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/kirinuki-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/chzzk-clips-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/chzzk-clips-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/chzzk-clips-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/chzzk-clips-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/chzzk-vods-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/chzzk-vods-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/chzzk-vods-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/chzzk-vods-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/feed-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/feed-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/feed-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/feed-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/multiview-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/multiview-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/multiview-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/multiview-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/rights-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/rights-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/rights-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/rights-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-discover-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-discover-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-discover-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-discover-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-search-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-search-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-search-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-search-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-search-top-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-search-top-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-search-top-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-search-top-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-filters-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-filters-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-filters-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-filters-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-detail-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-detail-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-detail-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-detail-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-details-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-details-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-details-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-details-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-review-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-review-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-review-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submit-review-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submissions-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submissions-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submissions-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submissions-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-dashboard-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-dashboard-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-dashboard-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-dashboard-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-review-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-review-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-review-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-review-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-rejections-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-rejections-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-rejections-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-rejections-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-x-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-x-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-x-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-x-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-naver-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-naver-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-naver-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-naver-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-schedule-settings-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-schedule-settings-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-schedule-settings-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-schedule-settings-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-youtube-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-youtube-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-youtube-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-youtube-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-kirinuki-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-kirinuki-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-kirinuki-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-kirinuki-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-notices-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-notices-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-notices-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-notices-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-ddays-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-ddays-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-ddays-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-ddays-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-snapshot-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-snapshot-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-snapshot-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-snapshot-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-catalog-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-catalog-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-catalog-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-catalog-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-review-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-review-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-review-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-review-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-import-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-import-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-import-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-import-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-channels-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-channels-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-channels-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-channels-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-operations-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-operations-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-operations-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-play-operations-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-resources-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-resources-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-resources-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-resources-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-images-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-images-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-images-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-images-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-history-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-history-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-history-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-history-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-schedule-history-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-schedule-history-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-schedule-history-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-schedule-history-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-audit-history-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-audit-history-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-audit-history-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-audit-history-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/profile-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/profile-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/profile-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/profile-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/snapshot-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/snapshot-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/snapshot-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/snapshot-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/snapshot-timeline-390-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/snapshot-timeline-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/snapshot-timeline-1440-light.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/snapshot-timeline-1440-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/notices-before.json | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/notices-saved.json | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/notices-restored.json | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-notice-unsaved.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-unsaved-confirm.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/schedule-unsaved-1440-low-height.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/notice-validation-error-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/notice-dialog-long-320-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-history-keyboard-summary.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-url-back.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/chzzk-clips-collapsed.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-filters-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-search-empty.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-player-390-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-submission-duplicate.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vod-boundary-1024x768.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/multiview-selected.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/snapshot-timeline-dark.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/nested-not-found.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vod-boundary-320x568.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vod-boundary-768x720.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vod-boundary-1024x768.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vod-boundary-1280x800.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/vod-boundary-1440x500.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-boundary-320x568.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-boundary-768x720.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-boundary-1024x768.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-boundary-1280x800.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/play-boundary-1440x500.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-boundary-320x568.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-boundary-768x720.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-boundary-1024x768.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-boundary-1280x800.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/admin-boundary-1440x500.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/profile-boundary-320x568.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/profile-boundary-768x720.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/profile-boundary-1024x768.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/profile-boundary-1280x800.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-system-audit/profile-boundary-1440x500.png | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-final-architecture.log | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-final-sync.log | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-final-typecheck.log | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-final-lint.log | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-final-coverage.log | 과거 증거 |
| docs/archive/ui-system-audit.md | ../../.tmp/ui-final-build.log | 과거 증거 |
