import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchYouTubeVods } from "../api/youtube-vods";

export const useYouTubeVods = (memberUids: number[]) => {
  const ids = [...new Set(memberUids)].sort((a, b) => a - b);
  return currentContentQuery(useInfiniteQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.media.youtubeVods(ids),
    queryFn: ({ pageParam }) => fetchYouTubeVods(ids, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,



    refetchInterval: (query) => {
      const state = query.state.data?.pages[0]?.collection.state;
      return state === "initializing" || state === "partial" ? 15_000 : false;
    },
  }));
};
