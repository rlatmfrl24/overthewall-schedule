import { useQuery } from "@tanstack/react-query";
import { fetchOtwPlayIngestionBudget } from "../api/admin";

export const ingestionBudgetKey = ["otw-play", "admin", "ingestion-budget"] as const;

export function useIngestionBudget(enabled: boolean) {
  return useQuery({ queryKey: ingestionBudgetKey, queryFn: fetchOtwPlayIngestionBudget,
    enabled, retry: false, staleTime: 60_000, refetchInterval: enabled ? 60_000 : false,
    refetchIntervalInBackground: false });
}
