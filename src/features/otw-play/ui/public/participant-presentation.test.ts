import { describe, expect, it } from "vitest";
import type { OtwPlayPublicParticipantDto } from "@contracts/otw-play";
import {
  groupOtwPlayParticipantCredits,
  presentOtwPlayParticipants,
} from "./participant-presentation";

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
  it("promotes only main vocalists in compact presentation", () => {
    const participants = [
      participant("chorus", "코러스", "chorus", 0),
      participant("lead", "메인", "vocal", 1),
      participant("featured", "서브", "featured_vocal", 2),
    ];
    const result = presentOtwPlayParticipants(participants);

    expect(result.primary.map(({ displayName }) => displayName)).toEqual(["메인"]);
    expect(groupOtwPlayParticipantCredits(participants).map(({ label, participants: credits }) => ({
      label,
      names: credits.map(({ displayName }) => displayName),
    }))).toEqual([
      { label: "메인 보컬", names: ["메인"] },
      { label: "피처링 보컬", names: ["서브"] },
      { label: "코러스", names: ["코러스"] },
    ]);
  });

  it("keeps one deterministic visible participant when legacy data has no main vocal", () => {
    const result = presentOtwPlayParticipants([
      participant("later", "두 번째", "chorus", 2),
      participant("first", "첫 번째", "featured_vocal", 0),
    ]);

    expect(result.primaryNames).toBe("첫 번째");
  });
});
