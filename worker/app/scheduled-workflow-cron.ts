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

const CRON_WORKFLOWS: Readonly<Record<string, readonly ScheduledWorkflowBinding[]>> = {
  "3 * * * *": [
    "INGESTION_RECOVERY_WORKFLOW",
    "SCHEDULE_AUTO_UPDATE_WORKFLOW",
  ],
  "13 * * * *": [
    "WEBSUB_MAINTENANCE_WORKFLOW",
    "NAVER_CAFE_COLLECTION_WORKFLOW",
  ],
  "23 * * * *": ["CHANNEL_RECONCILE_WORKFLOW"],
  "33 * * * *": ["SOURCE_HEALTH_WORKFLOW"],
};

export function selectScheduledWorkflowBindings(
  cron: string,
  scheduledTime: number,
): readonly ScheduledWorkflowBinding[] {
  const bindings = [...(CRON_WORKFLOWS[cron] ?? [])];
  const scheduledHour = new Date(scheduledTime).getUTCHours();

  if (cron === "23 * * * *" && scheduledHour % 2 === 0) {
    bindings.push("X_COLLECTION_WORKFLOW");
  }

  if (cron === "3 * * * *" && scheduledHour === 18) {
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
