import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchNaverCafePostsConfig,
  type NaverCafePostsConfigResponse,
} from "@/lib/api/naver-cafe";
import { QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import type { NaverCafePostsVisibility } from "@/lib/types";

export const NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT =
  "otw:naver-cafe-posts-config-updated";

type NaverCafePostsConfigState = {
  enabled: boolean;
  visibility: NaverCafePostsVisibility;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const isVisibility = (value: unknown): value is NaverCafePostsVisibility =>
  value === "public" || value === "members" || value === "private";

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

  useEffect(() => {
    const handleConfigUpdate = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          enabled?: unknown;
          visibility?: unknown;
        }>
      ).detail;
      const current = queryClient.getQueryData<NaverCafePostsConfigResponse>(
        queryKey,
      );
      const next = {
        enabled:
          typeof detail?.enabled === "boolean"
            ? detail.enabled
            : current?.enabled ?? true,
        visibility: isVisibility(detail?.visibility)
          ? detail.visibility
          : current?.visibility ?? "members",
      };

      if (
        typeof detail?.enabled === "boolean" ||
        isVisibility(detail?.visibility)
      ) {
        queryClient.setQueryData(queryKey, next);
        return;
      }
      void reload();
    };

    window.addEventListener(
      NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT,
      handleConfigUpdate,
    );
    return () =>
      window.removeEventListener(
        NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT,
        handleConfigUpdate,
      );
  }, [queryClient, queryKey, reload]);

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
