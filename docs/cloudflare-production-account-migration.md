# Cloudflare Production Account Migration and Runtime Consolidation

Status: repository consolidation validated; production-account provisioning and
cutover pending. Last source-account inventory readback: 2026-08-31.

## 1. Purpose

This document is the execution baseline for moving OTW Schedule from the shared
Cloudflare test account to a dedicated production account. It also defines the
runtime consolidation that must happen before the account cutover.

The two changes solve different problems:

- Runtime consolidation reduces deployment units, duplicated bindings, and
  dashboard noise.
- Account migration isolates OTW Schedule limits, secrets, billing, access, and
  failures from unrelated projects.

The account cutover is not authorized by this document alone. Production data,
DNS, secrets, and resource deletion remain explicit release operations.

## 2. Current Baseline

The source account currently hosts OTW Schedule together with unrelated test
projects. OTW Schedule is deployed as:

| Resource | Current topology |
| --- | --- |
| Workers | 6 services: HTTP, scheduler, collectors, media, auto-update, maintenance |
| Workflows | 9 job-specific Workflow definitions |
| Cron Triggers | 1 staggered expression |
| Queues | 10 physical queues |
| D1 | `otw-db` |
| R2 | `otw-schedule` |
| Analytics Engine | `otw_play_events`, `otw_youtube_cache_events` |
| Public domain | `otw-schedule.info` |

The shared account has already reached its account-level Cron Trigger limit
during an OTW deployment. Account isolation is therefore an operational
requirement, not only a dashboard organization preference.

## 3. Target Topology

The production account target is:

| Resource | Target topology | Rationale |
| --- | --- | --- |
| Worker | 1 `overthewall-schedule` Worker | One deployment and one binding authority |
| Workflow | 1 `otw-scheduled-operations` Workflow | Job type is a validated payload, not a separate class |
| Cron Trigger | 1 staggered expression | Preserves the current start cadence |
| Queues | 6 physical queues | Consolidates compatible traffic while preserving latency and retry boundaries |
| D1 | 1 production `otw-db` | Same schema and migration history |
| R2 | 1 production `otw-schedule` bucket | Same object-key contract |
| Analytics Engine | 2 datasets | Keeps product and YouTube-cache metric contracts separate |
| Domain | `otw-schedule.info` | Moved only after target-account verification |

The consolidated Worker exports all supported Cloudflare entry points:

```text
overthewall-schedule
├─ fetch       public/admin HTTP and static assets
├─ scheduled   one staggered Cron bridge
├─ queue       protocol-aware queue router
└─ workflow    ScheduledOperationsWorkflow
```

### Queue topology

| Target queue | Traffic | Concurrency policy | Why it remains separate |
| --- | --- | --- | --- |
| `otw-ops-control` | Manual operation planning | 1 | Admin commands must not wait behind collection work |
| `otw-ops-critical` | ingestion recovery, WebSub maintenance, source health, reconcile | 1 | Protects recovery and correctness work from background traffic |
| `otw-ops-background` | X, Naver Cafe, schedule auto-update, retention | 1 | Serializes non-urgent external and maintenance load |
| `otw-play-ingestion` | OTW Play ingestion messages | 1 | Preserves ingestion ordering and retry semantics |
| `otw-websub` | Live WebSub delivery messages | 2 | Preserves delivery responsiveness |
| `otw-dead-letter` | All terminal queue failures | 1 | Protocol-aware routing makes a shared failure sink safe |

The logical D1 lanes (`x`, `naver`, `websub`, `ingestion`,
`youtube-critical`, `auto-update`, `maintenance`) remain unchanged. They still
own admission priority, usage accounting, leases, idempotency, monitoring, and
run history. Only their physical queue mapping changes.

The following queues are replaced after they are drained:

| Previous queue | Replacement |
| --- | --- |
| `otw-x-collection` | `otw-ops-background` |
| `otw-naver-cafe` | `otw-ops-background` |
| `otw-schedule-auto-update` | `otw-ops-background` |
| `otw-maintenance` | `otw-ops-background` |
| `otw-youtube-critical` | `otw-ops-critical` |
| scheduled messages on `otw-play-ingestion` | `otw-ops-critical` |
| scheduled messages on `otw-websub` | `otw-ops-critical` |
| `otw-ops-dlq` | `otw-dead-letter` |
| `otw-play-ingestion-dlq` | `otw-dead-letter` |

## 4. Preserved Runtime Invariants

Consolidation must not change the product contract or increase upstream load.

- Public and admin HTTP routes keep their existing methods, payloads, status
  codes, authentication, and cache behavior.
- YouTube public media remains demand-driven D1 SWR. It does not become a
  scheduled job.
- Manual YouTube cache refresh remains a synchronous `200` command.
- General Operations commands remain asynchronous `202` runs with polling.
- The existing staggered Cron expression and job selection times remain
  unchanged.
- Scheduled item batch size remains one message per Queue invocation.
- Ingestion remains concurrency 1 and WebSub delivery remains concurrency 2.
- Critical and background scheduled traffic never share a physical queue.
- Background consolidation does not add parallelism. X, Naver Cafe,
  auto-update, and retention each previously used concurrency 1 and now share a
  concurrency-1 queue.
- D1 run/item/outbox leases, retry budgets, daily admission limits, and
  idempotency keys remain authoritative.
- Queue messages are drained before a producer is switched to a replacement
  queue. A queue with pending messages is never deleted.

## 5. Account Boundary

The target account should contain production OTW resources only. The existing
shared account remains the test/staging boundary.

| Concern | Shared account after migration | OTW production account |
| --- | --- | --- |
| OTW test deployments | Allowed | Not allowed |
| Production domain | No | Yes |
| Production D1/R2 | No | Yes |
| Production secrets | No | Yes |
| Unrelated projects | Allowed | No |
| Production API token | No access | Least-privilege OTW access only |

Record these values in the release ticket or private operator vault. Do not put
secret values in this repository.

| Value | Source | Target | Verification |
| --- | --- | --- | --- |
| Account ID | current Wrangler account | new production account | Wrangler identity readback |
| D1 database ID | current `otw-db` | new `otw-db` | migrations and row-count readback |
| R2 bucket | current `otw-schedule` | new bucket | object count and sampled checksum |
| Analytics datasets | current datasets | recreated datasets | test datapoint and query |
| Queue IDs/names | current queues | six target queues | producer/consumer readback |
| Worker secrets | current Worker | target Worker | names-only secret list and route smoke |
| DNS zone | current account | production account | authoritative nameserver readback |

Required target secrets include, as applicable:

- `YOUTUBE_API_KEY`
- `X_BEARER_TOKEN`
- `CLERK_ISSUER`
- `CLERK_ADMIN_IDS`
- `CLERK_AUTHORIZED_PARTIES`
- `CLERK_JWKS_URL` when explicitly configured
- `OTW_PLAY_ANALYTICS_READ_TOKEN`
- `CLOUDFLARE_D1_ANALYTICS_READ_TOKEN` with Account Analytics Read only
- `YOUTUBE_CACHE_ANALYTICS_READ_TOKEN` when separate
- `OTW_PLAY_WEBSUB_SECRET_V1`

## 6. Execution Phases

### Phase A — repository consolidation

1. Replace the five auxiliary Worker entry points with the main Worker entry
   point.
2. Replace nine Workflow classes and bindings with one validated generic
   Workflow.
3. Route logical scheduled lanes to critical or background physical queues.
4. Add a protocol-aware shared dead-letter router.
5. Reduce deployment and queue-provision scripts to the target topology.
6. Update architecture and scheduled-job runbooks.
7. Pass tests, coverage, build, preflight, and Wrangler dry-run.

This phase changes repository configuration only. It does not delete or move
production resources.

Do not deploy this phase to the source account until the drain and consumer
handoff steps in Phase D are ready. The source account still has the ten legacy
queues with active consumers and nine job-specific Workflows; the target queues
do not exist there yet.

### Phase B — target account provisioning

1. Create the dedicated production account and least-privilege deployment API
   token.
2. Create D1, R2, Analytics Engine datasets, rate limiter, and six queues.
3. Update target deployment configuration with the target account and resource
   IDs without changing source-account configuration prematurely.
4. Apply the complete D1 migration chain to the empty target database.
5. Install secrets directly in the target account.
6. Deploy to the target account's `workers.dev` hostname with no production
   custom domain.

### Phase C — data copy and isolated verification

1. Export the source D1 database at an identified migration baseline.
2. Import into target D1 and apply any later migrations in order.
3. Compare table row counts, migration journal, critical settings, active
   members, scheduled-run state, and sampled records.
4. Copy R2 objects and compare total objects, total bytes, and sampled hashes.
5. Exercise representative public, admin, collection, Queue, Workflow, D1, R2,
   WebSub, and Analytics flows through the target `workers.dev` entry point.
6. Keep target Cron and external producers disabled during this verification.

### Phase D — queue and runtime cutover

1. Set all `scheduled_v2_<jobType>_enabled` flags to false in the source D1.
2. Block new manual Operations runs for the short cutover window.
3. Wait until active runs, scheduled items, outbox rows, and all replaced queues
   are empty. Preserve live ingestion and WebSub messages in their existing
   queues until their consumer handoff.
4. Create the six target queues before deploying bindings that reference them.
5. Remove legacy consumers, deploy the consolidated Worker, and confirm exactly
   one consumer for every queue.
6. Run one canary per critical/background job family.
7. Re-enable scheduled flags only after authoritative run readback succeeds.

### Phase E — domain and authority cutover

1. Take a final D1 delta/export after source writers are frozen.
2. Import and verify the final delta in the target account.
3. Move the Cloudflare zone and recreate settings that do not transfer
   automatically.
4. Handle DNSSEC, nameserver, certificate, and Registrar requirements before
   changing authority.
5. Attach `otw-schedule.info` to the target Worker.
6. Renew or verify WebSub subscriptions against the production callback.
7. Confirm public DNS, TLS, HTTP, admin auth, D1 writes, R2 reads, Queues,
   Workflow runs, and Analytics readback.

## 7. Release Gates

The cutover is blocked unless all applicable checks pass:

```text
pnpm architecture:check
pnpm typecheck:test
pnpm lint
pnpm test
pnpm test:worker-integration
pnpm test:coverage
pnpm build
pnpm preflight
pnpm deploy:dry-run
```

Operational readback must also confirm:

- one production Worker service;
- one Workflow definition;
- one Cron Trigger expression;
- six queues with exactly one consumer each;
- no pending messages in retired queues;
- no YouTube warmup Workflow or scheduled job;
- D1 migrations match the repository journal;
- critical settings and row counts match the migration baseline;
- no increase in upstream API concurrency;
- public and admin representative flows reach the target account.

## 8. Rollback

Before domain authority moves, rollback means disabling the target Worker and
continuing to use the source account.

After domain authority moves:

1. Disable target scheduled flags and manual Operations writes.
2. Preserve target D1/R2 evidence and export any target-only writes.
3. Reattach the domain to the source Worker only if its D1/R2 state is still
   authoritative or after the target delta is reconciled.
4. Restore source Queue consumers before source producers are re-enabled.
5. Verify DNS, TLS, public reads, admin writes, and one scheduled canary.

Do not delete source Workers, Workflows, queues, D1, R2, secrets, or DNS records
until the target account has completed a defined observation window and the
rollback owner explicitly closes the gate.

## 9. Decommission Checklist

Legacy resources can be deleted only after the target account is authoritative
and rollback has been closed.

- [ ] All retired queues have zero pending messages.
- [ ] No D1 outbox row references a retired queue delivery.
- [ ] Target scheduled and manual runs have succeeded.
- [ ] WebSub renewal and delivery have succeeded on the target.
- [ ] The production domain resolves only to the target account.
- [ ] Required logs and migration evidence are retained.
- [ ] Source account resources have an exact deletion inventory.
- [ ] A production owner approved irreversible deletion.
