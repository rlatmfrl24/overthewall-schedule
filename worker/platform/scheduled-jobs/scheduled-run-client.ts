import type {
  OperationRunAcceptedDto,
  ScheduledControlQueueMessage,
  ScheduledJobStatus,
  ScheduledJobType,
} from "@contracts/scheduled-operations";
import type { Env } from "../types";
import {
  D1ScheduledJobRepository,
  type ScheduledJobActor,
} from "./d1-scheduled-job-repository";

const makeStatusUrl = (runId: string) =>
  `/api/operations/runs/${encodeURIComponent(runId)}`;

export class ScheduledRunClient {
  private readonly env: Env;
  private readonly repository: D1ScheduledJobRepository;

  constructor(env: Env) {
    this.env = env;
    this.repository = new D1ScheduledJobRepository(env.otw_db);
  }

  private async enqueueControl(runId: string) {
    const queue = this.env.OTW_OPS_CONTROL_QUEUE;
    if (!queue) {
      await this.repository.markRunFailed(
        runId,
        "scheduled_control_queue_unavailable",
      );
      throw new Error("scheduled_control_queue_unavailable");
    }
    const reserved = await this.repository.reserveQueueOperations("control");
    if (!reserved) {
      await this.repository.markRunThrottled(
        runId,
        "scheduled_queue_daily_budget_exhausted",
      );
      throw new Error("scheduled_queue_daily_budget_exhausted");
    }
    const message: ScheduledControlQueueMessage = {
      schemaVersion: 1,
      messageType: "scheduled_job_control",
      runId,
    };
    try {
      await queue.send(message, { contentType: "json" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.markRunFailed(runId, `control_queue_send_failed:${message}`);
      throw error;
    }
  }

  async createManualRun(
    jobType: ScheduledJobType,
    actor: ScheduledJobActor,
    requestedIdempotencyKey?: string | null,
  ): Promise<OperationRunAcceptedDto> {
    const idempotencyKey = requestedIdempotencyKey?.trim() ||
      `manual:${jobType}:${crypto.randomUUID()}`;
    const run = await this.repository.createRun({
      jobType,
      source: "manual",
      idempotencyKey,
      actor,
    });
    let acceptedRun = run;
    if (["failed", "partial", "throttled"].includes(run.status)) {
      const retry = await this.repository.retryRun(run.id);
      if (retry.kind === "not_found") {
        throw new Error("scheduled_run_missing_after_idempotent_replay");
      }
      if (retry.kind === "accepted") {
        acceptedRun = retry.run;
      } else if (
        !["queued", "running", "succeeded", "skipped"].includes(retry.status)
      ) {
        throw new Error(`scheduled_run_replay_not_retryable:${retry.status}`);
      }
    }
    if (acceptedRun.status === "queued") {
      await this.enqueueControl(run.id);
    }
    return {
      runId: acceptedRun.id,
      jobType: acceptedRun.job_type,
      status: "queued",
      acceptedAt: acceptedRun.accepted_at,
      idempotencyKey: acceptedRun.idempotency_key,
      statusUrl: makeStatusUrl(acceptedRun.id),
    };
  }

  getRun(runId: string) {
    return this.repository.readRunDto(runId);
  }

  listRuns(input: {
    jobType?: ScheduledJobType;
    status?: ScheduledJobStatus;
    limit: number;
  }) {
    return this.repository.listRunDtos(input);
  }

  listLatestRunsByJobType() {
    return this.repository.listLatestRunDtosByJobType();
  }

  readLatestSuccessfulRunTimes() {
    return this.repository.readLatestSuccessfulRunTimes();
  }

  async retryRun(runId: string) {
    const outcome = await this.repository.retryRun(runId);
    if (outcome.kind !== "accepted") return outcome;
    await this.enqueueControl(runId);
    return {
      kind: "accepted" as const,
      run: await this.repository.readRunDto(runId),
    };
  }
}
