import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchXHistoryHealth } from "../api/x-history-api";

export const xReferenceHealthQueryKey = [...queryKeys.memberPosts.all, "x-reference-health"];

export function useXReferenceHealth() {
  return useQuery({
    queryKey: xReferenceHealthQueryKey,
    queryFn: fetchXHistoryHealth,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
