---
name: worker-api-change
description: Implement and validate OTW Worker API contract changes end-to-end. Use when adding or modifying /api endpoints, request or response payloads, query params, shared API types, or frontend API client modules.
---

# Worker API Change (OTW)

## Scope
Use this skill when change includes:
- `worker/features/*/http/*` or `worker/app/routes.ts`
- `src/features/*/api/*` or `src/shared/api/*`
- shared request or response DTOs in `contracts/*`
- UI or queries that consume updated API contracts

Follow the [shared outcome rules](../../../.agent/rules/antigravity.md).

## Procedure
1. Define contract changes (path, method, input, response, and errors).
2. Update or add the owning capability handler and register the exact contract
   in `worker/app/routes.ts`, updating `contracts/api-routes.ts` when its shared
   route contract changes.
3. Validate input at route boundaries and normalize before database writes.
4. Update the owning frontend API module using `src/shared/api/client.ts`.
5. Update consumer queries, cache invalidation, UI, and related contract types.
6. Add the smallest regression coverage for changed authorization, persistence,
   races, errors, and observable behavior. Trace asynchronous requests from
   acceptance through dispatch/retry to final result; queued is not completed.
7. Verify through the intended UI/runtime entry and authoritative server readback.
   Check that saved identities/results are reusable and caches show the new state.
   A direct database write or lower-level API cannot replace required user controls.
8. Run architecture/type checks and focused tests; use broader lint/test/build
   checks when warranted. Record precisely which runtime flows remain unverified.

## Safety Rules
- Keep actor and audit behavior aligned between `src/shared/api/client.ts` and
  `worker/platform/http-helpers.ts`.
- Prefer explicit 4xx responses for invalid input.
- Keep response shapes stable unless a breaking change is intentional and documented.
- Run `pnpm architecture:check` so a contract change does not bypass capability boundaries.

## References
- [Touchpoint map](references/touchpoints.md)
- [Project standards](../../../.agent/rules/project-standards.md)
