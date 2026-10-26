# X Activity Feed Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive one member's XAA posts through the deployed application's authenticated webhook and existing persisted feed, with visible subscription and media processing results.

**Architecture:** An administrator manages one site-owned subscription. The webhook verifies CRC/raw-body HMAC, persists an idempotent inbox before acknowledging, and dispatches a typed message on the existing background queue. The consumer reuses the X normalizer, stored-post writer and budgeted API client. Cron renews the subscription and recovers pending inbox entries; existing polling and its completeness watermark remain authoritative for recovery.

**Tech Stack:** TypeScript, Cloudflare Worker/Queues/D1, Drizzle, React/TanStack Query.

**Spec:** [Research and observed API contracts](../../operations/x-feed-subscription-research.md), especially sections 15–17.

## Global Constraints

- Preserve existing collection, daily 100-cent budget, cycle cap and autorecharge settings.
- Local implementation is authorized; production deployment, migration and paid subscription activation are deferred.
- Start with one member. Refuse ownership conflicts and arbitrary callback URLs.
- XAA admission cannot enforce a supplier-side daily $1 hard cap. State this explicitly; record already-incurred event cost separately from Post Read cost.
- Use the existing queues, source allowlist/publication policy, tombstones and budget reservation. Do not advance the REST completeness cursor from events.
- No new dependencies, no native video player or browser push refresh.

## Review Focus

- Duplicate/parallel delivery and consumer retries: one inbox event, one event cost, no duplicate paid hydration after a persisted result.
- Missing attachments versus confirmed empty media: unknown raw shape requires one bounded lookup; complete photo/video poster data needs none.
- Member removal, site cutover, disabled collection or budget exhaustion: stop renewing and delete only this site's owned subscription.
- Registration timeout/partial failure: retain owned identifiers and recover or stop without touching foreign subscriptions/webhooks.
- Long note_tweet text, media mapping, redaction and out-of-order events: preserve content and privacy while leaving the polling cursor unchanged.

### Task 1: Signed event contract and storage

**Files:** `contracts/x-activity.ts`, `worker/features/x-posts/domain/x-activity.ts`, colocated tests, `db/schema/index.ts`, generated `drizzle/*`.

**Interfaces:** `parseXActivityEvent`, `xActivityMediaReady`, `isXActivityQueueMessage`; singleton subscription state and inbox keyed by event identity.

- [ ] Write and run failing cases for altered signatures, CRC oracle input, foreign authors/tags, mixed media and long text.
- [ ] Implement the event parser/HMAC boundary and generate additive state/inbox tables with pending/retention indexes.
- [ ] Run domain tests and inspect generated SQL/journal.

### Task 2: Subscription and durable ingestion

**Files:** application contract, `infrastructure/x-activity.ts`, `http/x-activity.ts`, `worker/app/x-activity.ts`, routes, queue and cron composition; `x-api.ts` shared writer/normalizer; integration tests.

**Interfaces:** service `status/start/stop/accept/process/reconcile`; GET/POST/DELETE `/api/x/activity`, GET/POST `/api/x/activity/webhook`; queue `{type:'x_activity', postId:string}`.

- [ ] Write and run failing D1 cases for duplicate receipts, independent event/read costs, conditional hydration, restart recovery, tombstones and stable REST cursors.
- [ ] Implement the real provider registration/ownership/readback path, durable acknowledgement and queue consumer. Reuse `requestXApi` and `writeStoredPosts`.
- [ ] Reconcile expiring subscriptions and pending events through existing cron without changing polling cadence/settings.
- [ ] Run changed Worker tests, type and architecture checks.

### Task 3: Operator controls and verification

**Files:** member-post admin API/UI and colocated tests, `docs/current-work.md`, research/runbook.

- [ ] Write and run failing UI cases for start/stop, error display and observable last receipt/media processing status.
- [ ] Add a compact panel to existing member-post settings. Show existing collection continuing and the supplier-side cap limitation before activation.
- [ ] Verify normal administrator → registration → signed webhook → queue → feed readback locally. Clearly label external responses in local tests as substitutes, not new live media evidence.
- [ ] Validate full migration chain in temporary D1, run affected checks, and record remaining production/natural-media verification.

No commit, push, remote mutation or activation is implicit in these tasks.
