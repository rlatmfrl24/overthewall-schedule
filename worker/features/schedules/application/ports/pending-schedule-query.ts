import type {
  PendingScheduleDto,
  ScheduleCandidateRejectionListDto,
  ScheduleCandidateRejectionQuery,
} from "../../../../../contracts/pending-schedules";

export interface PendingScheduleQuery {
  readReview(): Promise<PendingScheduleDto[]>;
  readRejections(
    input: ScheduleCandidateRejectionQuery,
  ): Promise<ScheduleCandidateRejectionListDto>;
}
