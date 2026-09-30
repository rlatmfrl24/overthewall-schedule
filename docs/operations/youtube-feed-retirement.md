# YouTube stored-feed retirement

## Stage A: runtime replacement

- Public official, kirinuki and VOD reads use only youtube_feed_sources/videos.
  Incomplete Shorts retain bounded backfill; public access restrictions and
  HTTP caching remain. The 24h retained metadata age governs fresh/stale.
- Admin GET /api/youtube/feed/status accepts 24 or 168 hours. It reads only D1;
  refreshing the screen must never collect, call YouTube or write to D1.
- Manual collection uses POST /api/operations/runs, youtube_feed_collection,
  confirmation, Idempotency-Key and existing queue/admission/lease protections.
  API events are marked manual; scheduled and demand origins remain distinct.
- The result_json YouTube facet reports channels, metadata, unavailable videos,
  Shorts, backfill failures and budget waits independently of wrapper progress.
- Legacy cache routes return 404; /admin/youtube-cache still redirects to
  /admin/collection?source=youtube. The old enabled flag, import, warmup,
  SWR, analytics binding and retention consumers are retired.

Stage A intentionally retains the old schema tables, applied migration history
and stored settings. There is no pending deletion migration. Do not bypass the
deploy script's unapplied-migration check.

## Stage B: separately approved destructive release

Do this only after Stage A production identity and public/admin readback succeed:

1. Export youtube_api_cache and youtube_warmup_runs plus the specifically retired
   settings below to recoverable storage; record database ID, timestamp, counts
   and the recovery path. Verify the export can be read before deletion.
2. Remove only those two definitions from db/schema/index.ts. Generate the schema
   migration with pnpm drizzle:generate and inspect DROP/DELETE SQL.
3. Generate a custom migration only if needed for these exact setting keys:
   youtube_feed_enabled, youtube_warmup_enabled, youtube_warmup_interval_hours,
   youtube_warmup_daily_quota_units, youtube_warmup_official_enabled,
   youtube_warmup_kirinuki_enabled, youtube_warmup_last_run,
   youtube_cache_manual_refresh_lease_until,
   youtube_shorts_legacy_import_completed_at.
4. Preserve youtube_feed_sources/videos, youtube_api_usage_events,
   scheduled_usage_daily, common audit logs, the scheduled collection enable
   setting, quota settings and the shared OTW_PLAY_ANALYTICS_READ_TOKEN.
5. Validate the complete generated migration chain with
   pnpm d1:reset:local -- --validate-only; apply locally to the intended database,
   inspect readback and run affected Worker/D1 tests.
6. Run release preparation and apply remotely only in the separately authorized
   release flow. Verify Stage A has no table readers first. After deletion,
   rollback must use the Stage A runtime or restore the export; a pre-A binary
   cannot safely run against the removed tables.

Historical audit event names remain readable. Cloudflare dataset/secret removal
is a separately approved account action, not an automatic local-code side effect.

## Administrator presentation

The collection screen uses shared Shadcn Radix components, eight compact KPIs,
static state/origin bar charts and channel/run/configuration tables. It retains
the existing status and Operations APIs. The usage period does not turn current
channel health or Pacific-day quota into historical measurements. There is no
display-font download, GSAP dependency or decorative carousel.

## Verification

Use the actual administrator entry point. Cancel the confirmation, then confirm
one due-work run. Distinguish queued/running from terminal status; read the saved
results, source success timestamps, metadata fetched_at and the remaining queue.
No-target runs are neutral, and remaining due work must not be called complete.
Check public videos, kirinuki, VODs and Shorts without a legacy fallback.
Check desktop/mobile, keyboard, themes, reduced motion and screen re-entry.

### Local evidence (2026-09-30)

- Actual administrator confirmation: cancel caused no collection; confirming
  created manual run 126beffd-7fdc-47c4-a8c0-16c394fbf60d through the operations
  queue. Its saved terminal result was succeeded: 8/8 channels, 100 metadata
  refreshes, 99 Shorts stored and 2 backfill pages. Manual API events: 18.
- Source success timestamps and video fetched_at changed in local D1; screen
  re-entry showed the saved result and 14 remaining channels / 1,285 metadata
  records due. This is not a claim that the entire backlog completed.
- Public official videos, Shorts, VODs and kirinuki were reachable in /vods.
  Desktop/mobile, light/dark, name search, keyboard and site animation-off were
  checked through the real UI for the original Stage A screen. That presentation
  was subsequently replaced by the compact Shadcn dashboard; these historical
  observations do not certify the replacement layout.
- Scoped API/UI/Worker/D1 tests, type checks, architecture check, changed-code
  lint and build passed. The existing 98-migration chain passed temporary local
  validation; no deletion migration was generated or applied.
- No commit, push or production release was performed. Stage B export, runtime
  identity/readback, schema deletion and remote application remain release work.

### Compact-dashboard replacement (2026-09-30)

- The authenticated administrator entry point showed eight KPIs, both static
  charts and detail tabs without scrolling at 1280x900. Registered channel
  count (22) matched table rows; due count (14) remained separate from the
  historical completed run's actual 8/8 source result and 1,285 metadata waits.
- Real UI checks covered confirmation cancel/focus restoration, keyboard
  state filtering and URL readback, channel details, saved run history,
  24-hour/7-day usage periods, 390px/768px/1440px layouts, light/dark themes,
  animation-off and the browser's effective reduced-motion mode. Preferences
  were restored. Mobile page width stayed 390px; table overflow was internal.
- No new collection was submitted and no schema or operational data was
  changed. Acceptance/terminal transitions and remaining-work refresh were
  regression-tested, not claimed as a new live collection completion.
- The UI suite also distinguishes metadata-only work from a no-target run and
  keeps a previously monitored run visible after it becomes terminal.
- Native browser zoom did not change through the available keyboard surface;
  actual 200% zoom remains unverified. Narrow-viewport reflow was checked.
