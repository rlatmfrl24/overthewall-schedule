import type { Member } from "./types";

export const SCHEDULE_STATUSES = ["방송", "휴방", "게릴라", "미정"] as const;
export const NOTICE_TYPES = ["notice", "event"] as const;
export const DDAY_TYPES = ["debut", "birthday", "event"] as const;

export const isActiveMember = (member: Member) => {
  const flag = member.is_deprecated;
  return (
    flag === undefined ||
    flag === null ||
    flag === "" ||
    flag === false ||
    flag === "false" ||
    flag === 0 ||
    flag === "0"
  );
};
