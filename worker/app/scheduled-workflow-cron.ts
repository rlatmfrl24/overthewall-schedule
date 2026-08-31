import type { Env } from "../platform/types";

type ScheduledWorkflowBinding =
  | "INGESTION_RECOVERY_WORKFLOW"
  | "WEBSUB_MAINTENANCE_WORKFLOW"
  | "CHANNEL_RECONCILE_WORKFLOW"
  | "SOURCE_HEALTH_WORKFLOW"
  | "NAVER_CAFE_COLLECTION_WORKFLOW"
  | "X_COLLECTION_WORKFLOW"
  | "SCHEDULE_AUTO_UPDATE_WORKFLOW"
  | "RECENT_RECONCILE_WORKFLOW"
  | "RETENTION_PRUNE_WORKFLOW";

export const SCHEDULED_WORKFLOW_CRON = "3,13,23,33 * * * *";

const MINUTE_WORKFLOWS: Readonly<Record<number, readonly ScheduledWorkflowBinding[]>> = {
  3: [
    "INGESTION_RECOVERY_WORKFLOW",
    "SCHEDULE_AUTO_UPDATE_WORKFLOW",
  ],
  13: [
    "WEBSUB_MAINTENANCE_WORKFLOW",
    "NAVER_CAFE_COLLECTION_WORKFLOW",
  ],
  23: ["CHANNEL_RECONCILE_WORKFLOW"],
  33: ["SOURCE_HEALTH_WORKFLOW"],
};

export function selectScheduledWorkflowBindings(
  cron: string,
  scheduledTime: number,
): readonly ScheduledWorkflowBinding[] {
  if (cron !== SCHEDULED_WORKFLOW_CRON) return [];

  const scheduledAt = new Date(scheduledTime);
  const scheduledHour = scheduledAt.getUTCHours();
  const scheduledMinute = scheduledAt.getUTCMinutes();
  const bindings = [...(MINUTE_WORKFLOWS[scheduledMinute] ?? [])];

  if (scheduledMinute === 23 && scheduledHour % 2 === 0) {
    bindings.push("X_COLLECTION_WORKFLOW");
  }

  if (scheduledMinute === 3 && scheduledHour === 18) {
    bindings.push("RECENT_RECONCILE_WORKFLOW", "RETENTION_PRUNE_WORKFLOW");
  }

  return bindings;
}

export async function handleScheduledWorkflowCron(
  event: ScheduledController,
  env: Env,
): Promise<void> {
  const bindings = selectScheduledWorkflowBindings(
    event.cron,
    event.scheduledTime,
  );

  await Promise.all(bindings.map(async (binding) => {
    const workflow = env[binding];
    if (!workflow) {
      throw new Error(`Missing scheduled Workflow binding: ${binding}`);
    }
    await workflow.create();
  }));
}
