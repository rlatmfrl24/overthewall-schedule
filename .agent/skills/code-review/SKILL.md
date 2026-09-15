---
name: code-review-otw
description: Review OTW code or pull-request changes for contract correctness, regressions, security, performance, accessibility, and release risks. Use for code, PR, or implementation regression reviews; a general product, document, or skill review alone does not trigger this workflow.
---

# Code Review (OTW)

## Scope and authority

Follow the shared [outcome and authority rules](../../../.agent/rules/antigravity.md).
Identify the requested review depth: static inspection, targeted verification, or
release/real-flow verification. A review does not authorize fixes, publication,
remote mutations, or merging by itself; use existing session authorization.

## Review procedure

1. Record the change scope and relevant commit/PR HEAD. Separate working-tree
   changes, reviewed commits, and deployed artifacts when the difference matters.
2. Trace accepted requirements through the intended entry point, authorization,
   application use case, persistence/readback, and the user-visible result.
   Compare current decisions with implementation; historical drafts and tests
   must not redefine the accepted outcome.
3. Inspect trust boundaries, actor/audit behavior, data integrity, idempotency,
   races, cache invalidation, and failure/retry behavior affected by the change.
4. For Play changes, follow the relevant current product documents from the
   [project context](../../../.agent/rules/project-context.md). Check shared song
   identity, review/registration/publication boundaries, and actual playback
   when that capability is in scope. For scheduled work, distinguish request
   acceptance, dispatch, item outcomes, retries, and final operation status.
5. For UI changes, use [Design.md](../../../Design.md) and inspect the rendered
   affected flow when practical. For multiview, preserve public Mul.Live iframe
   behavior and repeated `c=` state without extension or cookie-bridge assumptions.
6. Execute the smallest relevant checks allowed by the review scope. When actual
   behavior verification is requested, use the intended UI/runtime and authoritative
   readback; unit tests or direct lower-level writes cannot replace that flow.
   For static-only review, propose the remaining runtime checks explicitly.

## Reporting

Lead with actionable findings ordered by severity and likelihood. Give each
finding a location, concrete trigger, impact, and required correction. If no
material issues are found, state that clearly and identify the evidence scope.
Then summarize executed checks, actual results, and remaining verification limits.
Omit empty severity sections and do not infer readiness from unexecuted tests.

For an owning open PR, follow the shared PR evidence policy when GitHub writes
are authorized. Record material PASS/FAIL evidence with the relevant HEAD even
when readiness or merge is blocked; routine activity belongs in the dev log.
