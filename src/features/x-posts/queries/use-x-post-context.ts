import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchXPostContext } from "../api/x-posts-api";
import { queryKeys } from "@/shared/query/query-keys";

const X_CONTEXT_STALE_TIME_MS = 7 * 24 * 60 * 60_000;

export function useXPostContext(postId: string) {
  const query = useQuery({
    queryKey: queryKeys.memberPosts.xContext(postId),
    queryFn: () => fetchXPostContext(postId),
    enabled: false,
    retry: false,
    staleTime: X_CONTEXT_STALE_TIME_MS,
  });
  const { refetch } = query;

  const load = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    context: query.data ?? null,
    loading: query.isFetching,
    error: query.error ? "관련 트윗을 불러오지 못했습니다." : null,
    load,
  };
}
