# OTW Play public layout design QA

result: passed

## Comparison set

- Home reference: `C:\Users\rlatm\Downloads\62f3def694141ce6ef05f62e3fc52a74.jpg`
- Home implementation: `C:\Users\rlatm\AppData\Local\Temp\otw-play-design-qa\home-1280x720.png`
- Discover reference: `C:\Users\rlatm\Downloads\e6b8550a2ad761244b0a97620791dce2.jpg`
- Discover implementation: `C:\Users\rlatm\AppData\Local\Temp\otw-play-design-qa\discover-1280x720.png`
- Captured with: Codex in-app Browser, `1280x720`, signed-in administrator preview

## Visible comparison

- Home preserves the second reference's search-led entry, layered featured artwork,
  circular member discovery, and persistent bottom playback controls while using
  real OTW Play catalog thumbnails and the existing OTW shell.
- Discover preserves the first reference's large featured video, dense songs and
  video sections, right-hand play queue, and bottom playback bar. The existing
  product sidebar and light/dark theme remain authoritative rather than copying
  the reference brand or palette.
- The right rail stays visible when empty so content width does not jump. The
  bottom bar is owned by `PlayShell`, so it persists between Home, Discover,
  Catalog, and song detail.

## Corrections made during QA

- Replaced the narrow split Discover hero after it clipped long Korean/Japanese
  titles beside the queue rail.
- Added safe wrapping for long multilingual hero titles.
- Corrected inherited foreground colors so outline actions and participant chips
  remain legible over dark artwork.
- Verified that adding `BAD HABIT` from Discover updates the real session queue
  from `0` to `1` and immediately populates the bottom playback bar.

## Responsive and accessibility checks

- Desktop rail is `360px`; the YouTube host remains 16:9 with a `200px` minimum
  height once a track is selected.
- Tablet/mobile keep the bottom bar and open the queue as a separate overlay;
  closing it uses the existing pause-and-collapse command.
- Queue count, current item, controls, empty state, and status announcements use
  landmarks or accessible labels; disabled controls remain explicit when empty.
- No new placeholder artwork, fake progress, saved playlist, API, schema,
  production flag, or deployment behavior was introduced.
