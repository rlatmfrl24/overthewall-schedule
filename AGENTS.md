# Agent Configuration for OTW Schedule

## Canonical Policy
- `.agent` is the canonical source for project rules and skills.
- `.cursor` is a generated mirror for Cursor compatibility.
- `.agents/skills` contains generated Codex discovery entries pointing to `.agent`.
- Do not manually edit generated discovery entries; the same sync commands maintain both surfaces.
- Do not manually edit mirrored `.cursor` files listed below.
- After changing mirrored `.agent` files, run:
  - `pnpm sync:agent-cursor`
  - `pnpm sync:agent-cursor:check`

## Skills

### Available skills
- `branch-maintenance`: Safely clean merged local task branches and fast-forward the default branch. Path: `.agent/skills/branch-maintenance/SKILL.md`
- `code-review-otw`: Review OTW code changes for correctness, security, performance, accessibility, and regression risks. Path: `.agent/skills/code-review/SKILL.md`
- `db-migration`: Execute safe Drizzle and D1 migration workflows. Path: `.agent/skills/db-migration/SKILL.md`
- `worker-api-change`: Implement `/api` contract changes across worker routes and frontend API clients. Path: `.agent/skills/worker-api-change/SKILL.md`
- `release-ops`: Run release and deployment preflight checks for the web app, Worker, and D1-backed changes. Path: `.agent/skills/release-ops/SKILL.md`

### Trigger rules
- Use `branch-maintenance` for merged-branch cleanup, stale ref pruning, or default-branch synchronization requests.
- Use `code-review-otw` for code, PR, or implementation regression review; general product/document/skill reviews do not trigger it.
- Use `db-migration` for schema or migration changes.
- Use `worker-api-change` for `/api` endpoints, payloads, query params, or frontend API client changes.
- Use `release-ops` for deployment readiness and release safety checks.

### Skill usage order
1. Use the minimum set of relevant skills for the request.
2. Sequence skills by dependency:
   - `db-migration` before `release-ops` for schema-aware releases.
   - `worker-api-change` before `release-ops` for API contract releases.
3. Keep canonical updates in `.agent`; generate `.cursor` and `.agents/skills` with the sync script. Its check validates content, managed inventory, and local Markdown references.

## Canonical Rules
- `.agent/rules/antigravity.md`
- `.agent/rules/project-context.md`
- `.agent/rules/project-standards.md`
- `.agent/rules/architecture.md`
- `.agent/rules/drizzle-workflow.md`

## Mirrored Cursor Targets
- `.cursor/rules/project-standards.mdc`
- `.cursor/rules/architecture.mdc`
- `.cursor/rules/drizzle-workflow.mdc`
- `.cursor/skills/branch-maintenance/SKILL.md`
- `.cursor/skills/code-review-otw/SKILL.md`
- `.cursor/skills/db-migration/SKILL.md`
- `.cursor/skills/worker-api-change/SKILL.md`
- `.cursor/skills/release-ops/SKILL.md`

## Codex Discovery

The five `.agents/skills/<skill-name>/SKILL.md` entries and their UI metadata
are generated from the canonical skills above. They contain portable relative
links, not personal global paths or symlinks. Branch maintenance stays in this
repository so a checkout works without a personal global installation.

For agent infrastructure changes, run `node --test scripts/sync-agent-to-cursor.test.mjs`
and `pnpm sync:agent-cursor:check`. These focused tests exercise missing sources,
drift, broken references, and portable generation in temporary directories.

## Compatibility Workflows
- `.agent/workflows/branch-maintenance.md`
- `.agent/workflows/db-migration.md`
- `.agent/workflows/local-dev-setup.md`
- `.agent/workflows/worker-deploy.md`

These wrappers must remain lightweight pointers to canonical skills and references.

## Current Repository Scope
- This repository currently ships the OTW Schedule web app and Cloudflare Worker only.
- No Chrome extension package is part of the active source tree. Do not recreate `extensions/*`, extension store metadata, or browser-extension release steps unless the user explicitly requests that work again.
- `/multiview` is currently a public Mul.Live iframe surface driven by selected CHZZK member channels, not an extension-assisted CHZZK DOM automation flow.
