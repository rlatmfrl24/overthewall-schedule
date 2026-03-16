---
name: worker-api-change
description: Implement and validate OTW Worker API contract changes end-to-end. Use when adding or modifying /api endpoints, request or response payloads, query params, shared API types, or frontend API client modules.
---

# Worker API Change (OTW)

## Scope
Use this skill when change includes:
- `worker/routes/*` or `worker/index.ts`
- `src/lib/api/*`
- shared request or response types in `src/lib/types.ts` or `worker/types.ts`
- UI or hooks that consume updated API contracts

## Procedure
1. Define contract changes (path, method, input, response, and errors).
2. Update or add worker route handler and wire route dispatch in `worker/index.ts`.
3. Validate input at route boundaries and normalize before database writes.
4. Update frontend API module in `src/lib/api/*` using `apiFetch`.
5. Update consumer hooks, components, and related types.
6. Add or adjust tests for API client behavior and affected logic.
7. Run verification (`pnpm lint`, `pnpm test`, and `pnpm build` when contract or type changes are broad).

## Safety Rules
- Keep actor and audit behavior aligned between `src/lib/api/client.ts` and `worker/utils/helpers.ts`.
- Prefer explicit 4xx responses for invalid input.
- Keep response shapes stable unless a breaking change is intentional and documented.

## References
- Touchpoint map: `references/touchpoints.md`
- Project standards: `../../rules/project-standards.md`
