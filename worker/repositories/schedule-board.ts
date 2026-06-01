import { and, asc, between, eq, sql } from "drizzle-orm";
import {
  ddays,
  members,
  notices,
  schedules,
} from "../../src/db/schema";
import type { DbInstance } from "../db";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const getTodayKstDateString = () =>
  new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);

export const getScheduleBoard = async (
  db: DbInstance,
  startDate: string,
  endDate: string,
) => {
  const today = getTodayKstDateString();
  const activeMembersCondition = sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0`;

  const [memberRows, ddayRows, noticeRows, scheduleRows] = await Promise.all([
    db.select().from(members).where(activeMembersCondition).orderBy(asc(members.uid)),
    db.select().from(ddays).orderBy(asc(ddays.date), asc(ddays.id)),
    db
      .select()
      .from(notices)
      .where(
        and(
          eq(notices.is_active, true),
          sql`(${notices.started_at} IS NULL OR ${notices.started_at} <= ${today})`,
          sql`(${notices.ended_at} IS NULL OR ${notices.ended_at} >= ${today})`,
        ),
      )
      .orderBy(asc(notices.id)),
    db
      .select()
      .from(schedules)
      .where(between(schedules.date, startDate, endDate))
      .orderBy(
        asc(schedules.date),
        asc(schedules.member_uid),
        asc(schedules.start_time),
        asc(schedules.id),
      ),
  ]);

  return {
    startDate,
    endDate,
    updatedAt: new Date().toISOString(),
    members: memberRows,
    ddays: ddayRows,
    notices: noticeRows,
    schedules: scheduleRows,
  };
};
