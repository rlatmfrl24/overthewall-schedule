import {sql} from "drizzle-orm";
import type {SiteId} from "@contracts/site-definition";
import {prepareHolidayCollectorCommand} from "./holiday-suggestions";
import { autoUpdateRuns } from "@db/schema";
import type { AutoUpdateDetail } from "../../../platform/types";
import type { DbInstance } from "../../../platform/db";
import { updateSetting } from "../../../platform/http-helpers";
import { autoUpdateSchedules } from "./auto-update";
import type { CollectorWriter } from "./collector-writer";

type AutoUpdateRunSource = "scheduled" | "manual";

type AutoUpdateRunActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorIp?: string | null;
};

type AutoUpdateRunOptions = {
  collectorWriter?: CollectorWriter;
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
> & {holidaySiteId?:SiteId;originalItem?:{id:string;runId:string;leaseToken:string|null};failed?:boolean;error?:string|null};

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
  const original=options.originalItem;
  if(original) {
    const prior=await db.$client.prepare("SELECT result_json FROM scheduled_job_items WHERE id=? AND run_id=? AND phase='finalize'").bind(original.id,original.runId).first<string>("result_json");
    if(prior) return JSON.parse(prior) as AutoUpdateResult;
  }
  const finishedAt = Date.now();
  const summary = summarizeDetails(result.details);

  const cleanup=original&&options.holidaySiteId?prepareHolidayCollectorCommand(db.$client,{action:"holiday_obsolete",now:finishedAt,target:null},{siteId:options.holidaySiteId}):[];
  const insert=db.insert(autoUpdateRuns).values({
    source: options.source,
    status: options.failed?"failed":"success",
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
    obsolete_pending_count: cleanup.length?sql`${result.obsoletePending} + changes()`:result.obsoletePending,
    actor_id: options.actor?.actorId ?? null,
    actor_name: options.actor?.actorName ?? null,
    actor_ip: options.actor?.actorIp ?? null,
    error: options.error??null,
    detail: serializeDetail(result),
  });

  if(original) {
    const query=insert.toSQL();
    try {
      const receipts=await db.$client.batch([
        db.$client.prepare(`SELECT iif(EXISTS(SELECT 1 FROM scheduled_job_items i JOIN scheduled_job_runs r ON r.id=i.run_id
          WHERE i.id=? AND i.run_id=? AND i.phase='finalize' AND r.job_type='schedule_auto_update' AND r.source=?
          AND i.status='running' AND i.lease_token=? AND i.result_json IS NULL
          AND NOT EXISTS(SELECT 1 FROM scheduled_job_items pending WHERE pending.run_id=r.id AND pending.phase IN ('scan','match') AND pending.status IN ('queued','running'))),1,json('original_finalizer_identity_conflict'))`).bind(original.id,original.runId,options.source,original.leaseToken),
        ...cleanup.slice(0,2),
        db.$client.prepare(query.sql).bind(...query.params),
        db.$client.prepare(`UPDATE scheduled_job_items SET result_json=${cleanup.length?"json_set(?, '$.obsoletePending', (SELECT obsolete_pending_count FROM auto_update_runs WHERE id=last_insert_rowid()))":"?"} WHERE id=? AND run_id=? AND result_json IS NULL RETURNING result_json`).bind(JSON.stringify(result),original.id,original.runId),
        ...cleanup.slice(2),
        db.$client.prepare("INSERT INTO settings(key,value,updated_at) VALUES('auto_update_last_run',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(String(finishedAt),String(finishedAt)),

      ]);
      const receipt=receipts[cleanup.length?4:2].results[0] as {result_json:string}|undefined;
      if(receipt) return JSON.parse(receipt.result_json) as AutoUpdateResult;
    } catch(error) {
      const committed=await db.$client.prepare("SELECT result_json FROM scheduled_job_items WHERE id=? AND run_id=? AND phase='finalize'").bind(original.id,original.runId).first<string>("result_json");
      if(committed) return JSON.parse(committed) as AutoUpdateResult;
      throw error;
    }
    return result;
  }
  await insert;

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
      ...(options.collectorWriter ? { collectorWriter: options.collectorWriter } : {}),
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
