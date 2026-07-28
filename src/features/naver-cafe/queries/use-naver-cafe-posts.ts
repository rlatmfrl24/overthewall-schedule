import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNaverCafePosts } from "../api/naver-cafe-api";
import { MEMBER_POSTS_QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import type {
  NaverCafePostDto,
  NaverCafeSourceStatusDto,
} from "@contracts/naver-cafe";
import { filterNaverCafePostsByMembers } from "../model/filter-naver-cafe-posts";

interface UseNaverCafePostsReturn {
  posts: NaverCafePostDto[];
  sources: NaverCafeSourceStatusDto[];
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  hasLoaded: boolean;
  reload: () => Promise<void>;
}

export function useNaverCafePosts(
  options: { enabled?: boolean; size?: number; admin?: boolean } = {},
): UseNaverCafePostsReturn {
  const queryClient = useQueryClient();
  const { enabled = true, size = 10, admin = false } = options;
  const queryKey = queryKeys.memberPosts.naverCafe(size, admin);
  const fetchPosts = useCallback(
    (force: boolean) => fetchNaverCafePosts({ admin, force, size }),
    [admin, size],
  );
  const query = useQuery({
    queryKey,
    queryFn: () => fetchPosts(false),
    enabled,
    staleTime: MEMBER_POSTS_QUERY_STALE_TIME_MS,
  });
  const reloadMutation = useMutation({
    mutationFn: () => fetchPosts(true),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response);
    },
  });

  const reload = useCallback(async () => {
    if (!enabled) return;
    await reloadMutation.mutateAsync();
  }, [enabled, reloadMutation]);

  const data = enabled ? query.data : null;
  const hasData = Boolean(data);
  const requestFailed = Boolean(query.error || reloadMutation.error);
  const error =
    data?.clientStale
      ? "새 카페글을 불러오지 못해 이전 데이터를 표시하고 있습니다."
      : query.error || reloadMutation.error
        ? hasData
          ? "새 카페글을 불러오지 못해 이전 데이터를 표시하고 있습니다."
          : "카페 최신글을 불러오는데 실패했습니다."
        : null;

  return {
    posts: data?.posts ?? [],
    sources: data?.sources ?? [],
    updatedAt: data?.updatedAt ?? null,
    loading: enabled ? query.isFetching || reloadMutation.isPending : false,
    error,
    stale:
      Boolean(data?.clientStale) ||
      Boolean(data?.sources.some((source) => source.stale)) ||
      (hasData && requestFailed),
    hasLoaded: enabled ? query.isFetched : false,
    reload,
  };
}

export function useFilteredNaverCafePosts(
  posts: NaverCafePostDto[],
  selectedMemberUids: number[] | null,
) {
  return useMemo(
    () => filterNaverCafePostsByMembers(posts, selectedMemberUids),
    [posts, selectedMemberUids],
  );
}
