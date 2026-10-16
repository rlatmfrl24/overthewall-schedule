import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchKirinukiVideos,
  type KirinukiVideosResponse,
  type FetchKirinukiVideosOptions,
} from "../api/kirinuki";
import { queryKeys } from "@/shared/query/query-keys";

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
  const query = currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.media.kirinuki(maxResults),
    queryFn: () => fetchKirinukiVideos({ maxResults }),

  }));


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
