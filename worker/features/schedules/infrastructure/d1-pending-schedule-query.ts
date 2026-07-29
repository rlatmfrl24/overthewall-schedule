import type {
  PendingMatchConfidence,
  PendingMatchReason,
  PendingCandidateKind,
  PendingMissingField,
  PendingRejectionReasonCode,
  PendingRankedScheduleDto,
  ScheduleCandidateRejectionDto,
  ScheduleCandidateRejectionListDto,
  ScheduleCandidateRejectionQuery,
} from "../../../../contracts/pending-schedules";
import {
  AUTO_UPDATE_TIME_WINDOW_MINUTES,
  getMissingScheduleFields,
  getTitleSimilarity,
} from "../domain/auto-update-matcher";

type PendingScheduleQueryRow = {
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
  previous_start_time: string | null;
  previous_title: string | null;
  candidate_kind: string | null;
  match_reason: string | null;
  match_confidence: string | null;
  ranked_schedule_ids: string | null;
  source_vod_ids: string | null;
  session_started_at: string | null;
  session_ended_at: string | null;
  vod_segment_count: number;
  vod_id: string | null;
  vod_started_at: string | null;
  vod_duration_seconds: number | null;
  vod_thumbnail_url: string | null;
  processed_reset_at: string | null;
  created_at: string | number | null;
};

type ScheduleSummary = {
  id: number;
  member_uid: number;
  date: string;
  start_time: string | null;
  title: string | null;
  status: string;
};

const PENDING_COLUMNS = `
  id,
  member_uid,
  member_name,
  date,
  start_time,
  title,
  status,
  action_type,
  existing_schedule_id,
  previous_status,
  previous_title,
  previous_start_time,
  candidate_kind,
  match_reason,
  match_confidence,
  ranked_schedule_ids,
  source_vod_ids,
  session_started_at,
  session_ended_at,
  vod_segment_count,
  vod_id,
  vod_started_at,
  vod_duration_seconds,
  vod_thumbnail_url,
  processed_reset_at,
  created_at
`;

const LEGACY_PENDING_COLUMNS = `
  id,
  member_uid,
  member_name,
  date,
  start_time,
  title,
  status,
  action_type,
  existing_schedule_id,
  previous_status,
  previous_title,
  NULL AS previous_start_time,
  NULL AS candidate_kind,
  NULL AS match_reason,
  NULL AS match_confidence,
  NULL AS ranked_schedule_ids,
  NULL AS source_vod_ids,
  NULL AS session_started_at,
  NULL AS session_ended_at,
  1 AS vod_segment_count,
  vod_id,
  NULL AS vod_started_at,
  NULL AS vod_duration_seconds,
  NULL AS vod_thumbnail_url,
  NULL AS processed_reset_at,
  created_at
`;

const getErrorText = (error: unknown) =>
  error instanceof Error
    ? `${error.message}${
        "cause" in error && error.cause instanceof Error
          ? ` ${error.cause.message}`
          : ""
      }`
    : String(error);

const isMissingVodMetadataError = (error: unknown) => {
  const message = getErrorText(error);
  return (
    [
      "vod_started_at",
      "vod_duration_seconds",
      "vod_thumbnail_url",
      "processed_reset_at",
      "candidate_kind",
      "source_vod_ids",
      "vod_segment_count",
    ].some((column) => message.includes(column)) &&
    (message.includes("no such column") ||
      message.includes("no column named") ||
      message.includes("pending_schedules"))
  );
};

const placeholders = (values: readonly unknown[]) =>
  values.map(() => "?").join(", ");

const getScheduleKey = (memberUid: number, date: string) =>
  `${memberUid}:${date}`;

const isEmptyScheduleTarget = (schedule: ScheduleSummary) =>
  !schedule.start_time?.trim() && !schedule.title?.trim();

const parseStringArray = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const parseNumberArray = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .map(Number)
          .filter((item) => Number.isSafeInteger(item) && item > 0)
      : [];
  } catch {
    return [];
  }
};

const parseCandidateKind = (value: string | null): PendingCandidateKind | null =>
  value === "missing_schedule" ||
  value === "fill_missing_fields" ||
  value === "ambiguous"
    ? value
    : null;

const parseMatchReason = (value: string | null): PendingMatchReason | null =>
  value === "time_window" ||
  value === "title_similarity" ||
  value === "single_gap_fallback" ||
  value === "missing_schedule" ||
  value === "ambiguous"
    ? value
    : null;

const parseMatchConfidence = (
  value: string | null,
): PendingMatchConfidence | null =>
  value === "high" || value === "medium" || value === "low" ? value : null;

const timeToMinutes = (value: string | null) => {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const toRankedSchedule = (
  item: PendingScheduleQueryRow,
  schedule: ScheduleSummary,
): PendingRankedScheduleDto => {
  const candidateMinutes = timeToMinutes(item.start_time);
  const scheduleMinutes = timeToMinutes(schedule.start_time);
  const timeDifferenceMinutes =
    candidateMinutes === null || scheduleMinutes === null
      ? null
      : Math.abs(candidateMinutes - scheduleMinutes);
  const titleSimilarity = getTitleSimilarity(item.title, schedule.title);
  const reason =
    timeDifferenceMinutes !== null &&
    timeDifferenceMinutes <= AUTO_UPDATE_TIME_WINDOW_MINUTES
      ? "time_window"
      : titleSimilarity >= 0.6
        ? "title_similarity"
        : "single_gap_fallback";
  return {
    ...toScheduleSummaryResponse(schedule),
    reason,
    confidence:
      reason === "time_window"
        ? timeDifferenceMinutes !== null && timeDifferenceMinutes <= 30
          ? "high"
          : "medium"
        : reason === "title_similarity" && titleSimilarity >= 0.9
          ? "high"
          : "medium",
    time_difference_minutes: timeDifferenceMinutes,
    title_similarity: titleSimilarity,
  };
};

const toScheduleSummaryResponse = (schedule: ScheduleSummary) => ({
  id: schedule.id,
  start_time: schedule.start_time,
  title: schedule.title,
  status: schedule.status,
});

const normalizeMetadataText = (
  value: unknown,
  sentinel: "vod_started_at" | "vod_thumbnail_url" | "processed_reset_at",
) =>
  typeof value === "string" &&
  ![sentinel, "null", "undefined", ""].includes(value)
    ? value
    : null;

const selectPendingSchedules = async (db: D1Database) => {
  try {
    return (
      await db
        .prepare(
          `SELECT ${PENDING_COLUMNS}
           FROM pending_schedules
           ORDER BY created_at DESC, id DESC`,
        )
        .all<PendingScheduleQueryRow>()
    ).results;
  } catch (error) {
    if (!isMissingVodMetadataError(error)) throw error;
    console.warn(
      "[pending] VOD metadata columns are missing; using the legacy read model.",
    );
    return (
      await db
        .prepare(
          `SELECT ${LEGACY_PENDING_COLUMNS}
           FROM pending_schedules
           ORDER BY created_at DESC, id DESC`,
        )
        .all<PendingScheduleQueryRow>()
    ).results;
  }
};

export const queryPendingScheduleReview = async (db: D1Database) => {
  const pendingList = await selectPendingSchedules(db);
  if (pendingList.length === 0) return [];

  const memberUids = [...new Set(pendingList.map((item) => item.member_uid))];
  const dates = [...new Set(pendingList.map((item) => item.date))];
  const existingScheduleIds = [
    ...new Set(
      pendingList
        .map((item) => item.existing_schedule_id)
        .filter(
          (id): id is number =>
            typeof id === "number" && Number.isSafeInteger(id) && id > 0,
        ),
    ),
  ];

  const scheduleConditions = [
    `(member_uid IN (${placeholders(memberUids)})
      AND date IN (${placeholders(dates)}))`,
  ];
  const scheduleBindings: unknown[] = [...memberUids, ...dates];
  if (existingScheduleIds.length > 0) {
    scheduleConditions.push(
      `id IN (${placeholders(existingScheduleIds)})`,
    );
    scheduleBindings.push(...existingScheduleIds);
  }

  const scheduleResult = await db
    .prepare(
      `SELECT id, member_uid, date, start_time, title, status
       FROM schedules
       WHERE ${scheduleConditions.join(" OR ")}`,
    )
    .bind(...scheduleBindings)
    .all<ScheduleSummary>();

  const sameDateSchedules = scheduleResult.results.filter(
    (schedule) =>
      memberUids.includes(schedule.member_uid) &&
      dates.includes(schedule.date),
  );
  const schedulesById = new Map(
    scheduleResult.results.map((schedule) => [schedule.id, schedule]),
  );
  const schedulesByMemberDate = new Map<string, ScheduleSummary[]>();
  for (const schedule of sameDateSchedules) {
    const key = getScheduleKey(schedule.member_uid, schedule.date);
    schedulesByMemberDate.set(key, [
      ...(schedulesByMemberDate.get(key) ?? []),
      schedule,
    ]);
  }

  return pendingList.map((item) => {
    const key = getScheduleKey(item.member_uid, item.date);
    const sameDaySchedules = schedulesByMemberDate.get(key) ?? [];
    const explicitExisting = item.existing_schedule_id
      ? schedulesById.get(item.existing_schedule_id) ?? null
      : null;
    const existingSchedule =
      explicitExisting &&
      explicitExisting.member_uid === item.member_uid &&
      explicitExisting.date === item.date
        ? explicitExisting
        : null;
    const schedulesWithExisting =
      existingSchedule &&
      !sameDaySchedules.some((schedule) => schedule.id === existingSchedule.id)
        ? [...sameDaySchedules, existingSchedule]
        : sameDaySchedules;
    const emptyTarget =
      (existingSchedule && isEmptyScheduleTarget(existingSchedule)
        ? existingSchedule
        : schedulesWithExisting.find(isEmptyScheduleTarget)) ?? null;
    return {
      ...item,
      vod_started_at: normalizeMetadataText(
        item.vod_started_at,
        "vod_started_at",
      ),
      vod_duration_seconds:
        typeof item.vod_duration_seconds === "number" &&
        Number.isFinite(item.vod_duration_seconds)
          ? item.vod_duration_seconds
          : null,
      vod_thumbnail_url: normalizeMetadataText(
        item.vod_thumbnail_url,
        "vod_thumbnail_url",
      ),
      processed_reset_at: normalizeMetadataText(
        item.processed_reset_at,
        "processed_reset_at",
      ),
      has_same_day_schedule: schedulesWithExisting.length > 0,
      same_day_schedule_count: schedulesWithExisting.length,
      same_day_schedules: schedulesWithExisting.map(toScheduleSummaryResponse),
      existing_schedule: existingSchedule
        ? toScheduleSummaryResponse(existingSchedule)
        : null,
      empty_target_schedule: emptyTarget
        ? toScheduleSummaryResponse(emptyTarget)
        : null,
      candidate_kind: parseCandidateKind(item.candidate_kind),
      match_reason: parseMatchReason(item.match_reason),
      match_confidence: parseMatchConfidence(item.match_confidence),
      missing_fields:
        parseCandidateKind(item.candidate_kind) === "missing_schedule"
          ? (["time", "title"] satisfies PendingMissingField[])
          : existingSchedule
            ? getMissingScheduleFields({
                startTime: existingSchedule.start_time,
                title: existingSchedule.title,
              })
            : [],
      ranked_schedules: parseNumberArray(item.ranked_schedule_ids)
        .map((id) => schedulesById.get(id))
        .filter((schedule): schedule is ScheduleSummary => Boolean(schedule))
        .map((schedule) => toRankedSchedule(item, schedule)),
      source_vod_ids: parseStringArray(item.source_vod_ids),
      vod_segment_count:
        Number.isSafeInteger(item.vod_segment_count) &&
        item.vod_segment_count > 0
          ? item.vod_segment_count
          : 1,
      can_apply_to_empty_target: emptyTarget !== null,
      is_processed: false,
      processed_decision: null,
      processed_at: null,
      processed_actor_name: null,
    };
  });
};

type RejectionQueryRow = Omit<
  ScheduleCandidateRejectionDto,
  | "action_type"
  | "reason_code"
  | "rejected_at"
  | "candidate_kind"
  | "match_reason"
  | "match_confidence"
  | "source_vod_ids"
> & {
  action_type: string;
  reason_code: string | null;
  rejected_at: string | number | null;
  candidate_kind: string | null;
  match_reason: string | null;
  match_confidence: string | null;
  source_vod_ids: string | null;
};

type CountRow = { total: number };

const escapeLike = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

export const queryScheduleCandidateRejections = async (
  db: D1Database,
  input: ScheduleCandidateRejectionQuery,
): Promise<ScheduleCandidateRejectionListDto> => {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const search = input.search?.trim();
  if (search) {
    conditions.push(
      `(member_name LIKE ? ESCAPE '\\'
        OR COALESCE(title, '') LIKE ? ESCAPE '\\'
        OR vod_id LIKE ? ESCAPE '\\')`,
    );
    const pattern = `%${escapeLike(search)}%`;
    bindings.push(pattern, pattern, pattern);
  }
  if (input.reasonCode) {
    conditions.push("reason_code = ?");
    bindings.push(input.reasonCode);
  }
  if (input.rejectedFrom) {
    conditions.push("rejected_at >= datetime(?, '-9 hours')");
    bindings.push(input.rejectedFrom);
  }
  if (input.rejectedTo) {
    conditions.push("rejected_at < datetime(?, '+1 day', '-9 hours')");
    bindings.push(input.rejectedTo);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (input.page - 1) * input.pageSize;
  const [countResult, itemResult] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM schedule_candidate_rejections
         ${where}`,
      )
      .bind(...bindings)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT
           id,
           vod_id,
           member_uid,
           member_name,
           date,
           start_time,
           title,
           status,
           action_type,
           existing_schedule_id,
           previous_status,
           previous_title,
           previous_start_time,
           candidate_kind,
           match_reason,
           match_confidence,
           source_vod_ids,
           session_started_at,
           session_ended_at,
           vod_segment_count,
           vod_started_at,
           vod_duration_seconds,
           vod_thumbnail_url,
           reason_code,
           reason_note,
           actor_name,
           rejected_at
         FROM schedule_candidate_rejections
         ${where}
         ORDER BY rejected_at DESC, id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, input.pageSize, offset)
      .all<RejectionQueryRow>(),
  ]);

  const total = Number(countResult?.total ?? 0);
  return {
    items: itemResult.results.map((row) => ({
      ...row,
      action_type: row.action_type === "update" ? "update" : "create",
      reason_code: row.reason_code as PendingRejectionReasonCode | null,
      candidate_kind: parseCandidateKind(row.candidate_kind),
      match_reason: parseMatchReason(row.match_reason),
      match_confidence: parseMatchConfidence(row.match_confidence),
      source_vod_ids: parseStringArray(row.source_vod_ids),
      rejected_at:
        row.rejected_at === null ? null : String(row.rejected_at),
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
};
