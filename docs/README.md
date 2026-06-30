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
| `auto-update.md` | Admin-approved CHZZK VOD based schedule auto-update flow. |
| `youtube-optimization.md` | YouTube API quota, caching, and fallback strategy. |
| `otw-schedule-plus-extension.md` | User-facing OTW Schedule + extension behavior and install notes. |
| `otw-schedule-plus-deployment-guide.md` | Chrome Web Store and production CTA release runbook. |
| `otw-schedule-plus-chrome-store-form.md` | Concrete Chrome Web Store form values for the current extension package. |
| `privacy.md` | OTW Schedule + privacy policy text. |

## Archived Context

`docs/archive/` contains exploratory analysis and drafts that remain useful as
background but should not be treated as current implementation guidance:

- CZViewer and external multiview research.
- Music player MVP analysis.
- Superseded OTW Schedule + release and Store listing drafts.

## Maintenance Rules

- Update `Design.md` when app shell, page header, card, navigation, color, or
  accessibility patterns change.
- Update extension docs whenever `extensions/otw-schedule-plus` permissions,
  user disclosures, or Store package behavior changes.
- Prefer one current runbook plus archived background notes over multiple active
  drafts for the same workflow.
- `.agent` is the source of truth for agent rules and skills. Do not edit
  `.cursor` mirrors directly; run `pnpm sync:agent-cursor` instead.
