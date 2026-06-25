# OTW Schedule + Extension

OTW Schedule + is an optional Chrome extension for the OTW Schedule
service. The current release focuses on `/multiview`: the web page still works
without it, but the extension can help with CHZZK iframe limitations that a
normal web page cannot control. Future releases may add schedule-related
features such as live notifications or faster access to OTW pages.

## What It Does

- Detects CHZZK live/chat frames embedded in OTW Multiview.
- Tries to click CHZZK's wide-screen/theater control inside live frames, then
  hides the player-side CHZZK chat panel so the video area has more room.
- Optionally bridges the Naver login cookies used by CHZZK (`NID_AUT`,
  `NID_SES`) into the OTW iframe partition so embedded chat can recognize a
  direct CHZZK login.
- When chat login bridge is off, the web app reloads only the chat iframe as a
  credentialless iframe. The extension does not delete Naver/CHZZK cookies and
  does not block cookies for live player iframes.

The cookie bridge is experimental and opt-in. Cookie values stay inside the
extension and are never sent to the OTW web app, Worker, or logs.

## Chrome Web Store Install

OTW Schedule + is being prepared for Chrome Web Store distribution.
After the store listing is approved, OTW pages should link users to the Chrome
Web Store listing instead of asking them to install a development build.

The extension uses these permissions for the store build:

- Required `storage`: saves local helper preferences.
- Required `https://chzzk.naver.com/*`: detects and optimizes embedded CHZZK live/chat
  frames.
- Required `https://otw-schedule.info/*`: connects the extension to OTW Multiview.
- Optional `cookies`: supports the chat login bridge only after user opt-in.
- Optional `https://nid.naver.com/*`: reads the narrow Naver login cookies needed
  for the optional chat login bridge.

The store build must not include `localhost`, `127.0.0.1`,
`https://*.naver.com/*`, or `declarativeNetRequestWithHostAccess`.

The toolbar popup shows the extension version, local helper states, and links to
OTW pages, help, and privacy information.

Release operators should use `docs/otw-schedule-plus-deployment-guide.md`
for packaging, Chrome Web Store submission, production CTA deployment, and
rollback steps.

## Development Install

1. Build the extension:

   ```bash
   pnpm extension:build:dev
   ```

2. Open Chrome Extensions:

   ```text
   chrome://extensions
   ```

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select:

   ```text
   extensions/otw-schedule-plus/dist
   ```

6. Open `/multiview` and check the left panel for the helper status.

When updating from an older development build, rebuild and reload the unpacked
extension. Version `0.1.1` removes the old tab-wide cookie blocking behavior;
Chrome clears session-scoped declarativeNetRequest rules on extension updates.
Version `0.1.2` adds Better MultiChzzk-style player optimization: wide-screen
activation plus player-side chat hiding.
Version `0.2.0` introduces Chrome Web Store build targets, optional Naver cookie
permissions, store package validation, and a first-use chat login disclosure.
Version `0.2.1` removes the old multiview bridge namespace and re-announces the
extension bridge after SPA navigation into `/multiview`, so the production page
can connect without a manual refresh.

## Store Release Build

Create and validate a store-ready package:

```bash
pnpm extension:zip
```

The zip is written to:

```text
extensions/otw-schedule-plus/artifacts/
```

The store build removes source maps and validates that no development host
permissions are present.

## Chat Login Flow

1. Open `https://chzzk.naver.com` directly and log in.
2. Return to OTW `/multiview`.
3. Open the left panel and turn on **채팅 로그인 연동**.
4. Allow the optional Chrome cookie permission if Chrome asks for it. If the web
   app cannot open the prompt, use the extension toolbar popup.
5. If Chrome or CHZZK blocks the partitioned-cookie bridge, the panel will show
   a limited-support status and the normal direct-open/Mul.Live fallbacks remain
   available.
6. Turning the toggle off returns the chat iframe to a guest context only inside
   `/multiview`; it must not sign the browser out of CHZZK itself.

## Maintenance Notes

- CHZZK DOM selectors can change without notice. Wide-screen automation is
  best-effort and reports a tile-level warning when it cannot find the player
  optimization controls.
- Naver/CHZZK session cookies can change. Keep the cookie allowlist narrow and
  never expose cookie values to the web app.
- Do not implement chat logout by deleting cookies or by tab-wide request
  blocking. That can affect live player iframes or the user's direct CHZZK
  session.
- Before Web Store submission, review permission wording, icons, screenshots,
  privacy disclosures, and reviewer test instructions.
