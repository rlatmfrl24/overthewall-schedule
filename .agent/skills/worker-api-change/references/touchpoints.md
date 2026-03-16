# Worker API Change Touchpoints

## Worker Routing Entry
- `worker/index.ts`: dispatch table for `/api/*` route namespaces.

## Route Handlers
- `worker/routes/live.ts`
- `worker/routes/vods.ts`
- `worker/routes/members.ts`
- `worker/routes/schedules.ts`
- `worker/routes/notices.ts`
- `worker/routes/ddays.ts`
- `worker/routes/kirinuki.ts`
- `worker/routes/settings.ts`

## Worker Shared Logic
- `worker/services/*`: integration and domain operations.
- `worker/utils/helpers.ts`: request parsing, validation helpers, response helpers, audit log helpers.
- `worker/types.ts`: worker-side payload and contract types.

## Frontend API Modules
- `src/lib/api/client.ts`: common fetch behavior and shared headers.
- `src/lib/api/*.ts`: endpoint-specific request wrappers.
- `src/lib/types.ts`: frontend-facing type contracts.

## Consumer Surfaces
- `src/hooks/*`: data loading and transformation hooks.
- `src/features/*`: UI state and behavior bound to API payload shapes.
- `src/routes/*`: route-level integration points.

## Contract Change Checklist
1. Update worker handler and route wiring.
2. Update client module and related types.
3. Update UI or hook consumers.
4. Add or update tests.
5. Run `pnpm lint`, `pnpm test`, and `pnpm build` when needed.
