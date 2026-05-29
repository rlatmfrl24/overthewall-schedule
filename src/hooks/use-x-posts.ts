import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMembersXPosts } from "@/lib/api/x";
import { MEMBER_POSTS_QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import type { Member, XPost, XPostsResponse } from "@/lib/types";

interface UseXPostsReturn {
  posts: XPost[];
  updatedAt: string | null;
  byHandle: XPostsResponse["byHandle"];
  loading: boolean;
  error: string | null;
  stale: boolean;
  hasLoaded: boolean;
  reload: () => Promise<void>;
}

export function useXPosts(
  members: Member[],
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
      Boolean(data?.byHandle.some((item) => item.stale)),
    hasLoaded: queryEnabled ? query.isFetched : members.length === 0 && enabled,
    reload,
  };
}

export function filterXPostsByMembers(
  posts: XPost[],
  selectedMemberUids: number[] | null,
): XPost[] {
  if (!selectedMemberUids || selectedMemberUids.length === 0) {
    return posts;
  }

  const uidSet = new Set(selectedMemberUids);
  return posts.filter(
    (post) => post.memberUid !== undefined && uidSet.has(post.memberUid),
  );
}

export function useFilteredXPosts(
  posts: XPost[],
  selectedMemberUids: number[] | null,
) {
  return useMemo(
    () => filterXPostsByMembers(posts, selectedMemberUids),
    [posts, selectedMemberUids],
  );
}
