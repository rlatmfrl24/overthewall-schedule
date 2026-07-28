import type { PendingScheduleDto } from "../../../../../contracts/pending-schedules";

export interface PendingScheduleQuery {
  readReview(): Promise<PendingScheduleDto[]>;
}
