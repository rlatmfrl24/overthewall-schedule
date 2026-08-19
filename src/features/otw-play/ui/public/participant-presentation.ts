import type { OtwPlayPublicParticipantDto } from "@contracts/otw-play";

export const otwPlayParticipantRoleLabel = {
  vocal: "메인 보컬",
  featured_vocal: "서브 보컬",
  chorus: "코러스",
  other: "기타 참여",
} as const;

export function presentOtwPlayParticipants(
  participants: OtwPlayPublicParticipantDto[],
) {
  const ordered = [...participants].sort(
    (left, right) => left.creditOrder - right.creditOrder,
  );
  const mainVocalists = ordered.filter(({ role }) => role === "vocal");
  const primary = mainVocalists.length > 0 ? mainVocalists : ordered.slice(0, 1);
  const primaryIds = new Set(primary.map(({ entityId }) => entityId));
  const supporting = ordered.filter(
    ({ entityId }) => !primaryIds.has(entityId),
  );
  return {
    primary,
    supporting,
    primaryNames: primary.map(({ displayName }) => displayName).join(", "),
    supportingNames: supporting
      .map(
        ({ displayName, role }) =>
          `${displayName} (${otwPlayParticipantRoleLabel[role]})`,
      )
      .join(", "),
  };
}
