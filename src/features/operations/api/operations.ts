import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  AutoUpdateRunResult,
  DataRetentionPruneResponse,
  NaverCafeCheckNowResponse,
  OperationsStatusResponse,
  XCollectionRunResult,
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

export async function runNaverCafeCheckNow(): Promise<NaverCafeCheckNowResponse> {
  return apiFetch<NaverCafeCheckNowResponse>(
    apiRoutes.naverCafe.checkNow.build(),
    { method: "POST" },
  );
}

export async function fetchDataRetentionStatus(): Promise<DataRetentionPruneResponse> {
  return apiFetch<DataRetentionPruneResponse>(
    apiRoutes.operations.retentionStatus.build(),
    { cache: "no-store" },
  );
}

export async function runDataRetentionPrune(options: {
  dryRun: boolean;
}): Promise<DataRetentionPruneResponse> {
  const params = new URLSearchParams({
    dryRun: String(options.dryRun),
  });
  return apiFetch<DataRetentionPruneResponse>(
    withRouteSearch(apiRoutes.operations.retentionPrune.build(), params),
    { method: "POST" },
  );
}

export async function runAutoUpdateNow(): Promise<AutoUpdateRunResult> {
  return apiFetch<AutoUpdateRunResult>(apiRoutes.schedules.runNow.build(), {
    method: "POST",
  });
}

export async function runXCollectionNow(): Promise<XCollectionRunResult> {
  return apiFetch<XCollectionRunResult>(
    apiRoutes.xPosts.runCollectionNow.build(),
    { method: "POST" },
  );
}
