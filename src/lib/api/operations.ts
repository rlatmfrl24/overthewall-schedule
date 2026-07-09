import { apiFetch } from "./client";

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
    trigger: "manual";
    status: NaverCafeSourceCheckStatus;
    checkedAt: number;
    durationMs: number;
    postCount: number;
    error: string | null;
  } | null;
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
    usage: {
      apiCalls: number;
      estimatedCostMicros: number;
      successCount: number;
      failureCount: number;
      rateLimitCount: number;
    };
  };
  naverCafe: {
    enabled: boolean;
    visibility: "public" | "members" | "private";
    sourceCount: number;
    enabledSourceCount: number;
    staleSourceCount: number;
    failingSourceCount: number;
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
    trigger: "manual";
    status: NaverCafeSourceCheckStatus;
    checkedAt: number;
    durationMs: number;
    postCount: number;
    error: string | null;
  }>;
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
