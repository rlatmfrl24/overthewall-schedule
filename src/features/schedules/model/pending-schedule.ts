import type {
  PendingApplyMode,
  PendingApprovalOptions,
  PendingRejectionOptions,
  PendingRejectionReasonCode,
  PendingScheduleDto,
  PendingScheduleSummaryDto,
  PendingTargetMode,
  PendingTimeMode,
  ScheduleCandidateRejectionDto,
  ScheduleCandidateRejectionListDto,
  ScheduleCandidateRejectionQuery,
  SelectedPendingBatchResponseDto,
  SelectedPendingBatchResultDto,
} from "@contracts/pending-schedules";

export type PendingSchedule = PendingScheduleDto;
export type PendingScheduleSummary = PendingScheduleSummaryDto;
export type SelectedPendingBatchResponse = SelectedPendingBatchResponseDto;
export type SelectedPendingBatchResult = SelectedPendingBatchResultDto;
export type ScheduleCandidateRejection = ScheduleCandidateRejectionDto;
export type ScheduleCandidateRejectionList =
  ScheduleCandidateRejectionListDto;
export type {
  PendingApplyMode,
  PendingApprovalOptions,
  PendingRejectionOptions,
  PendingRejectionReasonCode,
  PendingTargetMode,
  PendingTimeMode,
  ScheduleCandidateRejectionQuery,
};
