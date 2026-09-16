import { describe, expect, it } from "vitest";
import { preservesRegistrationVisit, type RegistrationChannelVisit } from "./registration-channel";

describe("preserved registration navigation", () => {
  const visit: RegistrationChannelVisit = {
    target: { externalChannelId: "UCtarget", displayName: "Target", kind: "singing_clip", role: "approved_kirinuki" },
    returnSearch: { tab: "catalog", kind: "broadcast", q: "검색", state: "draft" },
  };
  const registration = { pathname: "/admin/otw-play", search: visit.returnSearch };
  const channel = { pathname: registration.pathname, search: { tab: "channels", view: "channel-edit", from: "play-registration", channel: "UCtarget" } };
  const preserves = preservesRegistrationVisit(visit);
  it("preserves both history directions only for the target channel and original search", () => {
    expect(preserves({ current: registration, next: channel })).toBe(true);
    expect(preserves({ current: channel, next: registration })).toBe(true);
    expect(preserves({ current: registration, next: { ...channel, search: { ...channel.search, channel: "other" } } })).toBe(false);
    expect(preserves({ current: channel, next: { ...registration, search: { ...visit.returnSearch, q: "changed" } } })).toBe(false);
    expect(preserves({ current: channel, next: { ...registration, pathname: "/admin/content" } })).toBe(false);
  });
});
