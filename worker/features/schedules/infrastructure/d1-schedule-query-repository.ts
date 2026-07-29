import type {
  ScheduleQuery,
  ScheduleQueryRepository,
} from "../application/ports/schedule-query-repository";
import { readSchedulesByDate } from "./d1-schedule-query";

export class D1ScheduleQueryRepository implements ScheduleQueryRepository {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async read(query: ScheduleQuery) {
    const result = await readSchedulesByDate(this.database, query);
    return result.results;
  }
}
