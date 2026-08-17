export type PendingApplyMode = "all" | "time" | "title";
export type PendingTargetMode = "update" | "create";
export type PendingTimeMode =
  | "nearest_half_hour"
  | "nearest_hour"
  | "exact";
export type PendingAction = "approve" | "reject" | "reset_processed";
export type PendingRejectionReasonCode =
  | "not_needed"
  | "already_reflected"
  | "wrong_match"
  | "duplicate"
  | "other";
export type PendingCandidateKind =
  | "missing_schedule"
  | "fill_missing_fields"
  | "ambiguous";
export type PendingMatchReason =
  | "time_window"
  | "title_similarity"
  | "single_gap_fallback"
  | "missing_schedule"
  | "ambiguous";
export type PendingMatchConfidence = "high" | "medium" | "low";
export type PendingMissingField = "time" | "title";

export type PendingRejectionOptions = {
  reasonCode?: PendingRejectionReasonCode | null;
  reasonNote?: string | null;
};

export type ScheduleCandidateRejectionQuery = {
  search?: string;
  reasonCode?: PendingRejectionReasonCode;
  rejectedFrom?: string;
  rejectedTo?: string;
  page: number;
  pageSize: number;
};

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

export interface PendingRankedScheduleDto
  extends PendingScheduleSummaryDto {
  reason: "time_window" | "title_similarity" | "single_gap_fallback";
  confidence: "high" | "medium";
  time_difference_minutes: number | null;
  title_similarity: number;
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
  previous_start_time: string | null;
  previous_title: string | null;
  candidate_kind: PendingCandidateKind | null;
  match_reason: PendingMatchReason | null;
  match_confidence: PendingMatchConfidence | null;
  missing_fields: PendingMissingField[];
  ranked_schedules: PendingRankedScheduleDto[];
  source_vod_ids: string[];
  session_started_at: string | null;
  session_ended_at: string | null;
  vod_segment_count: number;
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
  action?:
    | "create"
    | "update"
    | "reject"
    | "reset_processed"
    | "candidate_obsolete";
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

export interface ScheduleCandidateRejectionDto {
  id: number;
  vod_id: string;
  member_uid: number;
  member_name: string;
  date: string;
  start_time: string | null;
  title: string | null;
  status: string;
  action_type: "create" | "update";
  existing_schedule_id: number | null;
  previous_status: string | null;
  previous_start_time: string | null;
  previous_title: string | null;
  candidate_kind: PendingCandidateKind | null;
  match_reason: PendingMatchReason | null;
  match_confidence: PendingMatchConfidence | null;
  source_vod_ids: string[];
  session_started_at: string | null;
  session_ended_at: string | null;
  vod_segment_count: number;
  vod_started_at: string | null;
  vod_duration_seconds: number | null;
  vod_thumbnail_url: string | null;
  reason_code: PendingRejectionReasonCode | null;
  reason_note: string | null;
  actor_name: string | null;
  rejected_at: string | null;
}

export interface ScheduleCandidateRejectionListDto {
  items: ScheduleCandidateRejectionDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
