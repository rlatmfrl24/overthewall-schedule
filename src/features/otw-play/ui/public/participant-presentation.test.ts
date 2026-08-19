import { describe, expect, it } from "vitest";
import type { OtwPlayPublicParticipantDto } from "@contracts/otw-play";
import { presentOtwPlayParticipants } from "./participant-presentation";

const participant = (
  entityId: string,
  displayName: string,
  role: OtwPlayPublicParticipantDto["role"],
  creditOrder: number,
): OtwPlayPublicParticipantDto => ({
  kind: "external",
  entityId,
  slug: entityId,
  displayName,
  role,
  creditOrder,
});

describe("presentOtwPlayParticipants", () => {
  it("promotes main vocalists and demotes supporting credits to a labeled summary", () => {
    const result = presentOtwPlayParticipants([
      participant("chorus", "코러스", "chorus", 0),
      participant("lead", "메인", "vocal", 1),
      participant("featured", "서브", "featured_vocal", 2),
    ]);

    expect(result.primary.map(({ displayName }) => displayName)).toEqual(["메인"]);
    expect(result.supporting.map(({ displayName }) => displayName)).toEqual([
      "코러스",
      "서브",
    ]);
    expect(result.supportingNames).toBe("코러스 (코러스), 서브 (서브 보컬)");
  });

  it("keeps one deterministic visible participant when legacy data has no main vocal", () => {
    const result = presentOtwPlayParticipants([
      participant("later", "두 번째", "chorus", 2),
      participant("first", "첫 번째", "featured_vocal", 0),
    ]);

    expect(result.primaryNames).toBe("첫 번째");
    expect(result.supporting).toHaveLength(1);
  });
});
