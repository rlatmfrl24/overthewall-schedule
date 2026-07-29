import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchNaverCafePostsConfig,
} from "../api/naver-cafe-api";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import type { NaverCafePostsVisibility } from "@contracts/naver-cafe";

type NaverCafePostsConfigState = {
  enabled: boolean;
  visibility: NaverCafePostsVisibility;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useNaverCafePostsConfig(): NaverCafePostsConfigState {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.memberPosts.naverCafeConfig();
  const query = useQuery({
    queryKey,
    queryFn: () => fetchNaverCafePostsConfig(),
    staleTime: QUERY_STALE_TIME_MS,
  });
  const reloadMutation = useMutation({
    mutationFn: () => fetchNaverCafePostsConfig({ force: true }),
    onSuccess: (config) => {
      queryClient.setQueryData(queryKey, config);
    },
  });

  const reload = useCallback(async () => {
    await reloadMutation.mutateAsync();
  }, [reloadMutation]);

  return {
    enabled: query.data?.enabled ?? true,
    visibility: query.data?.visibility ?? "members",
    loading: query.isLoading || reloadMutation.isPending,
    error:
      query.error || reloadMutation.error
        ? "카페 최신글 공개 설정을 불러오지 못했습니다."
        : null,
    reload,
  };
}
