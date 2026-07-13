import { apiFetch } from "./client";
import type {
  NaverCafePostsVisibility,
  XPostsVisibility,
} from "@/lib/types";

export type OperationsStatusLevel = "ok" | "warning" | "critical";
export type OperationsIssue = {
  severity: "warning" | "critical";
  code: string;
  message: string;
};

export type AutoUpdateOperationRun = {
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
};

export type XCollectionOperationRun = {
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
};

export type XUsageAggregate = {
  apiCalls: number;
  estimatedCostMicros: number;
  resourceCount: number;
  successCount: number;
  failureCount: number;
  rateLimitCount: number;
};

export type XDailyUsageSummary = XUsageAggregate & {
  day: string;
};

export type XOperationUsageSummary = Omit<XUsageAggregate, "successCount"> & {
  operation: string;
};

export type XForceRefreshPathSummary = {
  path: string;
  label: string;
  apiCalls: number;
  estimatedCostMicros: number;
  rateLimitCount: number;
  failureCount: number;
  runCount: number;
  latestAt: number | null;
};

export type NaverCafeSourceCheckStatus =
  | "ok"
  | "stale"
  | "error"
  | "private"
  | "invalid_response"
  | "disabled";

export type NaverCafeOperationSource = {
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
};

export type OperationsStatusResponse = {
  updatedAt: string;
  window: { hours: number; since: number };
  summary: {
    status: OperationsStatusLevel;
    issues: OperationsIssue[];
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
    latestRun: AutoUpdateOperationRun | null;
    recentRuns: AutoUpdateOperationRun[];
  };
  xCollection: {
    enabled: boolean;
    intervalHours: number;
    dailyBudgetCents: number;
    lastRun: number | null;
    nextEligibleAt: number | null;
    latestRun: XCollectionOperationRun | null;
    recentRuns: XCollectionOperationRun[];
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
      daily: XDailyUsageSummary[];
      byOperation: XOperationUsageSummary[];
      forceRefreshPaths: XForceRefreshPathSummary[];
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
    sources: NaverCafeOperationSource[];
  };
};

export type NaverCafeCheckNowResponse = {
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
};

export type DataRetentionCategory =
  | "usage_events"
  | "collection_runs"
  | "logs";

export type DataRetentionPolicyStatus = {
  id: string;
  category: DataRetentionCategory;
  table: string;
  label: string;
  timestampColumn: string;
  retentionDays: number;
  cutoff: number;
  prunableRows: number;
  deletedRows: number;
};

export type DataRetentionPruneResponse = {
  source: "scheduled" | "manual";
  dryRun: boolean;
  startedAt: number;
  finishedAt: number;
  totalPrunableRows: number;
  totalDeletedRows: number;
  policies: DataRetentionPolicyStatus[];
};

export async function fetchOperationsStatus(
  windowHours = 24,
): Promise<OperationsStatusResponse> {
  const params = new URLSearchParams({ windowHours: String(windowHours) });
  return apiFetch<OperationsStatusResponse>(`/api/operations/status?${params}`, {
    cache: "no-store",
  });
}

export async function runNaverCafeCheckNow(): Promise<NaverCafeCheckNowResponse> {
  return apiFetch<NaverCafeCheckNowResponse>(
    "/api/operations/naver-cafe/check-now",
    {
      method: "POST",
    },
  );
}

export async function fetchDataRetentionStatus(): Promise<DataRetentionPruneResponse> {
  return apiFetch<DataRetentionPruneResponse>(
    "/api/operations/data-retention/status",
    {
      cache: "no-store",
    },
  );
}

export async function runDataRetentionPrune(options: {
  dryRun: boolean;
}): Promise<DataRetentionPruneResponse> {
  const params = new URLSearchParams({
    dryRun: String(options.dryRun),
  });
  return apiFetch<DataRetentionPruneResponse>(
    `/api/operations/data-retention/prune?${params}`,
    {
      method: "POST",
    },
  );
}
