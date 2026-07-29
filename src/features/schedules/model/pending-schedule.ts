import type {
  PendingApplyMode,
  PendingApprovalOptions,
  PendingScheduleDto,
  PendingScheduleSummaryDto,
  PendingTargetMode,
  PendingTimeMode,
  SelectedPendingBatchResponseDto,
  SelectedPendingBatchResultDto,
} from "@contracts/pending-schedules";

export type PendingSchedule = PendingScheduleDto;
export type PendingScheduleSummary = PendingScheduleSummaryDto;
export type SelectedPendingBatchResponse = SelectedPendingBatchResponseDto;
export type SelectedPendingBatchResult = SelectedPendingBatchResultDto;
export type {
  PendingApplyMode,
  PendingApprovalOptions,
  PendingTargetMode,
  PendingTimeMode,
};
