import {
  asc,
  and,
  between,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
  SQL,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  pendingSchedules,
  schedules,
  settings,
  updateLogs,
} from "../../src/db/schema";
import {
  isAutoUpdateIntervalHours,
  normalizeAutoUpdateIntervalHours,
} from "../../src/lib/auto-update-interval";
import { roundTimeToNearestScheduleHour } from "../../src/lib/pending-time";
import {
  badRequest,
  getActorInfo,
  getSetting,
  insertUpdateLog,
  parseNumericId,
  pMap,
  updateSetting,
} from "../utils/helpers";
import { autoUpdateSchedules } from "../services/schedule";
import type { DbInstance } from "../db";
import type { Env } from "../types";

type PendingScheduleRow = typeof pendingSchedules.$inferSelect;
type ScheduleSummary = {
  id: number;
  member_uid: number;
  date: string;
  start_time: string | null;
  title: string | null;
  status: string;
};
type ProcessedPendingDecision = "approved" | "rejected";
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
type PendingApplyMode = "all" | "time" | "title";
type PendingTargetMode = "update" | "create";
type PendingTimeMode = "nearest_hour" | "exact";
type PendingApprovalOptions = {
  applyMode: PendingApplyMode;
  targetMode: PendingTargetMode;
  timeMode: PendingTimeMode;
  targetScheduleId: number | null;
};
type PendingApprovalResult = {
  action: PendingTargetMode;
  scheduleId: number | null;
  previousStatus: string | null;
};

const PENDING_VOD_METADATA_COLUMNS = [
  "vod_started_at",
  "vod_duration_seconds",
  "vod_thumbnail_url",
  "processed_reset_at",
] as const;

const getScheduleKey = (memberUid: number, date: string) => `${memberUid}:${date}`;

const isEmptyScheduleTarget = (schedule: {
  start_time?: string | null;
  title?: string | null;
}) => !schedule.start_time?.trim() && !schedule.title?.trim();

const toScheduleSummaryResponse = (schedule: ScheduleSummary) => ({
  id: schedule.id,
  start_time: schedule.start_time,
  title: schedule.title,
  status: schedule.status,
});

const normalizePendingVodStartedAt = (value: unknown) =>
  typeof value === "string" &&
  !["vod_started_at", "null", "undefined", ""].includes(value)
    ? value
    : null;

const normalizePendingVodDuration = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizePendingVodThumbnail = (value: unknown) =>
  typeof value === "string" &&
  !["vod_thumbnail_url", "null", "undefined", ""].includes(value)
    ? value
    : null;

const normalizePendingProcessedResetAt = (value: unknown) =>
  typeof value === "string" &&
  !["processed_reset_at", "null", "undefined", ""].includes(value)
    ? value
    : null;

const normalizeComparableText = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

const getProcessedDecision = (
  action: string,
): ProcessedPendingDecision | null => {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  return null;
};

const parseTimestampMs = (value: string | number | null | undefined) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const sqliteUtcMatch = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
  const normalized = sqliteUtcMatch ? `${value.replace(" ", "T")}Z` : value;
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const compareTimestamps = (
  left: string | number | null | undefined,
  right: string | number | null | undefined,
) => {
  const leftTime = parseTimestampMs(left);
  const rightTime = parseTimestampMs(right);
  if (leftTime !== null && rightTime !== null) {
    return leftTime - rightTime;
  }
  return String(left ?? "").localeCompare(String(right ?? ""));
};

const isLogAfterReset = (logCreatedAt: string | null, resetAt: string | null) => {
  if (!resetAt) return true;
  if (!logCreatedAt) return false;
  return compareTimestamps(logCreatedAt, resetAt) > 0;
};

const getLaterTimestamp = (
  left: string | null,
  right: string | null | undefined,
) => {
  if (!left) return right ?? null;
  if (!right) return left;
  return compareTimestamps(left, right) >= 0 ? left : right;
};

const isMatchingProcessedLog = (
  item: PendingScheduleRow,
  log: ProcessedPendingLog,
) => {
  if (log.previous_status === `pending:${item.id}`) {
    return true;
  }
  if (item.existing_schedule_id && log.schedule_id === item.existing_schedule_id) {
    return true;
  }
  return (
    normalizeComparableText(log.title) !== "" &&
    normalizeComparableText(log.title) === normalizeComparableText(item.title)
  );
};

const getErrorText = (error: unknown): string => {
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause instanceof Error
        ? ` ${error.cause.message}`
        : "";
    return `${error.message}${cause}`;
  }
  return String(error);
};

const isMissingPendingVodMetadataColumnError = (error: unknown) => {
  const message = getErrorText(error);
  const mentionsVodMetadata = PENDING_VOD_METADATA_COLUMNS.some((column) =>
    message.includes(column),
  );
  return (
    mentionsVodMetadata &&
    (message.includes("no such column") ||
      message.includes("no column named") ||
      message.includes("pending_schedules"))
  );
};

const warnPendingVodMetadataFallback = () => {
  console.warn(
    "[settings] pending_schedules VOD metadata columns are missing; using legacy pending schedule query. Run D1 migrations to store thumbnails and duration.",
  );
};

const legacyPendingScheduleFields = {
  id: pendingSchedules.id,
  member_uid: pendingSchedules.member_uid,
  member_name: pendingSchedules.member_name,
  date: pendingSchedules.date,
  start_time: pendingSchedules.start_time,
  title: pendingSchedules.title,
  status: pendingSchedules.status,
  action_type: pendingSchedules.action_type,
  existing_schedule_id: pendingSchedules.existing_schedule_id,
  previous_status: pendingSchedules.previous_status,
  previous_title: pendingSchedules.previous_title,
  vod_id: pendingSchedules.vod_id,
  vod_started_at: sql<string | null>`NULL`.as("vod_started_at"),
  vod_duration_seconds: sql<number | null>`NULL`.as("vod_duration_seconds"),
  vod_thumbnail_url: sql<string | null>`NULL`.as("vod_thumbnail_url"),
  processed_reset_at: sql<string | null>`NULL`.as("processed_reset_at"),
  created_at: pendingSchedules.created_at,
};

const selectLegacyPendingSchedules = async (db: DbInstance) =>
  (await db
    .select(legacyPendingScheduleFields)
    .from(pendingSchedules)
    .orderBy(desc(pendingSchedules.created_at))) as PendingScheduleRow[];

const selectLegacyPendingScheduleById = async (
  db: DbInstance,
  pendingId: number,
) =>
  (await db
    .select(legacyPendingScheduleFields)
    .from(pendingSchedules)
    .where(eq(pendingSchedules.id, pendingId))
    .limit(1)) as PendingScheduleRow[];

const selectPendingSchedules = async (db: DbInstance) => {
  try {
    return await db
      .select()
      .from(pendingSchedules)
      .orderBy(desc(pendingSchedules.created_at));
  } catch (error) {
    if (!isMissingPendingVodMetadataColumnError(error)) {
      throw error;
    }
    warnPendingVodMetadataFallback();
    return selectLegacyPendingSchedules(db);
  }
};

const selectPendingScheduleById = async (
  db: DbInstance,
  pendingId: number,
) => {
  try {
    return await db
      .select()
      .from(pendingSchedules)
      .where(eq(pendingSchedules.id, pendingId))
      .limit(1);
  } catch (error) {
    if (!isMissingPendingVodMetadataColumnError(error)) {
      throw error;
    }
    warnPendingVodMetadataFallback();
    return selectLegacyPendingScheduleById(db, pendingId);
  }
};

const selectPendingSchedulesByIds = async (
  db: DbInstance,
  pendingIds: number[],
) => {
  try {
    return await db
      .select()
      .from(pendingSchedules)
      .where(inArray(pendingSchedules.id, pendingIds));
  } catch (error) {
    if (!isMissingPendingVodMetadataColumnError(error)) {
      throw error;
    }
    warnPendingVodMetadataFallback();
    const idSet = new Set(pendingIds);
    const pendingList = await selectLegacyPendingSchedules(db);
    return pendingList.filter((item) => idSet.has(item.id));
  }
};

const enrichPendingSchedules = async (
  db: DbInstance,
  pendingList: PendingScheduleRow[],
) => {
  if (pendingList.length === 0) {
    return [];
  }

  const memberUids = [...new Set(pendingList.map((item) => item.member_uid))];
  const dates = [...new Set(pendingList.map((item) => item.date))];
  const existingScheduleIds = [
    ...new Set(
      pendingList
        .map((item) => item.existing_schedule_id)
        .filter(
          (scheduleId): scheduleId is number =>
            typeof scheduleId === "number" && Number.isInteger(scheduleId),
        ),
    ),
  ];

  const sameDateSchedules = await db
    .select({
      id: schedules.id,
      member_uid: schedules.member_uid,
      date: schedules.date,
      start_time: schedules.start_time,
      title: schedules.title,
      status: schedules.status,
    })
    .from(schedules)
    .where(
      and(
        inArray(schedules.member_uid, memberUids),
        inArray(schedules.date, dates),
      ),
    );

  const explicitExistingSchedules =
    existingScheduleIds.length > 0
      ? await db
          .select({
            id: schedules.id,
            member_uid: schedules.member_uid,
            date: schedules.date,
            start_time: schedules.start_time,
            title: schedules.title,
            status: schedules.status,
          })
          .from(schedules)
          .where(inArray(schedules.id, existingScheduleIds))
      : [];

  const processedLogs = (await db
    .select({
      id: updateLogs.id,
      schedule_id: updateLogs.schedule_id,
      member_uid: updateLogs.member_uid,
      schedule_date: updateLogs.schedule_date,
      action: updateLogs.action,
      title: updateLogs.title,
      previous_status: updateLogs.previous_status,
      actor_name: updateLogs.actor_name,
      created_at: updateLogs.created_at,
    })
    .from(updateLogs)
    .where(
      and(
        inArray(updateLogs.action, ["approve", "reject", "reset_processed"]),
        inArray(updateLogs.member_uid, memberUids),
        inArray(updateLogs.schedule_date, dates),
      ),
    )
    .orderBy(desc(updateLogs.created_at), desc(updateLogs.id))) as ProcessedPendingLog[];

  const schedulesByMemberDate = new Map<string, ScheduleSummary[]>();
  const schedulesById = new Map<number, ScheduleSummary>();
  const processedLogsByMemberDate = new Map<string, ProcessedPendingLog[]>();
  for (const schedule of [...sameDateSchedules, ...explicitExistingSchedules]) {
    if (!schedulesById.has(schedule.id)) {
      schedulesById.set(schedule.id, schedule);
    }
  }
  for (const schedule of sameDateSchedules) {
    const key = getScheduleKey(schedule.member_uid, schedule.date);
    const existing = schedulesByMemberDate.get(key) || [];
    existing.push(schedule);
    schedulesByMemberDate.set(key, existing);
  }
  for (const log of processedLogs) {
    if (!log.member_uid) continue;
    const key = getScheduleKey(log.member_uid, log.schedule_date);
    const existing = processedLogsByMemberDate.get(key) || [];
    existing.push(log);
    processedLogsByMemberDate.set(key, existing);
  }

  return pendingList.map((item) => {
    const columnProcessedResetAt = normalizePendingProcessedResetAt(
      item.processed_reset_at,
    );
    const sameDaySchedules =
      schedulesByMemberDate.get(getScheduleKey(item.member_uid, item.date)) ||
      [];
    const sameDayProcessedLogs =
      processedLogsByMemberDate.get(getScheduleKey(item.member_uid, item.date)) ||
      [];
    const explicitExistingSchedule = item.existing_schedule_id
      ? schedulesById.get(item.existing_schedule_id) || null
      : null;
    const existingSchedule =
      explicitExistingSchedule &&
      explicitExistingSchedule.member_uid === item.member_uid &&
      explicitExistingSchedule.date === item.date
        ? explicitExistingSchedule
        : null;
    const sameDaySchedulesWithExisting =
      existingSchedule &&
      !sameDaySchedules.some((schedule) => schedule.id === existingSchedule.id)
        ? [...sameDaySchedules, existingSchedule]
        : sameDaySchedules;
    const emptyTargetSchedule =
      (existingSchedule && isEmptyScheduleTarget(existingSchedule)
        ? existingSchedule
        : sameDaySchedulesWithExisting.find(isEmptyScheduleTarget)) || null;
    const latestResetLogAt =
      sameDayProcessedLogs.find(
        (log) =>
          log.action === "reset_processed" && isMatchingProcessedLog(item, log),
      )?.created_at ?? null;
    const processedResetAt = getLaterTimestamp(
      columnProcessedResetAt,
      latestResetLogAt,
    );
    const processedLog =
      sameDayProcessedLogs.find((log) => {
        if (!getProcessedDecision(log.action)) {
          return false;
        }
        if (!isLogAfterReset(log.created_at, processedResetAt)) {
          return false;
        }
        return isMatchingProcessedLog(item, log);
      }) || null;
    const processedDecision = processedLog
      ? getProcessedDecision(processedLog.action)
      : null;

    return {
      ...item,
      vod_started_at: normalizePendingVodStartedAt(item.vod_started_at),
      vod_duration_seconds: normalizePendingVodDuration(
        item.vod_duration_seconds,
      ),
      vod_thumbnail_url: normalizePendingVodThumbnail(item.vod_thumbnail_url),
      processed_reset_at: processedResetAt,
      has_same_day_schedule: sameDaySchedulesWithExisting.length > 0,
      same_day_schedule_count: sameDaySchedulesWithExisting.length,
      same_day_schedules: sameDaySchedulesWithExisting.map(
        toScheduleSummaryResponse,
      ),
      existing_schedule: existingSchedule
        ? toScheduleSummaryResponse(existingSchedule)
        : null,
      empty_target_schedule: emptyTargetSchedule
        ? toScheduleSummaryResponse(emptyTargetSchedule)
        : null,
      can_apply_to_empty_target: emptyTargetSchedule !== null,
      is_processed: processedDecision !== null,
      processed_decision: processedDecision,
      processed_at: processedLog?.created_at ?? null,
      processed_actor_name: processedLog?.actor_name ?? null,
    };
  });
};

const findEmptyTargetSchedule = async (
  db: DbInstance,
  item: PendingScheduleRow,
) => {
  const sameDaySchedules = await db
    .select({
      id: schedules.id,
      member_uid: schedules.member_uid,
      date: schedules.date,
      start_time: schedules.start_time,
      title: schedules.title,
      status: schedules.status,
    })
    .from(schedules)
    .where(
      and(
        eq(schedules.member_uid, item.member_uid),
        eq(schedules.date, item.date),
      ),
    );

  const existingSchedule = item.existing_schedule_id
    ? sameDaySchedules.find((schedule) => schedule.id === item.existing_schedule_id) ||
      null
    : null;

  if (existingSchedule && isEmptyScheduleTarget(existingSchedule)) {
    return existingSchedule;
  }

  return sameDaySchedules.find(isEmptyScheduleTarget) || null;
};

const isPendingApplyMode = (value: unknown): value is PendingApplyMode =>
  value === "all" || value === "time" || value === "title";

const isPendingTargetMode = (value: unknown): value is PendingTargetMode =>
  value === "update" || value === "create";

const isPendingTimeMode = (value: unknown): value is PendingTimeMode =>
  value === "nearest_hour" || value === "exact";

const hasPendingApprovalOptions = (body: Record<string, unknown>) =>
  "applyMode" in body ||
  "targetMode" in body ||
  "timeMode" in body ||
  "targetScheduleId" in body;

const parsePendingApprovalOptions = (
  body: Record<string, unknown>,
): PendingApprovalOptions | Response | null => {
  if (!hasPendingApprovalOptions(body)) {
    return null;
  }

  if (body.applyMode !== undefined && !isPendingApplyMode(body.applyMode)) {
    return badRequest("Invalid applyMode");
  }
  if (body.targetMode !== undefined && !isPendingTargetMode(body.targetMode)) {
    return badRequest("Invalid targetMode");
  }
  if (body.timeMode !== undefined && !isPendingTimeMode(body.timeMode)) {
    return badRequest("Invalid timeMode");
  }

  const targetScheduleId =
    body.targetScheduleId === undefined || body.targetScheduleId === null
      ? null
      : parseNumericId(body.targetScheduleId as string | number);

  if (body.targetScheduleId !== undefined && body.targetScheduleId !== null) {
    if (targetScheduleId === null) {
      return badRequest("Invalid targetScheduleId");
    }
  }

  return {
    applyMode: isPendingApplyMode(body.applyMode) ? body.applyMode : "all",
    targetMode: isPendingTargetMode(body.targetMode)
      ? body.targetMode
      : "update",
    timeMode: isPendingTimeMode(body.timeMode)
      ? body.timeMode
      : "nearest_hour",
    targetScheduleId,
  };
};

const getApprovalStartTime = (
  item: PendingScheduleRow,
  timeMode: PendingTimeMode,
) =>
  timeMode === "exact"
    ? item.start_time
    : roundTimeToNearestScheduleHour(item.start_time);

const approvalAppliesTime = (applyMode: PendingApplyMode) =>
  applyMode === "all" || applyMode === "time";

const approvalAppliesTitle = (applyMode: PendingApplyMode) =>
  applyMode === "all" || applyMode === "title";

const findTargetScheduleForPendingApproval = async (
  db: DbInstance,
  item: PendingScheduleRow,
  options: PendingApprovalOptions,
) => {
  const targetId = options.targetScheduleId ?? item.existing_schedule_id;
  if (!targetId) {
    return null;
  }

  const target = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, targetId))
    .limit(1);
  const schedule = target[0] ?? null;
  if (
    !schedule ||
    schedule.member_uid !== item.member_uid ||
    schedule.date !== item.date
  ) {
    return null;
  }

  return schedule;
};

const hasCreateTimeConflict = async (
  db: DbInstance,
  item: PendingScheduleRow,
  startTime: string | null,
) => {
  if (!startTime) return false;

  const pendingMinutes =
    parseInt(startTime.split(":")[0]) * 60 +
    parseInt(startTime.split(":")[1]);
  const existingSchedules = await db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.member_uid, item.member_uid),
        eq(schedules.date, item.date),
      ),
    );

  return existingSchedules.some((schedule) => {
    if (!schedule.start_time) return false;
    const scheduleMinutes =
      parseInt(schedule.start_time.split(":")[0]) * 60 +
      parseInt(schedule.start_time.split(":")[1]);
    return Math.abs(pendingMinutes - scheduleMinutes) <= 30;
  });
};

const approvePendingWithOptions = async (
  db: DbInstance,
  item: PendingScheduleRow,
  options: PendingApprovalOptions,
): Promise<PendingApprovalResult | Response> => {
  const nextStartTime = approvalAppliesTime(options.applyMode)
    ? getApprovalStartTime(item, options.timeMode)
    : null;
  const nextTitle = approvalAppliesTitle(options.applyMode) ? item.title : null;

  if (options.targetMode === "create") {
    if (await hasCreateTimeConflict(db, item, nextStartTime)) {
      return Response.json(
        {
          success: false,
          error: "conflict",
          message: "이미 비슷한 시간에 스케줄이 존재합니다.",
        },
        { status: 409 },
      );
    }

    await db.insert(schedules).values({
      member_uid: item.member_uid,
      date: item.date,
      start_time: nextStartTime,
      title: nextTitle,
      status: item.status,
    });

    const created = await db
      .select({ id: schedules.id })
      .from(schedules)
      .where(
        and(
          eq(schedules.member_uid, item.member_uid),
          eq(schedules.date, item.date),
          nextStartTime
            ? eq(schedules.start_time, nextStartTime)
            : isNull(schedules.start_time),
          nextTitle ? eq(schedules.title, nextTitle) : isNull(schedules.title),
        ),
      )
      .orderBy(desc(schedules.id))
      .limit(1);

    return {
      action: "create",
      scheduleId: created[0]?.id ?? null,
      previousStatus: null,
    };
  }

  const targetSchedule = await findTargetScheduleForPendingApproval(
    db,
    item,
    options,
  );
  if (!targetSchedule) {
    return Response.json(
      {
        success: false,
        error: "not_found",
        message: "수정 대상 스케줄을 찾을 수 없습니다.",
      },
      { status: 404 },
    );
  }

  const updates: Partial<typeof schedules.$inferInsert> = {};
  if (approvalAppliesTime(options.applyMode)) {
    updates.start_time = nextStartTime;
  }
  if (approvalAppliesTitle(options.applyMode)) {
    updates.title = nextTitle;
  }
  if (options.applyMode === "all") {
    updates.status = item.status;
  }

  if (Object.keys(updates).length === 0) {
    return badRequest("No fields selected to apply");
  }

  await db
    .update(schedules)
    .set(updates)
    .where(eq(schedules.id, targetSchedule.id));

  return {
    action: "update",
    scheduleId: targetSchedule.id,
    previousStatus: targetSchedule.status,
  };
};

export const handleSettings = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);
  const actor = getActorInfo(request);

  // 관리자 설정 화면에서 노출하는 설정 키만 허용
  const ALLOWED_SETTINGS = [
    "auto_update_enabled",
    "auto_update_interval_hours",
    "auto_update_last_run",
    "auto_update_range_days",
    "x_rich_link_preview_enabled",
  ] as const;

  // GET /api/settings/logs - 로그 조회 (더 구체적인 경로를 먼저 처리)
  if (request.method === "GET" && url.pathname === "/api/settings/logs") {
    const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");
    const sort = url.searchParams.get("sort") || "created_desc";
    const isPagedMode = pageParam !== null || pageSizeParam !== null;
    const action = url.searchParams.get("action");
    const member = url.searchParams.get("member");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const query = url.searchParams.get("query");

    const filters: SQL[] = [];
    if (action && action !== "all") {
      filters.push(eq(updateLogs.action, action));
    }
    if (member) {
      const memberQuery = `%${member.toLowerCase()}%`;
      filters.push(
        sql`lower(coalesce(${updateLogs.member_name}, '')) like ${memberQuery}`,
      );
    }
    if (dateFrom && dateTo) {
      filters.push(between(updateLogs.schedule_date, dateFrom, dateTo));
    } else if (dateFrom) {
      filters.push(gte(updateLogs.schedule_date, dateFrom));
    } else if (dateTo) {
      filters.push(lte(updateLogs.schedule_date, dateTo));
    }
    if (query) {
      const searchQuery = `%${query.toLowerCase()}%`;
      filters.push(
        sql`(
          lower(coalesce(${updateLogs.title}, '')) like ${searchQuery}
          or lower(coalesce(${updateLogs.member_name}, '')) like ${searchQuery}
        )`,
      );
    }

    let logQuery = db.select().from(updateLogs).$dynamic();
    if (filters.length > 0) {
      logQuery = logQuery.where(and(...filters));
    }

    if (!isPagedMode) {
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 1000)
        : 50;
      const logsData = await logQuery
        .orderBy(desc(updateLogs.created_at), desc(updateLogs.id))
        .limit(limit);
      return Response.json(logsData);
    }

    const pageRaw = parseInt(pageParam || "1", 10);
    const pageSizeRaw = parseInt(pageSizeParam || "50", 10);
    const page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
    const pageSize = Number.isFinite(pageSizeRaw)
      ? Math.min(Math.max(pageSizeRaw, 1), 200)
      : 50;
    const offset = (page - 1) * pageSize;

    let countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(updateLogs)
      .$dynamic();
    if (filters.length > 0) {
      countQuery = countQuery.where(and(...filters));
    }
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count ?? 0);
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    let pagedQuery = logQuery;
    if (sort === "created_asc") {
      pagedQuery = pagedQuery.orderBy(
        asc(updateLogs.created_at),
        asc(updateLogs.id),
      );
    } else if (sort === "schedule_desc") {
      pagedQuery = pagedQuery.orderBy(
        desc(updateLogs.schedule_date),
        desc(updateLogs.created_at),
        desc(updateLogs.id),
      );
    } else if (sort === "schedule_asc") {
      pagedQuery = pagedQuery.orderBy(
        asc(updateLogs.schedule_date),
        asc(updateLogs.created_at),
        asc(updateLogs.id),
      );
    } else if (sort === "action_asc") {
      pagedQuery = pagedQuery.orderBy(
        asc(updateLogs.action),
        desc(updateLogs.created_at),
        desc(updateLogs.id),
      );
    } else {
      pagedQuery = pagedQuery.orderBy(
        desc(updateLogs.created_at),
        desc(updateLogs.id),
      );
    }

    const items = await pagedQuery.limit(pageSize).offset(offset);
    return Response.json({
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    });
  }

  // GET /api/settings - 설정 조회
  if (request.method === "GET" && url.pathname === "/api/settings") {
    const data = await db
      .select()
      .from(settings)
      .where(inArray(settings.key, [...ALLOWED_SETTINGS]));

    // 키-값 객체로 변환
    const settingsObj: Record<string, string | null> = {};
    for (const row of data) {
      settingsObj[row.key] = row.value;
    }
    settingsObj.x_rich_link_preview_enabled ??= "true";
    const normalizedIntervalHours = normalizeAutoUpdateIntervalHours(
      settingsObj.auto_update_interval_hours,
    );
    if (settingsObj.auto_update_interval_hours !== normalizedIntervalHours) {
      await updateSetting(
        db,
        "auto_update_interval_hours",
        normalizedIntervalHours,
      );
      settingsObj.auto_update_interval_hours = normalizedIntervalHours;
    }
    return Response.json(settingsObj);
  }

  if (request.method === "PUT") {
    const body = (await request.json()) as Record<string, string>;

    // 허용된 키만 업데이트
    const updates: Promise<void>[] = [];
    for (const key of ALLOWED_SETTINGS) {
      if (key in body && key !== "auto_update_last_run") {
        if (
          key === "auto_update_interval_hours" &&
          !isAutoUpdateIntervalHours(body[key])
        ) {
          return badRequest("Invalid auto_update_interval_hours");
        }
        if (
          key === "x_rich_link_preview_enabled" &&
          body[key] !== "true" &&
          body[key] !== "false"
        ) {
          return badRequest("Invalid x_rich_link_preview_enabled");
        }
        // last_run은 시스템에서만 업데이트
        updates.push(updateSetting(db, key, body[key]));
      }
    }

    if (updates.length === 0) {
      return badRequest("No valid settings to update");
    }

    await Promise.all(updates);
    return new Response("Settings updated", { status: 200 });
  }

  // POST /api/settings/run-now - 수동 실행
  if (request.method === "POST" && url.pathname === "/api/settings/run-now") {
    try {
      // 날짜 범위 설정 가져오기
      const rangeDaysStr = await getSetting(db, "auto_update_range_days");
      const rangeDays = parseInt(rangeDaysStr || "3", 10);

      const result = await autoUpdateSchedules(db, rangeDays);
      await updateSetting(db, "auto_update_last_run", Date.now().toString());
      return Response.json({
        success: true,
        updated: result.updated,
        checked: result.checked,
        details: result.details,
      });
    } catch (error) {
      console.error("Manual auto update failed:", error);
      const today = new Date().toISOString().slice(0, 10);
      await insertUpdateLog(db, {
        scheduleId: null,
        memberUid: null,
        memberName: null,
        scheduleDate: today,
        action: "auto_failed",
        title: "manual auto update failed",
        previousStatus: null,
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorIp: actor.actorIp,
      });
      return new Response("Auto update failed", { status: 500 });
    }
  }

  // DELETE /api/settings/logs/:id - 로그만 삭제 (스케줄 연동 제외)
  if (
    request.method === "DELETE" &&
    url.pathname.startsWith("/api/settings/logs/")
  ) {
    const logId = url.pathname.split("/").pop();
    if (!logId) {
      return badRequest("Log ID is required");
    }
    const numericId = parseNumericId(logId);
    if (numericId === null) {
      return badRequest("Invalid log ID");
    }

    // 로그 삭제 (스케줄 삭제 연동 제외)
    await db.delete(updateLogs).where(eq(updateLogs.id, numericId));

    return Response.json({ success: true });
  }

  // GET /api/settings/pending - 대기 스케줄 목록 조회
  if (request.method === "GET" && url.pathname === "/api/settings/pending") {
    const pendingList = await selectPendingSchedules(db);
    const enrichedList = await enrichPendingSchedules(db, pendingList);
    return Response.json(enrichedList);
  }

  // POST /api/settings/pending/:id/reset-processed - 처리 완료 판정 리셋
  if (
    request.method === "POST" &&
    url.pathname.match(/^\/api\/settings\/pending\/\d+\/reset-processed$/)
  ) {
    const pathParts = url.pathname.split("/");
    const pendingId = parseNumericId(pathParts[4]);
    if (pendingId === null) {
      return badRequest("Invalid pending ID");
    }

    const pending = await selectPendingScheduleById(db, pendingId);
    if (pending.length === 0) {
      return new Response("Pending schedule not found", { status: 404 });
    }

    const resetAt = new Date().toISOString();
    try {
      await db
        .update(pendingSchedules)
        .set({ processed_reset_at: resetAt })
        .where(eq(pendingSchedules.id, pendingId));
    } catch (error) {
      if (isMissingPendingVodMetadataColumnError(error)) {
        console.warn(
          "[settings] processed_reset_at column is missing; storing reset state in update_logs only.",
        );
      } else {
        throw error;
      }
    }

    await insertUpdateLog(db, {
      scheduleId: pending[0].existing_schedule_id,
      memberUid: pending[0].member_uid,
      memberName: pending[0].member_name,
      scheduleDate: pending[0].date,
      action: "reset_processed",
      title: pending[0].title,
      previousStatus: `pending:${pending[0].id}`,
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
    });

    return Response.json({ success: true, resetAt });
  }

  // POST /api/settings/pending/:id/apply-empty-target - 빈 기존 스케줄에 수집 항목 반영
  if (
    request.method === "POST" &&
    url.pathname.match(/^\/api\/settings\/pending\/\d+\/apply-empty-target$/)
  ) {
    const pathParts = url.pathname.split("/");
    const pendingId = parseNumericId(pathParts[4]);
    if (pendingId === null) {
      return badRequest("Invalid pending ID");
    }

    const pending = await selectPendingScheduleById(db, pendingId);

    if (pending.length === 0) {
      return new Response("Pending schedule not found", { status: 404 });
    }

    const item = pending[0];

    try {
      const targetSchedule = await findEmptyTargetSchedule(db, item);

      if (!targetSchedule) {
        return Response.json(
          {
            success: false,
            error: "no_empty_target",
            message:
              "제목과 방송 시작 시간이 모두 비어 있는 기존 스케줄을 찾을 수 없습니다.",
          },
          { status: 409 },
        );
      }

      const result = await db
        .update(schedules)
        .set({
          start_time: item.start_time,
          title: item.title,
          status: item.status,
        })
        .where(eq(schedules.id, targetSchedule.id));

      if (!result.success) {
        return new Response("Failed to update target schedule", { status: 500 });
      }

      await insertUpdateLog(db, {
        scheduleId: targetSchedule.id,
        memberUid: item.member_uid,
        memberName: item.member_name,
        scheduleDate: item.date,
        action: "approve",
        title: item.title,
        previousStatus: targetSchedule.status,
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorIp: actor.actorIp,
      });

      await db
        .delete(pendingSchedules)
        .where(eq(pendingSchedules.id, pendingId));

      return Response.json({
        success: true,
        scheduleId: targetSchedule.id,
      });
    } catch (error) {
      console.error("Failed to apply pending schedule to empty target:", error);
      return new Response("Failed to apply pending schedule", { status: 500 });
    }
  }

  // POST /api/settings/pending/:id/approve - 개별 승인
  if (
    request.method === "POST" &&
    url.pathname.match(/^\/api\/settings\/pending\/\d+\/approve$/)
  ) {
    const pathParts = url.pathname.split("/");
    const pendingId = parseNumericId(pathParts[4]);
    if (pendingId === null) {
      return badRequest("Invalid pending ID");
    }

    // 대기 스케줄 조회
    const pending = await selectPendingScheduleById(db, pendingId);

    if (pending.length === 0) {
      return new Response("Pending schedule not found", { status: 404 });
    }

    const item = pending[0];

    try {
      const requestBody = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const approvalOptions = parsePendingApprovalOptions(requestBody);
      if (approvalOptions instanceof Response) {
        return approvalOptions;
      }
      if (approvalOptions) {
        const approvalResult = await approvePendingWithOptions(
          db,
          item,
          approvalOptions,
        );
        if (approvalResult instanceof Response) {
          return approvalResult;
        }

        await insertUpdateLog(db, {
          scheduleId: approvalResult.scheduleId,
          memberUid: item.member_uid,
          memberName: item.member_name,
          scheduleDate: item.date,
          action: "approve",
          title: item.title,
          previousStatus: approvalResult.previousStatus,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorIp: actor.actorIp,
        });

        await db
          .delete(pendingSchedules)
          .where(eq(pendingSchedules.id, pendingId));

        return Response.json({
          success: true,
          action: approvalResult.action,
          scheduleId: approvalResult.scheduleId,
        });
      }

      let createdScheduleId: number | null = null;
      if (item.action_type === "create") {
        // 충돌 감지: 같은 멤버, 같은 날짜에 비슷한 시간의 스케줄이 있는지 확인
        const existingSchedules = await db
          .select()
          .from(schedules)
          .where(
            and(
              eq(schedules.member_uid, item.member_uid),
              eq(schedules.date, item.date),
            ),
          );

        // 시간 충돌 검사 (±30분 이내)
        if (item.start_time) {
          const pendingMinutes =
            parseInt(item.start_time.split(":")[0]) * 60 +
            parseInt(item.start_time.split(":")[1]);

          const conflicting = existingSchedules.find((s) => {
            if (!s.start_time) return false;
            const scheduleMinutes =
              parseInt(s.start_time.split(":")[0]) * 60 +
              parseInt(s.start_time.split(":")[1]);
            return Math.abs(pendingMinutes - scheduleMinutes) <= 30;
          });

          if (conflicting) {
            return Response.json(
              {
                success: false,
                error: "conflict",
                message: `이미 비슷한 시간(${conflicting.start_time})에 스케줄이 존재합니다.`,
                conflictingScheduleId: conflicting.id,
              },
              { status: 409 },
            );
          }
        }

        // 신규 생성: schedules 테이블에 삽입
        await db.insert(schedules).values({
          member_uid: item.member_uid,
          date: item.date,
          start_time: item.start_time,
          title: item.title,
          status: item.status,
        });
        const created = await db
          .select({ id: schedules.id })
          .from(schedules)
          .where(
            and(
              eq(schedules.member_uid, item.member_uid),
              eq(schedules.date, item.date),
              item.start_time
                ? eq(schedules.start_time, item.start_time)
                : isNull(schedules.start_time),
              item.title
                ? eq(schedules.title, item.title)
                : isNull(schedules.title),
            ),
          )
          .orderBy(desc(schedules.id))
          .limit(1);
        createdScheduleId = created[0]?.id ?? null;
      } else if (item.action_type === "update" && item.existing_schedule_id) {
        // 정합성 검사: 대상 스케줄이 아직 존재하는지 확인
        const targetSchedule = await db
          .select()
          .from(schedules)
          .where(eq(schedules.id, item.existing_schedule_id))
          .limit(1);

        if (targetSchedule.length === 0) {
          return Response.json(
            {
              success: false,
              error: "not_found",
              message: "수정 대상 스케줄이 이미 삭제되었습니다.",
            },
            { status: 404 },
          );
        }

        // 업데이트: 기존 스케줄 수정
        await db
          .update(schedules)
          .set({
            start_time: item.start_time,
            title: item.title,
            status: item.status,
          })
          .where(eq(schedules.id, item.existing_schedule_id));
      }

      await insertUpdateLog(db, {
        scheduleId: item.existing_schedule_id ?? createdScheduleId,
        memberUid: item.member_uid,
        memberName: item.member_name,
        scheduleDate: item.date,
        action: "approve",
        title: item.title,
        previousStatus: item.previous_status,
        actorId: actor.actorId,
        actorName: actor.actorName,
        actorIp: actor.actorIp,
      });

      // 대기 스케줄 삭제
      await db
        .delete(pendingSchedules)
        .where(eq(pendingSchedules.id, pendingId));

      return Response.json({ success: true, action: item.action_type });
    } catch (error) {
      console.error("Failed to approve pending schedule:", error);
      return new Response("Failed to approve", { status: 500 });
    }
  }

  // POST /api/settings/pending/:id/reject - 개별 거부
  if (
    request.method === "POST" &&
    url.pathname.match(/^\/api\/settings\/pending\/\d+\/reject$/)
  ) {
    const pathParts = url.pathname.split("/");
    const pendingId = parseNumericId(pathParts[4]);
    if (pendingId === null) {
      return badRequest("Invalid pending ID");
    }

    // 대기 스케줄 조회
    const pending = await selectPendingScheduleById(db, pendingId);

    if (pending.length === 0) {
      return new Response("Pending schedule not found", { status: 404 });
    }

    const item = pending[0];

    await insertUpdateLog(db, {
      scheduleId: item.existing_schedule_id,
      memberUid: item.member_uid,
      memberName: item.member_name,
      scheduleDate: item.date,
      action: "reject",
      title: item.title,
      previousStatus: item.previous_status,
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorIp: actor.actorIp,
    });

    // 대기 스케줄 삭제
    await db.delete(pendingSchedules).where(eq(pendingSchedules.id, pendingId));

    return Response.json({ success: true });
  }

  // POST /api/settings/pending/approve-selected - 선택 승인
  if (
    request.method === "POST" &&
    url.pathname === "/api/settings/pending/approve-selected"
  ) {
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
    } | null;
    if (!body || !Array.isArray(body.ids)) {
      return badRequest("ids array is required");
    }

    const targetIds = [...new Set(body.ids)]
      .map((value) => parseNumericId(value as string | number))
      .filter((value): value is number => value !== null);

    if (targetIds.length === 0) {
      return badRequest("No valid pending IDs");
    }

    const pendingList = await selectPendingSchedulesByIds(db, targetIds);
    const pendingMap = new Map(pendingList.map((item) => [item.id, item]));

    const results = await pMap(
      targetIds,
      async (pendingId) => {
        const item = pendingMap.get(pendingId);
        if (!item) {
          return {
            id: pendingId,
            success: false as const,
            error: "not_found",
            message: "대기 스케줄을 찾을 수 없습니다.",
          };
        }

        try {
          let createdScheduleId: number | null = null;

          if (item.action_type === "create") {
            const existingSchedules = await db
              .select()
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date),
                ),
              );

            if (item.start_time) {
              const pendingMinutes =
                parseInt(item.start_time.split(":")[0]) * 60 +
                parseInt(item.start_time.split(":")[1]);
              const conflicting = existingSchedules.find((s) => {
                if (!s.start_time) return false;
                const scheduleMinutes =
                  parseInt(s.start_time.split(":")[0]) * 60 +
                  parseInt(s.start_time.split(":")[1]);
                return Math.abs(pendingMinutes - scheduleMinutes) <= 30;
              });

              if (conflicting) {
                return {
                  id: item.id,
                  success: false as const,
                  error: "conflict",
                  message: `이미 비슷한 시간(${conflicting.start_time})에 스케줄이 존재합니다.`,
                };
              }
            }

            await db.insert(schedules).values({
              member_uid: item.member_uid,
              date: item.date,
              start_time: item.start_time,
              title: item.title,
              status: item.status,
            });

            const created = await db
              .select({ id: schedules.id })
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date),
                  item.start_time
                    ? eq(schedules.start_time, item.start_time)
                    : isNull(schedules.start_time),
                  item.title
                    ? eq(schedules.title, item.title)
                    : isNull(schedules.title),
                ),
              )
              .orderBy(desc(schedules.id))
              .limit(1);

            createdScheduleId = created[0]?.id ?? null;
          } else if (item.action_type === "update" && item.existing_schedule_id) {
            const targetSchedule = await db
              .select()
              .from(schedules)
              .where(eq(schedules.id, item.existing_schedule_id))
              .limit(1);

            if (targetSchedule.length === 0) {
              return {
                id: item.id,
                success: false as const,
                error: "not_found",
                message: "수정 대상 스케줄이 이미 삭제되었습니다.",
              };
            }

            await db
              .update(schedules)
              .set({
                start_time: item.start_time,
                title: item.title,
                status: item.status,
              })
              .where(eq(schedules.id, item.existing_schedule_id));
          }

          await insertUpdateLog(db, {
            scheduleId: item.existing_schedule_id ?? createdScheduleId,
            memberUid: item.member_uid,
            memberName: item.member_name,
            scheduleDate: item.date,
            action: "approve",
            title: item.title,
            previousStatus: item.previous_status,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });

          await db
            .delete(pendingSchedules)
            .where(eq(pendingSchedules.id, pendingId));

          return {
            id: pendingId,
            success: true as const,
            action: item.action_type,
          };
        } catch (error) {
          console.error(`Failed to approve selected pending ${pendingId}:`, error);
          return {
            id: pendingId,
            success: false as const,
            error: "error",
            message: "승인 처리 중 오류가 발생했습니다.",
          };
        }
      },
      5,
    );

    const successCount = results.filter((result) => result.success).length;
    return Response.json({
      success: true,
      totalRequested: targetIds.length,
      successCount,
      failedCount: targetIds.length - successCount,
      results,
    });
  }

  // POST /api/settings/pending/reject-selected - 선택 거부
  if (
    request.method === "POST" &&
    url.pathname === "/api/settings/pending/reject-selected"
  ) {
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
    } | null;
    if (!body || !Array.isArray(body.ids)) {
      return badRequest("ids array is required");
    }

    const targetIds = [...new Set(body.ids)]
      .map((value) => parseNumericId(value as string | number))
      .filter((value): value is number => value !== null);

    if (targetIds.length === 0) {
      return badRequest("No valid pending IDs");
    }

    const pendingList = await selectPendingSchedulesByIds(db, targetIds);
    const pendingMap = new Map(pendingList.map((item) => [item.id, item]));

    const results = await pMap(
      targetIds,
      async (pendingId) => {
        const item = pendingMap.get(pendingId);
        if (!item) {
          return {
            id: pendingId,
            success: false as const,
            error: "not_found",
            message: "대기 스케줄을 찾을 수 없습니다.",
          };
        }

        try {
          await insertUpdateLog(db, {
            scheduleId: item.existing_schedule_id,
            memberUid: item.member_uid,
            memberName: item.member_name,
            scheduleDate: item.date,
            action: "reject",
            title: item.title,
            previousStatus: item.previous_status,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });

          await db
            .delete(pendingSchedules)
            .where(eq(pendingSchedules.id, pendingId));

          return {
            id: pendingId,
            success: true as const,
            action: "reject",
          };
        } catch (error) {
          console.error(`Failed to reject selected pending ${pendingId}:`, error);
          return {
            id: pendingId,
            success: false as const,
            error: "error",
            message: "거부 처리 중 오류가 발생했습니다.",
          };
        }
      },
      10,
    );

    const successCount = results.filter((result) => result.success).length;
    return Response.json({
      success: true,
      totalRequested: targetIds.length,
      successCount,
      failedCount: targetIds.length - successCount,
      results,
    });
  }

  // POST /api/settings/pending/approve-all - 전체 승인
  if (
    request.method === "POST" &&
    url.pathname === "/api/settings/pending/approve-all"
  ) {
    const allPending = await selectPendingSchedules(db);

    let approvedCount = 0;
    let skippedCount = 0;
    const skippedItems: { id: number; reason: string }[] = [];

    const results = await pMap(
      allPending,
      async (item) => {
        try {
          let createdScheduleId: number | null = null;
          if (item.action_type === "create") {
            // 충돌 감지
            const existingSchedules = await db
              .select()
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date),
                ),
              );

            let hasConflict = false;
            if (item.start_time) {
              const pendingMinutes =
                parseInt(item.start_time.split(":")[0]) * 60 +
                parseInt(item.start_time.split(":")[1]);

              hasConflict = existingSchedules.some((s) => {
                if (!s.start_time) return false;
                const scheduleMinutes =
                  parseInt(s.start_time.split(":")[0]) * 60 +
                  parseInt(s.start_time.split(":")[1]);
                return Math.abs(pendingMinutes - scheduleMinutes) <= 30;
              });
            }

            if (hasConflict) {
              return { success: false, id: item.id, reason: "conflict" };
            }

            await db.insert(schedules).values({
              member_uid: item.member_uid,
              date: item.date,
              start_time: item.start_time,
              title: item.title,
              status: item.status,
            });
            const created = await db
              .select({ id: schedules.id })
              .from(schedules)
              .where(
                and(
                  eq(schedules.member_uid, item.member_uid),
                  eq(schedules.date, item.date),
                  item.start_time
                    ? eq(schedules.start_time, item.start_time)
                    : isNull(schedules.start_time),
                  item.title
                    ? eq(schedules.title, item.title)
                    : isNull(schedules.title),
                ),
              )
              .orderBy(desc(schedules.id))
              .limit(1);
            createdScheduleId = created[0]?.id ?? null;
          } else if (
            item.action_type === "update" &&
            item.existing_schedule_id
          ) {
            // 정합성 검사
            const targetSchedule = await db
              .select()
              .from(schedules)
              .where(eq(schedules.id, item.existing_schedule_id))
              .limit(1);

            if (targetSchedule.length === 0) {
              return { success: false, id: item.id, reason: "not_found" };
            }

            await db
              .update(schedules)
              .set({
                start_time: item.start_time,
                title: item.title,
                status: item.status,
              })
              .where(eq(schedules.id, item.existing_schedule_id));
          }

          await insertUpdateLog(db, {
            scheduleId: item.existing_schedule_id ?? createdScheduleId,
            memberUid: item.member_uid,
            memberName: item.member_name,
            scheduleDate: item.date,
            action: "approve",
            title: item.title,
            previousStatus: item.previous_status,
            actorId: actor.actorId,
            actorName: actor.actorName,
            actorIp: actor.actorIp,
          });

          // 승인된 항목 삭제
          await db
            .delete(pendingSchedules)
            .where(eq(pendingSchedules.id, item.id));

          return { success: true, id: item.id };
        } catch (error) {
          console.error(`Failed to approve pending ${item.id}:`, error);
          return { success: false, id: item.id, reason: "error" };
        }
      },
      1,
    );

    for (const res of results) {
      if (res.success) {
        approvedCount++;
      } else {
        skippedCount++;
        skippedItems.push({ id: res.id, reason: res.reason || "unknown" });
      }
    }

    return Response.json({
      success: true,
      approvedCount,
      skippedCount,
      skippedItems: skippedItems.length > 0 ? skippedItems : undefined,
    });
  }

  // POST /api/settings/pending/reject-all - 전체 거부
  if (
    request.method === "POST" &&
    url.pathname === "/api/settings/pending/reject-all"
  ) {
    const allPending = await selectPendingSchedules(db);

    await pMap(
      allPending,
      async (item) => {
        await insertUpdateLog(db, {
          scheduleId: item.existing_schedule_id,
          memberUid: item.member_uid,
          memberName: item.member_name,
          scheduleDate: item.date,
          action: "reject",
          title: item.title,
          previousStatus: item.previous_status,
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorIp: actor.actorIp,
        });
      },
      10,
    );

    // 모든 대기 스케줄 삭제
    await db.delete(pendingSchedules);

    return Response.json({
      success: true,
      rejectedCount: allPending.length,
    });
  }

  return new Response(null, { status: 404 });
};
