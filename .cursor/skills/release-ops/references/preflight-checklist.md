# Release Preflight Checklist

## Local release gate

Use `pnpm preflight`. The authoritative sequence is
[scripts/preflight.mjs](../../../../scripts/preflight.mjs):

1. `pnpm architecture:check`
2. `pnpm typecheck:test`
3. `pnpm lint`
4. `pnpm test` (unit and Worker integration assertions together, once)
5. `pnpm build`
6. `pnpm d1:doctor` (local D1)
7. `pnpm sync:agent-cursor:check`

Coverage is an optional diagnostic, not a percentage release gate.
Do not repeat the same tests unless a new change, failure, or unresolved concern
justifies it. For agent-only maintenance that is not a release, validate the
changed scripts, references, and generated files instead of invoking app-wide
or production checks solely because this checklist exists.

## Agent synchronization

`.agent` is canonical; `.cursor` mirrors and `.agents/skills` discovery entries
are generated. Run `pnpm sync:agent-cursor` after canonical changes, then check.
Drift, missing managed sources/entries, or broken local Markdown links must fail
the synchronization check; byte-identical copies alone are insufficient.

## Schema and deployment

Complete local migration validation first. For an authorized production release,
verify target account/D1, recovery plan, and compatibility with deployed code;
apply and read back migrations before schema-dependent deployment.

Use the authorized deployment route: merge-triggered build or manual `pnpm deploy`.
Track the intended commit/artifact through completion and verify production
readback. Do not equate a merged PR, green build, or HTTP 200 with the requested
operation having occurred.

## Changed-flow verification

Choose representative flows based on the diff rather than always visiting a
fixed list of routes:

- Schedule: normal create/edit control, visible saved result, server readback;
  include downloaded image inspection when snapshot behavior changes.
- Play: administrator review/registration and shared song identity reuse;
  publication/public lookup/playback when those contracts change.
- Operations: normal manual or scheduled entry point, item results, pending
  retries, and terminal outcome; preserve real partial failures and distinguish
  guard suppression from an ordinary skipped run.
- Feeds: source ingestion when authorized, persisted records, public pagination,
  cache behavior, and source visibility.

Prefer existing read-only cost/usage ledgers for observation. Do not add writes
or trigger external jobs just to display status. If an intentional production
pause prevents an ingestion canary, report that exact limit and continue other
independent verification.

## Evidence

Report the relevant reviewed/deployed identity, checks actually run, observable
result and authoritative readback, and remaining limitations. Material PR
evidence is recorded independently of PASS/FAIL or merge readiness when GitHub
writes are authorized. Extension packaging is outside this repository's scope.
