import { autoUpdateRuns } from "@db/schema";
import type { AutoUpdateDetail } from "../../../platform/types";
import type { DbInstance } from "../../../platform/db";
import { updateSetting } from "../../../platform/http-helpers";
import { autoUpdateSchedules } from "./auto-update";

type AutoUpdateRunSource = "scheduled" | "manual";

type AutoUpdateRunActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorIp?: string | null;
};

type AutoUpdateRunOptions = {
  source: AutoUpdateRunSource;
  rangeDays: number;
  actor?: AutoUpdateRunActor;
  cacheDb?: Pick<D1Database, "prepare">;
  skipScan?: boolean;
};

export type AutoUpdateResult = Awaited<ReturnType<typeof autoUpdateSchedules>>;

type AutoUpdateHistoryOptions = Pick<
  AutoUpdateRunOptions,
  "source" | "rangeDays" | "actor"
>;

const getErrorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const summarizeDetails = (details: AutoUpdateDetail[]) => ({
  createdCount: details.filter((detail) => detail.action === "auto_collected")
    .length,
  updatedCount: details.filter((detail) => detail.action === "auto_updated")
    .length,
  existingCount: details.filter((detail) => detail.action === "existing").length,
});

const serializeDetail = (result: AutoUpdateResult) =>
  JSON.stringify({
    details: result.details,
  });

export const recordAutoUpdateResultWithHistory = async (
  db: DbInstance,
  options: AutoUpdateHistoryOptions,
  result: AutoUpdateResult,
  startedAt: number,
) => {
  const finishedAt = Date.now();
  const summary = summarizeDetails(result.details);

  await db.insert(autoUpdateRuns).values({
    source: options.source,
    status: "success",
    started_at: startedAt,
    finished_at: finishedAt,
    range_days: options.rangeDays,
    checked_count: result.checked,
    segment_count: result.segmentCount,
    session_count: result.sessionCount,
    resume_merged_count: result.resumeMergedCount,
    updated_count: summary.updatedCount,
    created_count: summary.createdCount,
    existing_count: summary.existingCount,
    pending_created_count: result.updated,
    rejected_suppressed_count: result.rejectedSuppressed,
    duplicate_pending_count: result.duplicatePending,
    short_suppressed_count: result.shortSuppressed,
    holiday_suppressed_count: result.holidaySuppressed,
    ambiguous_count: result.ambiguous,
    obsolete_pending_count: result.obsoletePending,
    actor_id: options.actor?.actorId ?? null,
    actor_name: options.actor?.actorName ?? null,
    actor_ip: options.actor?.actorIp ?? null,
    error: null,
    detail: serializeDetail(result),
  });

  await updateSetting(db, "auto_update_last_run", String(finishedAt));
  return result;
};

export const runAutoUpdateWithHistory = async (
  db: DbInstance,
  options: AutoUpdateRunOptions,
): Promise<AutoUpdateResult> => {
  const startedAt = Date.now();

  try {
    const result = await autoUpdateSchedules(db, options.rangeDays, {
      cacheDb: options.cacheDb,
      ...(options.skipScan ? { skipScan: true } : {}),
    });
    return recordAutoUpdateResultWithHistory(db, options, result, startedAt);
  } catch (error) {
    const finishedAt = Date.now();

    await db.insert(autoUpdateRuns).values({
      source: options.source,
      status: "failed",
      started_at: startedAt,
      finished_at: finishedAt,
      range_days: options.rangeDays,
      checked_count: 0,
      segment_count: 0,
      session_count: 0,
      resume_merged_count: 0,
      updated_count: 0,
      created_count: 0,
      existing_count: 0,
      pending_created_count: 0,
      rejected_suppressed_count: 0,
      duplicate_pending_count: 0,
      short_suppressed_count: 0,
      holiday_suppressed_count: 0,
      ambiguous_count: 0,
      obsolete_pending_count: 0,
      actor_id: options.actor?.actorId ?? null,
      actor_name: options.actor?.actorName ?? null,
      actor_ip: options.actor?.actorIp ?? null,
      error: getErrorText(error),
      detail: null,
    });

    throw error;
  }
};
