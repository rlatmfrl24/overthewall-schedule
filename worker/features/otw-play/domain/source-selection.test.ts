import { describe, expect, it } from "vitest";
import {
  selectPreferredOfficialSource,
  type OfficialSourceCandidate,
} from "./source-selection";

const source = (
  overrides: Partial<OfficialSourceCandidate>,
): OfficialSourceCandidate => ({
  id: "source-default",
  channelRole: "member_main",
  channelApproved: true,
  channelActive: true,
  availabilityStatus: "playable",
  ...overrides,
});

describe("OTW Play official source selection", () => {
  it.each([
    ["otw_official", "member_music"],
    ["unit_official", "member_music"],
    ["member_music", "member_main"],
    ["member_main", "project_official"],
  ] as const)(
    "ranks %s ahead of %s",
    (preferredRole, lowerRole) => {
      expect(
        selectPreferredOfficialSource([
          source({ id: "source-z", channelRole: preferredRole }),
          source({ id: "source-a", channelRole: lowerRole }),
        ])?.channelRole,
      ).toBe(preferredRole);
    },
  );

  it("applies the official channel role priority", () => {
    const candidates = [
      source({ id: "project", channelRole: "project_official" }),
      source({ id: "main", channelRole: "member_main" }),
      source({ id: "music", channelRole: "member_music" }),
      source({ id: "unit-z", channelRole: "unit_official" }),
      source({ id: "otw-a", channelRole: "otw_official" }),
    ];

    expect(selectPreferredOfficialSource(candidates)?.id).toBe("otw-a");
  });

  it("skips non-playable sources before applying role priority", () => {
    expect(
      selectPreferredOfficialSource([
        source({
          id: "otw-private",
          channelRole: "otw_official",
          availabilityStatus: "private",
        }),
        source({ id: "music-playable", channelRole: "member_music" }),
      ])?.id,
    ).toBe("music-playable");
  });

  it.each([
    "unknown",
    "private",
    "embed_disabled",
    "deleted",
    "region_blocked",
    "unavailable",
  ] as const)("does not select a %s source", (availabilityStatus) => {
    expect(
      selectPreferredOfficialSource([source({ availabilityStatus })]),
    ).toBeNull();
  });

  it("requires an approved and active channel before ranking", () => {
    expect(
      selectPreferredOfficialSource([
        source({
          id: "otw-pending",
          channelRole: "otw_official",
          channelApproved: false,
        }),
        source({
          id: "unit-inactive",
          channelRole: "unit_official",
          channelActive: false,
        }),
        source({ id: "music-playable", channelRole: "member_music" }),
      ])?.id,
    ).toBe("music-playable");

    expect(
      selectPreferredOfficialSource([
        source({ channelApproved: false }),
        source({ channelActive: false }),
      ]),
    ).toBeNull();
  });

  it("uses configured priority and then stable ID ordering for ties", () => {
    expect(
      selectPreferredOfficialSource([
        source({ id: "source-a", channelRole: "member_music", priority: 2 }),
        source({ id: "source-z", channelRole: "member_music", priority: 1 }),
      ])?.id,
    ).toBe("source-z");

    expect(
      selectPreferredOfficialSource([
        source({ id: "source-b", channelRole: "member_main", priority: 1 }),
        source({ id: "source-a", channelRole: "member_main", priority: 1 }),
      ])?.id,
    ).toBe("source-a");
  });

  it("does not select future or non-official roles", () => {
    expect(
      selectPreferredOfficialSource([
        source({ id: "kirinuki", channelRole: "approved_kirinuki" }),
        source({ id: "other", channelRole: "other" }),
      ]),
    ).toBeNull();
  });

  it("returns null when no source is playable and leaves input unchanged", () => {
    const candidates = [
      source({ id: "source-b", availabilityStatus: "deleted" }),
      source({ id: "source-a", availabilityStatus: "embed_disabled" }),
    ];
    const snapshot = [...candidates];

    expect(selectPreferredOfficialSource(candidates)).toBeNull();
    expect(candidates).toEqual(snapshot);
  });
});
