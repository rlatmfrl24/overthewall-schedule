import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchMemberPostsAggregate,
  type MemberPostSourcePolicy,
  type MemberPostsAggregateResponse,
} from "@/lib/api/member-posts";
import { MEMBER_POSTS_QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

const createEmptyPolicy = (
  source: MemberPostSourcePolicy["source"],
): MemberPostSourcePolicy => ({
  source,
  requested: false,
  admin: false,
  enabled: false,
  visibility: "private",
  accessible: false,
  status: "not_requested",
  reason: null,
  publicPath: "/feed",
  monitorPath: "/admin/member-posts",
  apiPath: `/api/member-posts?sources=${source}&admin=1`,
});

const EMPTY_RESPONSE: MemberPostsAggregateResponse = {
  updatedAt: "",
  posts: [],
  x: {
    posts: [],
    byHandle: [],
    updatedAt: "",
    error: null,
    policy: createEmptyPolicy("x"),
  },
  naverCafe: {
    posts: [],
    sources: [],
    updatedAt: "",
    error: null,
    policy: createEmptyPolicy("naver-cafe"),
  },
};

const isPolicyNoticeError = (
  error: string | null,
  policy: MemberPostSourcePolicy,
) =>
  Boolean(error) &&
  (policy.status === "private" ||
    policy.status === "disabled" ||
    policy.status === "not_requested");

export function useMemberPosts(
  options: {
    includeX?: boolean;
    includeNaverCafe?: boolean;
    maxResults?: number;
    size?: number;
    admin?: boolean;
  } = {},
) {
  const queryClient = useQueryClient();
  const {
    includeX = true,
    includeNaverCafe = true,
    maxResults = 10,
    size = 10,
    admin = false,
  } = options;
  const enabled = includeX || includeNaverCafe;
  const queryKey = queryKeys.memberPosts.aggregate(
    includeX,
    includeNaverCafe,
    maxResults,
    size,
    admin,
  );
  const fetchPosts = useCallback(
    (force: boolean) =>
      fetchMemberPostsAggregate({
        includeX,
        includeNaverCafe,
        maxResults,
        size,
        force,
        admin,
      }),
    [admin, includeNaverCafe, includeX, maxResults, size],
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

  const data = enabled ? query.data ?? EMPTY_RESPONSE : EMPTY_RESPONSE;
  const hasData = Boolean(query.data);
  const sourceErrors = [
    isPolicyNoticeError(data.x.error, data.x.policy) ? null : data.x.error,
    isPolicyNoticeError(data.naverCafe.error, data.naverCafe.policy)
      ? null
      : data.naverCafe.error,
  ].filter(Boolean);
  const error =
    sourceErrors.length > 0
      ? sourceErrors.join(" ")
      : query.error || reloadMutation.error
        ? hasData
          ? "새 게시글을 불러오지 못해 이전 데이터를 표시하고 있습니다."
          : "멤버 게시글을 불러오는데 실패했습니다."
        : null;

  return {
    posts: data.posts,
    updatedAt: data.updatedAt || null,
    loading: enabled ? query.isFetching || reloadMutation.isPending : false,
    error,
    hasLoaded: enabled ? query.isFetched : true,
    reload,
    x: {
      posts: data.x.posts,
      updatedAt: data.x.updatedAt || null,
      byHandle: data.x.byHandle,
      policy: data.x.policy,
      loading: enabled && includeX
        ? query.isFetching || reloadMutation.isPending
        : false,
      error: data.x.error,
      stale: data.x.byHandle.some((item) => item.stale),
      hasLoaded: enabled && includeX ? query.isFetched : true,
      reload,
    },
    naverCafe: {
      posts: data.naverCafe.posts,
      sources: data.naverCafe.sources,
      policy: data.naverCafe.policy,
      updatedAt: data.naverCafe.updatedAt || null,
      loading: enabled && includeNaverCafe
        ? query.isFetching || reloadMutation.isPending
        : false,
      error: data.naverCafe.error,
      stale: data.naverCafe.sources.some((source) => source.stale),
      hasLoaded: enabled && includeNaverCafe ? query.isFetched : true,
      reload,
    },
  };
}
