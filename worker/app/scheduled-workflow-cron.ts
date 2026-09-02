import type { ScheduledJobType } from "@contracts/scheduled-operations";
import type { Env } from "../platform/types";

export const SCHEDULED_WORKFLOW_CRON = "3,13,23,33,53 * * * *";

const MINUTE_JOBS: Readonly<Partial<Record<number, readonly ScheduledJobType[]>>> = {
  3: [
    "ingestion_recovery",
    "schedule_auto_update",
  ],
  13: [
    "websub_maintenance",
    "naver_cafe_collection",
  ],
  23: ["channel_reconcile", "youtube_feed_collection"],
  33: ["source_health"],
};

export function selectScheduledWorkflowJobs(
  cron: string,
  scheduledTime: number,
): readonly ScheduledJobType[] {
  if (cron !== SCHEDULED_WORKFLOW_CRON) return [];

  const scheduledAt = new Date(scheduledTime);
  const scheduledHour = scheduledAt.getUTCHours();
  const scheduledMinute = scheduledAt.getUTCMinutes();
  const jobs = [...(MINUTE_JOBS[scheduledMinute] ?? [])];

  if (scheduledMinute === 23 || scheduledMinute === 53) {
    jobs.push("x_collection");
  }

  if (scheduledMinute === 3 && scheduledHour === 18) {
    jobs.push("recent_reconcile", "retention_prune");
  }

  return jobs;
}

type ScheduledWorkflowSettingRow = {
  key: string;
  value: string | null;
};

type ScheduledD1WriteGateRow = {
  consumed: number | string;
  limitValue: number | string | null;
};

const hasScheduledD1WriteCapacity = async (
  env: Env,
  scheduledTime: number,
) => {
  const day = new Date(scheduledTime).toISOString().slice(0, 10);
  const row = await env.otw_db.prepare(
    `SELECT COALESCE(SUM(used + reserved), 0) AS consumed,
            MAX(limit_value) AS limitValue
     FROM scheduled_usage_daily
     WHERE day = ? AND lane = 'all' AND resource = 'd1_rows_written'`,
  ).bind(day).first<ScheduledD1WriteGateRow>();
  if (row?.limitValue === null || row?.limitValue === undefined) return true;
  return Number(row.consumed) < Number(row.limitValue);
};

export async function filterRunnableScheduledWorkflowJobs(
  jobs: readonly ScheduledJobType[],
  scheduledTime: number,
  env: Env,
): Promise<readonly ScheduledJobType[]> {
  if (jobs.length === 0) return [];
  if (!(await hasScheduledD1WriteCapacity(env, scheduledTime))) return [];
  const keys = jobs.map((jobType) => `scheduled_v2_${jobType}_enabled`);
  const rows = await env.otw_db.prepare(
    `SELECT key, value FROM settings WHERE key IN (${keys.map(() => "?").join(", ")})`,
  ).bind(...keys).all<ScheduledWorkflowSettingRow>();
  const enabledKeys = new Set(
    rows.results
      .filter((row) => row.value === "true")
      .map((row) => row.key),
  );
  return jobs.filter((jobType) =>
    enabledKeys.has(`scheduled_v2_${jobType}_enabled`)
  );
}

export async function handleScheduledWorkflowCron(
  event: ScheduledController,
  env: Env,
): Promise<void> {
  const jobs = selectScheduledWorkflowJobs(
    event.cron,
    event.scheduledTime,
  );
  if (jobs.length === 0) return;
  const workflow = env.SCHEDULED_OPERATIONS_WORKFLOW;
  if (!workflow) {
    throw new Error("Missing scheduled Workflow binding: SCHEDULED_OPERATIONS_WORKFLOW");
  }
  const runnableJobs = await filterRunnableScheduledWorkflowJobs(
    jobs,
    event.scheduledTime,
    env,
  );
  if (runnableJobs.length === 0) return;
  await Promise.all(runnableJobs.map((jobType) => workflow.create({
    params: { jobType, scheduledFor: event.scheduledTime },
  })));
}
