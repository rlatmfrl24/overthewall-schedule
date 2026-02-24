---
description: Compatibility wrapper for local development setup.
---

# Local Dev Setup (Compatibility)

Use canonical guidance:
- Project context: `../rules/project-context.md`
- DB setup checklist: `../skills/db-migration/references/checklist.md`
- API touchpoints: `../skills/worker-api-change/references/touchpoints.md`

Minimum bootstrap commands:
1. `pnpm install`
2. `pnpm cf-typegen`
3. `pnpm drizzle:migrate:local`
4. `pnpm dev`
