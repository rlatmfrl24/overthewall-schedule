import type { NaverCafePostsVisibility } from "./naver-cafe";
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
  updatedCount: number;
  createdCount: number;
  existingCount: number;
  pendingCreatedCount: number;
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
  | "logs";

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

export interface AutoUpdateRunDetailDto {
  memberUid: number;
  memberName: string;
  scheduleId: number | null;
  scheduleDate: string;
  action: string;
  title?: string;
  previousStatus: string | null;
}

export interface AutoUpdateRunResultDto {
  success: boolean;
  updated: number;
  checked: number;
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
