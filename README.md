# OverTheWall Schedule

OverTheWall Schedule is a fan-operated schedule hub for the Over The Wall
creator group. It focuses on fast schedule scanning, live status awareness,
content discovery, and lightweight admin workflows.

## Active Surfaces

- **Public app shell**: responsive sidebar navigation, mobile sheet menu,
  account/theme controls, and compact site footer.
- **Daily schedule**: member cards with readable schedule states, integrated
  live indicators, image export, and profile links.
- **Weekly schedule**: dense weekly grid with sticky headers and schedule items
  optimized for contrast and scannability.
- **Notices and events**: date-windowed notices plus always-on notices when no
  display period is configured.
- **VOD and clips**: YouTube, CHZZK VOD, and clip browsing with shared content
  headers and media cards.
- **Member posts**: X and Naver Cafe post feeds with member-aware filtering and
  shared content page spacing.
- **OTW Multiview**: member/source selection, shareable multiview state, and an
  optional OTW Schedule + extension bridge for CHZZK iframe helpers.
- **Profile and snapshot routes**: chrome-free profile pages and stable image
  capture surfaces for schedule sharing.
- **Admin**: notices, schedules, content source settings, auto-update review,
  and operational logs.

## Documentation

- `Design.md`: current UI patterns, tone, layout, accessibility, and component
  guidance.
- `docs/README.md`: documentation index and archive policy.
- `AGENTS.md`: agent rules, canonical `.agent` source policy, and available
  project skills.
- `docs/otw-schedule-plus-extension.md`: extension behavior and install notes.
- `docs/otw-schedule-plus-deployment-guide.md`: Chrome Web Store release
  runbook.

## Development

Use `pnpm` for project commands.

```bash
pnpm dev
pnpm lint
pnpm test
pnpm build
```

Local development defaults to local D1. Remote D1 is used only by explicit
release or deploy commands.

```bash
pnpm drizzle:migrate:local
pnpm d1:reset:local
pnpm d1:seed:local
pnpm d1:doctor
```

Apply remote migrations only after local validation:

```bash
pnpm drizzle:migrate:remote
```

## OTW Schedule +

The Chrome extension lives under `extensions/otw-schedule-plus`.

```bash
pnpm extension:build:dev
pnpm extension:build:store
pnpm extension:validate
pnpm extension:zip
```

The current Store release scope is `/multiview` support: CHZZK player layout
helpers and optional chat login bridging. Update the extension docs whenever
permissions, user disclosures, package behavior, or Store form values change.

## Profile Background Images

Profile background images use R2 as the source of truth. Do not store final
background assets under `public/profile-background`.

- Put temporary originals in `r2/profile-background/*.webp`.
- Run `pnpm images:profile-backgrounds` to generate responsive WebP variants.
- Run `pnpm r2:upload-profile-backgrounds` to upload to the `otw-schedule` R2
  bucket under `members/{code}/backgrounds/{backgroundId}/{variant}.webp`.
- The profile route falls back to the member profile image if R2 loading fails.

## Roadmap Notes

- Music catalog/player work should start from the archived MVP analysis in
  `docs/archive/` and must respect YouTube embed and rights constraints.
- Future social/content integrations should reuse the shared content page shell
  and member post/feed card patterns.
- New release or migration workflows should update `.agent` first, then mirror
  with `pnpm sync:agent-cursor`.
