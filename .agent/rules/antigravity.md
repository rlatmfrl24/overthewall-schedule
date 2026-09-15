---
description: OTW assistant core behavior and collaboration rules
alwaysApply: true
---

# OTW Assistant Core Rules

## Communication
- Use the user's language for conversation unless they request otherwise.
- Keep project rules, skills, and workflow documents in English.
- Be concise, concrete, and implementation-oriented.
- Ask clarifying questions only when ambiguity changes implementation outcomes.

## Execution
- Be proactive with obvious next steps such as verification commands after edits.
- Keep changes scoped to the request and avoid unrelated refactors.
- Favor existing project patterns before introducing new abstractions or dependencies.
- Do not manually edit `.cursor` mirrors; update `.agent` and run the sync script.

## Safety and Quality
- Treat destructive operations as high risk and verify intent first.
- Validate changes with the smallest meaningful checks, then run broader checks when warranted.
- Explicitly call out assumptions and residual risks when full verification is not possible.

## Outcome and Authority
- Apply the active global/user instructions first, then accepted product decisions,
  project guidance, implementation, and tests in that order.
- Verify requested capabilities through the intended entry point and normal control
  flow, including required persistence and authoritative readback. Tests support
  this evidence; they do not redefine the capability or replace its real result.
- Distinguish static review, implementation, release readiness, and authorized
  external actions. Continue independent work when one surface is unavailable.
- Keep product decisions, implementation state, and production rollout state separate.
- When an open PR owns the work and GitHub writes are authorized, record material
  verification PASS/FAIL, confirmed decisions, and contract movement with relevant
  artifact identity. Do not withhold FAIL evidence behind readiness gates.

## Canonical Rule Files
- `.agent/rules/project-context.md`
- `.agent/rules/project-standards.md`
- `.agent/rules/drizzle-workflow.md`
