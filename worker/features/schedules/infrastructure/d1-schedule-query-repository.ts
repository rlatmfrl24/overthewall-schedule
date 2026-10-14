import type {
  ScheduleQuery,
  ScheduleQueryRepository,
} from "../application/ports/schedule-query-repository";
import { readSchedulesByDate } from "./d1-schedule-query";

export class D1ScheduleQueryRepository implements ScheduleQueryRepository {
  private readonly database: D1Database;

  private readonly includeArchived: boolean;

  constructor(database: D1Database, includeArchived = false) {
    this.database = database;
    this.includeArchived = includeArchived;
  }

  async read(query: ScheduleQuery) {
    const result = await readSchedulesByDate(this.database, query, this.includeArchived);
    return result.results;
  }
}
