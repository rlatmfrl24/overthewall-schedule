import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  DataRetentionPruneResponse,
  DataRetentionStatusResponse,
  D1ObservabilityResponse,
  OperationJobSummaryList,
  OperationsStatusResponse,
  OperationRun,
  OperationRunAccepted,
  OperationRunList,
  ScheduledJobStatus,
  ScheduledJobType,
} from "../model/types";

export async function fetchOperationsStatus(
  windowHours = 24,
): Promise<OperationsStatusResponse> {
  const params = new URLSearchParams({ windowHours: String(windowHours) });
  return apiFetch<OperationsStatusResponse>(
    withRouteSearch(apiRoutes.operations.status.build(), params),
    { cache: "no-store" },
  );
}

export async function fetchD1Observability(): Promise<D1ObservabilityResponse> {
  const params = new URLSearchParams({ window: "7d" });
  return apiFetch<D1ObservabilityResponse>(
    withRouteSearch(apiRoutes.operations.d1Observability.build(), params),
    { cache: "no-store" },
  );
}

export async function fetchOperationJobSummaries(): Promise<OperationJobSummaryList> {
  return apiFetch<OperationJobSummaryList>(
    apiRoutes.operations.jobSummaries.build(),
    { cache: "no-store" },
  );
}

const makeIdempotencyHeaders = () => ({
  "Idempotency-Key": crypto.randomUUID(),
});

export async function createOperationRun(
  jobType: ScheduledJobType,
): Promise<OperationRunAccepted> {
  return apiFetch<OperationRunAccepted>(apiRoutes.operations.runs.build(), {
    method: "POST",
    headers: makeIdempotencyHeaders(),
    body: JSON.stringify({ jobType }),
  });
}

export async function fetchOperationRun(runId: string): Promise<OperationRun> {
  return apiFetch<OperationRun>(apiRoutes.operations.run.build(runId), {
    cache: "no-store",
  });
}

export async function fetchOperationRuns(options: {
  jobType?: ScheduledJobType;
  status?: ScheduledJobStatus;
  limit?: number;
} = {}): Promise<OperationRunList> {
  const params = new URLSearchParams();
  if (options.jobType) params.set("jobType", options.jobType);
  if (options.status) params.set("status", options.status);
  if (options.limit) params.set("limit", String(options.limit));
  const path = params.size > 0
    ? withRouteSearch(apiRoutes.operations.runs.build(), params)
    : apiRoutes.operations.runs.build();
  return apiFetch<OperationRunList>(path, { cache: "no-store" });
}

export async function retryOperationRun(
  runId: string,
): Promise<OperationRun> {
  return apiFetch<OperationRun>(apiRoutes.operations.retryRun.build(runId), {
    method: "POST",
  });
}

export async function runNaverCafeCheckNow(): Promise<OperationRunAccepted> {
  return apiFetch<OperationRunAccepted>(
    apiRoutes.naverCafe.checkNow.build(),
    { method: "POST", headers: makeIdempotencyHeaders() },
  );
}

export async function fetchDataRetentionStatus(): Promise<DataRetentionStatusResponse> {
  return apiFetch<DataRetentionStatusResponse>(
    apiRoutes.operations.retentionStatus.build(),
    { cache: "no-store" },
  );
}

export async function runDataRetentionPrune(options: {
  dryRun: boolean;
}): Promise<DataRetentionPruneResponse | OperationRunAccepted> {
  const params = new URLSearchParams({
    dryRun: String(options.dryRun),
  });
  return apiFetch<DataRetentionPruneResponse | OperationRunAccepted>(
    withRouteSearch(apiRoutes.operations.retentionPrune.build(), params),
    { method: "POST", headers: makeIdempotencyHeaders() },
  );
}

export async function runAutoUpdateNow(): Promise<OperationRunAccepted> {
  return apiFetch<OperationRunAccepted>(apiRoutes.schedules.runNow.build(), {
    method: "POST",
    headers: makeIdempotencyHeaders(),
  });
}

export async function runXCollectionNow(): Promise<OperationRunAccepted> {
  return apiFetch<OperationRunAccepted>(
    apiRoutes.xPosts.runCollectionNow.build(),
    { method: "POST", headers: makeIdempotencyHeaders() },
  );
}
