import type { ScheduledJobType } from "@contracts/scheduled-operations";
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
  23: ["channel_reconcile"],
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

  if (scheduledMinute === 23 && scheduledHour % 2 === 0) {
    jobs.push("x_collection");
  }

  if (scheduledMinute === 3 && scheduledHour === 18) {
    jobs.push("recent_reconcile", "retention_prune");
  }

  return jobs;
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
  await Promise.all(jobs.map((jobType) => workflow.create({
    params: { jobType, scheduledFor: event.scheduledTime },
  })));
}
