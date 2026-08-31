export const scheduledJobTypes = [
  "x_collection",
  "naver_cafe_collection",
  "schedule_auto_update",
  "ingestion_recovery",
  "channel_reconcile",
  "recent_reconcile",
  "websub_maintenance",
  "source_health",
  "retention_prune",
] as const;

export type ScheduledJobType = (typeof scheduledJobTypes)[number];

export const scheduledJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "skipped",
  "throttled",
] as const;

export type ScheduledJobStatus = (typeof scheduledJobStatuses)[number];
export type ScheduledJobSource = "scheduled" | "manual";

export type OperationRunAcceptedDto = {
  runId: string;
  jobType: ScheduledJobType;
  status: "queued";
  acceptedAt: number;
  idempotencyKey: string;
  statusUrl: string;
};

export type OperationRunProgressDto = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  skipped: number;
  throttled: number;
};

export type OperationRunFailureDto = {
  itemId: string;
  targetKey: string;
  phase: string;
  code: string | null;
  message: string;
  attempts: number;
  lastAttemptAt: number;
};

export type OperationRunDto = {
  runId: string;
  jobType: ScheduledJobType;
  source: ScheduledJobSource;
  status: ScheduledJobStatus;
  idempotencyKey: string;
  scheduledFor: number | null;
  acceptedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  progress: OperationRunProgressDto;
  failures: OperationRunFailureDto[];
  summary: Record<string, unknown> | null;
  lastError: string | null;
};

export type OperationRunListDto = {
  runs: OperationRunDto[];
};

export type CreateOperationRunRequestDto = {
  jobType: ScheduledJobType;
};

export type ScheduledJobQueueMessage = {
  schemaVersion: 1;
  messageType: "scheduled_job_item";
  runId: string;
  itemId: string;
  phase: string;
};

export type ScheduledControlQueueMessage = {
  schemaVersion: 1;
  messageType: "scheduled_job_control";
  runId: string;
};

export const isScheduledJobType = (
  value: unknown,
): value is ScheduledJobType =>
  typeof value === "string" &&
  scheduledJobTypes.includes(value as ScheduledJobType);

export const isScheduledJobStatus = (
  value: unknown,
): value is ScheduledJobStatus =>
  typeof value === "string" &&
  scheduledJobStatuses.includes(value as ScheduledJobStatus);

export const isScheduledJobQueueMessage = (
  value: unknown,
): value is ScheduledJobQueueMessage => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1 &&
    record.messageType === "scheduled_job_item" &&
    typeof record.runId === "string" &&
    typeof record.itemId === "string" &&
    typeof record.phase === "string";
};

export const isScheduledControlQueueMessage = (
  value: unknown,
): value is ScheduledControlQueueMessage => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1 &&
    record.messageType === "scheduled_job_control" &&
    typeof record.runId === "string";
};
