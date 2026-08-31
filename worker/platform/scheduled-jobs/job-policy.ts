import type { ScheduledJobType } from "@contracts/scheduled-operations";

export type ScheduledLane =
  | "control"
  | "x"
  | "naver"
  | "websub"
  | "ingestion"
  | "youtube-critical"
  | "auto-update"
  | "maintenance";

export const SCHEDULED_JOB_LEASE_MS = 5 * 60_000;
// Free Queues retain messages for 24 hours. Allow one hourly recovery cycle of
// propagation grace before treating a dispatched-but-unclaimed item as lost.
export const SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS = 25 * 60 * 60_000;
export const SCHEDULED_QUEUE_DAILY_TARGET = 5_000;
export const SCHEDULED_D1_READ_DAILY_TARGET = 2_000_000;
export const SCHEDULED_D1_WRITE_DAILY_TARGET = 40_000;

export const getEstimatedD1RowsPerItem = (jobType: ScheduledJobType) => {
  const estimates: Record<
    ScheduledJobType,
    { rowsRead: number; rowsWritten: number }
  > = {
    x_collection: { rowsRead: 500, rowsWritten: 50 },
    naver_cafe_collection: { rowsRead: 500, rowsWritten: 70 },
    schedule_auto_update: { rowsRead: 1_000, rowsWritten: 100 },
    ingestion_recovery: { rowsRead: 1_000, rowsWritten: 100 },
    websub_maintenance: { rowsRead: 300, rowsWritten: 25 },
    channel_reconcile: { rowsRead: 2_000, rowsWritten: 100 },
    recent_reconcile: { rowsRead: 2_000, rowsWritten: 100 },
    source_health: { rowsRead: 1_000, rowsWritten: 30 },
    retention_prune: { rowsRead: 300, rowsWritten: 250 },
  };
  return estimates[jobType];
};

export const getLaneForJob = (jobType: ScheduledJobType): ScheduledLane => {
  switch (jobType) {
    case "x_collection":
      return "x";
    case "naver_cafe_collection":
      return "naver";
    case "schedule_auto_update":
      return "auto-update";
    case "ingestion_recovery":
      return "ingestion";
    case "websub_maintenance":
      return "websub";
    case "channel_reconcile":
    case "recent_reconcile":
    case "source_health":
      return "youtube-critical";
    case "retention_prune":
      return "maintenance";
  }
};

export const getAdmissionPriority = (
  jobType: ScheduledJobType,
): "critical" | "core" | "low" => {
  switch (jobType) {
    case "websub_maintenance":
    case "ingestion_recovery":
      return "critical";
    case "x_collection":
    case "naver_cafe_collection":
    case "schedule_auto_update":
    case "channel_reconcile":
      return "core";
    case "source_health":
    case "recent_reconcile":
    case "retention_prune":
      return "low";
  }
};

export const shouldThrottleAtUsage = (
  jobType: ScheduledJobType,
  usagePercent: number,
) => {
  const priority = getAdmissionPriority(jobType);
  if (usagePercent >= 95) return priority !== "critical";
  if (usagePercent >= 85) return priority === "low";
  if (usagePercent >= 70) {
    return jobType === "retention_prune";
  }
  return false;
};

export const getScheduledBucket = (
  jobType: ScheduledJobType,
  timestamp: number,
) => {
  const intervals: Record<ScheduledJobType, number> = {
    ingestion_recovery: 60 * 60_000,
    websub_maintenance: 60 * 60_000,
    channel_reconcile: 60 * 60_000,
    source_health: 60 * 60_000,
    naver_cafe_collection: 60 * 60_000,
    x_collection: 2 * 60 * 60_000,
    // The scheduler probes hourly so the configured 1/6/12/24-hour interval
    // can be enforced by the planner without collapsing every probe in a day.
    schedule_auto_update: 60 * 60_000,
    recent_reconcile: 24 * 60 * 60_000,
    retention_prune: 24 * 60 * 60_000,
  };
  const interval = intervals[jobType];
  return String(Math.floor(timestamp / interval) * interval);
};
