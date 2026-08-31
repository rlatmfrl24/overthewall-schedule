import {
  isScheduledJobType,
  type ScheduledOperationsWorkflowParams,
} from "@contracts/scheduled-operations";
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { ScheduledJobCoordinator } from "../features/scheduled-operations";
import type { Env } from "../platform/types";

export class ScheduledOperationsWorkflow extends WorkflowEntrypoint<
  Env,
  ScheduledOperationsWorkflowParams
> {
  async run(
    event: Readonly<WorkflowEvent<ScheduledOperationsWorkflowParams>>,
    step: WorkflowStep,
  ) {
    const { jobType, scheduledFor } = event.payload;
    if (
      !isScheduledJobType(jobType) ||
      !Number.isFinite(scheduledFor) ||
      scheduledFor <= 0
    ) {
      throw new Error("Invalid scheduled operations Workflow payload");
    }
    return step.do(
      `coordinate-${jobType}`,
      {
        retries: { limit: 2, delay: "1 minute", backoff: "exponential" },
        timeout: "1 minute",
      },
      () => new ScheduledJobCoordinator(this.env).runScheduled(
        jobType,
        scheduledFor,
      ),
    );
  }
}
