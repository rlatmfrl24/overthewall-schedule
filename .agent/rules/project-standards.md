---
description: OTW repository coding standards across frontend, worker, and shared contracts
alwaysApply: true
---

# OTW Project Standards

## Language and Scope
- Write new project rules, skills, and workflow documents in English.
- Keep changes tightly scoped to the requested task.
- Preserve backward compatibility unless the task explicitly requests a breaking change.

## Repository Structure
- `src/components/ui`: reusable primitive UI components.
- `src/features`: domain-focused UI modules.
- `src/shared`: cross-domain shared components.
- `src/hooks`: custom hooks and hook tests.
- `src/lib/api`: frontend API calls, all backed by `apiFetch`.
- `src/db/schema.ts`: canonical Drizzle schema.
- `worker/routes`: HTTP route handlers.
- `worker/services`: integration and domain services.
- `worker/utils/helpers.ts`: shared worker helper functions.

## Naming and Exports
- Use kebab-case for filenames.
- Use PascalCase for React components and exported types.
- Use `useX` naming for hooks.
- Prefer named exports for app modules.

## Routing Conventions
- Keep file-based route definitions in `src/routes`.
- Route files must expose `export const Route = createFileRoute(...)`.
- Keep route component logic in a `RouteComponent` function where practical.
- Do not hand-edit `src/routeTree.gen.ts`; regenerate via normal build or dev workflow.

## API Contract Conventions
- Add or change endpoints in `worker/routes/*` and wire route dispatch in `worker/index.ts`.
- Keep frontend API modules in `src/lib/api/*` aligned with worker request and response shapes.
- When changing payloads, update related types, route handlers, and consuming hooks/components together.
- If actor or audit headers change, update both `src/lib/api/client.ts` and `worker/utils/helpers.ts` in the same change.
- Validate and normalize external input at route boundaries before persistence.

## Database and Migration Hygiene
- Treat `src/db/schema.ts` as the database schema source of truth.
- Generate migrations; do not handcraft numbered migration files.
- Review generated SQL for destructive operations before applying.

## Verification Gates
- Run `pnpm lint` after meaningful code changes.
- Run `pnpm test` for regression coverage.
- Run `pnpm build` when changes impact routing, types, build configuration, or release paths.
- If full verification is not possible, document what was skipped and why.
