import type { NaverCafePostsVisibility } from "./naver-cafe";
import type { ScheduledJobType } from "./scheduled-operations";
import type { XPostsVisibility } from "./x-posts";

export type OperationsStatusLevel = "ok" | "warning" | "critical";

export interface OperationsIssueDto {
  severity: "warning" | "critical";
  code: string;
  message: string;
}

export interface AutoUpdateOperationRunDto {
  id: number;
  source: "scheduled" | "manual";
  status: "success" | "failed";
  startedAt: number;
  finishedAt: number;
  rangeDays: number;
  checkedCount: number;
  segmentCount: number;
  sessionCount: number;
  resumeMergedCount: number;
  updatedCount: number;
  createdCount: number;
  existingCount: number;
  pendingCreatedCount: number;
  rejectedSuppressedCount: number;
  duplicatePendingCount: number;
  shortSuppressedCount: number;
  holidaySuppressedCount: number;
  ambiguousCount: number;
  obsoletePendingCount: number;
  actorId: string | null;
  actorName: string | null;
  error: string | null;
}

export interface XCollectionOperationRunDto {
  id: number;
  source: string;
  status: "success" | "skipped" | "failed";
  startedAt: number;
  finishedAt: number | null;
  checkedHandles: number;
  refreshedHandles: number;
  postsReturned: number;
  postsStored: number;
  apiCalls: number;
  estimatedCostMicros: number;
  error: string | null;
}

export interface XUsageAggregateDto {
  apiCalls: number;
  estimatedCostMicros: number;
  resourceCount: number;
  successCount: number;
  failureCount: number;
  rateLimitCount: number;
}

export interface XDailyUsageSummaryDto extends XUsageAggregateDto {
  day: string;
}

export type XOperationUsageSummaryDto = Omit<
  XUsageAggregateDto,
  "successCount"
> & {
  operation: string;
};

export interface XForceRefreshPathSummaryDto {
  path: string;
  label: string;
  apiCalls: number;
  estimatedCostMicros: number;
  rateLimitCount: number;
  failureCount: number;
  runCount: number;
  latestAt: number | null;
}

export type NaverCafeSourceCheckStatus =
  | "ok"
  | "stale"
  | "error"
  | "private"
  | "invalid_response"
  | "disabled";

export interface NaverCafeOperationSourceDto {
  sourceId: number;
  sourceName: string;
  cafeId: string;
  menuId: string;
  enabled: boolean;
  latestCheck: {
    id: number;
    trigger: "manual" | "scheduled";
    status: NaverCafeSourceCheckStatus;
    checkedAt: number;
    durationMs: number;
    postCount: number;
    error: string | null;
  } | null;
  lastSuccessAt: number | null;
  latestError: string | null;
  disabledReason: string | null;
  stale: boolean;
  failing: boolean;
}

export interface OperationsStatusResponseDto {
  updatedAt: string;
  window: { hours: number; since: number };
  summary: {
    status: OperationsStatusLevel;
    issues: OperationsIssueDto[];
  };
  scheduledOperations: {
    activeRunCount: number;
    staleLeaseCount: number;
    outboxBacklog: number;
    oldestOutboxAvailableAt: number | null;
    queueOperations: {
      used: number;
      limit: number;
      usedPercent: number;
    };
    d1WriteGuard: {
      status: "available" | "blocked" | "unavailable";
      used: number;
      reserved: number;
      limit: number;
      usedPercent: number;
      blockedJobTypes: ScheduledJobType[];
      resetAt: number;
    };
    dailyUsage: Array<{
      resource: string;
      reserved: number;
      used: number;
      limit: number;
      usedPercent: number;
    }>;
  };
  autoUpdate: {
    enabled: boolean;
    intervalHours: number;
    rangeDays: number;
    lastRun: number | null;
    nextEligibleAt: number | null;
    pending: {
      total: number;
      createCount: number;
      updateCount: number;
    };
    rejectionCount: number;
    latestRun: AutoUpdateOperationRunDto | null;
    recentRuns: AutoUpdateOperationRunDto[];
  };
  xCollection: {
    enabled: boolean;
    intervalHours: number;
    dailyBudgetCents: number;
    lastRun: number | null;
    nextEligibleAt: number | null;
    latestRun: XCollectionOperationRunDto | null;
    recentRuns: XCollectionOperationRunDto[];
    feed: {
      visibility: XPostsVisibility;
      publicPath: string;
      monitorPath: string;
      apiPath: string;
    };
    usage: {
      apiCalls: number;
      estimatedCostMicros: number;
      resourceCount: number;
      successCount: number;
      failureCount: number;
      rateLimitCount: number;
      quota: {
        dailyBudgetMicros: number;
        todayUsedMicros: number;
        todayRemainingMicros: number;
        todayBudgetUsedPercent: number;
      };
      daily: XDailyUsageSummaryDto[];
      byOperation: XOperationUsageSummaryDto[];
      forceRefreshPaths: XForceRefreshPathSummaryDto[];
    };
  };
  naverCafe: {
    enabled: boolean;
    visibility: NaverCafePostsVisibility;
    collection: {
      intervalHours: number;
      lastRun: number | null;
      nextEligibleAt: number | null;
    };
    publicPath: string;
    monitorPath: string;
    apiPath: string;
    sourceCount: number;
    enabledSourceCount: number;
    staleSourceCount: number;
    failingSourceCount: number;
    disabledSourceCount: number;
    sources: NaverCafeOperationSourceDto[];
  };
}

export interface NaverCafeCheckNowResponseDto {
  success: boolean;
  updatedAt: string;
  checkedAt: number;
  sources: Array<{
    sourceId: number;
    sourceName: string;
    cafeId: string;
    menuId: string;
    trigger: "manual" | "scheduled";
    status: NaverCafeSourceCheckStatus;
    checkedAt: number;
    durationMs: number;
    postCount: number;
    error: string | null;
  }>;
}

export type DataRetentionCategory =
  | "usage_events"
  | "collection_runs"
  | "feed"
  | "logs"
  | "scheduled_operations";

export interface DataRetentionPolicyStatusDto {
  id: string;
  category: DataRetentionCategory;
  table: string;
  label: string;
  timestampColumn: string;
  retentionDays: number;
  cutoff: number;
  prunableRows: number;
  deletedRows: number;
}

export interface DataRetentionPruneResponseDto {
  source: "scheduled" | "manual";
  dryRun: boolean;
  startedAt: number;
  finishedAt: number;
  totalPrunableRows: number;
  totalDeletedRows: number;
  policies: DataRetentionPolicyStatusDto[];
}

export interface DataRetentionRunSummaryDto {
  runId: string;
  source: "scheduled" | "manual";
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "skipped" | "throttled";
  startedAt: number | null;
  finishedAt: number | null;
  totalDeletedRows: number;
  verifiedAt: number | null;
  remainingPrunableRows: number | null;
  verification: "verified" | "remaining" | "unavailable";
  policies: Array<{
    id: string;
    deletedRows: number;
    hasMore: boolean;
    remainingPrunableRows: number | null;
  }>;
}

export interface DataRetentionStatusResponseDto extends DataRetentionPruneResponseDto {
  recentRuns: DataRetentionRunSummaryDto[];
  capacity: {
    sizeBytes: number | null;
    maxBytes: number;
    usedPercent: number | null;
    status: "unavailable" | "ok" | "notice" | "warning" | "critical";
    thresholds: readonly [60, 75, 85];
  };
}

export interface AutoUpdateRunDetailDto {
  memberUid: number;
  memberName: string;
  scheduleId: number | null;
  scheduleDate: string;
  action: string;
  title?: string;
  previousStatus: string | null;
  vodId?: string | null;
  candidateKind?:
    | "missing_schedule"
    | "fill_missing_fields"
    | "ambiguous";
  matchReason?: string;
  matchConfidence?: "high" | "medium" | "low";
  sessionStartedAt?: string;
  sessionEndedAt?: string;
  segmentCount?: number;
}

export interface AutoUpdateRunResultDto {
  success: boolean;
  updated: number;
  checked: number;
  segmentCount: number;
  sessionCount: number;
  resumeMergedCount: number;
  rejectedSuppressed: number;
  duplicatePending: number;
  shortSuppressed: number;
  holidaySuppressed: number;
  ambiguous: number;
  obsoletePending: number;
  details: AutoUpdateRunDetailDto[];
}

export interface XCollectionRunResultDto {
  success: boolean;
  status: "success" | "skipped" | "failed";
  checkedHandles: number;
  refreshedHandles: number;
  postsReturned: number;
  postsStored: number;
  apiCalls: number;
  estimatedCostMicros: number;
  error: string | null;
  updatedAt: string;
}
