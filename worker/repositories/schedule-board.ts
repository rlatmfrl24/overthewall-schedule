import { and, asc, between, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ddays,
  members,
  notices,
  schedules,
  updateLogs,
} from "../../src/db/schema";
import type { DbInstance } from "../db";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const getTodayKstDateString = () =>
  new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);

export const SCHEDULE_CHANGE_ACTIONS = [
  "create",
  "update",
  "delete",
  "approve",
  "schedule_auto_created",
  "schedule_auto_updated",
] as const;

export const isScheduleChangeAction = (action: string) =>
  (SCHEDULE_CHANGE_ACTIONS as readonly string[]).includes(action);

const parseDatabaseTimestamp = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim().length === 0) return null;

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const resolveScheduleBoardUpdatedAt = (
  latestLogCreatedAt: unknown,
  scheduleCreatedAtValues: unknown[],
) => {
  const candidates = [latestLogCreatedAt, ...scheduleCreatedAtValues]
    .map(parseDatabaseTimestamp)
    .filter((value): value is number => value !== null);

  return candidates.length > 0
    ? new Date(Math.max(...candidates)).toISOString()
    : null;
};

export const getScheduleBoard = async (
  db: DbInstance,
  startDate: string,
  endDate: string,
) => {
  const today = getTodayKstDateString();
  const activeMembersCondition = sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0`;

  const [memberRows, ddayRows, noticeRows, scheduleRows, latestUpdateRows] =
    await Promise.all([
      db
        .select()
        .from(members)
        .where(activeMembersCondition)
        .orderBy(asc(members.uid)),
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
      db
        .select({ createdAt: updateLogs.created_at })
        .from(updateLogs)
        .where(
          and(
            between(updateLogs.schedule_date, startDate, endDate),
            inArray(updateLogs.action, [...SCHEDULE_CHANGE_ACTIONS]),
          ),
        )
        .orderBy(desc(updateLogs.created_at), desc(updateLogs.id))
        .limit(1),
    ]);

  const updatedAt = resolveScheduleBoardUpdatedAt(
    latestUpdateRows[0]?.createdAt,
    scheduleRows.map((schedule) => schedule.created_at),
  );

  return {
    startDate,
    endDate,
    updatedAt,
    members: memberRows,
    ddays: ddayRows,
    notices: noticeRows,
    schedules: scheduleRows,
  };
};
