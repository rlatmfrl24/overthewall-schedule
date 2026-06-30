# CZViewer Repository Analysis for OTW Multiview

Created: 2026-06-23

Analyzed repository: https://github.com/selentia/czviewer/tree/main

Local analysis commit: `88b3dd7 chore(release): bump version to 1.0.5`

## Summary

CZViewer is useful reference material, but it is not a complete multiview web app implementation.

The public repository contains only the Chrome Extension source. The hosted multiview web application, backend APIs, and deployment infrastructure are intentionally excluded. For OTW, the repository should be treated as evidence of which CHZZK-specific browser limitations exist and how an optional companion extension could solve them.

The main product direction remains:

1. Build an OTW web-only multiview MVP first.
2. Keep advanced CHZZK features extension-gated.
3. Do not make the MVP depend on a browser extension.

## What CZViewer Actually Contains

| Area | Files | What it does |
| --- | --- | --- |
| Chrome MV3 manifest | `manifest.json`, `rules.json` | Declares CHZZK, Naver, CZViewer, and localhost host permissions; injects scripts into CHZZK live/chat pages and the hosted CZViewer multiview page. |
| Message protocol | `src/shared/messages.ts` | Defines stable `window.postMessage` and `chrome.runtime` message types between web page, content scripts, background worker, and injected scripts. |
| Channel ID parsing | `src/shared/channelId.ts` | Extracts 32-hex CHZZK channel IDs from raw IDs and CHZZK URLs. |
| Popup launcher | `src/popup/popup.ts` | Lets a user paste CHZZK channels, resolves display names, stores favorites/options, then opens `https://czviewer.duna.me/multiview?c=...`. |
| Hosted page bridge | `src/content/multiviewBridge.ts` | Lets the hosted multiview page detect the extension, request channel names, subscribe to latency updates, request fast-forward, and patch CHZZK iframe URLs. |
| Live page content script | `src/content/liveContent.ts` | Runs in CHZZK live frames, reads video buffer/current time, requests page-context injection, reports latency, handles fast-forward, and optionally runs reward claim logic. |
| Page-context injection | `src/background/injectedMain.ts` | Uses CHZZK private page globals and React internals to read latency, force wide layout, and collapse chat. |
| Chat frame helpers | `src/content/chatContent.ts`, `src/background/injectedChatWsHook.ts` | Adds timestamps to CHZZK chat lines by inspecting React props and DOM class names. |
| Cookie bridge | `src/background/cookieBridge.ts` | Copies Naver login cookies into partitioned cookie storage for CZViewer top-level sites so CHZZK login-dependent features can work inside third-party contexts. |
| Channel name resolver | `src/background/fetchChannelName.ts` | Fetches `https://api.chzzk.naver.com/service/v1/channels/{id}` and caches channel names in the extension background context. |

## Important Scope Caveats

- The repository README explicitly says web services, backend APIs, and deployment infrastructure are excluded.
- The hosted CZViewer multiview route is referenced but not included.
- `manifest.json` references some web-accessible resources that are not present in the public source tree, such as `multiview/multiview.html` and `permission/permission.html`.
- `manifest.json` references `background/injectedChatWsHook.js`; the source exists as TypeScript, but the public `tsup.config.ts` does not list it as a build entry. The published extension may use additional build/deploy steps not included in the repo.
- The extension host permissions are scoped to `czviewer.duna.me`, `www.czviewer.duna.me`, and localhost. The published CZViewer extension cannot automatically enhance an OTW-owned domain unless that extension adds OTW to its manifest permissions or OTW ships its own extension.

## Lessons for OTW

### 1. Keep URL State Simple

CZViewer's popup opens the hosted page with repeated `c=` params:

```text
/multiview?c={channelId}&c={channelId}&chat=right&header=on&lp=0&autoFF=0&autoFFThreshold=12&ts=1
```

For OTW, this is a good pattern. Prefer simple, shareable query state:

```text
/multiview?c={chzzkChannelId}&c={chzzkChannelId}&layout=auto&chat=right
```

Add YouTube later with a typed prefix if needed:

```text
/multiview?s=chzzk:{channelId}&s=youtube:{videoId}&chat=chzzk:{channelId}
```

For the first version, repeated `c=` is easier and matches the CHZZK-only MVP.

### 2. Web-Only MVP Should Avoid Extension-Only Promises

The following CZViewer features depend on extension privileges and should not be promised in a plain OTW web MVP:

- Reading CHZZK player latency from page globals.
- Seeking embedded CHZZK players to live edge.
- Mirroring Naver login cookies into third-party/partitioned cookie storage.
- CHZZK login-dependent chat features inside embedded frames.
- Injecting scripts into CHZZK live/chat frames.
- Auto reward claim logic.
- DOM or React Fiber manipulation inside CHZZK pages.

OTW web MVP should provide:

- Multi-player layout.
- Manual add/remove/reorder.
- Current-live OTW source suggestions.
- Basic chat iframe selection if it works without extension privileges.
- Shareable URL state.
- Clear fallback links to open CHZZK/YouTube directly.

### 3. Extension Detection Is a Good Optional Pattern

CZViewer uses several extension-presence signals:

- A request header `x-has-extension`.
- `document.documentElement.dataset.cmvExt = "1"`.
- A cookie such as `cmv_ext=1`.
- A custom `CMV_EXT_READY` browser event.
- `window.postMessage` protocol messages.

If OTW later builds a companion extension, use the same general pattern:

- The web app detects optional extension capabilities.
- Advanced controls appear only when detected.
- The base page still works without the extension.

### 4. A Typed Message Protocol Is Worth Copying Conceptually

`src/shared/messages.ts` is one of the most reusable ideas in the repo. It keeps cross-context messaging explicit and stable.

For an OTW extension later, define a small protocol such as:

```ts
OTW_EXT_READY
OTW_SUBSCRIBE_LATENCY
OTW_UNSUBSCRIBE_LATENCY
OTW_LATENCY_UPDATE
OTW_FAST_FORWARD_REQUEST
OTW_FETCH_CHANNEL_NAME_REQUEST
OTW_FETCH_CHANNEL_NAME_RESPONSE
```

Do not reuse `CMV_*` names unless interoperating directly with CZViewer becomes an intentional goal.

### 5. CHZZK Internals Are High-Maintenance

The most powerful CZViewer behaviors rely on private CHZZK internals:

- `window.__getLiveInfo().latency`
- React Fiber traversal.
- CHZZK class-name prefixes.
- DOM selectors for chat and player layout.
- Login cookies and partitioned storage behavior.

These are useful for a power-user extension, but they are fragile for an OTW production web feature. Treat them as optional enhancement work with ongoing maintenance cost.

## Recommended OTW Implementation Direction

### Phase 0: Feasibility PoC

Goal: verify that a plain OTW web page can embed the minimum useful CHZZK/YouTube players.

Build a temporary `/multiview-poc` or local component that embeds:

- One CHZZK live URL: `https://chzzk.naver.com/live/{channelId}`.
- One CHZZK chat URL if available: `https://chzzk.naver.com/live/{channelId}/chat`.
- One YouTube embed URL.

Verify:

- CHZZK iframe renders on the OTW domain.
- Chat iframe behavior is acceptable without a login bridge.
- Fullscreen works.
- Multiple iframes do not break mobile layout.
- Browser console has no frame-blocking errors.

Exit criteria:

- If CHZZK live iframe works, continue with a web-only MVP.
- If CHZZK live iframe is blocked, ship source selection plus "open each stream" links and consider an extension-backed approach.

### Phase 1: Web-Only OTW Multiview MVP

Implement:

- `src/routes/multiview.tsx`
- `src/features/multiview/multiview-page.tsx`
- `src/features/multiview/multiview-url-state.ts`
- `src/features/multiview/player-grid.tsx`
- `src/features/multiview/source-picker.tsx`
- `src/features/multiview/chat-panel.tsx`
- `src/hooks/use-multiview-sources.ts`

Scope:

- CHZZK-only source list first.
- Manual URL/channel ID input using a parser based on CZViewer's `extractChannelId`.
- Repeated `c=` query params for shareability.
- Grid presets: auto, 1, 2, 4, 6, 9.
- Current-live OTW suggestions from existing members and `fetchLiveStatusesForMembers`.
- Optional chat panel with one selected source.
- Replace the external multiview header link with `/multiview` after the MVP works.

Avoid in Phase 1:

- Custom extension.
- Latency synchronization.
- Fast-forward controls.
- Cookie bridge.
- Auto reward features.
- CHZZK DOM manipulation.

### Phase 2: Production Hardening

Add:

- URL parser tests.
- Source normalization tests.
- Playwright smoke tests for desktop and mobile layout.
- Tile count cap or warning when more than four streams are open.
- Per-tile unavailable state and fallback link.
- Local storage for last layout and source history.
- Performance guardrails: lazy mounting, pause/remove hidden tiles, and explicit user action before loading many players.

### Phase 3: Optional OTW Companion Extension

Only consider this after the web MVP proves useful.

Possible extension features:

- Detect extension on `overthewall-schedule` production domain.
- Show CHZZK latency per tile.
- Add "catch up to live edge" button.
- Improve CHZZK chat timestamp display.
- Improve login-dependent CHZZK chat behavior if users need it.

Requirements:

- OTW-owned extension manifest with OTW domain host permissions.
- Minimal message protocol.
- No default cookie mirroring unless there is a clear user-facing benefit and consent UX.
- Strict origin checks.
- A maintenance plan for CHZZK DOM/API changes.

## What Not To Copy Into OTW MVP

| CZViewer pattern | Reason to avoid in MVP |
| --- | --- |
| Naver cookie bridge | Sensitive permission surface; only possible in extension; high trust cost. |
| React Fiber traversal | Fragile against CHZZK UI updates. |
| Auto reward claim | Not core to OTW schedule/multiview; policy and trust risk. |
| Fast-forward based on embedded video internals | Requires extension access to CHZZK frames. |
| Chat timestamp injection | Nice-to-have; tied to CHZZK DOM internals. |
| Extension-only source of truth | Would make the feature unavailable to most mobile and non-Chrome users. |

## Architecture Fit With Current OTW

Existing OTW assets make Phase 1 straightforward:

- `members.url_chzzk` already stores CHZZK URLs.
- `src/lib/api/live-status.ts` can map members and schedule titles to CHZZK channel IDs.
- `worker/routes/live.ts` already fetches CHZZK live status.
- Historical note: this analysis originally referenced `src/components/header.tsx`; the current product slot lives in `src/components/app-navigation.ts` and `src/components/app-shell.tsx`.
- No new D1 table is needed unless official presets are introduced.

Optional new shared helper:

```text
src/lib/chzzk-channel-id.ts
```

This can centralize CHZZK ID parsing for:

- existing live-status title extraction,
- multiview manual input,
- future admin validation.

## Risk Comparison After CZViewer Analysis

| Risk | Web-only MVP | Extension-enhanced version |
| --- | --- | --- |
| Build speed | Fast | Slow-medium |
| User reach | High | Chrome desktop users only |
| CHZZK login/chat support | Limited | Better, but permission-heavy |
| Latency/FF features | Not available | Possible |
| Maintenance burden | Moderate | High |
| Trust/security review | Normal web app | Higher due cookies/scripting permissions |

## Recommendation

Do not build an extension first.

Use CZViewer to confirm the right product boundaries:

- The web app should own layout, source selection, URL state, and OTW live suggestions.
- Extension-style capabilities should be treated as progressive enhancement.
- The first OTW release should be useful without any browser extension.

The recommended first milestone is a CHZZK-only `/multiview` MVP with shareable `c=` URL state, live OTW suggestions, manual add/remove, grid layout, and a fallback link per tile. After that is stable, add YouTube source support and only then revisit an OTW companion extension for latency/chat power features.

