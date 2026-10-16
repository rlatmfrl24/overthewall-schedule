import { publicationHiddenSql } from "../../content-access";
import type { SiteId } from "@contracts/site-definition";
import { and, asc, between, desc, eq, inArray, sql } from "drizzle-orm";
import {
  ddays,
  members,
  notices,
  schedules,
  updateLogs,
} from "@db/schema";
import type { ScheduleBoardResponse } from "../../../../contracts/schedule-board";
import type { DbInstance } from "../../../platform/db";
import type { ScheduleBoardReader } from "../application/ports/schedule-board-reader";

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
  includeArchived = false,
  siteId: SiteId = "otw",
): Promise<ScheduleBoardResponse> => {
  const today = getTodayKstDateString();
  const activeMembersCondition = sql`(${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0)`;

  const [memberRows, ddayRows, noticeRows, scheduleRows, latestUpdateRows] =
    await Promise.all([
      db
        .select()
        .from(members)
        .where(includeArchived ? undefined : and(activeMembersCondition, sql.raw(`members.content_access = 'normal' AND NOT (${publicationHiddenSql("members","members",siteId)})`)))
        .orderBy(asc(members.uid)),
      db.select().from(ddays).where(includeArchived ? undefined : sql.raw(`ddays.content_access = 'normal' AND NOT (${publicationHiddenSql("ddays","ddays",siteId)})`)).orderBy(asc(ddays.date), asc(ddays.id)),
      db
        .select()
        .from(notices)
        .where(
          and(
            includeArchived ? undefined : sql.raw(`notices.content_access = 'normal' AND NOT (${publicationHiddenSql("notices","notices",siteId)})`),
            eq(notices.is_active, true),
            sql`(${notices.started_at} IS NULL OR ${notices.started_at} <= ${today})`,
            sql`(${notices.ended_at} IS NULL OR ${notices.ended_at} >= ${today})`,
          ),
        )
        .orderBy(asc(notices.id)),
      db
        .select()
        .from(schedules)
        .where(and(between(schedules.date, startDate, endDate), includeArchived ? undefined : sql.raw(`schedules.content_access = 'normal' AND NOT (${publicationHiddenSql("schedules","schedules",siteId)})`)))
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
            includeArchived ? undefined : sql`NOT EXISTS (SELECT 1 FROM members archive_member WHERE archive_member.uid = ${updateLogs.member_uid} AND archive_member.content_access = 'admin_archive') AND NOT EXISTS (SELECT 1 FROM schedules archive_schedule WHERE archive_schedule.id = ${updateLogs.schedule_id} AND archive_schedule.content_access = 'admin_archive')`,
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
    schedules: scheduleRows as ScheduleBoardResponse["schedules"],
  };
};

export class D1ScheduleBoardReader implements ScheduleBoardReader {
  private readonly db: DbInstance;

  private readonly includeArchived: boolean;

  private readonly siteId: SiteId;
  constructor(db: DbInstance, includeArchived = false, siteId: SiteId = "otw") {
    this.db = db;
    this.siteId = siteId;
    this.includeArchived = includeArchived;
  }

  read(startDate: string, endDate: string) {
    return getScheduleBoard(this.db, startDate, endDate, this.includeArchived, this.siteId);
  }
}
