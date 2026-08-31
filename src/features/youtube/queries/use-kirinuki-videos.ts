import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchKirinukiVideos,
  type KirinukiVideosResponse,
  type FetchKirinukiVideosOptions,
} from "../api/kirinuki";
import { MEDIA_QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { useOneShotCacheRevalidation } from "./use-one-shot-cache-revalidation";

interface UseKirinukiVideosResult {
  videos: KirinukiVideosResponse["videos"];
  shorts: KirinukiVideosResponse["shorts"];
  byChannel: KirinukiVideosResponse["byChannel"];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  refetch: () => Promise<void>;
}

export function useKirinukiVideos(
  options: FetchKirinukiVideosOptions = {},
): UseKirinukiVideosResult {
  const { maxResults = 20 } = options;
  const query = useQuery({
    queryKey: queryKeys.media.kirinuki(maxResults),
    queryFn: () => fetchKirinukiVideos({ maxResults }),
    staleTime: MEDIA_QUERY_STALE_TIME_MS,
  });

  useOneShotCacheRevalidation({
    identity: String(maxResults),
    cache: query.data?.cache,
    refetch: query.refetch,
  });

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    videos: query.data?.videos ?? [],
    shorts: query.data?.shorts ?? [],
    byChannel: query.data?.byChannel ?? [],
    loading: query.isFetching,
    error:
      query.error && !query.data
        ? "키리누키 영상을 불러오는데 실패했습니다."
        : null,
    hasLoaded: query.isFetched,
    refetch,
  };
}
