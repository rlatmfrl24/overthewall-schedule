import type { SiteId } from "@contracts/site-definition";
import { SCHEDULE_MEMBER_END } from "@contracts/schedule-member-policy";

export const automaticScheduleAllowedSql = (siteId: SiteId, memberUidSql: string, dateSql: string) =>
  siteId !== SCHEDULE_MEMBER_END.siteId ? "1" :
    `NOT (${dateSql} > '${SCHEDULE_MEMBER_END.lastDate}' AND ${memberUidSql} IN
      (SELECT uid FROM members WHERE code = '${SCHEDULE_MEMBER_END.memberCode}'))`;

export const readScheduleEndMemberUid = (db: D1Database, siteId: SiteId): Promise<number | null> =>
  siteId === SCHEDULE_MEMBER_END.siteId
    ? db.prepare("SELECT uid FROM members WHERE code = ? LIMIT 1").bind(SCHEDULE_MEMBER_END.memberCode).first<number>("uid")
    : Promise.resolve(null);

export const allowsAutomaticSchedule = async (db: D1Database, siteId: SiteId, uid: number, date: string) =>
  siteId !== SCHEDULE_MEMBER_END.siteId || date <= SCHEDULE_MEMBER_END.lastDate ||
  uid !== await readScheduleEndMemberUid(db, siteId);
