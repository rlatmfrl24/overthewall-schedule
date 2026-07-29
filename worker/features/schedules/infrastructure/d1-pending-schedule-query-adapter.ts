import type { PendingScheduleQuery } from "../application/ports/pending-schedule-query";
import type {
  PendingScheduleDto,
  ScheduleCandidateRejectionQuery,
} from "../../../../contracts/pending-schedules";
import {
  queryPendingScheduleReview,
  queryScheduleCandidateRejections,
} from "./d1-pending-schedule-query";

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

  readRejections(input: ScheduleCandidateRejectionQuery) {
    return queryScheduleCandidateRejections(this.database, input);
  }
}
