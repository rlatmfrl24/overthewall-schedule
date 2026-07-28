export type PendingApplyMode = "all" | "time" | "title";
export type PendingTargetMode = "update" | "create";
export type PendingTimeMode = "nearest_hour" | "exact";
export type PendingAction = "approve" | "reject" | "reset_processed";

export type PendingApprovalOptions = {
  applyMode: PendingApplyMode;
  targetMode: PendingTargetMode;
  timeMode: PendingTimeMode;
  targetScheduleId?: number | null;
};

export type PendingScheduleActionResult = {
  id: number;
  success: boolean;
  action?: string;
  scheduleId?: number | null;
  error?: string;
  message?: string;
};

export type PendingScheduleBatchResult = {
  success: boolean;
  totalRequested: number;
  successCount: number;
  failedCount: number;
  results: PendingScheduleActionResult[];
};

export interface PendingScheduleSummaryDto {
  id: number;
  start_time: string | null;
  title: string | null;
  status: string;
}

export interface PendingScheduleDto {
  id: number;
  member_uid: number;
  member_name: string;
  date: string;
  start_time: string | null;
  title: string | null;
  status: string;
  action_type: "create" | "update";
  existing_schedule_id: number | null;
  previous_status: string | null;
  previous_title: string | null;
  vod_id: string | null;
  vod_started_at: string | null;
  vod_duration_seconds: number | null;
  vod_thumbnail_url: string | null;
  processed_reset_at: string | null;
  created_at: string | null;
  has_same_day_schedule: boolean;
  same_day_schedule_count: number;
  same_day_schedules: PendingScheduleSummaryDto[];
  existing_schedule: PendingScheduleSummaryDto | null;
  empty_target_schedule: PendingScheduleSummaryDto | null;
  can_apply_to_empty_target: boolean;
  is_processed: boolean;
  processed_decision: "approved" | "rejected" | null;
  processed_at: string | null;
  processed_actor_name: string | null;
}

export interface SelectedPendingBatchResultDto {
  id: number;
  success: boolean;
  action?: "create" | "update" | "reject" | "reset_processed";
  scheduleId?: number | null;
  resetAt?: string;
  error?: string;
  message?: string;
}

export interface SelectedPendingBatchResponseDto {
  success: boolean;
  totalRequested: number;
  successCount: number;
  failedCount: number;
  results: SelectedPendingBatchResultDto[];
}
