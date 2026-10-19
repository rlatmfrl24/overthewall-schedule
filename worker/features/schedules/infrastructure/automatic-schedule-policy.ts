import type { SiteId } from "@contracts/site-definition";
import { SCHEDULE_MEMBER_END } from "@contracts/schedule-member-policy";

export const automaticScheduleAllowedSql = (siteId: SiteId, memberUidSql: string, dateSql: string) =>
  siteId !== SCHEDULE_MEMBER_END.siteId ? "1" :
    `NOT (${dateSql} > '${SCHEDULE_MEMBER_END.lastDate}' AND ${memberUidSql} IN
      (SELECT uid FROM members WHERE code = '${SCHEDULE_MEMBER_END.memberCode}'))`;

export const readScheduleEndMemberUids = async (db: D1Database, siteId: SiteId): Promise<Set<number>> => {
  if (siteId !== SCHEDULE_MEMBER_END.siteId) return new Set();
  const { results } = await db.prepare("SELECT uid FROM members WHERE code = ?").bind(SCHEDULE_MEMBER_END.memberCode).all<{ uid: number }>();
  return new Set(results.map(member => member.uid));
};

export const allowsAutomaticSchedule = async (db: D1Database, siteId: SiteId, uid: number, date: string) =>
  siteId !== SCHEDULE_MEMBER_END.siteId || date <= SCHEDULE_MEMBER_END.lastDate ||
  !(await readScheduleEndMemberUids(db, siteId)).has(uid);
