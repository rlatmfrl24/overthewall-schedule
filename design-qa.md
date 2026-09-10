# Playlist card design QA

Reference: user-supplied codex-clipboard-e3fd8105-2bf7-436f-9942-ad8a206c5e8f.png, after panel.
Implementation: http://localhost:5173/play/playlists (existing production app, local preview).
Scope: adapt the full-bleed imagery and bold overlaid typography, retaining OTW content and navigation. The reference is a style board, not an exact viewport or content specification.

- Typography: existing Korean font, weight 900, responsive title sizes, readable member names and separate small metadata.
- Layout: edge-to-edge imagery, large collection cards, portrait member cards, bottom metadata; desktop four columns and mobile one column.
- Colors: white text over a 55% black scrim, preserving recognizable images and contrast. Existing app shell retained.
- Image quality: real member profiles and catalog thumbnails; existing OTW graphic for absent imagery. Initial P2: embedded black bars in YouTube thumbnails broke the full-bleed treatment. Fixed centered crop and scale; subsequent mobile screenshot confirms removal.
- Content: actual titles, counts and private status retained. Redundant member description replaced by concise category label.
- Interaction: cover card opens /play/playlists/defaults/cover, heading readback confirms the intended detail; back link returns to playlists.
- Responsive: 390px viewport has 390px document width; card client/scroll widths both 348px. Desktop and mobile screenshots visually inspected. Viewport reset after verification.
- Validation: changed TSX ESLint and TypeScript project check passed. No API or persistence changes.

final result: passed
