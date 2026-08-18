# OTW Play public layout design QA

## Comparison target

- Source visual truth:
  - Home/chrome reference: `C:\Users\rlatm\Downloads\62f3def694141ce6ef05f62e3fc52a74.jpg`
  - Queue/player reference: `C:\Users\rlatm\Downloads\e6b8550a2ad761244b0a97620791dce2.jpg`
- Rendered implementation:
  - Compact: `C:\Users\rlatm\AppData\Local\Temp\otw-play-design-qa\home-chrome-compact-1280x720.png`
  - Expanded: `C:\Users\rlatm\AppData\Local\Temp\otw-play-design-qa\home-chrome-expanded-1280x720.png`
- Local URL: `http://127.0.0.1:5173/play`
- State: signed-in administrator preview, light theme, two published songs, one queued track

## Viewport and normalization

- Source Home image: 1000×718 px; source queue/player image: 1200×900 px.
- Implementation captures: 1280×720 px at a 1280×720 CSS viewport and 1× browser density.
- The references are inspirational desktop compositions rather than pixel-identical OTW
  shell mocks. The comparison therefore normalizes by visible region and judges hierarchy,
  chrome alignment, queue placement, card interaction affordance and current-track expansion.

## Full-view comparison evidence

- The implementation keeps the reference hierarchy of persistent left navigation, large
  central featured card, right play queue and bottom playback controls while preserving the
  existing OTW shell and live catalog imagery.
- The Play header measures exactly 64px and aligns with the left menu's 64px top row. The
  compact playback region measures exactly 56px and aligns with the left menu's 56px footer.
- The Home hero exposes previous/next arrows, two position indicators and visible supporting
  artwork. Browser interaction changed the level-one title from the first catalog song to
  `BAD HABIT` without changing the queue or starting playback.
- The expanded capture preserves the 56px compact bar and opens an information surface above
  it containing the live thumbnail, classification, participants, channel, source status,
  duration and exact detail link. It does not add a second YouTube iframe.

## Focused region comparison evidence

- Header/footer alignment was checked as a focused geometry surface because one-pixel chrome
  drift is not reliably judged from the full screenshot alone: header 64px = sidebar top 64px;
  playback bar 56px = sidebar footer 56px.
- The compact and expanded bottom regions were captured separately so the toggle affordance,
  metadata density and persistent playback controls remained readable during comparison.
- The Home hero was switched with its visible mouse control and the resulting `BAD HABIT`
  heading was read back from the rendered page.

## Required fidelity surfaces

- Fonts and typography: the existing application font and semantic hierarchy remain
  authoritative; the hero title, compact track title and small metadata retain distinct
  optical weights and truncate or wrap within their assigned regions.
- Spacing and layout rhythm: the 64px/56px chrome baselines are exact, the 360px queue rail is
  stable, and the expanded details use a bounded three-column desktop grid without hiding the
  compact controls.
- Colors and tokens: existing background, card, border, foreground and muted tokens are reused;
  selected carousel and expand controls retain visible contrast in the light theme.
- Image quality and asset fidelity: all artwork is the actual catalog thumbnail with preserved
  aspect ratio and object-fit cropping; no placeholder illustration, emoji or reconstructed
  source artwork was introduced.
- Copy and content: Korean navigation and control labels are action-specific, the expanded
  content uses public catalog metadata, and technical IDs/raw enums are not shown.

## Findings

- No actionable P0, P1 or P2 visual difference remains for the requested refinement.
- P3 follow-up: the expanded current-track surface intentionally prioritizes metadata over
  preserving the full Home hero above the fold at 720px height. A later motion/polish pass may
  add a short height transition, but it is not required for the requested behavior.

## Comparison history

1. Earlier implementation used a content-height Play header and an 80px playback bar. The
   bottom chrome did not align with the left sidebar footer, and the featured card had no
   explicit manual carousel controls.
2. The implementation changed to a 64px Play header, 56px compact bar, manual carousel controls
   and a current-track detail toggle.
3. Post-fix browser evidence at 1280×720 confirmed exact chrome heights, successful card
   switching, complete expanded metadata, and no application console errors. The only console
   messages were the expected Clerk development-key warning.

## Primary interactions tested

- Click `다음 추천곡` and verify the featured title changes to `BAD HABIT`.
- Open `재생 상세 펼치기`, verify current title, participants, channel, source status, duration
  and detail link, then retain the compact playback bar.
- Verify header/playback geometry against the left navigation reference rows.
- Check browser warning/error logs after the interactions.

## Implementation checklist

- [x] 64px Play header aligned to the left menu top row
- [x] 56px compact playback bar aligned to the left menu footer
- [x] Mouse, pointer, wheel and keyboard featured-card switching
- [x] Accessible previous/next, indicators and carousel labeling
- [x] Expand/collapse current-track details without another iframe
- [x] Focused unit tests and browser-rendered interaction evidence

final result: passed
