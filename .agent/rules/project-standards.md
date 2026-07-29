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
- Run `pnpm architecture:check` after moving modules or changing imports.
- Run `pnpm typecheck:test` when test fixtures or shared contracts change.
- Run `pnpm lint` after meaningful code changes.
- Run `pnpm test` for regression coverage.
- Run `pnpm test:coverage` for architecture-wide changes.
- Run `pnpm build` when changes impact routing, types, build configuration, or release paths.
- If full verification is not possible, document what was skipped and why.
