---
description: OTW repository coding and documentation standards across frontend, worker, and shared contracts
alwaysApply: true
---

# OTW Project Standards

## Language and Scope
- Use the user's language in chat.
- Write new project rules, skills, and workflow documents in English.
- Keep changes tightly scoped to the requested task.
- Preserve backward compatibility unless the task explicitly requests a breaking change.

## Repository Structure
- `contracts`: wire DTOs shared by frontend and Worker.
- `db/schema/index.ts`: canonical Drizzle schema.
- `src/app`: providers, layout, and admin composition.
- `src/routes`: thin file-based route adapters.
- `src/features/<capability>`: colocated API, model, query, use-case, and UI code.
- `src/shared`: cross-capability API, query, UI, and library primitives.
- `worker/app`: exact route registry, cron composition, and runtime boundaries.
- `worker/platform`: Cloudflare auth, D1, HTTP helpers, cache policy, and runtime types.
- `worker/features/<capability>`: domain, application, ports, infrastructure, and HTTP adapters.
- `docs`: active documentation and `docs/archive` for superseded research or drafts.

## Naming and Exports
- Use kebab-case for filenames.
- Use PascalCase for React components and exported types.
- Use `useX` naming for hooks.
- Prefer named exports for app modules.

## Routing and App Shell
- Keep file-based route definitions in `src/routes`.
- Route files must expose `export const Route = createFileRoute(...)`.
- Keep route component logic in a local `RouteComponent` function where practical, but do not export extra named route components unless another module truly imports them.
- Do not hand-edit `src/routeTree.gen.ts`; regenerate via normal build or dev workflow.
- Use `PublicAppShell` for public app chrome, `ContentPageShell` for notice/VOD/member post style content pages, and chrome-free layouts for profile/snapshot routes.
- Keep public navigation changes centralized in `src/app/layout/app-navigation.ts`.

## Multiview
- Keep `/multiview` usable without authentication and without browser-extension support unless the product requirement changes.
- Use the current Mul.Live iframe fallback model for CHZZK multiview behavior.
- Preserve selected channel URL state through repeated `c=` params when touching multiview routing.
- Do not add CHZZK DOM automation, iframe cookie/login bridging, or Chrome extension coupling without an explicit new request.

## Frontend Design
- Follow `Design.md` for current shell, spacing, card, color, and accessibility patterns.
- Use semantic tokens from `src/index.css` before introducing ad hoc colors.
- Keep dark-mode active sidebar state white with dark text unless Design.md changes.
- For user-facing layout changes, validate the rendered page when practical.

## API Contract Conventions
- Add or change endpoints in the owning `worker/features/<capability>/http`
  adapter and register the exact method/path contract in `worker/app/routes.ts`.
- Keep frontend API modules in the owning `src/features/<capability>/api`
  directory and use `src/shared/api/client.ts`.
- Put frontend/Worker wire DTOs in `contracts`; do not import Drizzle schema into frontend code.
- When changing payloads, update related types, route handlers, tests, and consuming hooks/components together.
- If actor or audit headers change, update both `src/shared/api/client.ts` and
  `worker/platform/http-helpers.ts` in the same change.
- Validate and normalize external input at route boundaries before persistence.

## Database and Migration Hygiene
- Treat `db/schema/index.ts` as the database schema source of truth.
- Generate migrations; do not handcraft numbered migration files.
- Review generated SQL for destructive operations before applying.

## Documentation Hygiene
- Keep `README.md` high level and current.
- Keep `Design.md` as the current UI guidance source.
- Keep active runbooks in `docs/`; move superseded research and drafts to `docs/archive/`.
- Update `.agent` first and mirror with `pnpm sync:agent-cursor`; do not manually edit mirrored `.cursor` files.

## Temporary Artifact Hygiene
- Keep generated build, coverage, Wrangler, temp log, and scratch directories out of source review and commits.
- Treat empty experimental directories as removable unless a tracked file or current document references them.

## Verification Gates
- Separate ordinary task completion from PR merge readiness. Implementation, review, a final reply, or a commit does not by itself require the full suite or preflight.
- Select checks from the task's committed diff against its base plus staged, unstaged, and relevant untracked changes. Include affected consumers and contract boundaries, not just tests beside changed files.
- For documentation/skill-only work, check references, metadata, relevant helper scripts, and agent synchronization; do not run application tests.
- Run `pnpm architecture:check` after moving modules or changing imports.
- Run `pnpm typecheck:test` when test fixtures or shared contracts change.
- Lint changed code and expand to repository-wide lint when configuration or shared impact requires it.
- Run focused unit tests and affected consumer tests for ordinary changes. Include real Worker/D1 integration tests for changed persistence, authorization, concurrency, or migration contracts; a `worker/` path alone does not require the entire integration suite.
- Explain broader checks for dependency, test configuration, global infrastructure, or uncertain cross-feature impact. Test selection returning zero tests for production changes is not verification success.
- Run `pnpm preflight` once on the final code after PR review fixes settle, as part of PR merge preparation (for example, `$pr-ready`), or for an explicitly requested release. Do not run it at every implementation/review/commit/PR transition.
- Record commands, scope, code/configuration identity, environment, and results. Reuse passing evidence only while its inputs remain equivalent; subsequent fixes invalidate affected checks, not automatically every check. After a preflight failure, rerun failed/invalidated steps and retain unaffected evidence. Report this as composed verification, not a successful full-command rerun.
- `pnpm test` runs all unit and Worker integration tests once. Never repeat it solely to reconfirm a passing preflight or an unchanged revision.
- Use `pnpm test:coverage` only for a coverage investigation or when validating test/coverage configuration changes. Percentages are diagnostic, not release gates.
- Keep contract, authorization, persistence, concurrency, cost, and user-flow regressions. Consolidate duplicate fixtures/assertions; do not add tests for decorative classes or trivial forwarding already covered at the owning boundary.
- Run `pnpm build` when changes impact routing, types, build configuration, or release paths.
- If full verification is not possible, document what was skipped and why.
