# OTW Schedule + Chrome Web Store Listing Draft

## Single Purpose

OTW Schedule +는 오버더월 스케줄표 사용 경험을 보조하는 전용
Chrome 확장 프로그램입니다. 현재 버전은 OTW `/multiview`의 CHZZK 플레이어
최적화와 선택적 채팅 로그인 보조 기능만 제공합니다.

## Short Description

오버더월 스케줄표의 멀티뷰 기능을 보조하고 향후 방송 알림 등 편의 기능을 제공할 전용 확장입니다.

## Long Description

OTW Schedule +는 오버더월 스케줄표 전용 Chrome 확장 프로그램입니다.
현재 릴리즈에서는 멀티뷰 시청을 돕는 기능만 제공하며, 이후 방송 알림,
빠른 멀티뷰 열기, 일정 보조 기능처럼 오버더월 스케줄표와 연결되는 편의
기능을 단계적으로 추가할 수 있도록 설계되었습니다.

It helps with CHZZK iframe limitations that a normal web page cannot control:

- Attempts to switch selected embedded CHZZK live players into a wider viewing
  mode.
- Attempts to hide the CHZZK player-side chat panel so the video area has more
  room.
- Optionally helps the OTW Multiview chat iframe recognize your existing CHZZK
  login.

Chat login support is off by default. When enabled, cookie values stay inside
Chrome extension APIs and are not sent to OTW servers, the OTW web app, logs, or
third-party services.
The extension requests the optional Naver cookie permission only when the user
turns on chat login.

CHZZK can change its page structure at any time, so player optimization is
best-effort. If automation cannot find the expected controls, OTW Multiview will
continue to show the normal CHZZK iframe and direct-open fallback.

This extension is not affiliated with, endorsed by, or produced by Naver or
CHZZK.

## Privacy Tab Draft

Single purpose:

> Provide companion features for the OTW Schedule service. The current release
> improves OTW Multiview CHZZK playback and optional embedded CHZZK chat login.

Data usage summary:

> The extension stores local preferences in Chrome storage. It reads selected
> CHZZK frame/channel identifiers to match embedded players. If the user turns
> on chat login and grants the optional permission, it reads Naver login cookies
> `NID_AUT` and `NID_SES` through Chrome's cookies API and copies them into the
> browser cookie partition used by the embedded CHZZK chat iframe. Cookie values
> are not sent to OTW servers or third parties.

Limited Use certification:

> User data is used only to provide or improve the extension's single purpose.
> It is not sold, transferred for advertising, or used for personalized ads.

## Reviewer Test Instructions

1. Install the submitted extension package.
2. Open `https://otw-schedule.info/multiview`.
3. Add a CHZZK channel from the left panel.
4. Confirm the extension status shows connected.
5. Turn on "화면 자동 정리" and verify the extension attempts to optimize only
   the embedded CHZZK live frame.
6. Optional chat login test:
   - Sign in to `https://chzzk.naver.com` directly.
   - Return to OTW Multiview.
   - Turn on "채팅 로그인".
   - Grant the optional Chrome cookie permission if prompted.
   - Confirm the disclosure and status update.
   - Confirm no Naver/CHZZK cookie values are shown in the web page or sent to
     OTW.

## Assets Needed Before Submission

- 3 production screenshots.
- Final support URL.
- Final Chrome Web Store item URL after first upload.
- Final category and distribution countries.
