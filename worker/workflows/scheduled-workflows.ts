import type { ScheduledJobType } from "@contracts/scheduled-operations";
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { ScheduledJobCoordinator } from "../features/scheduled-operations";
import type { Env } from "../platform/types";

abstract class ScheduledWorkflowBase extends WorkflowEntrypoint<Env> {
  protected abstract readonly jobType: ScheduledJobType;

  async run(
    event: Readonly<WorkflowEvent<unknown>>,
    step: WorkflowStep,
  ) {
    return step.do(
      `coordinate-${this.jobType}`,
      {
        retries: { limit: 2, delay: "1 minute", backoff: "exponential" },
        timeout: "1 minute",
      },
      () => new ScheduledJobCoordinator(this.env).runScheduled(
        this.jobType,
        event.timestamp.getTime(),
      ),
    );
  }
}

export class IngestionRecoveryWorkflow extends ScheduledWorkflowBase {
  protected readonly jobType = "ingestion_recovery" as const;
}

export class WebsubMaintenanceWorkflow extends ScheduledWorkflowBase {
  protected readonly jobType = "websub_maintenance" as const;
}

export class ChannelReconcileWorkflow extends ScheduledWorkflowBase {
  protected readonly jobType = "channel_reconcile" as const;
}

export class SourceHealthWorkflow extends ScheduledWorkflowBase {
  protected readonly jobType = "source_health" as const;
}

export class NaverCafeCollectionWorkflow extends ScheduledWorkflowBase {
  protected readonly jobType = "naver_cafe_collection" as const;
}

export class XCollectionWorkflow extends ScheduledWorkflowBase {
  protected readonly jobType = "x_collection" as const;
}

export class ScheduleAutoUpdateWorkflow extends ScheduledWorkflowBase {
  protected readonly jobType = "schedule_auto_update" as const;
}

export class RecentReconcileWorkflow extends ScheduledWorkflowBase {
  protected readonly jobType = "recent_reconcile" as const;
}

export class RetentionPruneWorkflow extends ScheduledWorkflowBase {
  protected readonly jobType = "retention_prune" as const;
}
