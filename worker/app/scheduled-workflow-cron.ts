import type { ScheduledJobType } from "@contracts/scheduled-operations";
import { X_COMPLIANCE_CYCLE_MS } from "../features/x-posts";
import type { Env } from "../platform/types";

export const SCHEDULED_WORKFLOW_CRON = "3,13,23,33 * * * *";

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
  33: ["source_health", "x_metrics_refresh", "x_compliance"],
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

  if (scheduledMinute === 23 && scheduledHour % 2 === 0) {
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

type XComplianceCronGateRow = {
  dueJob: number | string;
  activeJob: number | string;
  hasPosts: number | string;
  lastCycleAt: number | string | null;
};

const isXComplianceDue = async (env: Env, scheduledTime: number) => {
  const row = await env.otw_db.prepare(
    `SELECT
       EXISTS(
         SELECT 1 FROM x_compliance_jobs
         WHERE status IN ('created', 'uploading', 'uploaded', 'pending', 'complete', 'failed')
           AND next_check_at IS NOT NULL AND next_check_at <= ?
       ) AS dueJob,
       EXISTS(
         SELECT 1 FROM x_compliance_jobs WHERE status <> 'applied'
       ) AS activeJob,
       EXISTS(
         SELECT 1 FROM x_posts
         WHERE hidden_at IS NULL AND content_removed_at IS NULL
       ) AS hasPosts,
       (SELECT value FROM settings WHERE key = 'x_compliance_last_cycle_at') AS lastCycleAt`,
  ).bind(scheduledTime).first<XComplianceCronGateRow>();
  if (Number(row?.dueJob ?? 0) > 0) return true;
  if (Number(row?.activeJob ?? 0) > 0) return false;
  if (Number(row?.hasPosts ?? 0) === 0) return false;
  return scheduledTime - Number(row?.lastCycleAt ?? 0) >= X_COMPLIANCE_CYCLE_MS;
};

export async function filterRunnableScheduledWorkflowJobs(
  jobs: readonly ScheduledJobType[],
  scheduledTime: number,
  env: Env,
): Promise<readonly ScheduledJobType[]> {
  if (jobs.length === 0) return [];
  const keys = jobs.map((jobType) => `scheduled_v2_${jobType}_enabled`);
  if (jobs.includes("x_compliance")) keys.push("x_compliance_enabled");
  const rows = await env.otw_db.prepare(
    `SELECT key, value FROM settings WHERE key IN (${keys.map(() => "?").join(", ")})`,
  ).bind(...keys).all<ScheduledWorkflowSettingRow>();
  const enabledKeys = new Set(
    rows.results
      .filter((row) => row.value === "true")
      .map((row) => row.key),
  );
  const enabledJobs = jobs.filter((jobType) =>
    enabledKeys.has(`scheduled_v2_${jobType}_enabled`) &&
    (jobType !== "x_compliance" || enabledKeys.has("x_compliance_enabled"))
  );
  if (!enabledJobs.includes("x_compliance")) return enabledJobs;
  if (await isXComplianceDue(env, scheduledTime)) return enabledJobs;
  return enabledJobs.filter((jobType) => jobType !== "x_compliance");
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
