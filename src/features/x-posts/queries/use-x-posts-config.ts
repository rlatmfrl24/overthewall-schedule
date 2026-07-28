import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchXPostsConfig } from "../api/x-posts-api";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import type { XPostsVisibility } from "@contracts/x-posts";

type XPostsConfigState = {
  visibility: XPostsVisibility;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useXPostsConfig(): XPostsConfigState {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.memberPosts.xConfig();
  const query = useQuery({
    queryKey,
    queryFn: () => fetchXPostsConfig(),
    staleTime: QUERY_STALE_TIME_MS,
  });
  const reloadMutation = useMutation({
    mutationFn: () => fetchXPostsConfig({ force: true }),
    onSuccess: (config) => {
      queryClient.setQueryData(queryKey, config);
    },
  });

  const reload = useCallback(async () => {
    await reloadMutation.mutateAsync();
  }, [reloadMutation]);

  return {
    visibility: query.data?.visibility ?? "members",
    loading: query.isLoading || reloadMutation.isPending,
    error:
      query.error || reloadMutation.error
        ? "멤버 게시글 공개 설정을 불러오지 못했습니다."
        : null,
    reload,
  };
}
