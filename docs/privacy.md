# Privacy Policy

## OTW Schedule +

OTW Schedule + is a Chrome extension for the OTW Schedule service.
The current release supports the OTW `/multiview` page only. Its current
single purpose is to improve CHZZK playback inside OTW Multiview and, only when
the user explicitly enables it, help embedded CHZZK chat recognize the user's
existing browser login. Future releases may add OTW Schedule companion features
such as live notifications, but those features must be documented here before
release.

## Data Handled By The Extension

The extension handles only the data needed for its user-facing features:

- Local extension preferences, such as whether player optimization or chat login
  bridge is enabled.
- CHZZK frame identifiers and channel IDs needed to match selected OTW Multiview
  tiles to embedded CHZZK frames.
- When chat login bridge is enabled by the user, the Naver login cookies
  `NID_AUT` and `NID_SES` are read through Chrome's extension cookie API and
  copied into the browser cookie partition used by the embedded CHZZK chat
  iframe.

## Data Not Collected Or Transferred

- OTW does not receive Naver or CHZZK cookie values.
- OTW does not send cookie values to its web app, Worker, logs, analytics, or
  third-party services.
- OTW does not collect browsing history through the extension.
- OTW does not sell, transfer, or use user data for personalized advertising.
- OTW does not allow humans to read personal user data handled by the extension.

## Chat Login Bridge

The chat login bridge is off by default. It runs only after the user turns on
the chat login toggle in OTW Multiview and accepts the in-product disclosure.
The extension requests the optional Chrome cookie permission for Naver login
cookies only for this feature.

Turning the chat login bridge off returns the OTW Multiview chat iframe to a
guest context. It must not delete Naver or CHZZK cookies and must not sign the
user out of the real CHZZK website.

## Limited Use Statement

Use of information received from Chrome extension APIs adheres to the Chrome Web
Store User Data Policy, including the Limited Use requirements. Data handled by
OTW Schedule + is used only to provide or improve the extension's
disclosed purpose. In the current release, that purpose is OTW Multiview player
optimization and optional embedded CHZZK chat login support.

## Contact

For support or privacy questions, use the project issue tracker:

https://github.com/rlatmfrl24/overthewall-schedule/issues
