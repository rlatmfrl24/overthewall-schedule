import type { ScheduleDto } from "../../../../contracts/schedules";

export type ScheduleDateQuery = {
  date?: string;
  startDate?: string;
  endDate?: string;
};

export const readSchedulesByDate = async (
  database: D1Database,
  query: ScheduleDateQuery,
) => {
  const statement =
    query.startDate && query.endDate
      ? database
          .prepare(
            `SELECT id, member_uid, date, start_time, title, status, created_at
             FROM schedules
             WHERE date BETWEEN ? AND ?`,
          )
          .bind(query.startDate, query.endDate)
      : database
          .prepare(
            `SELECT id, member_uid, date, start_time, title, status, created_at
             FROM schedules
             WHERE date = ?`,
          )
          .bind(query.date);

  return statement.all<ScheduleDto>();
};
