import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchXPostContext } from "../api/x-posts-api";
import { queryKeys } from "@/shared/query/query-keys";

const X_CONTEXT_STALE_TIME_MS = 5 * 60_000;

export function useXPostContext(postId: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.memberPosts.xContext(postId),
    queryFn: () => fetchXPostContext(postId),
    enabled: false,
    retry: false,
    staleTime: X_CONTEXT_STALE_TIME_MS,
  });
  const { refetch } = query;

  const load = useCallback(async () => {
    const result = await refetch();
    if (result.data) await client.invalidateQueries({ queryKey: queryKeys.memberPosts.all,
      predicate: query => !query.queryKey.includes("x-context") });
  }, [refetch, client]);

  return {
    context: query.data ?? null,
    loading: query.isFetching,
    error: query.error ? "원문이 아직 준비되지 않았거나 확인할 수 없습니다" : null,
    load,
  };
}
