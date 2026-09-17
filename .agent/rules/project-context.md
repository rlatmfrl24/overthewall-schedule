---
trigger: always_on
---

# OTW Schedule Project Context

## Technology Stack

- Package manager: `pnpm@11.7.0` from `package.json`.
- Development/build runtime: Node.js 24 LTS, pinned in `.node-version` and
  constrained by `package.json#engines`. Match Cloudflare Builds `NODE_VERSION`.

### Frontend
- React 19 with Vite 7.
- TanStack Router file-based routes under `src/routes`.
- Tailwind CSS v4 with shadcn/ui primitives in `src/shared/ui`.
- Clerk for auth-gated user/admin surfaces.
- TanStack Query adapters under each capability's `queries` directory.
- Capability API modules use the shared `src/shared/api` client.

### Edge and Backend
- Cloudflare Workers runtime (`worker/index.ts`).
- Cloudflare D1 (SQLite) database.
- Drizzle ORM with schema in `db/schema/index.ts`.
- Exact route registry and runtime composition under `worker/app`.
- Capability handlers and adapters under `worker/features/<capability>`.
- Runtime-specific adapters under `worker/platform`.

## Core Application Flows
- Browser UI -> capability `api`/`queries` -> shared `apiFetch` -> exact
  `/api/*` registry -> capability HTTP/application/infrastructure -> D1.
- Public chrome is selected by `getAppChromeMode` and rendered by `PublicAppShell`.
- Content pages such as notice, VOD, and member posts share `ContentPageShell`.
- Daily and weekly schedule views consume the `schedule-board` read model.
- `/multiview` is a public Mul.Live iframe surface. Member chips with CHZZK channel URLs build `c=` URL state and the embedded Mul.Live URL.
- Admin screens control notices, schedules, source settings, auto-update settings, pending schedules, and logs.
- OTW Play shares song/performance/source identities across official releases
  and singing clips, with distinct discovery and review/publication policies.
  Admin import/review -> registration -> explicit publication -> public lookup
  and playback must preserve that shared model and identity reuse.
- Cron performs read-only eligibility/budget checks before Workflow creation;
  Workflow coordination and Queue execution handle item outcomes and retries.
  Operations distinguishes suppression, queued work, real partial failure, and
  terminal completion. Cost observation reads existing ledgers without new writes.
- Approved channel uploads use the current polling contract. Retired WebSub
  implementation records are historical, not a dependency to restore.

## Product and Operational References
- [Documentation index](../../docs/README.md) and
  [development/operations status](../../docs/development-status.md) separate
  current contracts, completed records, and remaining gates.
- [Play requirements](../../docs/otw-play-product-requirements.md),
  [singing-clip decisions and implementation](../../docs/otw-play-singing-clips-requirements-and-plan.md),
  and [admin workflow](../../docs/otw-play-admin-workflow-integration.md).
- [Scheduled jobs](../../docs/operations/scheduled-jobs-v2.md),
  [channel polling](../../docs/operations/channel-upload-polling.md), and
  [cost operations](../../docs/operations/backend-cost-optimization.md).
- Resolve older draft/status statements against the latest explicit product
  decisions and corresponding implementation evidence. A merged implementation
  does not prove production flags, collection, or playback were verified.
- AI review work in the current working tree must be checked for actual commit
  and deployment state before reporting it as released. AI quality testing is
  planned; automatic collection still needs functional verification.
- The 2026-09-17 user decision closes X cost tracking and removes player original-artist
  display, member production-credit expansion, and external sharing banners from
  this project backlog. VOD AI summaries/highlights belong to a separate project.
  Do not restore these items from archived proposals. Existing catalog metadata
  and vocal credits remain in scope.

## Key Directories
- `contracts`: frontend/Worker wire DTOs and shared contract policy.
- `db/schema/index.ts`: canonical Drizzle schema.
- `src/app`: providers, application shell, and admin composition.
- `src/routes`: thin TanStack Router adapters.
- `src/features/<capability>`: colocated API, model, query, use-case, and UI code.
- `src/shared`: cross-capability API, query, UI, and library primitives.
- `worker/app`: route registry, scheduled composition, and runtime error boundary.
- `worker/platform`: Cloudflare auth, D1, HTTP, cache, and runtime types.
- `worker/features/<capability>`: domain, application, ports, infrastructure, and HTTP adapters.
- `docs`: active project docs plus archived research.
- `.agent`: canonical agent rules and skills.

## Current Non-Goals
- No Chrome extension package is maintained in this repository.
- Do not reintroduce extension bridge code, CHZZK DOM automation, iframe cookie bridging, or Chrome Web Store packaging unless explicitly requested.
- Keep `/multiview` web-safe and functional without privileged browser APIs.

## Commands (pnpm-first)
- `pnpm dev`: start local development server.
- `pnpm lint`: run repository ESLint rules.
- `pnpm architecture:check`: enforce dependency direction, legacy path removal, and import-cycle guards.
- `pnpm typecheck:test`: type-check frontend and Worker test sources.
- `pnpm test`: run Vitest suites.
- `pnpm test:worker-integration`: run isolated D1 Worker integration tests.
- `pnpm test:coverage`: optional combined coverage report; no percentage gate.
- `pnpm preflight`: final quality gates, including all tests once without coverage instrumentation.
- `pnpm build`: type-check and build.
- `pnpm cf-typegen`: regenerate worker type bindings.
- `pnpm drizzle:generate`: generate schema migration SQL.
- `pnpm drizzle:generate:custom`: generate an empty custom migration.
- `pnpm drizzle:migrate:local`: apply migrations to local D1.
- `pnpm drizzle:migrate:remote`: apply migrations to remote D1.
- `pnpm deploy`: build and deploy to Cloudflare Workers.
- `pnpm sync:agent-cursor`: regenerate Cursor mirrors and Codex discovery entries from `.agent`.

## Generated Artifacts
- `src/routeTree.gen.ts` is generated by TanStack Router tooling. Do not edit it manually.
- `worker-configuration.d.ts` is generated by Wrangler typegen. Regenerate with `pnpm cf-typegen`.
- `.cursor/rules/*`, `.cursor/skills/*`, and `.agents/skills/*` are generated compatibility/discovery files. Update `.agent` and run the sync command.

## Local and Temporary Artifacts
- Do not commit `dist/`, `coverage/`, `.tmp/`, `.tmp-*.log`, `.codex-*.log`, `.wrangler/`, `.yoyo/`, or removed experimental package directories.
- Keep local-only configuration such as `.env.local`, editor settings, and dependency directories out of cleanup unless the user explicitly asks for a destructive reset.
