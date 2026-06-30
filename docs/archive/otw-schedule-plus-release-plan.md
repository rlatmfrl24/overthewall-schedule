# OTW Schedule + Chrome Web Store Release Plan

## Goal

`extensions/otw-schedule-plus`를 개발용 `Load unpacked` 확장에서 Chrome Web
Store 배포 가능한 first-party 확장으로 전환한다. 공개 제품명은
`OTW Schedule +`이며, 목표는 오버더월 스케줄표 사용자가 안전하게
설치하고 현재 제공되는 CHZZK 멀티뷰 화면 정리와 선택적 채팅 로그인 보조
기능을 신뢰할 수 있게 사용하는 것이다. 이후 방송 알림, 빠른 멀티뷰 열기,
일정 보조 기능 등을 추가할 수 있지만, 각 기능은 릴리즈 전에 권한/개인정보
문구와 함께 별도로 검토한다.

## Official References

- Chrome Web Store overview: https://developer.chrome.com/docs/webstore
- Prepare your extension: https://developer.chrome.com/docs/webstore/prepare
- Publish in the Chrome Web Store: https://developer.chrome.com/docs/webstore/publish
- Chrome Web Store Program Policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- Declare permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome cookies API permissions: https://developer.chrome.com/docs/extensions/reference/api/cookies
- User data policy FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

## Operational Runbook

Use `docs/otw-schedule-plus-deployment-guide.md` for the step-by-step
release checklist, Store upload process, web app CTA deployment, smoke checks,
and rollback plan.

## Current State

Current manifest:

- Manifest V3 service worker extension.
- Required permissions: `storage`.
- Optional permissions: `cookies`.
- Development host permissions: `https://chzzk.naver.com/*`,
  `https://otw-schedule.info/*`, `http://localhost/*`,
  `http://127.0.0.1/*`.
- Optional development host permissions: `https://nid.naver.com/*`.
- Store host permissions: `https://chzzk.naver.com/*`,
  `https://otw-schedule.info/*`.
- Optional store host permissions: `https://nid.naver.com/*`.
- Content scripts:
  - CHZZK live/chat frames, `all_frames: true`.
  - OTW web app bridge on production and, for development builds only, local
    development hosts.
- Toolbar popup:
  - Shows the extension version.
  - Shows local player optimization and chat login states.
  - Links to OTW Multiview, help, and privacy documents.
- `externally_connectable` has already been removed.
- `declarativeNetRequestWithHostAccess` has been removed from the manifest.
- Chat login bridge is opt-in and cookie values are not sent to OTW web app,
  Worker, logs, or external services.

Main store-readiness gaps:

- Chrome Web Store item URL does not exist yet.
- Store screenshots are not yet produced.
- Privacy policy and listing drafts exist in-repo, but must be legally and
  product-reviewed before submission.
- Manual QA on Chrome Stable and reviewer instructions still need final
  confirmation against the uploaded package.

## Chrome Web Store Constraints To Design Around

1. Manifest metadata is part of the package. If `name`, `description`, `version`,
   or `icons` need changes after upload, the manifest must be changed, versioned,
   zipped, and uploaded again.
2. The extension zip must contain `manifest.json` at the zip root.
3. Chrome permissions and host permissions can trigger user-facing warnings.
   Store readiness requires narrow permissions plus clear in-product and listing
   explanations.
4. Products that handle user data need an accurate privacy policy and privacy
   disclosures in the Developer Dashboard.
5. Personal or sensitive user data must only be used for the disclosed single
   purpose, must not be sold or used for personalized ads, and must be handled
   securely.
6. Prominent disclosure and affirmative consent are required when sensitive data
   handling is not obvious from the store listing and product UI.
7. Reviewers may need test instructions and, if needed, test credentials or a
   reproducible flow.

## Release Strategy

### 1. Split Development And Store Builds

Add a store-specific extension build path:

- Keep `public/manifest.json` for local development or replace it with generated
  manifests.
- Add `manifest.store.json` or generate `dist/manifest.json` from a typed source.
- Add scripts:
  - `pnpm extension:build:dev`
  - `pnpm extension:build:store`
  - `pnpm extension:zip`
  - `pnpm extension:validate`

Store manifest target:

- Remove `http://localhost/*` and `http://127.0.0.1/*`.
- Keep OTW bridge only on `https://otw-schedule.info/*`.
- Keep CHZZK content script only on `https://chzzk.naver.com/*`.
- Narrow Naver cookie host permission to the minimum verified set. Preferred:
  `https://nid.naver.com/*` instead of `https://*.naver.com/*`.
- Remove `declarativeNetRequestWithHostAccess` if legacy cleanup is not needed for
  store users.
- Add production icons: 16, 32, 48, 128.
- Add `action.default_title` and, if useful, a minimal popup explaining current
  status and linking to OTW `/multiview`.
- Use the public name `OTW Schedule +`.
- Keep description under Chrome's 132-character limit.

### 2. Minimize Permission Warnings

Baseline feature:

- `storage`: required for local feature preferences.
- `https://chzzk.naver.com/*`: required for CHZZK frame automation.
- `https://otw-schedule.info/*`: required for the OTW bridge.

Sensitive feature:

- `cookies` plus Naver cookie host access should be treated as sensitive.
- `cookies` and `https://nid.naver.com/*` are optional runtime permissions.
- The web app requests them only when the user enables chat login. If Chrome
  cannot show the permission prompt from that flow, the toolbar popup provides
  a direct permission button.
- If optional permissions become non-viable in Chrome, keep chat login:
  - off by default,
  - enabled only after explicit user action,
  - accompanied by clear disclosure before first enable.

Disclosure copy target:

> 채팅 로그인을 켜면 확장이 Chrome 안의 네이버 로그인 쿠키 일부를 CHZZK
> 멀티뷰 채팅 iframe이 읽을 수 있는 브라우저 저장 영역으로 복사합니다. 쿠키
> 값은 OTW 서버나 웹앱으로 전송되지 않으며, 실제 CHZZK 로그인을 해제하지
> 않습니다.

### 3. Product UX For Trust

In `/multiview`:

- Installed state: show concise connected state and toggles.
- Missing state: show Chrome Web Store install CTA only after the store listing
  exists. Before publication, do not present development install as the main path.
- First chat-login enable: show a one-time confirmation dialog with the disclosure
  above.
- Provide a persistent "자세히 보기" link to privacy and help docs.
- Do not imply affiliation with Naver or CHZZK.

Extension UI:

- A small toolbar popup shows:
  - current extension version,
  - player optimization state,
  - chat login bridge state,
  - link to OTW `/multiview`,
  - privacy policy link.

### 4. Privacy And Policy Package

Create or update public documents:

- `docs/otw-schedule-plus-extension.md`: user-facing help.
- `docs/privacy.md` or a site route for privacy policy.
- Store listing privacy summary.
- Reviewer test instructions.

Privacy policy must explicitly state:

- Single purpose: provide companion features for the OTW Schedule service. In
  the current release, this means improving OTW `/multiview` CHZZK playback and
  optional embedded chat login.
- Data handled:
  - local extension preferences in Chrome storage,
  - selected CHZZK frame identifiers needed to match frames,
  - Naver login cookie values `NID_AUT` and `NID_SES` only inside Chrome extension
    APIs when chat login is enabled.
- Data not collected:
  - no cookie values sent to OTW servers,
  - no browsing history collection,
  - no analytics or advertising usage,
  - no sale or transfer of user data.
- Limited Use statement aligned with Chrome Web Store User Data Policy.
- Contact/support channel.

Chrome Web Store privacy tab:

- Declare the single purpose in plain language.
- Declare cookie/session-related local handling.
- Certify limited use only if the code and docs match the statement.

### 5. Security Hardening Before Submission

Required checks:

- No remote hosted code. All executable JS must be bundled in the extension zip.
- No `eval`, dynamic remote script injection, or broad web access.
- No `externally_connectable` unless a future design truly needs it.
- Bridge messages must continue validating namespace, version, direction, origin,
  current path, and channel ID shape.
- Cookie bridge must never log cookie values.
- Chat-login off flow must never delete Naver/CHZZK cookies.
- Store build must fail if local hosts are present in `host_permissions`,
  `optional_host_permissions`, or `content_scripts.matches`.
- Store build must fail if `*.naver.com` remains without an explicit override.

### 6. Store Listing Assets

Prepare:

- 128x128 icon and smaller manifest icons.
- At least 3 screenshots:
  - `/multiview` without extension, showing fallback state.
  - extension connected with player optimization toggle.
  - chat login opt-in disclosure.
- Short description:
  - `오버더월 스케줄표의 멀티뷰 기능을 보조하고 향후 방송 알림 등 편의 기능을 제공할 전용 확장입니다.`
- Long description:
  - Explain this is an optional helper for OTW Schedule.
  - Explain the current release supports OTW Multiview only.
  - Explain auto wide-screen/player chat hiding.
  - Explain chat login is opt-in and local to Chrome.
  - Explain fallback behavior if CHZZK changes its UI.
- Category: likely Productivity or Accessibility/Tools; choose based on final
  store category availability.
- Support URL and privacy policy URL.

### 7. QA Matrix

Automated:

- `pnpm extension:typecheck`
- extension unit tests
- `pnpm extension:build:store`
- `pnpm extension:zip`
- manifest validation script
- `pnpm lint`
- `pnpm test`
- `pnpm build`

Manual:

- Clean Chrome profile, store build loaded unpacked.
- OTW production `/multiview`, extension missing/connected UI.
- Add 1, 4, 6 CHZZK sources.
- Player optimization on/off:
  - wide-screen button attempts,
  - CHZZK player-side chat hiding,
  - side navigation collapse.
- Chat login off:
  - chat iframe is guest/credentialless,
  - direct CHZZK tab remains logged in.
- Chat login on:
  - user sees disclosure,
  - permission prompt if optional permissions are used,
  - chat iframe recognizes login if Chrome/CHZZK allows partitioned cookies,
  - no cookie value appears in page messages or logs.
- Permission denied:
  - clear status,
  - player optimization still works,
  - direct-open and Mul.Live fallback remain available.
- Browser restart and service worker sleep/wake.
- CHZZK UI selector failure:
  - tile-level warning appears,
  - no page crash.

### 8. Submission Workflow

1. Freeze release branch.
2. Bump extension version.
3. Generate store manifest and zip.
4. Run automated checks.
5. Run manual QA on Chrome Stable.
6. Upload zip to Chrome Developer Dashboard.
7. Fill Store Listing, Privacy, Distribution, and Test Instructions tabs.
8. Submit with deferred publishing enabled for the first release.
9. After approval, smoke-test the staged item before publishing.
10. Publish and update OTW install CTA to the Chrome Web Store URL.

### 9. Reviewer Test Instructions Draft

Use this as the basis for the Developer Dashboard test instructions:

1. Install the extension.
2. Open `https://otw-schedule.info/multiview`.
3. Add a CHZZK channel from the left panel.
4. Confirm the extension status shows connected.
5. Turn on "화면 자동 정리" and verify the extension attempts to optimize only the
   embedded CHZZK live frame.
6. Optional chat login test:
   - Sign in to `https://chzzk.naver.com` directly.
   - Return to OTW Multiview.
   - Turn on "채팅 로그인".
   - Confirm the disclosure and status update.
   - No Naver/CHZZK cookie values are shown in the web page or sent to OTW.

### 10. Operating Plan

Post-launch:

- Track user reports about CHZZK selector breakage separately from app bugs.
- Maintain a small selector compatibility test fixture for Better MultiChzzk-like
  controls.
- Keep extension release notes focused on permissions and CHZZK behavior changes.
- For urgent CHZZK selector breakage, ship extension-only patch releases.
- For permission changes, prefer deferred publishing and a clear changelog because
  Chrome may show new permission warnings.

## Milestones

### M1: Store Build Hardening

- Generate separate store manifest.
- Remove local host permissions from store build.
- Remove or justify DNR permission.
- Keep Naver cookie host access as an optional `https://nid.naver.com/*`
  permission.
- Add icons and package validation.

### M2: Privacy And Consent

- Add first-use chat login disclosure.
- Add public privacy policy.
- Update `/multiview` helper text to point to privacy/help docs.
- Draft Chrome Web Store privacy fields.

### M3: Store Listing

- Prepare screenshots and copy.
- Prepare support URL and reviewer test instructions.
- Decide category and distribution countries.

### M4: Release Automation

- Add store zip command.
- Add CI checks for manifest policy.
- Add release checklist to docs.

### M5: Submission And Launch

- Upload with deferred publishing.
- Resolve review feedback.
- Publish.
- Replace in-app install CTA with Chrome Web Store URL.

## Definition Of Ready For Submission

- Store zip contains no development host permissions.
- Store zip contains no remote hosted code.
- Manifest has icons, final name, final description, and bumped version.
- Required permissions are justified in listing and privacy docs.
- Chat login requires explicit opt-in and never logs or transfers cookie values.
- Automated checks and manual QA matrix pass.
- Chrome Developer Dashboard listing, privacy, distribution, and test instructions
  are complete.
