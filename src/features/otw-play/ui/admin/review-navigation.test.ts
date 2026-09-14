import { expect, it } from "vitest";
import { preservesPlayReview } from "./review-navigation";
import { validateConsoleSearch } from "@/shared/lib/admin-console-search";

it("only preserves review drafts inside the mounted review/channel workflow", () => {
  const current = { pathname: "/admin/otw-play", search: { tab: "import", view: "review" } };
  expect(preservesPlayReview({ current, next: { ...current, search: { tab: "channels", view: "channel-edit", from: "play-review", channel: "UC123" } } })).toBe(true);
  expect(preservesPlayReview({ current, next: { ...current, search: { tab: "import", view: "inbox" } } })).toBe(true);
  for (const tab of ["channels", "playlists", "catalog"]) expect(preservesPlayReview({ current, next: { ...current, search: { tab } } })).toBe(false);
  expect(preservesPlayReview({ current, next: { pathname: "/admin/content", search: { tab: "import" } } })).toBe(false);
});

it("retains channel and return context in validated admin URLs", () => {
  expect(validateConsoleSearch({ tab: "channels", view: "channel-edit", channel: "UC123", channelKind: "singing_clip", from: "play-review", category: "job-1", selected: "youtube:video" })).toMatchObject({ channel: "UC123", channelKind: "singing_clip", category: "job-1", selected: "youtube:video" });
  expect(validateConsoleSearch({ channelKind: "invalid" }).channelKind).toBeUndefined();
});
