import { autoUpdateRuns } from "../../src/db/schema";
import type { AutoUpdateDetail } from "../types";
import type { DbInstance } from "../db";
import { updateSetting } from "../utils/helpers";
import { autoUpdateSchedules } from "./schedule";

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
};

type AutoUpdateResult = Awaited<ReturnType<typeof autoUpdateSchedules>>;

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

export const runAutoUpdateWithHistory = async (
  db: DbInstance,
  options: AutoUpdateRunOptions,
): Promise<AutoUpdateResult> => {
  const startedAt = Date.now();

  try {
    const result = await autoUpdateSchedules(db, options.rangeDays);
    const finishedAt = Date.now();
    const summary = summarizeDetails(result.details);

    await db.insert(autoUpdateRuns).values({
      source: options.source,
      status: "success",
      started_at: startedAt,
      finished_at: finishedAt,
      range_days: options.rangeDays,
      checked_count: result.checked,
      updated_count: summary.updatedCount,
      created_count: summary.createdCount,
      existing_count: summary.existingCount,
      pending_created_count: result.updated,
      actor_id: options.actor?.actorId ?? null,
      actor_name: options.actor?.actorName ?? null,
      actor_ip: options.actor?.actorIp ?? null,
      error: null,
      detail: serializeDetail(result),
    });

    await updateSetting(db, "auto_update_last_run", String(finishedAt));
    return result;
  } catch (error) {
    const finishedAt = Date.now();

    await db.insert(autoUpdateRuns).values({
      source: options.source,
      status: "failed",
      started_at: startedAt,
      finished_at: finishedAt,
      range_days: options.rangeDays,
      checked_count: 0,
      updated_count: 0,
      created_count: 0,
      existing_count: 0,
      pending_created_count: 0,
      actor_id: options.actor?.actorId ?? null,
      actor_name: options.actor?.actorName ?? null,
      actor_ip: options.actor?.actorIp ?? null,
      error: getErrorText(error),
      detail: null,
    });

    throw error;
  }
};
