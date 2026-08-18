# OTW Play Discover layout design QA

## Evidence

- Source visual truth: `C:\Users\rlatm\Downloads\e6b8550a2ad761244b0a97620791dce2.jpg`
- Source pixels: 1200×900
- Final implementation capture: `C:\Users\rlatm\AppData\Local\Temp\otw-play-discovery-table-final-1440x900.png`
- Expanded player capture: `C:\Users\rlatm\AppData\Local\Temp\otw-play-player-reopened-final-1440x900.png`
- Side-by-side comparison: `C:\Users\rlatm\AppData\Local\Temp\otw-play-reference-table-comparison.png`
- Browser viewport and implementation pixels: 1440×900 CSS px / 1440×900 image px
- Density normalization: device scale factor 1; the 1200×900 framed reference and 1440×900 product viewport were compared at the same 900px height. The existing OTW sidebar and current light theme were preserved intentionally.
- State: authenticated administrator preview, published fixture catalog, one queue item; landing and expanded-player states checked.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the existing OTW sans stack remains authoritative. The reference hierarchy is reproduced with compact uppercase section labels, a large hero title, dense queue copy, and smaller metadata.
- Spacing and layout rhythm: the page now uses the same major-region composition as the source—left navigation, 64px header, one full-width hero, compact lower song table/member grid, right queue, and 64px bottom player. At 1440×900 the document has no vertical overflow; the app frame is 900/900px and the center content is 772/772px. The 514px table has matching client/scroll width and introduces no nested scrollbar.
- Colors and visual tokens: the source is dark-only, while OTW supports the existing light/dark theme. Current semantic background, border, foreground, and card tokens were retained instead of hard-coding the reference palette.
- Image quality and assets: catalog YouTube thumbnails and existing member portraits are used directly. No placeholder artwork, generated substitute, CSS art, or image overlay was introduced.
- Copy and content: the primary route is labeled `발견`; the secondary route remains `곡 검색`. The right panel is `플레이큐` and contains queue data only.

Focused comparison was required because the source does not depict the requested expanded-player state. The expanded implementation was checked separately: its single 16:9 YouTube iframe stays in the bottom overlay, is absent from the queue, retains native YouTube controls, and the metadata grid remains within the viewport.

## Comparison history

1. Initial pass
   - P1: the queue owned the iframe, contrary to the requested data-only right rail.
   - P1: the expanded player participated in flex layout and compressed the center/queue regions.
   - Fix: moved the single iframe to an absolute bottom-player overlay and reduced the right queue to a 336px data rail.
2. Interaction pass
   - P1: after collapse and re-expand, React could recreate the YouTube target and leave a black empty host.
   - Fix: introduced a stable imperative host inside a React-owned wrapper and made collapse pause without unmounting the player.
   - Post-fix evidence: first play, collapsed state, and reopened state each retained exactly one iframe; the queue retained zero iframes. Fresh-tab console errors: zero.
3. Responsive pass
   - Post-fix evidence: 768×900 and 375×812 both kept body and document scroll heights equal to their viewport heights. Overflow is contained by the center content and expanded-player panels.
4. Discovery density follow-up
   - P2: the stacked supporting hero cards and repeated recent-song cards retained a card-dashboard appearance instead of the flatter source layout.
   - Fix: removed supporting card surfaces, expanded the active hero into one banner, moved carousel controls onto the banner, and replaced recent-song cards with a compact responsive table.
   - Post-fix evidence: the side-by-side comparison shows the same hero/table/queue/bar region order as the source. At 1440×900 body, HTML, app frame and content each fit their allocated viewport; the table is 514/514px client/scroll width and the queue contains zero iframes.

## Primary interactions tested

- Featured play from `/play`
- Expand current player
- Collapse with pause
- Re-expand the same iframe
- Desktop right-queue separation
- Tablet and mobile internal scrolling

## Follow-up polish

- P3: denser production data will populate more table rows and make the lower song region visually closer to the reference; the current blank space reflects the two-song local catalog rather than a layout defect.

final result: passed
