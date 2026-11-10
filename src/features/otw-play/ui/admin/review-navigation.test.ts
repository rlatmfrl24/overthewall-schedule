import { expect, it } from "vitest";
import { preservesPlayReview } from "./review-navigation";
import { validateConsoleSearch, normalizePlayAdminSearch } from "@/shared/lib/admin-console-search";

it("preserves review drafts while the catalog manager stays mounted", () => {
  const current = { pathname: "/admin/otw-play", search: { tab: "import", view: "review" } };
  expect(preservesPlayReview({ current, next: { ...current, search: { tab: "operations", view: "channel-edit", from: "play-review", channel: "UC123" } } })).toBe(true);
  expect(preservesPlayReview({ current, next: { ...current, search: { tab: "import", view: "inbox" } } })).toBe(true);
  for (const tab of ["channels", "catalog", "operations"]) expect(preservesPlayReview({ current, next: { ...current, search: { tab } } })).toBe(true);
  expect(preservesPlayReview({ current, next: { ...current, search: { tab: "playlists" } } })).toBe(false);
  expect(preservesPlayReview({ current, next: { pathname: "/admin/content", search: { tab: "import" } } })).toBe(false);
  const card = { ...current, search: { ...current.search, category: "job-1", selected: "candidate-1" } };
  expect(preservesPlayReview({ current: card, next: { ...card, search: { ...card.search, tab: "operations", from: "play-review" } } })).toBe(true);
  expect(preservesPlayReview({ current: card, next: { ...card, search: { tab: "import" } } })).toBe(false);
});

it("retains channel and return context in validated admin URLs", () => {
  expect(validateConsoleSearch({ tab: "operations", view: "channel-edit", channel: "UC123", channelKind: "singing_clip", from: "play-review", category: "job-1", selected: "youtube:video" })).toMatchObject({ channel: "UC123", channelKind: "singing_clip", category: "job-1", selected: "youtube:video" });
  expect(validateConsoleSearch({ channelKind: "invalid" }).channelKind).toBeUndefined();
});

it("redirects request bookmarks to the proposal tab and automatic bookmarks to import", () => {
  expect(normalizePlayAdminSearch({ tab: "requests" })).toMatchObject({ tab: "review", source: undefined });
  expect(normalizePlayAdminSearch({ tab: "requests", selected: "p1", kind: "broadcast" })).toMatchObject({ tab: "review", source: undefined, view: "proposal", proposal: "p1", kind: "broadcast", selected: undefined });
  expect(normalizePlayAdminSearch({ tab: "import", source: "user", proposal: "p2" })).toMatchObject({ tab: "review", proposal: "p2" });
  expect(normalizePlayAdminSearch({ tab: "automatic-review", selected: "c1" })).toMatchObject({ tab: "import", selected: undefined });
  const current = { tab: "import", source: "playlist", category: "job1", selected: "c1" };
  expect(normalizePlayAdminSearch(current)).toBe(current);
});

it("retargets old channel bookmarks to operations and preserves the editor target", () => {
  expect(normalizePlayAdminSearch({ tab: "channels", q: "이전 검색" })).toMatchObject({ tab: "operations", q: undefined, view: "channels" });
  expect(normalizePlayAdminSearch({ tab: "channels", channel: "UCtarget", from: "play-review" }))
    .toMatchObject({ tab: "operations", view: "channel-edit", channel: "UCtarget", from: "play-review" });
  expect(normalizePlayAdminSearch({ tab: "play-monitor", category: "monitor-id" }))
    .toMatchObject({ tab: "operations", view: "channel-monitor", category: "monitor-id" });
});

it("opens former catalog people and groups bookmarks in operations", () => {
  expect(normalizePlayAdminSearch({ tab: "catalog", view: "entities" })).toEqual({ tab: "operations", view: "entities" });
  expect(normalizePlayAdminSearch({ view: "entities" })).toEqual({ tab: "operations", view: "entities" });
  const canonical = { tab: "operations", view: "entities" };
  expect(normalizePlayAdminSearch(canonical)).toBe(canonical);
});
