import type { SiteId } from "@contracts/site-definition";
import type {
  ScheduleQuery,
  ScheduleQueryRepository,
} from "../application/ports/schedule-query-repository";
import { readSchedulesByDate } from "./d1-schedule-query";

export class D1ScheduleQueryRepository implements ScheduleQueryRepository {
  private readonly database: D1Database;

  private readonly includeArchived: boolean;

  private readonly siteId: SiteId;
  constructor(database: D1Database, includeArchived = false, siteId: SiteId = "otw") {
    this.database = database;
    this.siteId = siteId;
    this.includeArchived = includeArchived;
  }

  async read(query: ScheduleQuery) {
    const result = await readSchedulesByDate(this.database, query, this.includeArchived, this.siteId);
    return result.results;
  }
}
