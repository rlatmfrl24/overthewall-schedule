> 2026-10-16 아카이브: 당시 계획·검증 기록입니다. 미완료 표기를 현재 실행 지시로 사용하지 않습니다. 남은 작업과 중단 조건은 [현재 작업](../../../current-work.md)을 따릅니다.

# Content transition retirement implementation plan

Goal: Retain publication, ordinary persistence, asset protection and historical reads in their owning features; retire the transfer-only runtime/tests/triggers and deploy both sites before 2026-10-19 00:00 KST.

Accepted specification: the user's 2026-10-16 implementation request and approved four-part plan in this conversation.

## Constraints
- Preserve original 409-file WIP, the X worktree, existing data and migrations 0102-0140.
- Keep server-time publication, OTW members bing_hayu/u_lili/yang_mei, D-day 4/9/10/11, shared references and administrator policies.
- Retain final transaction publication guards and ordinary validation, authorization, audit, CAS, leases, retry and limits.
- Move nine mixed file-reference projection triggers into assets before deleting the 492 transfer-related triggers; retain 14 asset guards and six X triggers.
- No transfer, full remote validation, backfill, message purge or enabling intentionally disabled automation.

## Tasks
1. Extract content-access, assets and content-history contracts. Preserve behavior, add focused regression tests, run affected tests.
2. Remove transfer-only orchestration, writers, contracts, Queue/Cron hooks, UI messages and tests after retaining ordinary behavior and unique regression coverage.
3. Generate a follow-up migration; atomically replace mixed triggers and remove exact reviewed transfer-only names. Validate fresh/populated local D1 and old/new Worker compatibility.
4. Review final branch, complete Node 24 preflight and both builds; recheck live recovery responsibilities and budget, apply compatible migration/readback, merge single PR and verify OTW automatic / LuvDia same-source release. Update existing October 19 observer.

## Review focus
- Cross-midnight provider responses must roll back every owned write.
- Shared legitimate content remains readable and collectable.
- Failed/unknown asset writes never make referenced bytes deletable.
- Historical material remains read-only evidence with original provenance.
- Ordinary Queue/AI/Workflow recovery and X low-read maintenance remain intact.
