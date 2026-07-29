import type { PendingScheduleQuery } from "./ports/pending-schedule-query";
import type { ScheduleCandidateRejectionQuery } from "../../../../contracts/pending-schedules";

export class PendingScheduleQueryService {
  private readonly query: PendingScheduleQuery;

  constructor(query: PendingScheduleQuery) {
    this.query = query;
  }

  readReview() {
    return this.query.readReview();
  }

  readRejections(input: ScheduleCandidateRejectionQuery) {
    return this.query.readRejections(input);
  }
}
