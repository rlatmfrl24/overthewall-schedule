import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchOperationRun } from "../api/operations";
import type { OperationRunAccepted } from "../model/types";

const terminalStatuses = new Set([
  "succeeded",
  "partial",
  "failed",
  "skipped",
  "throttled",
]);

export const useOperationRun = (
  accepted: OperationRunAccepted | null | undefined,
) => useQuery({
  queryKey: queryKeys.operations.run(accepted?.runId ?? "idle"),
  queryFn: () => fetchOperationRun(accepted!.runId),
  enabled: Boolean(accepted?.runId),
  refetchInterval: (query) => {
    const run = query.state.data;
    if (run && terminalStatuses.has(run.status)) return false;
    if (!accepted) return false;
    const elapsed = Date.now() - accepted.acceptedAt;
    if (elapsed < 10_000) return 2_000;
    if (elapsed < 60_000) return 5_000;
    return 15_000;
  },
  refetchIntervalInBackground: false,
  staleTime: 0,
});
