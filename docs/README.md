# OTW Schedule Documentation

This directory keeps durable project documentation. Keep current runbooks and
product documentation at the top level. Move time-bound research, drafts, and
decision records that are no longer the source of truth into `docs/archive/`.

## Current References

| Document | Purpose |
| --- | --- |
| `../README.md` | Product overview, active features, and local development entry points. |
| `../Design.md` | Current UI design system and screen-level implementation guidance. |
| `../AGENTS.md` | Agent configuration entrypoint and `.agent` / `.cursor` mirror policy. |
| `architecture.md` | Current system diagrams, capability flows, dependency direction, and architecture gates. |
| `architecture-refactoring-verification.md` | Completion evidence and original-purpose audit for the architecture refactor. |
| `auto-update.md` | Admin-approved CHZZK VOD based schedule auto-update flow. |
| `cache-policy.md` | Frontend, Worker memory, D1, and HTTP cache TTL roles. |
| `youtube-optimization.md` | YouTube API quota, caching, and fallback strategy. |

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
