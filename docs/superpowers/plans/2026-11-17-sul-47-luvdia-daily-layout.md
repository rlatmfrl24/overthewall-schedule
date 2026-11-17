# SUL-47 LuvDia Daily Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute in the current session and perform one independent final review.

**Goal:** Apply the approved header-name, two-column daily schedule to LuvDia while preserving existing controls and flows.

**Architecture:** Add a LuvDia member-card presentation under schedule-board. Reuse CardSchedule, the board query, live query and ScheduleDialog callbacks. Select the presentation by site identity; retain OTW and snapshot consumers.

**Tech Stack:** Existing React 19, TanStack Query/Router, Tailwind/CSS, Lucide, Vitest, Node 24.

**Spec:** `docs/superpowers/specs/2026-11-17-sul-47-luvdia-daily-layout-design.md`

## Global Constraints

- Publication update: the user's later `pr-ready` request authorizes task-scoped commits, push, a normal PR and final preflight. Implementation-phase publication holds below are historical. Merge, deployment, remote DB writes and automations remain outside scope.
- No member ID filtering, new package/API/schema/auth changes, remote mutations, paid model calls or automation resumption.
- Preserve latest master schedule-add menu, snapshot exports, timeline, edit/add/delete callbacks, notices, D-days, pet and historical roster.
- Only OPEN is live; missing status is not offline; non-today dates show no current state.
- Keep Git publication/merge/deployment outside this request. Retain reviewable local changes.

## Review Focus

- A live card contains interactive schedules and links: editing must not open a broadcast.
- More than two schedules and historical three-member dates remain reachable.
- Guest/authorized schedule entry follows existing login and confirmation gates.
- Missing/offline/initial live data must not invent a broadcast state or channel URL.
- OTW, weekly and export surfaces must keep their existing behavior and rendering.

## Task 1: Implement and connect the LuvDia card

**Files:** Create `src/features/schedule-board/ui/daily/luvdia-member-card.tsx`, `luvdia-member-card.css`, `luvdia-member-card.test.tsx`; modify `daily-schedule.tsx`, `daily-schedule.test.ts` and `card-member-skeleton.tsx` if needed for the loading layout.

**Interfaces:** Consume `Member`, `ScheduleItem[]`, `ChzzkLiveStatusMap[number]`, today/loading booleans and existing `onScheduleClick(schedule)` / `onAddSchedule(memberUid)` callbacks. Expose `LuvDiaMemberCard` to DailySchedule within the same capability.

- [x] Add behavioral regressions for header identity/links, all schedules, live/background vs edit/add propagation, missing channel/status and non-today state. Run and observe the expected failure.
- [x] Implement the card using existing image, color, router, CHZZK URL and schedule-card helpers. Add scoped responsive styling matching the approved V6.
- [x] Select the LuvDia card and two-column/loading layout only for LuvDia. Add owning route integration regressions proving existing controls and OTW remain available.
- [x] Run new and existing daily, chronological, snapshot and save-feedback regression tests. Expected: all selected tests pass.

## Task 2: Verify the real app and close the implementation

**Files:** Update `Design.md`, `docs/current-work.md`, the plan/spec and `design-qa.md` with actual scoped evidence. Save local captures under ignored `output/sul-47/`.

**Interfaces:** Use the actual local Worker-backed `/` and existing UI. Use isolated local data and preserve normal authorization/confirmation. Do not substitute a demo route or mocked API for runtime verification.

- [x] Run app/test types, changed-file lint, architecture check and both site builds on Node 24. Expected: success; no full preflight unless release preparation becomes authorized.
- [x] Compare actual LuvDia app against the approved capture at matching viewport/state where practical, classify real-data differences, and verify desktop/mobile/dark/keyboard plus existing daily controls, schedule editing/login gate and image export.
- [x] Review the scoped diff independently once, fix material findings with a reproducing regression, and rerun affected checks.
- [x] Record actual reachable flow, authoritative local readback where a mutation is exercised, remaining limits and the distinction between local implementation and production deployment.

## Execution decisions

The user explicitly approved the final design and requested implementation in this session. Continue directly; do not introduce another plan-approval pause. A managed worktree starts from master `d7a15a08`, excluding unrelated root branch history. New implementation changes remain uncommitted for review.

## Completed evidence

- Functional RED: three new owning-route tests failed before integration. GREEN: nine affected files /78 tests; `.affected-sul47.log`. The added component's six cases and the route cases cover links, status, editing propagation, every schedule and loading. Existing chronological/snapshot/dialog/save consumers remain passing.
- App types and changed-file lint/architecture passed. Final `pnpm typecheck:test` covers tests/Worker/Node. Final `pnpm build:luvdia` and `pnpm build` passed with verified manifests after both CSS refinements. Logs are ignored task artifacts, not release proof.
- Real local entry point: `http://localhost:5184/`, ordinary Worker/D1 app. Isolated local DB uses public metadata and12 representative schedules. No mocks, auth bypass or production mutation. Existing edit saved schedule #3 with identical content; authoritative D1 readback confirms its fields, one update log and total12 rows. Image download was opened; mapped real LIVE destination reached CHZZK's normal login/age gate.
- Actual browser exercised1440/940 desktop,390/320 mobile and768 dark, historical roster, dates, timeline, profile, member-add/edit, guest image-add gate and snapshot download. Independent reviewer found no concrete defect and deferred real-flow/mobile judgment; parent checked those surfaces and fixed the confirmed badge clipping.
- Combined final source/rendered full/card comparison passed after avatar baseline and badge fixes. See root `design-qa.md` for exact dimensions, artifact identities, five fidelity surfaces, deviations and remaining limits. Existing schedule-entry QA history is preserved in that file.
- No full preflight, remote writes, publication, commit, merge or deployment. No physical-device/authenticated/admin/delete/clipboard-copy verification; OTW has test/build coverage rather than a new browser session. Current browser runtime remains available for local review.

## Follow-up feedback — completed

Restored the viewer-count width/opacity/transform transition, removed the CLOSE label per the new explicit request, and fixed the closing dialog's edit→add morph at its shared owner. The parent may clear the selected schedule during exit; the dialog now retains its presentation mode until the next open. Daily and weekly callers were traced and both real closing flows checked.

Two changed behavioral checks failed before the fix. Affected card/daily/dialog tests48 and weekly/save-feedback/snapshot consumer tests21 passed, total69 across8 files. App/test/Worker/Node types, changed-file lint and both final site builds/manifests passed. Real daily Escape and weekly Cancel retained576×606px layout through `data-state=closed`; the following member-add opened correctly. Local browser also confirmed no offline label, a live viewer opacity0.849 intermediate value with200ms transition, and an expanded mobile badge inside its card. No save/delete, production mutation, publication or full preflight. Details and captures are recorded in the root QA report.
