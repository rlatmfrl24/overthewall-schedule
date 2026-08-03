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
- **Multiview**: temporary Mul.Live embed surface with top member chips for
  quick CHZZK channel selection.
- **Profile and snapshot routes**: chrome-free profile pages and stable image
  capture surfaces for schedule sharing.
- **Admin**: notices, schedules, content source settings, auto-update review,
  and operational logs.

## Documentation

- `Design.md`: current UI patterns, tone, layout, accessibility, and component
  guidance.
- `docs/architecture.md`: current capability ownership, dependency rules, and
  architecture verification gates.
- `docs/README.md`: documentation index and archive policy.
- `AGENTS.md`: agent rules, canonical `.agent` source policy, and available
  project skills.

## Development

Use `pnpm` for project commands.

```bash
pnpm dev
pnpm architecture:check
pnpm typecheck:test
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm preflight
```

The local development server listens on `http://127.0.0.1:4173` by default.

Local development defaults to local D1. Remote D1 is used only by explicit
release or deploy commands.

```bash
pnpm drizzle:migrate:local
pnpm d1:reset:local -- --validate-only
pnpm d1:reset:local
pnpm d1:seed:local
pnpm d1:doctor
```

`pnpm d1:reset:local -- --validate-only`는 임시 D1에서 모든 numbered
migration SQL을 실제 적용·검증하며 현재 로컬 DB를 교체하지 않습니다.
`pnpm d1:reset:local`은 같은 검증을 통과한 임시 DB만 로컬 DB로 교체합니다.

`pnpm d1:seed:local`은 fixture 전용 명령이며 비강제 실행은 삭제 대상
테이블이 모두 비어 있을 때만 허용됩니다. fixture 환경이 필요할 때는 기존
로컬 데이터 삭제가 의도된 경우에만 `pnpm d1:reset:local`로 빈 스키마를
만든 뒤 실행합니다. 기존 데이터를 의도적으로 fixture로 교체하는 경우에만
`pnpm d1:seed:local -- --force`를 사용합니다.

Run release or migration preflight checks in one command:

```bash
pnpm preflight
```

Apply remote migrations only after local validation:

```bash
pnpm drizzle:migrate:remote
```

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
