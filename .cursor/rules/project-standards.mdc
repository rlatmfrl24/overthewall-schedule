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
- `src/components`: app shell, navigation, footer, shared primitives, and UI components.
- `src/components/ui`: reusable shadcn/ui-style primitive components.
- `src/features`: domain-focused UI modules.
- `src/shared`: cross-domain shared components.
- `src/hooks`: custom hooks and hook tests.
- `src/lib/api`: frontend API calls, all backed by `apiFetch`.
- `src/db/schema.ts`: canonical Drizzle schema.
- `worker/routes`: HTTP route handlers.
- `worker/services`, `worker/repositories`, `worker/use-cases`: worker domain logic.
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
- Keep public navigation changes centralized in `src/components/app-navigation.ts`.

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
- Add or change endpoints in `worker/routes/*` and wire route dispatch in `worker/index.ts`.
- Keep frontend API modules in `src/lib/api/*` aligned with worker request and response shapes.
- When changing payloads, update related types, route handlers, tests, and consuming hooks/components together.
- If actor or audit headers change, update both `src/lib/api/client.ts` and `worker/utils/helpers.ts` in the same change.
- Validate and normalize external input at route boundaries before persistence.

## Database and Migration Hygiene
- Treat `src/db/schema.ts` as the database schema source of truth.
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
- Run `pnpm lint` after meaningful code changes.
- Run `pnpm test` for regression coverage.
- Run `pnpm build` when changes impact routing, types, build configuration, or release paths.
- If full verification is not possible, document what was skipped and why.
