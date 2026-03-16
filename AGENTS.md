# Agent Configuration for OTW Schedule

## Canonical Policy
- `.agent` is the canonical source for project rules and skills.
- `.cursor` is a mirror generated from `.agent`.
- Do not manually edit mirrored `.cursor` files listed in this document.
- Keep mirrors updated with:
  - `pnpm sync:agent-cursor`
  - `pnpm sync:agent-cursor:check`

## Skills

### Available skills
- `code-review-otw`: Review OTW code changes for correctness, security, performance, and regression risks. Path: `.agent/skills/code-review/SKILL.md`
- `db-migration`: Execute safe Drizzle and D1 migration workflows. Path: `.agent/skills/db-migration/SKILL.md`
- `worker-api-change`: Implement API contract changes across worker routes and frontend API clients. Path: `.agent/skills/worker-api-change/SKILL.md`
- `release-ops`: Run preflight and deployment safety workflow for releases. Path: `.agent/skills/release-ops/SKILL.md`

### Trigger rules
- Use `code-review-otw` for review, PR review, or risk-review requests.
- Use `db-migration` for schema or migration changes.
- Use `worker-api-change` for `/api` contract or endpoint changes.
- Use `release-ops` for deployment readiness and release safety checks.

### Skill usage order
1. Use the minimum set of relevant skills for the request.
2. Sequence skills by dependency:
   - `db-migration` before `release-ops` for schema-aware releases.
   - `worker-api-change` before `release-ops` for API contract releases.
3. Keep canonical updates in `.agent`; mirror into `.cursor` with the sync script.

## Canonical Rules
- `.agent/rules/antigravity.md`
- `.agent/rules/project-context.md`
- `.agent/rules/project-standards.md`
- `.agent/rules/drizzle-workflow.md`

## Mirrored Cursor Targets
- `.cursor/rules/project-standards.mdc`
- `.cursor/rules/drizzle-workflow.mdc`
- `.cursor/skills/code-review-otw/SKILL.md`
- `.cursor/skills/db-migration/SKILL.md`
- `.cursor/skills/worker-api-change/SKILL.md`
- `.cursor/skills/release-ops/SKILL.md`

## Compatibility Workflows
- `.agent/workflows/db-migration.md`
- `.agent/workflows/local-dev-setup.md`
- `.agent/workflows/worker-deploy.md`

These wrappers must remain lightweight pointers to canonical skills and references.
