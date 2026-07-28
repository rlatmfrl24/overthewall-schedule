import type { PendingScheduleQuery } from "./ports/pending-schedule-query";

export class PendingScheduleQueryService {
  private readonly query: PendingScheduleQuery;

  constructor(query: PendingScheduleQuery) {
    this.query = query;
  }

  readReview() {
    return this.query.readReview();
  }
}
