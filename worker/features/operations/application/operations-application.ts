import type {
  ScheduledJobStatus,
  ScheduledJobType,
} from "@contracts/scheduled-operations";

export type OperationsActor = {
  actorId: string | null;
  actorName: string | null;
  actorIp: string | null;
};

export type OperationRunRetryResult =
  | { kind: "accepted"; run: unknown }
  | { kind: "not_found" }
  | { kind: "not_retryable"; status: ScheduledJobStatus };

export interface OperationsApplication {
  getStatus(windowHours: number): Promise<unknown>;
  getD1Observability(): Promise<unknown>;
  getJobSummaries(): Promise<unknown>;
  checkNaverCafe(actor: OperationsActor): Promise<unknown>;
  getDataRetentionStatus(): Promise<unknown>;
  pruneDataRetention(
    dryRun: boolean,
    actor: OperationsActor,
  ): Promise<unknown>;
  createRun(
    jobType: ScheduledJobType,
    actor: OperationsActor,
    idempotencyKey?: string | null,
  ): Promise<unknown>;
  getRun(runId: string): Promise<unknown>;
  listRuns(input: {
    jobType?: ScheduledJobType;
    status?: ScheduledJobStatus;
    limit: number;
  }): Promise<unknown>;
  retryRun(runId: string): Promise<OperationRunRetryResult>;
}
