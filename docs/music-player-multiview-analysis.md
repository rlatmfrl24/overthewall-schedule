# OTW Music Player and Multiview Feature Analysis

Created: 2026-06-23

## Purpose

This document compares two proposed OTW Schedule product additions:

1. A Spotify-style music player that collects OTW cover songs and song clips uploaded to YouTube.
2. An OTW-owned multiview page similar in spirit to Mul.Live and Holodex Multiview.

The goal is to choose a fast and stable implementation path that fits the current React, Worker, D1, and Drizzle architecture.

## Executive Recommendation

Build the OTW multiview MVP first.

The multiview feature is faster and safer because it can start as a mostly client-side route backed by existing member, schedule, and live-status data. It does not require a new durable music catalog, manual metadata curation workflow, or playlist state. The first version can replace the current external multiview link with an internal `/multiview` page and shareable URL state.

Build the music player second, starting with a curated metadata MVP rather than fully automated classification.

The music player is still valuable, but its stable version needs a small catalog model, admin review, and stricter rights/product boundaries. The player should use official YouTube embeds via the YouTube IFrame Player API. It should not download, extract, proxy, or re-host audio from YouTube.

## Current Project Fit

The repository already has useful building blocks for both ideas:

| Existing area | Relevant files | Reuse |
| --- | --- | --- |
| Member source data | `src/db/schema.ts`, `worker/routes/members.ts` | Members already store `youtube_channel_id`, `url_youtube`, `url_chzzk`, and extra `member_links`. |
| YouTube metadata | `worker/services/youtube.ts`, `worker/routes/vods.ts`, `src/lib/api/youtube.ts`, `src/hooks/use-youtube-videos.ts` | Existing code fetches uploads playlists, video details, duration, thumbnails, view count, and channel data. |
| VOD and clips page | `src/features/vods/vods-overview.tsx`, `src/features/youtube/*`, `src/features/clips/*` | A media browsing UI already exists and can inform `/music`. |
| CHZZK live status | `worker/routes/live.ts`, `worker/services/chzzk.ts`, `src/lib/api/live-status.ts` | Multiview can auto-suggest currently live CHZZK channels. |
| Admin management | `src/features/admin/*`, `worker/auth.ts` | Music catalog curation and multiview source presets can use existing admin patterns. |
| External multiview link | `src/components/header.tsx` | The header already links to an external OTW multiview, so the product slot exists. |

## External Reference Notes

The references below were checked on 2026-06-23.

- Mul.Live is a thin multiview service for CHZZK, SOOP, Twitch, and YouTube. Its URL accepts slash-separated stream identifiers, including `y:` for YouTube handles, custom URLs, channels, or video IDs. It uses a browser extension for chat and login-dependent features.
- Mul.Live's public source shows a simple model: resolve stream IDs, build player/chat URLs, render multiple iframes, and resize a grid based on viewport and chat visibility.
- Holodex exposes a public API for VTuber live/upcoming data. Its docs require `X-APIKEY` and recommend the quick `/api/v2/users/live` endpoint for fixed channel lists.
- YouTube's IFrame Player API supports JavaScript control for embedded players, including play, pause, stop, volume, and player-state events.
- YouTube embeds must meet minimum viewport requirements. When using `enablejsapi=1`, the embed should include the `origin` parameter.
- YouTube Data API quota rules have changed over time. As of the current Google quota page, all requests cost at least one quota point, common list endpoints such as `channels.list`, `playlistItems.list`, and `videos.list` cost 1, and default project quota is still a hard design constraint.

## Feature 1: Spotify-Style YouTube Music Player

### Product Definition

The player should feel like a music player, but the playback source must remain YouTube.

In scope:

- Official cover songs, original songs, singing clips, song-focused Shorts, and optionally approved fan clips.
- YouTube metadata, thumbnails, duration, channel, member attribution, release date, and tags.
- Queue, playlist, shuffle, repeat, member filter, search, and "now playing" UI.
- Playback through visible YouTube embed/IFrame Player API.
- Admin-reviewed catalog entries and optional automatic candidate discovery.

Out of scope for the main app:

- Downloading YouTube audio.
- Playing YouTube as hidden background-only audio.
- Re-hosting or transcoding YouTube content.
- Replacing YouTube branding or controls in ways the embed API does not allow.
- Fully automatic song recognition from long karaoke streams in the MVP.

### Why This Is Not Just the Current YouTube Tab

The current YouTube tab is video-feed oriented. A music player needs a stable catalog and playback state:

- A feed answers "what was uploaded recently?"
- A music player answers "what can I listen to next?"

That distinction creates new requirements:

- Track identity independent of raw video freshness.
- Curation and correction.
- Playlists and ordering.
- Queue behavior across filters.
- Resilience when a video is deleted, private, region-locked, or no longer embeddable.

### Recommended MVP

MVP name: Music Library

MVP behavior:

- Add `/music`.
- Show a searchable list/grid of curated tracks.
- Provide member, source type, and duration filters.
- Open a right or bottom player panel with a visible YouTube iframe.
- Support queue, next/previous, shuffle, repeat-one, repeat-all.
- Persist only local client queue preferences in `localStorage`.
- Store canonical track metadata in D1.
- Let admins add/edit/hide tracks manually.
- Run an optional candidate scanner that suggests likely music uploads, but does not publish them automatically.

### Data Model Draft

The MVP needs a small schema. Exact migration should be generated with Drizzle when implementation starts.

#### `music_tracks`

Canonical track metadata.

| Field | Notes |
| --- | --- |
| `id` | Internal primary key. |
| `member_uid` | Primary OTW member attribution. Nullable for group/unit tracks if needed. |
| `title` | Display title. |
| `artist_name` | Defaults to member or unit name, editable. |
| `source_type` | `cover`, `original`, `singing_clip`, `karaoke_stream`, `short`, `fan_clip`. |
| `youtube_video_id` | Unique where active. |
| `youtube_channel_id` | Source channel. |
| `thumbnail_url` | Cached metadata URL from YouTube response. |
| `duration_seconds` | From YouTube content details. |
| `published_at` | YouTube publish time. |
| `start_seconds` | Optional start point for song clips inside a longer video. |
| `end_seconds` | Optional end point. |
| `visibility` | `public`, `unlisted`, `hidden`. |
| `review_status` | `candidate`, `approved`, `rejected`, `needs_update`. |
| `sort_title` | Optional normalized title for ordering. |
| `tags_json` | Small JSON array for mood, language, event, etc. |
| `created_at` | Timestamp. |
| `updated_at` | Timestamp. |

#### `music_playlists`

Optional for MVP if only system playlists are needed. Add when curated playlists become part of the product.

| Field | Notes |
| --- | --- |
| `id` | Internal primary key. |
| `slug` | Stable route key. |
| `title` | Display title. |
| `description` | Optional. |
| `visibility` | `public`, `hidden`. |
| `sort_order` | Manual ordering. |
| `created_at` | Timestamp. |
| `updated_at` | Timestamp. |

#### `music_playlist_items`

| Field | Notes |
| --- | --- |
| `id` | Internal primary key. |
| `playlist_id` | Parent playlist. |
| `track_id` | Track. |
| `sort_order` | Manual ordering. |

### API Contract Draft

Public:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/music/tracks` | List approved public tracks with filters. |
| `GET` | `/api/music/playlists` | List public playlists. |
| `GET` | `/api/music/playlists/:slug` | Playlist detail and tracks. |

Admin:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/music/admin/tracks` | List all tracks, including candidates and hidden entries. |
| `POST` | `/api/music/admin/tracks` | Create manual track. |
| `PUT` | `/api/music/admin/tracks/:id` | Update metadata/review status. |
| `POST` | `/api/music/admin/candidates/scan` | Scan YouTube uploads and create candidates. |
| `POST` | `/api/music/admin/candidates/:id/approve` | Approve a candidate. |
| `POST` | `/api/music/admin/candidates/:id/reject` | Reject a candidate. |

### Candidate Discovery

Start conservative. Automatic discovery should create `candidate` rows only.

Initial signal candidates:

- Source channel is a member official YouTube channel, member VOD/sub channel, or approved kirinuki channel.
- Title contains terms such as `cover`, `covered by`, `song`, `singing`, `karaoke`, `shorts`, Korean equivalents, or known series markers.
- Duration is within a likely song range for normal uploads, for example 90 seconds to 8 minutes.
- Shorts are allowed only if title/source strongly indicates song content.
- Video description or tags can be scanned later, but this may add API calls and quota usage.

Avoid high-risk automation:

- Do not classify every long live stream as a track.
- Do not publish candidates without admin review.
- Do not infer copyrighted song metadata aggressively unless the title/description explicitly provides it.

### Frontend Architecture

Suggested feature structure:

```text
src/routes/music.tsx
src/features/music/music-page.tsx
src/features/music/music-track-list.tsx
src/features/music/music-player.tsx
src/features/music/music-queue.tsx
src/features/music/music-filters.tsx
src/hooks/use-music-tracks.ts
src/lib/api/music.ts
```

Player implementation:

- Use a single YouTube IFrame Player instance.
- Keep the iframe visible in the player area once playback starts.
- Use `enablejsapi=1`, `origin`, and `playsinline=1`.
- Drive queue transitions from `onStateChange` ended events.
- Store transient queue state client-side first.
- Keep route state filterable/shareable, but avoid encoding full queues in URLs for MVP.

### Music Player Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| YouTube playback restrictions | High | Use official visible embeds only; no audio extraction or hidden-only playback. |
| Mobile autoplay limits | Medium | Require user gesture before playback; avoid promising autoplay. |
| Metadata quality | High | Use admin review for every public track in MVP. |
| Deleted/private/unembeddable videos | Medium | Mark tracks `needs_update` when embed/player API fails; show unavailable UI. |
| Quota overuse | Medium | Reuse existing cache strategy; use cron/admin scans with D1 persistence. |
| Catalog maintenance burden | Medium | Start with a small curated launch list. |
| Rights and fan clip consent | High | Limit fan clips to approved channels and add opt-out/removal workflow. |

### Music Player Difficulty

| Scope | Difficulty | Estimated effort | Stability |
| --- | --- | --- | --- |
| Manual curated library + YouTube embed queue | Medium | 5-8 working days | Good if YouTube embed constraints are accepted. |
| Candidate scanner + admin review | Medium | 3-5 additional days | Good with conservative matching. |
| Public playlists and playlist admin | Medium | 2-4 additional days | Good. |
| Timestamped songs inside long streams | Medium-high | 5-10 additional days | Depends on manual timestamp quality. |
| Fully automatic song detection/lyrics/sync | High | Multi-week | Not recommended for MVP. |

## Feature 2: OTW Multiview Page

### Product Definition

The multiview page lets fans watch several OTW streams at once from one page.

MVP scope:

- Internal `/multiview` route.
- Grid of multiple embedded players.
- Source picker from active/live OTW members.
- Manual add by URL or channel ID.
- Shareable URL that preserves selected sources and basic layout.
- Optional chat side panel with one selected chat source.
- Responsive grid layouts for desktop and mobile.

Out of MVP:

- Login-dependent chat actions.
- Chat sending through OTW.
- Stream recording, restreaming, proxying, or transcoding.
- Server-side synchronization of playback positions.
- Multi-platform deep feature parity with Holodex.

### Recommended MVP

MVP name: OTW Multiview

First version behavior:

- Replace the current external header link with an internal `/multiview` link.
- Show currently live CHZZK sources from existing live-status data.
- Allow manual YouTube video/channel URL input.
- Allow manual CHZZK channel URL input.
- Render selected streams as iframes.
- Add a single chat panel selector.
- Encode selected sources in URL search params or path segments.
- Persist user's last selected layout in `localStorage`.

### Data Model

No D1 schema is required for MVP.

Optional later schema:

- `multiview_presets`: official event/collab presets.
- `multiview_preset_items`: streams in a preset.

Do not add tables until there is a clear admin need for official presets.

### API Contract Draft

The MVP can reuse existing APIs:

- `GET /api/members`
- `GET /api/schedule-board` or current schedule APIs
- `GET /api/live-status?channelIds=...`
- Existing YouTube metadata APIs only when resolving channel uploads or live video IDs becomes necessary.

Optional new endpoint:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/multiview/sources` | Return normalized live/upcoming sources from members and current schedule. |

The optional endpoint can keep the frontend simpler, but it is not required for the first client-only version.

### Source Resolution

Support these source types:

| Type | Input examples | Player URL |
| --- | --- | --- |
| `chzzk` | CHZZK channel ID, `https://chzzk.naver.com/{channelId}`, schedule title link | `https://chzzk.naver.com/live/{channelId}` initially. Verify iframe behavior during PoC. |
| `youtube_video` | `https://www.youtube.com/watch?v=...`, `https://youtu.be/...` | `https://www.youtube.com/embed/{videoId}?autoplay=1&playsinline=1` |
| `youtube_live_channel` | YouTube channel ID or handle | Resolve to current `/live` video if possible, then use embed URL. |

For CHZZK, iframe stability should be verified because platform headers and login/chat behavior can change. Mul.Live uses direct CHZZK live and chat page URLs, which suggests a thin iframe approach is feasible, but this should still be treated as a PoC gate.

### Frontend Architecture

Suggested feature structure:

```text
src/routes/multiview.tsx
src/features/multiview/multiview-page.tsx
src/features/multiview/source-picker.tsx
src/features/multiview/source-chip.tsx
src/features/multiview/player-grid.tsx
src/features/multiview/chat-panel.tsx
src/features/multiview/multiview-url-state.ts
src/hooks/use-multiview-sources.ts
```

Layout:

- Use CSS grid with fixed aspect-ratio tiles.
- Default to 1, 2, 3, 4, 6, and 9 tile presets.
- Let the largest tile mode arrive after MVP.
- Keep chat as a collapsible side sheet on desktop and bottom sheet on mobile.
- Show clear empty, loading, and unavailable states.

URL state draft:

```text
/multiview?s=chzzk:{channelId},youtube:{videoId}&chat=chzzk:{channelId}&layout=auto
```

Alternative path-style state:

```text
/multiview/chzzk:{channelId}/youtube:{videoId}
```

Query params are easier with TanStack Router search validation and future options.

### Multiview Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| CHZZK iframe or chat restrictions | Medium-high | Run a small browser PoC first; degrade to "open in CHZZK" if blocked. |
| Multiple embeds consume CPU/bandwidth | Medium | Cap default tile count, warn after 4, lazy-load offscreen mobile tiles. |
| YouTube account anti-abuse false positives | Medium | Do not auto-open too many streams; require user action and document limits. |
| Chat login limitations | Medium | Keep chat read-only/optional; do not promise login features. |
| Layout overlap on mobile | Medium | Use stable aspect ratios and explicit grid constraints. |
| API dependency drift | Low-medium | Reuse existing live-status wrapper and route tests. |

### Multiview Difficulty

| Scope | Difficulty | Estimated effort | Stability |
| --- | --- | --- | --- |
| Client-only `/multiview` with manual sources and URL sharing | Low-medium | 2-4 working days | Good after iframe PoC. |
| Live OTW source suggestions | Medium | 1-3 additional days | Good because live-status exists. |
| Chat panel | Medium | 1-3 additional days | Depends on platform iframe behavior. |
| Admin/event presets | Medium | 2-4 additional days | Good; can be D1-backed later. |
| Holodex-like auto collab detection and sync | High | Multi-week | Not recommended for MVP. |

## Side-by-Side Comparison

| Criterion | Music player | Multiview |
| --- | --- | --- |
| Fastest usable MVP | 5-8 days | 2-4 days |
| New database schema | Required for stable catalog | Not required for MVP |
| External API pressure | YouTube metadata scans and embed playback | Mostly embeds plus existing live-status |
| Admin workflow | Required for quality | Optional |
| Policy/rights risk | Medium-high | Medium |
| UX complexity | Medium-high queue/player states | Medium layout/source state |
| Operational stability | Good after curation, but needs maintenance | Good if iframe PoC passes |
| Biggest unknown | Accurate music catalog and YouTube playback constraints | CHZZK iframe/chat behavior |
| Best first release | Curated track library | Internal multiview route |

## Suggested Implementation Order

### Step 1: Multiview PoC

Build a throwaway route or small local component that embeds:

- One CHZZK live page from a known OTW channel.
- One YouTube video.
- Optional CHZZK/YouTube chat iframe.

Verify in desktop and mobile browsers:

- Player renders.
- Fullscreen works.
- Audio can be controlled by the user.
- Chat iframe does not break layout.
- Browser console has no blocking frame errors.

### Step 2: Multiview MVP

Implement `/multiview`:

- Source parser and URL state.
- Manual add/remove/reorder.
- Grid layout.
- Current live source suggestions.
- Header link replacement.
- Focused tests for URL parsing and source normalization.

### Step 3: Music Catalog MVP

Implement D1-backed curated tracks:

- Drizzle schema and migration.
- Public list API.
- Admin CRUD.
- `/music` route and player queue.
- YouTube IFrame player wrapper.

### Step 4: Music Candidate Scanner

Add automated discovery after manual catalog behavior is stable:

- Scan configured member channels.
- Upsert candidate rows only.
- Admin approve/reject.
- Log scan failures and quota usage.

## Final Recommendation

Choose multiview first if the goal is speed and service stability.

The fastest production-safe version can be mostly frontend work, uses existing live-status/member data, and can ship without migrations. The main gate is a small CHZZK iframe/chat PoC.

Choose music player first only if the product goal is longer-term media discovery and retention rather than quick feature delivery.

The music player is a stronger catalog feature, but the stable path requires D1 schema, admin curation, YouTube embed-player integration, and ongoing metadata maintenance. It should be built, but after the multiview page has moved from the external link into the OTW app.

## References

- Mul.Live: https://mul.live/
- Mul.Live GitHub: https://github.com/jebibot/mullive
- Holodex Multiview: https://holodex.net/multiview
- Holodex API docs: https://docs.holodex.net/
- YouTube IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- YouTube player parameters: https://developers.google.com/youtube/player_parameters
- YouTube Data API quota costs: https://developers.google.com/youtube/v3/determine_quota_cost
- YouTube `playlistItems.list`: https://developers.google.com/youtube/v3/docs/playlistItems/list
