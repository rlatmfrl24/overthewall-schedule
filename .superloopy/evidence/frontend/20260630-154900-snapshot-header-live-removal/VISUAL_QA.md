# Snapshot Header And Live Indicator Removal Visual QA

## Scope

- Page: `/snapshot`
- Date: `2026-05-29`
- Modes: `grid`, `timeline`
- Themes: `light`, `dark`
- Request: remove lower header chips and live-related indicators, while keeping the date visible.

## Browser Evidence

Captured with a temporary frontend-only Vite server on `127.0.0.1:5317` and Chrome DevTools Protocol.

| Surface | Screenshot |
| --- | --- |
| Grid, light | `after-grid-light.png` |
| Grid, dark | `after-grid-dark.png` |
| Timeline, light | `after-timeline-light.png` |
| Timeline, dark | `after-timeline-dark.png` |

Machine assertions are in `browser-assertions.json`.

## Checks

- Header contains `2026년 5월 29일`.
- Header no longer contains member, schedule count, empty count, or LIVE chips.
- Date remains visible as plain header text, not as a chip.
- Snapshot body contains no `LIVE`, `방송 중`, `현재 방송 중입니다`, or `미등록 LIVE` text.
- Snapshot route made zero real `/api/live-status` requests.
- Light and dark screenshots show no obvious clipping, overlap, or broken images.
- Existing fixed-width snapshot behavior is preserved for grid and timeline export sizes.

## Commands

```powershell
pnpm vitest run src/features/daily/snapshot/snapshot-output.test.ts
node .superloopy/evidence/frontend/20260630-154900-snapshot-header-live-removal/capture-snapshot-visual.mjs
pnpm lint
pnpm exec tsc -b
pnpm build
```
