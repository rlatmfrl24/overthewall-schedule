import { describe, expect, it } from "vitest";
import {
  selectPublicPlaybackSource,
  type PublicSourceCandidate,
} from "./public-source-selection";

const source = (
  overrides: Partial<PublicSourceCandidate>,
): PublicSourceCandidate => ({
  id: "source-default",
  priority: 0,
  isPrimary: false,
  channelApproved: true,
  channelActive: true,
  channelRole: "otw_official",
  sourceRole: "official",
  availabilityStatus: "playable",
  ...overrides,
});

describe("OTW Play public source selection", () => {
  it("uses the stored playable primary without recomputing channel-role rank", () => {
    const primary = source({ id: "primary", priority: 20, isPrimary: true });
    const earlier = source({ id: "earlier", priority: 0 });

    expect(selectPublicPlaybackSource([earlier, primary])).toMatchObject({
      primarySource: primary,
      playbackSource: primary,
      playable: true,
      fallbackReason: null,
    });
  });

  it("reports an explicit fallback when the primary is unavailable", () => {
    const selection = selectPublicPlaybackSource([
      source({
        id: "primary",
        priority: 0,
        isPrimary: true,
        availabilityStatus: "embed_disabled",
      }),
      source({ id: "fallback-z", priority: 2 }),
      source({ id: "fallback-a", priority: 1 }),
    ]);

    expect(selection.primarySource?.id).toBe("primary");
    expect(selection.playbackSource?.id).toBe("fallback-a");
    expect(selection).toMatchObject({
      playable: true,
      fallbackReason: "primary_unplayable",
    });
  });

  it("reports a missing primary instead of silently treating fallback as primary", () => {
    const selection = selectPublicPlaybackSource([
      source({ id: "source-b", priority: 1 }),
      source({ id: "source-a", priority: 1 }),
    ]);

    expect(selection.primarySource).toBeNull();
    expect(selection.playbackSource?.id).toBe("source-a");
    expect(selection.fallbackReason).toBe("missing_primary");
  });

  it.each([
    "unknown",
    "private",
    "embed_disabled",
    "deleted",
    "region_blocked",
    "unavailable",
  ] as const)("does not mark %s as playable", (availabilityStatus) => {
    const selection = selectPublicPlaybackSource([
      source({ isPrimary: true, availabilityStatus }),
    ]);
    expect(selection.playable).toBe(false);
    expect(selection.playbackSource).toBeNull();
    expect(selection.fallbackReason).toBe("primary_unplayable");
  });

  it("excludes sources on unapproved or inactive channels and leaves input unchanged", () => {
    const candidates = [
      source({ id: "pending", isPrimary: true, channelApproved: false }),
      source({ id: "inactive", channelActive: false }),
      source({ id: "visible", priority: 3 }),
    ];
    const snapshot = [...candidates];
    const selection = selectPublicPlaybackSource(candidates);

    expect(selection.sources.map(({ id }) => id)).toEqual(["visible"]);
    expect(selection.playbackSource?.id).toBe("visible");
    expect(selection.fallbackReason).toBe("missing_primary");
    expect(candidates).toEqual(snapshot);
  });

  it.each([
    { channelRole: "approved_kirinuki" as const },
    { channelRole: "other" as const },
    { sourceRole: "kirinuki" as const },
    { sourceRole: "broadcast_original" as const },
  ])("excludes non-public source and channel roles: $channelRole$sourceRole", (hidden) => {
    const visible = source({ id: "visible", isPrimary: true });
    const selection = selectPublicPlaybackSource([
      source({ id: "hidden", ...hidden }),
      visible,
    ]);

    expect(selection.sources).toEqual([visible]);
    expect(selection.primarySource).toBe(visible);
    expect(selection.playbackSource).toBe(visible);
  });

  it.each([
    "otw_official",
    "unit_official",
    "member_music",
    "member_main",
    "project_official",
  ] as const)("allows approved, active %s channels", (channelRole) => {
    const candidate = source({ channelRole, isPrimary: true });
    expect(selectPublicPlaybackSource([candidate]).playbackSource).toBe(
      candidate,
    );
  });
});
