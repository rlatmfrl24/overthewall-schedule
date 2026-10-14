import type { ScheduleDto } from "../../../../contracts/schedules";

export type ScheduleDateQuery = {
  date?: string;
  startDate?: string;
  endDate?: string;
};

export const readSchedulesByDate = async (
  database: D1Database,
  query: ScheduleDateQuery,
  includeArchived = false,
) => {
  const statement =
    query.startDate && query.endDate
      ? database
          .prepare(
            `SELECT id, member_uid, date, start_time, title, status, created_at, content_access
             FROM schedules
             WHERE date BETWEEN ? AND ? ${includeArchived ? "" : "AND content_access = 'normal'"}`,
          )
          .bind(query.startDate, query.endDate)
      : database
          .prepare(
            `SELECT id, member_uid, date, start_time, title, status, created_at, content_access
             FROM schedules
             WHERE date = ? ${includeArchived ? "" : "AND content_access = 'normal'"}`,
          )
          .bind(query.date);

  return statement.all<ScheduleDto>();
};
