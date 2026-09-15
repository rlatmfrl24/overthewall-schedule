---
description: Clean Architecture boundaries and capability ownership for OTW Schedule
alwaysApply: true
---

# OTW Clean Architecture

## Dependency Direction

Frontend dependencies flow from `src/routes` or `src/app` through a capability's
public `index.ts`, then into `ui`/`queries`/`use-cases`, and finally `model`.
Capability API adapters may depend on `contracts` and `src/shared/api`.

Worker dependencies flow from `http` to `application`, then to `domain` and
ports. Infrastructure implements ports, and `worker/app` is the composition
root. Domain, application, and ports must not import Cloudflare runtime types,
D1, Drizzle, HTTP adapters, or platform modules.

## Ownership Rules

- Put feature behavior and colocated tests under the owning
  `src/features/<capability>` or `worker/features/<capability>`.
- Access another frontend capability only through its public `index.ts`.
- Access another Worker capability only through its public `index.ts`.
  Application code must represent cross-capability collaboration as a port;
  inject the concrete public service from `worker/app`.
- Keep concrete adapter construction in `worker/app`. Worker HTTP adapters
  may use platform auth/HTTP helpers and their own application/domain, but
  must not construct infrastructure or database adapters.
- Keep wire DTOs in `contracts` and persistence tables in `db/schema/index.ts`.
- Keep generic frontend primitives in `src/shared` and Cloudflare-specific
  adapters in `worker/platform`.
- Keep route files thin. Register every Worker endpoint with an exact method
  and path in `worker/app/routes.ts`.
- Keep raw D1 SQL and external API clients in a capability's `infrastructure`.
- Use TanStack Query as the single source of truth for server state; reserve
  local React state for actual UI state.

## Prohibited Legacy Paths

Do not recreate `src/components`, `src/hooks`, `src/lib/api`, `src/db`,
`worker/routes`, `worker/services`, `worker/repositories`, or
`worker/use-cases`.

## Required Verification

Run `pnpm architecture:check` after structural changes. Use focused tests while
editing and `pnpm preflight` for final broad verification; it runs typecheck,
lint, all unit/D1 tests, build, D1 doctor, and mirror checks once. Do not repeat
its tests for the same unchanged revision. Coverage is an optional diagnostic,
not a release gate. Keep real D1 concurrency and rollback coverage in the
Worker integration project included by `pnpm test`.
