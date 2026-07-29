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
  previous_title: string | null;
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

type ProcessedPendingLog = {
  id: number;
  schedule_id: number | null;
  member_uid: number | null;
  schedule_date: string;
  action: string;
  title: string | null;
  previous_status: string | null;
  actor_name: string | null;
  created_at: string | null;
};

type ProcessedPendingDecision = "approved" | "rejected";

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

const normalizeComparableText = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

const parseTimestampMs = (value: string | number | null | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const compareTimestamps = (
  left: string | number | null | undefined,
  right: string | number | null | undefined,
) => {
  const leftTime = parseTimestampMs(left);
  const rightTime = parseTimestampMs(right);
  return leftTime !== null && rightTime !== null
    ? leftTime - rightTime
    : String(left ?? "").localeCompare(String(right ?? ""));
};

const getLaterTimestamp = (
  left: string | null,
  right: string | null | undefined,
) => {
  if (!left) return right ?? null;
  if (!right) return left;
  return compareTimestamps(left, right) >= 0 ? left : right;
};

const getProcessedDecision = (
  action: string,
): ProcessedPendingDecision | null => {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  return null;
};

const isMatchingProcessedLog = (
  item: PendingScheduleQueryRow,
  log: ProcessedPendingLog,
) => {
  if (log.previous_status === `pending:${item.id}`) return true;
  if (
    item.existing_schedule_id &&
    log.schedule_id === item.existing_schedule_id
  ) {
    return true;
  }
  if (
    normalizeComparableText(log.title) === "" ||
    normalizeComparableText(log.title) !== normalizeComparableText(item.title)
  ) {
    return false;
  }
  const logTime = parseTimestampMs(log.created_at);
  const pendingTime = parseTimestampMs(item.created_at);
  return logTime !== null && pendingTime !== null && logTime >= pendingTime;
};

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

  const [scheduleResult, logResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, member_uid, date, start_time, title, status
         FROM schedules
         WHERE ${scheduleConditions.join(" OR ")}`,
      )
      .bind(...scheduleBindings)
      .all<ScheduleSummary>(),
    db
      .prepare(
        `SELECT
           id,
           schedule_id,
           member_uid,
           schedule_date,
           action,
           title,
           previous_status,
           actor_name,
           created_at
         FROM update_logs
         WHERE action IN ('approve', 'reject', 'reset_processed')
           AND member_uid IN (${placeholders(memberUids)})
           AND schedule_date IN (${placeholders(dates)})
         ORDER BY created_at DESC, id DESC`,
      )
      .bind(...memberUids, ...dates)
      .all<ProcessedPendingLog>(),
  ]);

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

  const logsByMemberDate = new Map<string, ProcessedPendingLog[]>();
  for (const log of logResult.results) {
    if (!log.member_uid) continue;
    const key = getScheduleKey(log.member_uid, log.schedule_date);
    logsByMemberDate.set(key, [
      ...(logsByMemberDate.get(key) ?? []),
      log,
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
    const logs = logsByMemberDate.get(key) ?? [];
    const columnResetAt = normalizeMetadataText(
      item.processed_reset_at,
      "processed_reset_at",
    );
    const latestResetLogAt =
      logs.find(
        (log) =>
          log.action === "reset_processed" &&
          isMatchingProcessedLog(item, log),
      )?.created_at ?? null;
    const processedResetAt = getLaterTimestamp(
      columnResetAt,
      latestResetLogAt,
    );
    const processedLog =
      logs.find(
        (log) =>
          getProcessedDecision(log.action) !== null &&
          (!processedResetAt ||
            (log.created_at !== null &&
              compareTimestamps(log.created_at, processedResetAt) > 0)) &&
          isMatchingProcessedLog(item, log),
      ) ?? null;

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
      processed_reset_at: processedResetAt,
      has_same_day_schedule: schedulesWithExisting.length > 0,
      same_day_schedule_count: schedulesWithExisting.length,
      same_day_schedules: schedulesWithExisting.map(toScheduleSummaryResponse),
      existing_schedule: existingSchedule
        ? toScheduleSummaryResponse(existingSchedule)
        : null,
      empty_target_schedule: emptyTarget
        ? toScheduleSummaryResponse(emptyTarget)
        : null,
      can_apply_to_empty_target: emptyTarget !== null,
      is_processed: processedLog !== null,
      processed_decision: processedLog
        ? getProcessedDecision(processedLog.action)
        : null,
      processed_at: processedLog?.created_at ?? null,
      processed_actor_name: processedLog?.actor_name ?? null,
    };
  });
};
