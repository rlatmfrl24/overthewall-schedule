import type { OtwPlayPublicParticipantDto } from "@contracts/otw-play";

export const otwPlayParticipantRoleLabel = {
  vocal: "메인 보컬",
  featured_vocal: "피처링 보컬",
  chorus: "코러스",
  other: "기타 참여",
} as const;

export const otwPlayParticipantRoleOrder = [
  "vocal",
  "featured_vocal",
  "chorus",
  "other",
] as const;

export function groupOtwPlayParticipantCredits(
  participants: OtwPlayPublicParticipantDto[],
) {
  const ordered = [...participants].sort(
    (left, right) => left.creditOrder - right.creditOrder,
  );
  return otwPlayParticipantRoleOrder.flatMap((role) => {
    const roleParticipants = ordered.filter(
      (participant) => participant.role === role,
    );
    return roleParticipants.length > 0
      ? [{ role, label: otwPlayParticipantRoleLabel[role], participants: roleParticipants }]
      : [];
  });
}

export function presentOtwPlayParticipants(
  participants: OtwPlayPublicParticipantDto[],
) {
  const ordered = [...participants].sort(
    (left, right) => left.creditOrder - right.creditOrder,
  );
  const mainVocalists = ordered.filter(({ role }) => role === "vocal");
  const primary = mainVocalists.length > 0 ? mainVocalists : ordered.slice(0, 1);
  return {
    primary,
    primaryNames: primary.map(({ displayName }) => displayName).join(", "),
  };
}
