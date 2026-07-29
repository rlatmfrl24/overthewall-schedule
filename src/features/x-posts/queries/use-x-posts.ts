import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMembersXPosts } from "../api/x-posts-api";
import { MEMBER_POSTS_QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import type { MemberDto } from "@contracts/members";
import type { XPostViewModel, XPostsByHandleViewModel } from "../model/types";
import { filterXPostsByMembers } from "../model/filter-x-posts";

interface UseXPostsReturn {
  posts: XPostViewModel[];
  updatedAt: string | null;
  byHandle: XPostsByHandleViewModel[];
  loading: boolean;
  error: string | null;
  stale: boolean;
  hasLoaded: boolean;
  reload: () => Promise<void>;
}

export function useXPosts(
  members: MemberDto[],
  options: { enabled?: boolean; maxResults?: number; admin?: boolean } = {},
): UseXPostsReturn {
  const queryClient = useQueryClient();
  const { enabled = true, maxResults = 5, admin = false } = options;
  const twitterUrlsKey = useMemo(
    () =>
      members
        .map((member) => member.url_twitter ?? "")
        .sort()
        .join(","),
    [members],
  );
  const queryEnabled = enabled && members.length > 0;
  const queryKey = queryKeys.memberPosts.x(twitterUrlsKey, maxResults, admin);
  const fetchPosts = useCallback(
    (force: boolean) =>
      fetchMembersXPosts(members, {
        admin,
        force,
        maxResults,
      }),
    [admin, members, maxResults],
  );

  const query = useQuery({
    queryKey,
    queryFn: () => fetchPosts(false),
    enabled: queryEnabled,
    staleTime: MEMBER_POSTS_QUERY_STALE_TIME_MS,
  });
  const reloadMutation = useMutation({
    mutationFn: () => fetchPosts(true),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response);
    },
  });

  const reload = useCallback(async () => {
    if (!queryEnabled) return;
    await reloadMutation.mutateAsync();
  }, [queryEnabled, reloadMutation]);

  const data = queryEnabled ? query.data : null;
  const hasData = Boolean(data);
  const requestFailed = Boolean(query.error || reloadMutation.error);
  const error =
    data?.clientStale
      ? "새 게시글을 불러오지 못해 이전 데이터를 표시하고 있습니다."
      : query.error || reloadMutation.error
        ? hasData
          ? "새 게시글을 불러오지 못해 이전 데이터를 표시하고 있습니다."
          : "X 게시글을 불러오는데 실패했습니다."
        : null;

  return {
    posts: data?.posts ?? [],
    updatedAt: data?.updatedAt ?? null,
    byHandle: data?.byHandle ?? [],
    loading: queryEnabled ? query.isFetching || reloadMutation.isPending : false,
    error,
    stale:
      Boolean(data?.clientStale) ||
      Boolean(data?.byHandle.some((item) => item.stale)) ||
      (hasData && requestFailed),
    hasLoaded: queryEnabled ? query.isFetched : members.length === 0 && enabled,
    reload,
  };
}

export function useFilteredXPosts(
  posts: XPostViewModel[],
  selectedMemberUids: number[] | null,
) {
  return useMemo(
    () => filterXPostsByMembers(posts, selectedMemberUids),
    [posts, selectedMemberUids],
  );
}
