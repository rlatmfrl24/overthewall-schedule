import type {
  PendingApplyMode,
  PendingApprovalOptions,
  PendingRejectionReasonCode,
  PendingTargetMode,
  PendingTimeMode,
} from "../../../../contracts/pending-schedules";

export type PendingScheduleRow = {
  content_access?: "normal" | "admin_archive";
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
  value === "nearest_half_hour" ||
  value === "nearest_hour" ||
  value === "exact";

export const roundTimeToNearestScheduleHalfHour = (
  time: string | null,
) => {
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

  const roundedMinutes = Math.min(
    Math.round((hour * 60 + minute) / 30) * 30,
    23 * 60 + 30,
  );
  return `${Math.floor(roundedMinutes / 60)
    .toString()
    .padStart(2, "0")}:${(roundedMinutes % 60)
    .toString()
    .padStart(2, "0")}`;
};

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

export const getPendingManualApprovalError = (options: PendingApprovalOptions): string | null => {
  if (options.changes === undefined) {
    return options.expectedTarget === undefined ? null : "expectedTarget requires changes";
  }
  const changes = options.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes) ||
    Object.keys(changes).length === 0 || Object.keys(changes).some(key => key !== "title" && key !== "startTime")) {
    return "Invalid changes";
  }
  if ("title" in changes && (typeof changes.title !== "string" || !changes.title.trim())) return "Invalid edited title";
  if ("startTime" in changes && (typeof changes.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(changes.startTime))) return "Invalid edited startTime";
  const snapshot = options.expectedTarget;
  if (options.targetMode === "create") return snapshot === undefined ? null : "Create does not accept expectedTarget";
  if (!Number.isSafeInteger(options.targetScheduleId) || (options.targetScheduleId ?? 0) <= 0) return "Manual update requires targetScheduleId";
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
    Object.keys(snapshot).length !== 3 || Object.keys(snapshot).some(key => !["title", "startTime", "status"].includes(key)) ||
    (snapshot.title !== null && typeof snapshot.title !== "string") ||
    (snapshot.startTime !== null && typeof snapshot.startTime !== "string") ||
    typeof snapshot.status !== "string" || !snapshot.status) return "Invalid expectedTarget";
  return null;
};

export const getPendingApprovalValues = (
  item: PendingScheduleRow,
  options: PendingApprovalOptions,
) => options.changes ? ({
  startTime: options.changes.startTime === undefined ? null : roundTimeToNearestScheduleHalfHour(options.changes.startTime),
  title: options.changes.title?.trim() ?? null,
}) : ({
  startTime:
    options.applyMode === "all" || options.applyMode === "time"
      ? options.timeMode === "exact"
        ? item.start_time
        : options.timeMode === "nearest_half_hour"
          ? roundTimeToNearestScheduleHalfHour(item.start_time)
          : roundTimeToNearestScheduleHour(item.start_time)
      : null,
  title:
    options.applyMode === "all" || options.applyMode === "title"
      ? item.title
      : null,
});
