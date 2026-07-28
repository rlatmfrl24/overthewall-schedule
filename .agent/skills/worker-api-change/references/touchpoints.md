# Worker API Change Touchpoints

## Worker Routing Entry
- `worker/app/routes.ts`: exact method/path registry and route manifest.
- `worker/app/route-registry.ts`: matching, `404`/`405`, numeric parameter, and cache policy enforcement.
- `worker/index.ts`: thin Cloudflare runtime entry only.

## Route Handlers
- `worker/features/<capability>/http/*`: request/response adapters.
- `worker/features/<capability>/application/*`: use cases and ports.
- `worker/features/<capability>/infrastructure/*`: D1 and external API adapters.
- `worker/features/<capability>/index.ts`: capability public surface.

## Worker Shared Logic
- `worker/platform/auth.ts`: authentication boundary.
- `worker/platform/db.ts`: Drizzle/D1 adapter creation.
- `worker/platform/http-helpers.ts`: parsing, actor, response, and audit helpers.
- `worker/platform/types.ts`: Cloudflare binding types.

## Frontend API Modules
- `src/shared/api/client.ts`: common fetch behavior and shared headers.
- `src/features/<capability>/api/*`: endpoint-specific request wrappers.
- `contracts/*`: frontend/Worker wire DTOs.

## Consumer Surfaces
- `src/features/<capability>/queries/*`: TanStack Query ownership.
- `src/features/<capability>/ui/*`: UI bound to API payloads.
- `src/routes/*`: route-level integration points.
- `src/app/layout/app-navigation.ts`: public navigation visibility when API-backed source visibility changes.

## Contract Change Checklist
1. Update worker handler and route wiring.
2. Update client module and related types.
3. Update UI or hook consumers.
4. Add or update tests.
5. Run `pnpm architecture:check`, `pnpm typecheck:test`, `pnpm lint`,
   `pnpm test`, and `pnpm build` when needed.
