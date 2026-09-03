import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { MemberDto } from "@contracts/members";
import { fetchMembersYouTubeShorts } from "../api/youtube";
import type {
  YouTubeShortsResponse,
  YouTubeVideo,
} from "../model/types";
import { queryKeys } from "@/shared/query/query-keys";

const EMPTY_SHORTS_RESPONSE: YouTubeShortsResponse = {
  items: [],
  nextCursor: null,
  hasMore: false,
  updatedAt: "",
  collection: {
    state: "exhausted",
    baselineTarget: 20,
    requested: 20,
    returned: 0,
    revalidateAfterMs: null,
  },
};

const isFinalized = (page: YouTubeShortsResponse) =>
  page.collection.state === "ready" ||
  page.collection.state === "exhausted";

export const useYouTubeShorts = (
  members: MemberDto[],
  options: { limit?: number } = {},
) => {
  const limit = options.limit ?? 20;
  const eligibleMembers = useMemo(
    () => members.filter((member) => member.youtube_channel_id),
    [members],
  );
  const channelIdsKey = useMemo(
    () =>
      eligibleMembers
        .map((member) => member.youtube_channel_id!)
        .sort()
        .join(","),
    [eligibleMembers],
  );
  const enabled = eligibleMembers.length > 0;
  const autoRevalidated = useRef(new Set<string>());
  const [autoRetryPending, setAutoRetryPending] = useState(false);

  const query = useInfiniteQuery({
    queryKey: queryKeys.media.youtubeShorts(channelIdsKey, limit),
    queryFn: async ({ pageParam }) =>
      (await fetchMembersYouTubeShorts(eligibleMembers, {
        limit,
        cursor: pageParam,
      })) ?? EMPTY_SHORTS_RESPONSE,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      if (isFinalized(lastPage)) return lastPage.nextCursor ?? undefined;
      return lastPage.nextCursor ?? lastPageParam ?? undefined;
    },
    enabled,
  });

  const lastPage = query.data?.pages.at(-1) ?? null;
  const refetch = query.refetch;
  const collection = lastPage?.collection ?? EMPTY_SHORTS_RESPONSE.collection;
  const needsMoreCollection =
    collection.state === "refreshing" || collection.state === "partial";
  const revalidationKey = `${channelIdsKey}:${query.data?.pages.length ?? 0}:${lastPage?.nextCursor ?? "first"}`;

  useEffect(() => {
    autoRevalidated.current.clear();
    setAutoRetryPending(false);
  }, [channelIdsKey, limit]);

  useEffect(() => {
    if (!needsMoreCollection) setAutoRetryPending(false);
  }, [needsMoreCollection]);

  useEffect(() => {
    if (
      !enabled ||
      !needsMoreCollection ||
      !collection.revalidateAfterMs ||
      autoRevalidated.current.has(revalidationKey)
    ) {
      return;
    }
    autoRevalidated.current.add(revalidationKey);
    setAutoRetryPending(true);
    const timer = window.setTimeout(() => {
      void refetch().finally(() => setAutoRetryPending(false));
    }, collection.revalidateAfterMs);
    return () => window.clearTimeout(timer);
  }, [
    collection.revalidateAfterMs,
    enabled,
    needsMoreCollection,
    refetch,
    revalidationKey,
  ]);

  const shorts = useMemo(() => {
    const byId = new Map<string, YouTubeVideo>();
    for (const [index, page] of (query.data?.pages ?? []).entries()) {
      if (!isFinalized(page) && index > 0) continue;
      for (const item of page.items) byId.set(item.videoId, item);
    }
    return [...byId.values()];
  }, [query.data?.pages]);

  const loadMore = useCallback(async () => {
    if (!enabled) return;
    if (!lastPage || (!isFinalized(lastPage) && !lastPage.nextCursor)) {
      await query.refetch();
      return;
    }
    await query.fetchNextPage();
  }, [enabled, lastPage, query]);

  return {
    shorts,
    collection,
    hasMore: lastPage?.hasMore ?? false,
    loading: enabled ? query.isPending : false,
    loadingMore:
      autoRetryPending ||
      query.isFetchingNextPage ||
      (query.isFetching && !query.isPending),
    error:
      query.error && shorts.length === 0
        ? "YouTube Shorts를 불러오는데 실패했습니다."
        : null,
    hasLoaded: enabled ? query.isFetched : true,
    loadMore,
  };
};
