import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchXPostsConfig } from "@/lib/api/x";
import { QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import type { XPostsVisibility } from "@/lib/types";

export const X_POSTS_CONFIG_UPDATED_EVENT = "otw:x-posts-config-updated";

type XPostsConfigState = {
  visibility: XPostsVisibility;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const isXPostsVisibility = (value: unknown): value is XPostsVisibility =>
  value === "public" || value === "members" || value === "private";

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

  useEffect(() => {
    const handleConfigUpdate = (event: Event) => {
      const visibility = (event as CustomEvent<{ visibility?: unknown }>).detail
        ?.visibility;
      if (isXPostsVisibility(visibility)) {
        queryClient.setQueryData(queryKey, { visibility });
        return;
      }
      void reload();
    };

    window.addEventListener(X_POSTS_CONFIG_UPDATED_EVENT, handleConfigUpdate);
    return () =>
      window.removeEventListener(
        X_POSTS_CONFIG_UPDATED_EVENT,
        handleConfigUpdate,
      );
  }, [queryClient, queryKey, reload]);

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
