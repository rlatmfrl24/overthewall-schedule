import { useQuery } from "@tanstack/react-query";
import { fetchXActivity, xActivityQueryKey } from "../api/x-activity-api";

export const useXActivityStatus = (enabled = true) => useQuery({
  queryKey: xActivityQueryKey, queryFn: fetchXActivity, enabled, staleTime: 30_000,
});
export type XActivityReadback = Pick<ReturnType<typeof useXActivityStatus>, "data" | "isError" | "isPending" | "isFetching" | "dataUpdatedAt">;
