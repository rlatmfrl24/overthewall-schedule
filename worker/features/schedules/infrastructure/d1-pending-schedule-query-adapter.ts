import type { PendingScheduleQuery } from "../application/ports/pending-schedule-query";
import type { PendingScheduleDto } from "../../../../contracts/pending-schedules";
import { queryPendingScheduleReview } from "./d1-pending-schedule-query";

export class D1PendingScheduleQuery implements PendingScheduleQuery {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  readReview() {
    return queryPendingScheduleReview(
      this.database,
    ) as Promise<PendingScheduleDto[]>;
  }
}
