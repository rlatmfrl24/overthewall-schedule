# OTW Schedule Documentation

This directory keeps durable project documentation. Keep current runbooks and
product documentation at the top level. Move time-bound research, drafts, and
decision records that are no longer the source of truth into `docs/archive/`.

## Current References

| Document                                               | Purpose                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `../README.md`                                         | Product overview, active features, and local development entry points.                             |
| `../Design.md`                                         | Current UI design system and screen-level implementation guidance.                                 |
| `../AGENTS.md`                                         | Agent configuration entrypoint and `.agent` / `.cursor` mirror policy.                             |
| `architecture.md`                                      | Current system diagrams, capability flows, dependency direction, and architecture gates.           |
| `architecture-refactoring-verification.md`             | Completion evidence and original-purpose audit for the architecture refactor.                      |
| `cloudflare-production-account-migration.md`           | Production-account isolation, runtime consolidation, cutover, verification, and rollback baseline. |
| `auto-update.md`                                       | Admin-approved CHZZK VOD based schedule auto-update flow.                                          |
| `cache-policy.md`                                      | Frontend, Worker memory, D1, and HTTP cache TTL roles.                                             |
| `operations/member-post-storage-policy.md`             | X and Naver member-post retention, redaction, public-read, and implementation closeout policy.     |
| `operations/x-member-history-and-archive-design.md`    | Canonical forward-only X feed, permanent admin archive, redaction, cost, and operational Closeout.      |
| `operations/scheduled-jobs-v2.md`                      | D1/Workflow/Queue scheduler operations and the production collection-stabilization closeout.       |
| `otw-play-product-requirements.md`                     | Living product requirements and decision baseline for OTW Play.                                    |
| `otw-play-system-design.md`                            | Clean Architecture, Cloudflare runtime, API, algorithms, and D1 schema design for OTW Play.        |
| `otw-play-ui-ux-design.md`                             | OTW Play visual direction, responsive flows, player, submission, and admin UX specification.       |
| `otw-play-implementation-guide.md`                     | Phased implementation, migration, verification, rollout, and rollback plan for OTW Play.           |
| `youtube-optimization.md`                              | YouTube API quota, caching, and fallback strategy.                                                 |

## Archived Context

`docs/archive/` contains exploratory analysis and drafts that remain useful as
background but should not be treated as current implementation guidance.
The completed clean architecture execution plan is preserved as
`archive/architecture-refactoring-plan.md` for historical context.

## Maintenance Rules

- Update `Design.md` when app shell, page header, card, navigation, color, or
  accessibility patterns change.
- Prefer one current runbook plus archived background notes over multiple active
  drafts for the same workflow.
- `.agent` is the source of truth for agent rules and skills. Do not edit
  `.cursor` mirrors directly; run `pnpm sync:agent-cursor` instead.
