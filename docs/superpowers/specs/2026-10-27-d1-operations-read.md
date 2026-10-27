# D1 operations read optimization

The user authorized implementation, local verification and a normal PR for the first three candidates from the October 27 SQL review: idle queue state, latest successful runs and YouTube ownership lookup indexes, in that order.

- Preserve account-wide UTC-day 5,000,000 rows read, background 4,000,000 and stricter existing limits. Preserve Play/AI pauses, publication, authorization, archive, shared owners, Bing Hayu policy and all cadence settings.
- Keep Operations DTOs, exact counts, global stale leases, future retries, genuine partial/failure and unresolved reconciliation semantics.
- Determine latest success by actual finished_at, including existing evidence-based YouTube normalization. Do not substitute accepted_at or a bounded recent-history sample.
- Add indexes through canonical Drizzle generation only. Do not edit applied migrations. Measure index construction and write overhead separately from SELECT savings.
- Preserve YouTube source policy SQL, membership fences and final atomic write guards. Add only reverse channel-ownership indexes; retain existing video and transition indexes.
- No production D1/business/provider queries, remote migrations, forced collection, merge, deployment, cadence changes, new dependencies or automation changes.
- Use isolated local D1; preserve all other worktrees and existing local databases. Publish only this task's changes after local verification and independent review.

Reference evidence is the existing local October 27 SQL review, not a production performance guarantee. Future daily savings and 5M compliance require separately authorized post-deployment observation.
