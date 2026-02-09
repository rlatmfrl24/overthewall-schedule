import { useState, useEffect, useCallback } from "react";
import {
  fetchKirinukiVideos,
  type KirinukiVideosResponse,
  type FetchKirinukiVideosOptions,
} from "@/lib/api/kirinuki";

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

  const [videos, setVideos] = useState<KirinukiVideosResponse["videos"]>([]);
  const [shorts, setShorts] = useState<KirinukiVideosResponse["shorts"]>([]);
  const [byChannel, setByChannel] = useState<
    KirinukiVideosResponse["byChannel"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchKirinukiVideos({ maxResults });
      setVideos(response.videos);
      setShorts(response.shorts);
      setByChannel(response.byChannel);
    } catch (err) {
      console.error("Failed to fetch kirinuki videos:", err);
      setError("키리누키 영상을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [maxResults]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return {
    videos,
    shorts,
    byChannel,
    loading,
    error,
    hasLoaded,
    refetch: fetch,
  };
}
