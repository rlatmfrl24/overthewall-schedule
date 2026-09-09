# Channel upload polling

Status: implemented, 2026-09-09. Final release evidence is recorded in the owning pull request.

## Decision

Replace WebSub with the existing YouTube uploads-playlist polling flow. The current service monitors a small number of explicitly approved singing-clip channels and stores uploads for administrator review. It does not require immediate push delivery. Maintaining callback authentication, subscription leases, Hub retries and delivery recovery adds more operational work than this scope needs.

The production subscription was already expired at Google on 2026-09-06 05:14:08 UTC. A real unsubscribe retry returned HTTP 503 after 20.409 seconds; waiting longer or switching to synchronous verification did not resolve it. The internal `unsubscribing` record is historical evidence, not an active operational dependency. See [diagnosis](websub-hub-diagnosis-2026-09-09.md).

## Current contract

- One `channel_reconcile` cron slot each hour, at minute 23 UTC. Successful polling sets the next timestamp to the next slot, avoiding an accidental two-hour interval caused by adding an hour to completion time.
- Read-only eligibility uses the same approved, active channel and monitor predicates as execution. A paused, leased or unapproved target creates no Workflow. At most ten due monitors are planned per dispatch; the existing queue budgets and per-item execution limits remain.
- The stored uploads playlist is read first. Only videos newer than the watermark receive `videos.list` metadata lookups, in batches of at most 50. Candidates are deduplicated and remain subject to manual review. No automatic publication.
- Preserve the 250-video continuation cap, generation and version checks, leases, gap detection and explicit recent 1–20 video backfill. A missing watermark pauses the monitor and reports a failed check. Metadata or persistence failure does not advance the watermark.
- Resume obtains the current latest video before the versioned state change. Failure leaves the monitor paused. Success clears any old continuation and skips the paused interval. Manual backfill is the explicit way to recover recent older videos.
- Global Play pause remains enabled in production. An operator first releases the global pause and then resumes each desired channel. Candidate review and common X/Naver/YouTube outbox recovery continue independently.

`playlistItems.list` costs one YouTube quota unit per request. With no new upload and no retry, one active channel uses approximately 24 units/day. New uploads require additional `videos.list` calls, also one unit each; initial channel lookup, backfill, recovery pages and retries are additional. These are API quota units, not currency or a measured Cloudflare bill. Polling normally detects uploads within about an hour; provider visibility, quota limits, failures and queue delays can extend that interval.

Sources: [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list), [videos.list](https://developers.google.com/youtube/v3/docs/videos/list).

## Retirement boundaries

Physical resource removal follows the [evidence-based drain and rollback procedure](retired-implementation-cleanup.md#websub-리소스-후속-제거). The original 49-hour wait from producer retirement was reassessed at the user's request: the last completed delivery predates both retention windows, recent Queue/DLQ traffic is absent, and both queues must remain empty in two realtime observations at least 15 minutes apart. Deployed consumer detachment is still required before deletion. If that evidence is incomplete, use the original retention wait. Hub unsubscribe acknowledgement is not a prerequisite.

- Remove the Hub client, subscription service, WebSub repository, crypto/feed parser, producer binding and subscription controls.
- Stop both `websub_maintenance` and the redundant daily `recent_reconcile`. Old job types remain readable in execution history, labeled retired; new manual runs and retries return authenticated HTTP 410. Previously dispatched items skip without Hub or YouTube calls.
- Exact legacy callback GET/POST routes return 410 without D1 queries, payload parsing, challenge confirmation or new messages. Old admin subscription commands retain authentication and return 410.
- The temporary drain consumer and WebSub-only queue telemetry are removed after the verified drain. No producer remains. Obsolete message shapes received by a shared queue still follow generic invalid-message acknowledgement without changing historical delivery records. The unused queue resource alone is not treated as a cost saving.
- Preserve historical subscription/delivery tables and all candidates, approvals and audit events. Do not fabricate an `unsubscribed` confirmation or an inferred lease expiry. Those archived subscription fields are removed from the current admin monitor DTO; public APIs are unchanged.
- Migration `0085` only updates nondeleted monitor intervals to 60, records the change, and disables the retired job settings. It preserves pause, generation, watermark, pending candidates and subscription history. New monitors explicitly persist 60; the existing database column default is retained to avoid a table rebuild.

## Validation and rollout

Use the normal `/admin/otw-play?tab=play-monitor` and `/admin/operations` entry points. Confirm polling controls, pause state, last success/error readback and retired job labels. Preserve the public Play flags and global automation pause.

Regression coverage includes real D1 migration/readback, deletion with archived subscriptions, authority and pause races, resumption with an old continuation, metadata failure, missing watermark, authenticated retirement endpoints, shared-queue routing, retries and malformed-message acknowledgement. The release gate includes coverage, Worker integration, build, local D1 doctor and agent-rule synchronization.

Production release identity, authoritative readback and remaining observation limits belong in the owning pull request's verification comments. A new-upload production canary remains deferred while global automation is deliberately paused; neither tests nor a successful HTTP response prove that future ingestion has occurred.
