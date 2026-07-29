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

## Procedure
1. Define contract changes (path, method, input, response, and errors).
2. Update or add the owning capability handler and register the exact contract
   in `worker/app/routes.ts`.
3. Validate input at route boundaries and normalize before database writes.
4. Update the owning frontend API module using `src/shared/api/client.ts`.
5. Update consumer queries, UI, and related contract types.
6. Add or adjust tests for API client behavior and affected logic.
7. Run verification (`pnpm lint`, `pnpm test`, and `pnpm build` when contract or type changes are broad).

## Safety Rules
- Keep actor and audit behavior aligned between `src/shared/api/client.ts` and
  `worker/platform/http-helpers.ts`.
- Prefer explicit 4xx responses for invalid input.
- Keep response shapes stable unless a breaking change is intentional and documented.
- Run `pnpm architecture:check` so a contract change does not bypass capability boundaries.

## References
- Touchpoint map: `references/touchpoints.md`
- Project standards: `../../rules/project-standards.md`
