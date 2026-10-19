import type { SiteId } from "./site-definition";

export const SCHEDULE_MEMBER_END = {
  siteId: "luvdia",
  memberCode: "bing_hayu",
  lastDate: "2026-11-15",
} as const;

export const isScheduleMemberActive = (siteId: SiteId, code: string | undefined, date: string) =>
  siteId !== SCHEDULE_MEMBER_END.siteId || code !== SCHEDULE_MEMBER_END.memberCode || date <= SCHEDULE_MEMBER_END.lastDate;
