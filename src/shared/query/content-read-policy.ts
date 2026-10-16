/** Re-entering a content screen must consult current server access, even when another
 * observer still holds a snapshot. Already rendered screens are refreshed on focus. */
export const CONTENT_READ_QUERY_OPTIONS = {
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: true,
} as const;

export function currentContentQuery<T extends {
  data: unknown;
  isFetchedAfterMount: boolean;
  isError: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isSuccess: boolean;
  isPending: boolean;
  status: "pending" | "error" | "success";
}>(query: T): T {
  if (query.isFetchedAfterMount && !query.isError) return query;
  // Keep the result's data/status discriminants consistent for consumers.
  return {
    ...query,
    data: undefined,
    status: query.isError ? "error" : "pending",
    isPending: !query.isError,
    isSuccess: false,
    isLoading: query.isLoading || (!query.isFetchedAfterMount && query.isFetching),
  } as T;
}
