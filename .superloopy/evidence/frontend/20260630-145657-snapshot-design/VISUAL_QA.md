# Snapshot Page Design Visual QA

## Scope

- Surface: `/snapshot`
- Date fixture: `2026-06-30`
- Modes: `grid`, `timeline`
- Themes: `light`, `dark`
- Design read: fixed-width share snapshot for schedule viewers; dense, high-contrast, scan-first UI.

## References Loaded

- Superloopy frontend anti-slop rules.
- Superloopy design-system guidance.
- OTW `Design.md`.

## Changes Verified

- Timeline snapshot header uses compact padding, title sizing, and stat pills so the 520px output no longer wastes vertical space.
- Grid member cards keep avatar/name identity inside the member color band instead of floating across the card body.
- Grid cards retain schedule/title readability and live/unit badges.
- Light and dark themes preserve contrast for headers, stat pills, card bodies, and empty states.

## Browser Evidence

Before screenshots:

- `before-grid-light.png`
- `before-grid-dark.png`
- `before-timeline-light.png`
- `before-timeline-dark.png`

After screenshots:

- `after-grid-light.png`
- `after-grid-dark.png`
- `after-timeline-light.png`
- `after-timeline-dark.png`

Capture method:

- Real headless Chrome via CDP.
- Frontend-only Vite server on `127.0.0.1:5317` to avoid Worker dependency during visual capture.
- CDP fulfilled `/api/schedule-board` and `/api/live-status` with the 2026-06-30 fixture.
- All four after captures reached `data-snapshot-ready="true"`.
- Captured layouts:
  - Grid: `1320px` viewport, snapshot root height `1004px`.
  - Timeline: `600px` viewport, snapshot root width `544px`, height `772px`.

## Anti-Slop Check

- Zero visible em dashes/en dashes found in `src/features/daily/snapshot`.
- No banned AI copy terms found in `src/features/daily/snapshot`.
- Existing app font stack and OTW semantic/member colors were preserved.
- No fake screenshots or invented decorative assets were introduced.
- Shape/theme/color locks hold across the snapshot surface.

## Commands

- `pnpm vitest run src/features/daily/snapshot/snapshot-output.test.ts`: passed, 8 tests.
- `pnpm lint`: passed.
- `pnpm exec tsc -b`: passed.
- `pnpm build`: passed after removing generated Chrome profile directories from the evidence folder.

## Notes

The first browser automation attempts wrote Chrome profile data under `.superloopy/evidence`, which caused Vite/Tailwind to hang while scanning. Those generated profile directories were removed, and the successful CDP pass used the OS temp directory for Chrome profile data.
