import type {
  PendingApplyMode,
  PendingApprovalOptions,
  PendingRejectionReasonCode,
  PendingTargetMode,
  PendingTimeMode,
} from "../../../../contracts/pending-schedules";

export type PendingScheduleRow = {
  id: number;
  member_uid: number;
  member_name: string;
  date: string;
  start_time: string | null;
  title: string | null;
  status: string;
  action_type: string;
  existing_schedule_id: number | null;
  previous_status: string | null;
  previous_start_time?: string | null;
  previous_title: string | null;
  candidate_kind?: string | null;
  match_reason?: string | null;
  match_confidence?: string | null;
  ranked_schedule_ids?: string | null;
  source_vod_ids?: string | null;
  session_started_at?: string | null;
  session_ended_at?: string | null;
  vod_segment_count?: number;
  vod_id: string | null;
  vod_started_at: string | null;
  vod_duration_seconds: number | null;
  vod_thumbnail_url: string | null;
};

export const isPendingApplyMode = (
  value: unknown,
): value is PendingApplyMode =>
  value === "all" || value === "time" || value === "title";

export const isPendingTargetMode = (
  value: unknown,
): value is PendingTargetMode =>
  value === "update" || value === "create";

export const isPendingTimeMode = (
  value: unknown,
): value is PendingTimeMode =>
  value === "nearest_hour" || value === "exact";

export const isPendingRejectionReasonCode = (
  value: unknown,
): value is PendingRejectionReasonCode =>
  value === "not_needed" ||
  value === "already_reflected" ||
  value === "wrong_match" ||
  value === "duplicate" ||
  value === "other";

export const roundTimeToNearestScheduleHour = (time: string | null) => {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return time;
  }

  const roundedHour = hour + (minute >= 30 ? 1 : 0);
  return `${Math.min(roundedHour, 23).toString().padStart(2, "0")}:00`;
};

export const getPendingApprovalValues = (
  item: PendingScheduleRow,
  options: PendingApprovalOptions,
) => ({
  startTime:
    options.applyMode === "all" || options.applyMode === "time"
      ? options.timeMode === "exact"
        ? item.start_time
        : roundTimeToNearestScheduleHour(item.start_time)
      : null,
  title:
    options.applyMode === "all" || options.applyMode === "title"
      ? item.title
      : null,
});
